// SPDX-License-Identifier: MIT
// Hair passes (web/hairpasses.js + the vendored threejs-hair-shader): the pure atlas analysis, the vendored
// file's integrity and the shader anchors the glue rewrites, and the tint hand-off to the export material.
// The rendering itself is checked in a browser (headless Chromium), not here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildHairAtlas, hasStrandDirection, SEED_AMP_REF, MIN_COHERENCE } from '../web/hairatlas.js';
import { applyTint } from '../web/character.js';

const VENDORED = fileURLToPath(new URL('../web/third_party/threejs-hair-shader/hair-shader.js', import.meta.url));
const VENDORED_SHA256 = '947cff0ec4ccd55f5f812c1ff5223759d83119a0e9d8071c2f9e56b074819ed6';   // upstream f0d6cf0d (web/third_party/threejs-hair-shader/README.md)

// RGBA8 texture: f(x, y) -> [r, g, b, a] (0..255)
function tex(w, h, f) {
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(f(x, y), (y * w + x) * 4);
  return d;
}
const deg = r => ((r * 180 / Math.PI) % 180 + 180) % 180;   // an axis: 0..180

test('atlas: R = G = alpha, A = 255; B = brightness relative to the mean (0.5 at the mean)', () => {
  const t = tex(8, 8, (x, y) => (x < 4 ? [100, 100, 100, 255] : [200, 200, 200, 128]));
  const r = buildHairAtlas(t, 8, 8);
  for (let i = 0; i < 64; i++) {
    assert.equal(r.data[i * 4], t[i * 4 + 3]);
    assert.equal(r.data[i * 4 + 1], t[i * 4 + 3]);
    assert.equal(r.data[i * 4 + 3], 255);
  }
  // mean over covered texels (alpha > 0.35): both halves, (100 + 200) / 2 / 255
  assert.ok(Math.abs(r.meanLum - 150 / 255) < 1e-9, `${r.meanLum}`);
  // seed = 0.5 + (L / mean - 1) / (2 * 0.36): 100 -> 0.5 - 0.4630 = 0.037, 200 -> 0.963
  const seedAt = i => r.data[i * 4 + 2] / 255;
  assert.ok(Math.abs(seedAt(0) - (0.5 + (100 / 150 - 1) / (2 * SEED_AMP_REF))) < 1 / 255);
  assert.ok(Math.abs(seedAt(7) - (0.5 + (200 / 150 - 1) / (2 * SEED_AMP_REF))) < 1 / 255);
  // the shader's strand multiplier at seedAmp 0.36 gives back the texel / mean brightness ratio
  const mul = s => 1 + (s - 0.5) * 2 * SEED_AMP_REF;
  assert.ok(Math.abs(mul(seedAt(0)) - 100 / 150) < 0.01 && Math.abs(mul(seedAt(7)) - 200 / 150) < 0.01);
});

test('atlas: strand direction = the axis the alpha stripes run along; coherence separates combed from curly', () => {
  const W = 64;
  const vertical = buildHairAtlas(tex(W, W, x => [128, 128, 128, (x % 4) < 2 ? 255 : 0]), W, W);   // stripes along v
  const horizontal = buildHairAtlas(tex(W, W, (x, y) => [128, 128, 128, (y % 4) < 2 ? 255 : 0]), W, W);
  const diagonal = buildHairAtlas(tex(W, W, (x, y) => [128, 128, 128, ((x + y) % 6) < 3 ? 255 : 0]), W, W);
  let s = 7; const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const noise = buildHairAtlas(tex(W, W, () => [128, 128, 128, rnd() < 0.5 ? 255 : 0]), W, W);
  assert.ok(Math.abs(deg(vertical.strandAngle) - 90) < 1, `vertical ${deg(vertical.strandAngle)}`);
  assert.ok(deg(horizontal.strandAngle) < 1 || deg(horizontal.strandAngle) > 179, `horizontal ${deg(horizontal.strandAngle)}`);
  assert.ok(Math.abs(deg(diagonal.strandAngle) - 135) < 3, `diagonal ${deg(diagonal.strandAngle)}`);
  for (const r of [vertical, horizontal, diagonal]) assert.ok(r.coherence > 0.9, `coherence ${r.coherence}`);
  assert.ok(noise.coherence < MIN_COHERENCE, `noise coherence ${noise.coherence}`);
  assert.ok(Math.abs(vertical.coverage - 0.5) < 1e-9);
  assert.ok(hasStrandDirection(vertical) && !hasStrandDirection(noise));
  // an opaque painted mesh (braid01: alpha >= 213) is not cards: no highlight direction even with coherent stripes
  const opaque = buildHairAtlas(tex(W, W, x => [128, 128, 128, (x % 4) < 2 ? 255 : 230]), W, W);
  assert.ok(opaque.coherence > 0.9 && opaque.coverage > 0.95 && !hasStrandDirection(opaque));
});

test('atlas: an empty texture does not divide by zero', () => {
  const r = buildHairAtlas(new Uint8Array(4 * 4 * 4), 4, 4);
  assert.equal(r.meanLum, 1);
  assert.equal(r.coherence, 0);
  // no coverage: R = G = 0, A = 255; black texels sit below the (fallback) mean, so the seed clamps to 0
  assert.ok(r.data.every((v, i) => v === (i % 4 === 3 ? 255 : 0)));
});

test('vendored threejs-hair-shader: unmodified, MIT notice kept, and the anchors web/hairpasses.js rewrites exist', () => {
  const src = fs.readFileSync(VENDORED);
  assert.equal(crypto.createHash('sha256').update(src).digest('hex'), VENDORED_SHA256, 'hair-shader.js differs from the vendored upstream file');
  const text = src.toString('utf8');
  assert.match(text, /SPDX-License-Identifier: MIT/);
  assert.ok(fs.existsSync(new URL('../web/third_party/threejs-hair-shader/LICENSE', import.meta.url)));
  // root -> tip is read from G when coverage is in R (the glue passes alphaChannel 'r' and rewrites these reads)
  assert.match(text, /const rootChan = alphaSwz === 'a' \? 'r' : 'g';/);
  assert.equal(text.split('hairAtlas.${rootChan}').length - 1, 1);
  assert.equal(text.split('texture2D( alphaMap, vAlphaMapUv ).${rootChan}').length - 1, 2);   // tone (roughness) + fringe
  for (const u of ['uHairRootDark', 'uHairRootMode', 'uHairRootColor', 'uHairRootStr', 'uHairSeedAmp', 'uHairRoughFlr', 'uHairRoughSeed', 'uHairDensity', 'uBlendDensity'])
    assert.ok(text.includes(`shader.uniforms.${u} =`), `uniform ${u}`);
});

test('applyTint: a hair pass hands the tint on to the textured material the exporter writes', () => {
  const color = () => ({ v: null, k: 1, set(h) { this.v = h; this.k = 1; return this; }, multiplyScalar(s) { this.k *= s; return this; } });
  const src = { color: color(), userData: { tint: { gain: 2 } } };
  const pass = { color: color(), userData: { tint: { gain: 2 * 0.6 } } };
  Object.defineProperty(pass, 'ccExportSource', { value: src });
  applyTint(pass, '#3b2a1e');
  assert.equal(pass.color.v, '#3b2a1e'); assert.ok(Math.abs(pass.color.k - 1.2) < 1e-12);
  assert.equal(src.color.v, '#3b2a1e'); assert.equal(src.color.k, 2);
  assert.ok(!JSON.stringify(pass).includes('ccExportSource'), 'not serialised (non-enumerable)');
});
