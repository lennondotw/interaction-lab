#!/bin/bash
# Reads Apple's shipping Liquid Glass shaders out of QuartzCore and prints the parts that
# answer "what does it compute": the uniform field lists in declaration order, the
# dispersion code paths, and every float constant.
#
#   ./probe-shaders.sh [outdir]        # default outdir: ./out
#
# QuartzCore ships `default.metallib` as a resource on disk — unlike the framework binary,
# which lives in the dyld shared cache and is awkward to get at. The fat metallib carries
# 19 GPU ISA slices plus one `air64_v29` slice, and that one is LLVM bitcode: `metal-objdump
# -d` prints it as IR with constants intact. The GPU slices cannot be disassembled here
# ("no instruction printer for target agx3"), which is fine — IR is the readable one.
#
# Needs the Metal toolchain (ships with Xcode; `xcrun -f metal-objdump` must resolve).
# Everything is read-only.

set -euo pipefail

MB=/System/Library/Frameworks/QuartzCore.framework/Versions/A/Resources/default.metallib
OUT="${1:-out}"
mkdir -p "$OUT"

[ -r "$MB" ] || { echo "!! $MB not readable — this needs macOS 26 or later"; exit 1; }
xcrun -f metal-objdump >/dev/null 2>&1 || { echo "!! Metal toolchain not installed"; exit 1; }

echo "── slices in $(basename "$MB") ($(du -h "$MB" | cut -f1))"
xcrun metal-lipo -info "$MB" | tr ' ' '\n' | grep -E '^(air64|applegpu|g1)' | tr '\n' ' '; echo

echo
echo "── extracting the AIR slice and disassembling to LLVM IR"
xcrun metal-lipo -thin air64_v29 -output "$OUT/air64.metallib" "$MB"
xcrun metal-objdump -d "$OUT/air64.metallib" > "$OUT/air.ll" 2>/dev/null
echo "   $OUT/air.ll — $(wc -l < "$OUT/air.ll") lines, $(grep -c -- ' -- .*:$' "$OUT/air.ll") modules"

echo
echo "── glass and aberration entry points"
xcrun metal-nm "$OUT/air64.metallib" 2>/dev/null \
  | grep -E 'glass_|aberration|displacement_map|sdf_' | awk '{print "   " $3}' | sort -u

# Each symbol is its own module in the dump, delimited by ` -- <name>:` lines, so a module
# can be sliced out by name. `_all` is the variant with every template flag on.
extract() {
  awk -v want=" -- $1:" '
    index($0, want) { f = 1; n = 0 }
    f && / -- / { n++; if (n > 1) exit }
    f { print }
  ' "$OUT/air.ll" > "$OUT/$2"
  echo "   $OUT/$2 — $(wc -l < "$OUT/$2") lines"
}

echo
echo "── slicing out the modules of interest"
extract glass_background_all_lpf gb.ll
extract chromatic_aberration_lpf ca.ll

echo
echo "── uniform field lists, in declaration order"
python3 - "$OUT" <<'PY'
import re, sys, struct, collections
out = sys.argv[1]

def fields(path, marker, label):
    for line in open(f"{out}/{path}"):
        if line.startswith('!') and marker in line:
            names = [n for n in re.findall(r'!"([A-Za-z_][A-Za-z_0-9]*)"', line)
                     if not n.startswith('air.')]
            # The metadata alternates type, name, type, name...
            pairs = list(zip(names[0::2], names[1::2]))
            print(f"\n   {label} — {len(pairs)} fields")
            for t, n in pairs:
                print(f"     {t:<8} {n}")
            return
    print(f"\n   !! {label}: no metadata node found")

fields('gb.ll', 'aberration_dir', 'GlassBackgroundUniforms')
fields('gb.ll', 'preserve_hue', 'GlassBackgroundUniformsExt')
# ChromaticAberrationUniforms emits no field names in its type-info node, only the
# layout, so print the LLVM struct type instead of pretending we recovered names. The
# roles come from the IR below rather than from metadata.
for line in open(f"{out}/ca.ll"):
    if 'ChromaticAberrationUniforms' in line and '= type {' in line:
        print("\n   ChromaticAberrationUniforms — layout only, no names in metadata")
        print("     " + line.split('= type', 1)[1].strip())
        print("     roles from the IR: off0, off1, off2, uvMin, uvMax")
        break
PY

echo
echo "── constants in glass_background (LLVM prints float literals as double bits)"
python3 - "$OUT" <<'PY'
import re, sys, struct, collections
src = open(f"{sys.argv[1]}/gb.ll").read()
dec = lambda h: struct.unpack('>d', bytes.fromhex(h[2:].rjust(16, '0')))[0]

print("\n   vector literals (per-channel weights show up here)")
seen = collections.Counter()
for m in re.finditer(r'<(\d+) x (float|half)> <([^>]*)>', src):
    vals = []
    for p in re.findall(r'(?:float|half) (0x[0-9A-Fa-f]+|-?[\d.]+e?[-+]?\d*|poison|undef)',
                        m.group(3)):
        vals.append(p if p in ('poison', 'undef')
                    else round(dec(p), 6) if p.startswith('0x') else float(p))
    seen[(m.group(1), m.group(2), tuple(map(str, vals)))] += 1
for (n, t, vals), c in seen.most_common():
    if all(v in ('0.0', '1.0', '0', '1', 'poison', 'undef') for v in vals):
        continue
    print(f"     x{c:<3} <{n} x {t}> {list(vals)}")

print("\n   scalar constants")
sc = collections.Counter(round(dec(m), 8)
                         for m in re.findall(r'(?:float|half) (0x[0-9A-Fa-f]{16})', src))
for v, c in sc.most_common(12):
    print(f"     x{c:<3} {v}")
PY

echo
echo "── the dispersion loops (weight init and step)"
grep -nE 'phi float \[ 1\.0+e\+00|fadd fast float %[0-9]+, 0xBFD5555560000000' "$OUT/gb.ll" \
  | head -6 | sed 's/^/   /'
echo
echo "   w starts at 1.0 and steps by -1/3 (0xBFD5555560000000), three iterations per loop."
echo "   Final normalisation is the <0.5, 1/3, 0.5> vector literal above; alpha gets 1/7."
echo
echo "── which channel each tap of the generic chromaticAberration filter feeds"
grep -nE 'extractelement <4 x float> %(16|18|20), i64 [0-2]$' "$OUT/ca.ll" | sed 's/^/   /'
echo "   tap0 -> R, tap1 -> G, tap2 -> B: three point samples, one per primary."
echo
echo "done — see $OUT/"
