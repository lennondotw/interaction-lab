# The two dispersion loops of glass_background_all_lpf, macOS 27.0 (26A5388g).
#
# Excerpt from QuartzCore's default.metallib, air64_v29 slice, disassembled with
# metal-objdump -d. Kept short on purpose: this is the evidence for the six-tap
# overlapping-weight reading in README.md, not a vendored copy of Apple's shader.
# Regenerate the full 9 MB module locally with ./probe-shaders.sh — we deliberately
# do not commit it.
#
# Loop A: uv = base + w·dir, w = 1, 2/3, 1/3;  R += tap.r·w,  G += tap.g·(1-w)
# Loop B: uv = base - t·dir, t = 0, 1/3, 2/3;  G += tap.g·w', B += tap.b·(1-w')
# Then:   rgb *= (0.5, 1/3, 0.5), alpha *= 1/7

; ── loop A header: w starts at 1.0, steps by -1/3, three iterations ──
12:                                               ; preds = %61, %7
  %13 = phi <4 x float> [ zeroinitializer, %7 ], [ %82, %61 ]
  %14 = phi float [ 1.000000e+00, %7 ], [ %83, %61 ]
  %15 = phi i32 [ 0, %7 ], [ %84, %61 ]
  %16 = insertelement <2 x float> poison, float %14, i64 0
  %17 = shufflevector <2 x float> %16, <2 x float> poison, <2 x i32> zeroinitializer
  %18 = fmul fast <2 x float> %17, %2
  %19 = fadd fast <2 x float> %18, %1
  br i1 %4, label %20, label %57

; ── loop A accumulate + step ──
  %69 = extractelement <2 x float> %68, i64 0
  %70 = fmul fast float %69, %14
  %71 = extractelement <4 x float> %13, i64 0
  %72 = fadd fast float %70, %71
  %73 = insertelement <4 x float> %13, float %72, i64 0
  %74 = extractelement <2 x float> %68, i64 1
  %75 = fsub fast float 1.000000e+00, %14
  %76 = fmul fast float %74, %75
  %77 = extractelement <4 x float> %13, i64 1
  %78 = fadd fast float %76, %77
  %79 = insertelement <4 x float> %73, float %78, i64 1
  %80 = extractelement <4 x float> %13, i64 3
  %81 = fadd fast float %63, %80
  %82 = insertelement <4 x float> %79, float %81, i64 3
  %83 = fadd fast float %14, 0xBFD5555560000000
  %84 = add nuw nsw i32 %15, 1
  %85 = icmp eq i32 %84, 3
  br i1 %85, label %99, label %12, !llvm.loop !99

; ── final per-channel normalisation: (0.5, 1/3, 0.5) and alpha 1/7 ──
  %87 = fmul fast float %168, 0x3FC24924A0000000
  %88 = shufflevector <4 x float> %166, <4 x float> poison, <3 x i32> <i32 0, i32 1, i32 2>
  %89 = fmul fast <3 x float> %88, <float 5.000000e-01, float 0x3FD5555560000000, float 5.000000e-01>
  %90 = shufflevector <3 x float> %89, <3 x float> poison, <4 x i32> <i32 0, i32 1, i32 2, i32 undef>
  %91 = insertelement <4 x float> %90, float %87, i64 3
  %92 = insertelement <3 x float> poison, float %87, i64 0
  %93 = shufflevector <3 x float> %92, <3 x float> poison, <3 x i32> zeroinitializer
  %94 = shufflevector <4 x float> %91, <4 x float> poison, <3 x i32> <i32 0, i32 1, i32 3>
  %95 = fmul fast <3 x float> %94, %93
  %96 = shufflevector <3 x float> %95, <3 x float> poison, <4 x i32> <i32 0, i32 1, i32 2, i32 undef>
  %97 = shufflevector <4 x float> %90, <4 x float> %96, <4 x i32> <i32 4, i32 5, i32 2, i32 6>
  %98 = select i1 %3, <4 x float> %97, <4 x float> %91
  ret <4 x float> %98
