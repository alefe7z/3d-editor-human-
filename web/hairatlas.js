// SPDX-License-Identifier: MIT
// Pure (no three.js) analysis of a MakeHuman hair colour texture for the vendored hair shader (web/hairpasses.js):
// the linear data atlas it samples and the strand direction of the texture. Kept free of imports so node tests
// can run it.

export const SEED_AMP_REF = 0.36;        // seedVariation at which the shader reproduces the texture's own contrast
export const MIN_COHERENCE = 0.3;        // below: no single strand direction in the texture (curly / mixed cards)
export const SHADOW_CUTOFF = 0.35;       // the glTF alphaCutoff of the MakeHuman hair materials
export const MAX_CARD_COVERAGE = 0.95;   // above: an opaque painted mesh (braid01), not cut-out strand cards

/** True when the texture is strand cards whose strands run in one clear direction (the anisotropic highlight
 *  follows that direction; on curly / mixed cards or an opaque painted mesh it stays off). */
export const hasStrandDirection = info => info.coverage < MAX_CARD_COVERAGE && info.coherence >= MIN_COHERENCE;

/**
 * Pure analysis of an RGBA8 hair texture (no three.js): the atlas bytes plus what the passes need.
 * @returns {{ data: Uint8Array, meanLum: number, coverage: number, strandAngle: number, coherence: number }}
 *   strandAngle: radians in texture (u, v) space, the axis the strands run along; coherence 0..1.
 */
export function buildHairAtlas(rgba, w, h, { cutoff = SHADOW_CUTOFF, seedAmp = SEED_AMP_REF } = {}) {
  const n = w * h;
  let sumL = 0, cnt = 0, sumA = 0, jxx = 0, jyy = 0, jxy = 0;
  const A = i => rgba[i * 4 + 3];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, a = rgba[i * 4 + 3] / 255;
    sumA += a;
    if (a > cutoff) { sumL += (rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2]) / 765; cnt++; }
    const gx = (A(y * w + Math.min(w - 1, x + 1)) - A(y * w + Math.max(0, x - 1))) / 510;
    const gy = (A(Math.min(h - 1, y + 1) * w + x) - A(Math.max(0, y - 1) * w + x)) / 510;
    jxx += gx * gx; jyy += gy * gy; jxy += gx * gy;
  }
  const meanLum = cnt ? sumL / cnt : 1;
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3], L = (rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2]) / 765;
    const seed = 0.5 + (L / meanLum - 1) / (2 * seedAmp);
    data[i * 4] = a; data[i * 4 + 1] = a;
    data[i * 4 + 2] = Math.round(255 * Math.min(1, Math.max(0, seed)));
    data[i * 4 + 3] = 255;
  }
  const tr = jxx + jyy;
  // the alpha gradient is strongest ACROSS the strands, so the strands run at the gradient angle + 90 degrees
  const gradAngle = 0.5 * Math.atan2(2 * jxy, jxx - jyy);
  const coherence = tr > 0 ? Math.sqrt((jxx - jyy) ** 2 + 4 * jxy * jxy) / tr : 0;
  return { data, meanLum, coverage: sumA / n, strandAngle: gradAngle + Math.PI / 2, coherence };
}

