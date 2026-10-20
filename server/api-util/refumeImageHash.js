/**
 * Refume: perceptual "fingerprints" of listing photos (pHash, 64 bits), so the same photo
 * used in several listings is found even after resizing or recompression.
 * Pure JavaScript: JPEG decoding with the vendored jpeg-js decoder.
 *
 * Distance guide (bits that differ): 0–6 same photo, 7–12 similar, more = different.
 */
const decodeJpeg = require('../vendor/jpeg-js-decoder');

const N = 32; // image is reduced to 32×32 grey
const K = 8; // low-frequency 8×8 DCT block is used
const SAME_PHOTO_MAX_DISTANCE = 6;

const isJpeg = buffer => buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8;

const COS = Array.from({ length: K }, (_, u) =>
  Array.from({ length: N }, (_, x) => Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N)))
);

const toGray32 = img => {
  const { width, height, data } = img;
  const out = new Float64Array(N * N);
  for (let cy = 0; cy < N; cy++) {
    const y0 = Math.floor((cy * height) / N);
    const y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * height) / N));
    for (let cx = 0; cx < N; cx++) {
      const x0 = Math.floor((cx * width) / N);
      const x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * width) / N));
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          count++;
        }
      }
      out[cy * N + cx] = count ? sum / count : 0;
    }
  }
  return out;
};

/** 64-bit perceptual hash as a 16-character hex string, or null when not a JPEG. */
const pHashFromJpeg = buffer => {
  if (!isJpeg(buffer)) return null;
  const img = decodeJpeg(buffer, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 25 });
  if (!img?.width || !img?.height) return null;
  const g = toGray32(img);
  const coefs = [];
  for (let u = 0; u < K; u++) {
    for (let v = 0; v < K; v++) {
      let s = 0;
      for (let y = 0; y < N; y++) {
        const cu = COS[u][y];
        for (let x = 0; x < N; x++) s += g[y * N + x] * COS[v][x] * cu;
      }
      coefs.push(s);
    }
  }
  const ac = coefs.slice(1); // skip the overall brightness
  const median = [...ac].sort((a, b) => a - b)[Math.floor(ac.length / 2)];
  let bits = ac.map(c => (c > median ? '1' : '0')).join('') + '0';
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
};

const POPCOUNT = Array.from({ length: 16 }, (_, n) => n.toString(2).replace(/0/g, '').length);

/** Number of differing bits between two hex hashes (0 = identical). */
const hammingDistance = (a, b) => {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) d += POPCOUNT[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  return d;
};

const isUsableHash = hash => typeof hash === 'string' && /^[0-9a-f]{16}$/.test(hash) && !/^(0{16}|f{16})$/.test(hash);

module.exports = { pHashFromJpeg, hammingDistance, isUsableHash, SAME_PHOTO_MAX_DISTANCE };
