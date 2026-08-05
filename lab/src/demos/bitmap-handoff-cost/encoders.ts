/**
 * Ways to turn a pixel buffer into something an `<img>` or an SVG `feImage` can point at,
 * so their costs can be compared instead of assumed.
 *
 * The question this exists to answer: `canvas.toDataURL('image/png')` bundles three
 * separate costs — a GPU→CPU readback, a full deflate compression pass, and a base64
 * expansion — and at a 120Hz frame budget of 8.33ms it is not obvious which of them, if
 * any, is the one that matters. Hand-writing the container lets each be removed
 * independently:
 *
 * - **Uncompressed PNG.** PNG's IDAT is a zlib stream, and zlib permits *stored* deflate
 *   blocks — no Huffman coding, no LZ77 window, just a 5-byte header per 64KB of literal
 *   bytes. That is a valid PNG every decoder accepts, and it deletes the compression cost
 *   entirely. What remains is one CRC-32 over the pixel data and one Adler-32.
 * - **BMP.** No checksums at all, so it isolates what the CRC and Adler passes were worth.
 *   The catch is that 32-bit `BI_RGB` alpha is widely ignored by decoders, which is fine
 *   for an opaque map and wrong for anything translucent.
 * - **Data URL vs blob URL.** Same bytes either way, so the difference is base64 plus the
 *   string allocation.
 *
 * None of these touch a canvas, which is the actual point when the pixels were generated
 * in JS to begin with: a displacement map is computed into a `Uint8ClampedArray`, and
 * `putImageData` followed by `toDataURL` pushes it to the GPU only to read it straight
 * back.
 */

export interface Rgba {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------------------
// Checksums

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array, from: number, to: number): number => {
  let c = 0xffffffff;
  for (let i = from; i < to; i++) {
    c = (crcTable[(c ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

/**
 * Adler-32, with the modulo hoisted out of the inner loop.
 *
 * 5552 is the most bytes that can be accumulated before `b` can overflow a 32-bit int,
 * which is what makes one `%` per 5552 bytes safe instead of one per byte.
 */
const adler32 = (bytes: Uint8Array): number => {
  let a = 1;
  let b = 0;
  let i = 0;
  const n = bytes.length;
  while (i < n) {
    const end = Math.min(i + 5552, n);
    for (; i < end; i++) {
      a += bytes[i] ?? 0;
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
};

// ---------------------------------------------------------------------------------------
// PNG with stored deflate blocks

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const DEFLATE_MAX_BLOCK = 0xffff;

const writeU32 = (out: Uint8Array, at: number, value: number): void => {
  out[at] = (value >>> 24) & 0xff;
  out[at + 1] = (value >>> 16) & 0xff;
  out[at + 2] = (value >>> 8) & 0xff;
  out[at + 3] = value & 0xff;
};

/**
 * A valid PNG carrying the pixels verbatim.
 *
 * The scanline filter byte is 0 (None) on every row, which is required by the format and
 * is also the only choice that keeps this a copy rather than a transform.
 */
export const encodeUncompressedPng = ({ data, width, height }: Rgba): Uint8Array => {
  const stride = width * 4;
  const rawLength = height * (stride + 1);

  // Scanlines with their filter bytes, which is what the zlib stream carries.
  const raw = new Uint8Array(rawLength);
  for (let y = 0; y < height; y++) {
    const at = y * (stride + 1);
    raw[at] = 0;
    raw.set(data.subarray(y * stride, y * stride + stride), at + 1);
  }

  const blocks = Math.max(1, Math.ceil(rawLength / DEFLATE_MAX_BLOCK));
  const idatLength = 2 + blocks * 5 + rawLength + 4; // zlib header + block headers + data + adler
  const total = PNG_SIGNATURE.length + (12 + 13) + (12 + idatLength) + 12;
  const out = new Uint8Array(total);

  let at = 0;
  out.set(PNG_SIGNATURE, at);
  at += PNG_SIGNATURE.length;

  // IHDR
  writeU32(out, at, 13);
  at += 4;
  const ihdrStart = at;
  out[at] = 0x49;
  out[at + 1] = 0x48;
  out[at + 2] = 0x44;
  out[at + 3] = 0x52; // 'IHDR'
  at += 4;
  writeU32(out, at, width);
  at += 4;
  writeU32(out, at, height);
  at += 4;
  out[at] = 8; // bit depth
  out[at + 1] = 6; // colour type: RGBA
  out[at + 2] = 0; // compression: deflate
  out[at + 3] = 0; // filter method
  out[at + 4] = 0; // no interlace
  at += 5;
  writeU32(out, at, crc32(out, ihdrStart, at));
  at += 4;

  // IDAT
  writeU32(out, at, idatLength);
  at += 4;
  const idatStart = at;
  out[at] = 0x49;
  out[at + 1] = 0x44;
  out[at + 2] = 0x41;
  out[at + 3] = 0x54; // 'IDAT'
  at += 4;
  // zlib header. 0x7801 % 31 === 0, which is the check the format requires.
  out[at] = 0x78;
  out[at + 1] = 0x01;
  at += 2;

  let written = 0;
  while (written < rawLength) {
    const size = Math.min(DEFLATE_MAX_BLOCK, rawLength - written);
    const isLast = written + size >= rawLength;
    out[at] = isLast ? 1 : 0; // BFINAL, BTYPE = 00 (stored)
    out[at + 1] = size & 0xff;
    out[at + 2] = (size >>> 8) & 0xff;
    out[at + 3] = ~size & 0xff;
    out[at + 4] = (~size >>> 8) & 0xff;
    at += 5;
    out.set(raw.subarray(written, written + size), at);
    at += size;
    written += size;
  }
  writeU32(out, at, adler32(raw));
  at += 4;
  writeU32(out, at, crc32(out, idatStart, at));
  at += 4;

  // IEND
  writeU32(out, at, 0);
  at += 4;
  const iendStart = at;
  out[at] = 0x49;
  out[at + 1] = 0x45;
  out[at + 2] = 0x4e;
  out[at + 3] = 0x44; // 'IEND'
  at += 4;
  writeU32(out, at, crc32(out, iendStart, at));

  return out;
};

// ---------------------------------------------------------------------------------------
// BMP

/**
 * A 32-bit top-down BMP. No checksums, so this is the floor for "wrap bytes in a container
 * a decoder will take".
 *
 * A negative height is what makes it top-down, matching how everything else here is
 * ordered. Rows are BGRA, so this is a byte swizzle rather than a copy.
 */
export const encodeBmp = ({ data, width, height }: Rgba): Uint8Array => {
  const stride = width * 4;
  const pixels = stride * height;
  const offset = 14 + 40;
  const out = new Uint8Array(offset + pixels);
  const view = new DataView(out.buffer);

  out[0] = 0x42;
  out[1] = 0x4d; // 'BM'
  view.setUint32(2, out.length, true);
  view.setUint32(10, offset, true);
  view.setUint32(14, 40, true); // BITMAPINFOHEADER
  view.setInt32(18, width, true);
  view.setInt32(22, -height, true); // negative: top-down
  view.setUint16(26, 1, true); // planes
  view.setUint16(28, 32, true); // bits per pixel
  view.setUint32(30, 0, true); // BI_RGB
  view.setUint32(34, pixels, true);

  for (let i = 0; i < pixels; i += 4) {
    const at = offset + i;
    out[at] = data[i + 2] ?? 0; // B
    out[at + 1] = data[i + 1] ?? 0; // G
    out[at + 2] = data[i] ?? 0; // R
    out[at + 3] = data[i + 3] ?? 0; // A, which BI_RGB decoders may ignore
  }

  return out;
};

// ---------------------------------------------------------------------------------------
// URLs

/**
 * Base64, in chunks, because `String.fromCharCode(...bytes)` on a whole megabyte-scale
 * buffer overflows the argument limit. The chunking is not the cost — `btoa` and the
 * intermediate binary string are.
 */
export const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

export const toDataUrl = (bytes: Uint8Array, mime: string): string => `data:${mime};base64,${toBase64(bytes)}`;

export const toBlobUrl = (bytes: Uint8Array, mime: string): string =>
  URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: mime }));
