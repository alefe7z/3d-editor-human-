// SPDX-License-Identifier: MIT
// Hair cards drawn with the vendored threejs-hair-shader (web/third_party/threejs-hair-shader, MIT, unmodified):
// an alpha-to-coverage pass with no hard alpha cut (fine, anti-aliased strand edges), a soft transparent fringe on
// top, an anisotropic highlight along the strands, per-strand brightness and roughness variation, self-shadowing of
// edge-on cards and an optional two-colour root. This file is the glue for the MakeHuman hair of this project:
//
// - Atlas: the shader wants linear data (R coverage, G root -> tip, B per-strand seed). MakeHuman hair has an RGBA
//   colour texture instead, so buildHairAtlas() derives it: R = G = texture alpha (G doubles as the coverage the
//   stock shadow shader reads), B = the texel's brightness relative to the style's mean, scaled so that the
//   shader's seed variation reproduces the texture's own strand contrast at seedAmp 0.36.
// - Root -> tip comes from the _CCHAIR vertex attribute (distance from the scalp), not from an atlas channel: the
//   shader's atlas reads of it are rewritten to `ccRootT` (web/materials.js patchHairShader).
// - The project's hair patch (shoulder collision, root/tip tone) runs on every pass, after the vendored one.
// - Both passes live on the SAME mesh as two geometry groups over the same triangles, so they share the skeleton,
//   morph targets, visibility and the collision uniforms with no extra mesh to keep in sync.
// - Strand direction: measured per texture (structure tensor of the alpha); the anisotropic highlight is only
//   turned on for cut-out strand cards whose strands have a clear direction (hairatlas.js hasStrandDirection).
// - Shadows: a per-mesh depth material cuts at the old glTF alpha cutoff, so the cards do not cast solid shadows.
// - Export (web/export): the GLB keeps the original textured material (`ccExportSource`).
import * as THREE from 'three';
import { createHairMaterials, HAIR_COLOR_STYLES, hairColorStyle } from './third_party/threejs-hair-shader/hair-shader.js';
import { patchHairShader } from './materials.js';
import { buildHairAtlas, hasStrandDirection, SEED_AMP_REF, MIN_COHERENCE, SHADOW_CUTOFF } from './hairatlas.js';

export { buildHairAtlas, hasStrandDirection, SEED_AMP_REF, MIN_COHERENCE, SHADOW_CUTOFF };

export { HAIR_COLOR_STYLES, hairColorStyle };


/** Live look of every hair style (UI sliders); see setHairLook(). */
export const DEFAULT_HAIR_LOOK = {
  hairShine: 0.5,          // anisotropic highlight strength (0 = off)
  hairSoft: 0.4,           // opacity of the soft fringe pass (0 = off)
  hairDensity: 1.2,        // coverage gain of the main pass: lower = thinner strands
  hairStrandVar: 0.36,     // per-strand brightness variation (0.36 = the texture's own contrast)
  hairRootColor: '#1a1008',
  hairRootMix: 0,          // two-colour root: 0 = off, 1 = root colour fully at the scalp
};

/** Shared uniform objects: every pass of every style points at these, so a slider change needs no recompile. */
export const hairLookUniforms = {
  uHairRootDark: { value: 1 },            // the vendored mono darkening is off: patchHairShader's tone does it
  uHairRootMode: { value: 0 },
  uHairRootColor: { value: new THREE.Color(DEFAULT_HAIR_LOOK.hairRootColor) },
  uHairRootStr: { value: 0 },
  uHairSeedAmp: { value: DEFAULT_HAIR_LOOK.hairStrandVar },
  uHairRoughFlr: { value: 0.55 },
  uHairRoughSeed: { value: 0.08 },
  uHairDensity: { value: DEFAULT_HAIR_LOOK.hairDensity },
  uBlendDensity: { value: 2.5 },
};

const atlasCache = new WeakMap();        // image -> { texture, info }
function atlasFor(map, renderer) {
  const img = map.image;
  if (atlasCache.has(img)) return atlasCache.get(img);
  const w = img.width, h = img.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const info = buildHairAtlas(ctx.getImageData(0, 0, w, h).data, w, h);
  const tex = new THREE.DataTexture(info.data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.NoColorSpace;   // data, not colour
  tex.flipY = map.flipY;                 // same orientation as the colour texture (glTF: false)
  tex.wrapS = map.wrapS; tex.wrapT = map.wrapT; tex.channel = map.channel;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() ?? 1);
  tex.name = `${map.name || 'hair'}_atlas`;
  tex.needsUpdate = true;
  const r = { texture: tex, info: { meanLum: info.meanLum, coverage: info.coverage, strandAngle: info.strandAngle, coherence: info.coherence } };
  atlasCache.set(img, r);
  return r;
}

// The vendored shader reads root -> tip from the atlas G channel; these are its reads (rewritten to ccRootT).
const ROOT_READS = ['hairAtlas.g', 'texture2D( alphaMap, vAlphaMapUv ).g'];
const EXPECT_READS = { a2c: 2, outer: 2, inner: 2, blend: 1 };

function chain(mat, flags) {
  const theirs = mat.onBeforeCompile, key = mat.customProgramCacheKey;
  const pass = mat.userData.hairPass;
  mat.onBeforeCompile = (sh, r) => {
    theirs?.call(mat, sh, r);
    for (const k of Object.keys(hairLookUniforms)) if (k in sh.uniforms) sh.uniforms[k] = hairLookUniforms[k];
    let f = sh.fragmentShader, reads = 0;
    for (const a of ROOT_READS) { const parts = f.split(a); reads += parts.length - 1; f = parts.join('ccRootT'); }
    sh.fragmentShader = f;
    if (reads !== (EXPECT_READS[pass] ?? reads)) console.warn(`[hair] ${mat.name}: ${reads} root reads rewritten, expected ${EXPECT_READS[pass]} (vendored shader changed?)`);
    patchHairShader(sh, flags);
    mat.userData.ccRootReads = reads;
  };
  mat.customProgramCacheKey = () => `${key ? key.call(mat) : ''}|ccHairPass${flags.hasLen}${flags.hasEdge}`;
  mat.needsUpdate = true;
}

function depthMaterial() {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  // three copies the pass's alphaMap (the atlas, coverage in G) and its alphaTest (0) onto this material every
  // frame; the cut is therefore fixed in the shader instead of alphaTest
  m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', `if ( diffuseColor.a < ${SHADOW_CUTOFF.toFixed(3)} ) discard;`);
  };
  m.customProgramCacheKey = () => 'ccHairDepth';
  return m;
}

const registry = new Set();              // { outer, inner, blend, info }
let currentLook = { ...DEFAULT_HAIR_LOOK };

/**
 * Replaces the single hair material of `mesh` (already upgraded by upgradeHair: `base`) with the vendored passes.
 * Returns the pass record, or null when the material has no usable colour texture (the mesh keeps `base`).
 */
export function applyHairPasses(mesh, base, { renderer } = {}) {
  if (!base?.map?.image || !mesh.geometry) return null;
  const { texture: atlas, info } = atlasFor(base.map, renderer);
  const geo = mesh.geometry;
  const flags = { hasLen: !!geo.attributes._cchair, hasEdge: !!geo.attributes._ccedge };
  const { outer, inner, blend, mode } = createHairMaterials(THREE, base, {
    atlas, renderer, alphaChannel: 'r', color: `#${base.color.getHexString()}`, roughness: base.roughness,
    density: currentLook.hairDensity, blendOpacity: currentLook.hairSoft, rootDarkening: 1,
    seedVariation: currentLook.hairStrandVar,
  });
  const gain = (Number(base.userData?.tint?.gain) || 1) * info.meanLum;
  const passes = [outer, inner, blend].filter(Boolean);
  for (const m of passes) {
    m.defines = { STANDARD: '', PHYSICAL: '' };          // MeshStandardMaterial.copy drops PHYSICAL
    m.specularIntensity = base.specularIntensity;
    m.envMapIntensity = base.envMapIntensity;
    m.color.copy(base.color);
    // the colour texture is gone (the atlas is data): its mean brightness moves into the tint gain
    m.userData.tint = { ...(base.userData?.tint || {}), gain };
    Object.defineProperty(m, 'ccExportSource', { value: base, configurable: true });   // not cloned / serialised
    chain(m, flags);
  }
  geo.clearGroups();
  const count = geo.index ? geo.index.count : geo.attributes.position.count;
  passes.forEach((_, i) => geo.addGroup(0, count, i));
  mesh.material = passes;
  mesh.customDepthMaterial = depthMaterial();
  const rec = { mesh, outer, inner, blend, mode, info, atlas };
  registry.add(rec);
  applyLook(rec, currentLook);
  return rec;
}

function applyLook(rec, look) {
  const shine = Math.max(0, Math.min(1, +look.hairShine || 0));
  // the highlight needs a smooth enough surface to show: shine also sets the roughness (0.5 -> 0.62, close to
  // the single-pass hair's 0.66); the stretch along the strands only where the texture has one direction
  const rough = shineRoughness(shine);
  for (const m of [rec.outer, rec.inner].filter(Boolean)) {
    m.roughness = rough;
    m.anisotropy = hasStrandDirection(rec.info) ? shine : 0;   // 0 <-> > 0 switches a define (one recompile)
    m.anisotropyRotation = rec.info.strandAngle;
  }
  if (rec.blend) {
    const soft = Math.max(0, Math.min(1, +look.hairSoft || 0));
    rec.blend.opacity = soft;
    rec.blend.visible = soft > 0 && rec.mode === 'both';
  }
}

/** Roughness of the main pass for a shine value 0..1 (0.85 matte .. 0.39 glossy). */
export const shineRoughness = shine => 0.85 - 0.46 * shine;

/** Applies the look (DEFAULT_HAIR_LOOK keys) to every hair style, loaded now or later. */
export function setHairLook(look = {}) {
  currentLook = { ...DEFAULT_HAIR_LOOK, ...currentLook, ...look };
  const L = currentLook, U = hairLookUniforms;
  U.uHairDensity.value = Math.max(0.1, +L.hairDensity || DEFAULT_HAIR_LOOK.hairDensity);
  U.uHairSeedAmp.value = Math.max(0, +L.hairStrandVar || 0);
  U.uHairRoughFlr.value = Math.max(0.2, shineRoughness(Math.max(0, Math.min(1, +L.hairShine || 0))) - 0.07);
  const mix = Math.max(0, Math.min(1, +L.hairRootMix || 0));
  U.uHairRootMode.value = mix > 0 ? 1 : 0;
  U.uHairRootStr.value = mix;
  U.uHairRootColor.value.set(L.hairRootColor || DEFAULT_HAIR_LOOK.hairRootColor);
  for (const rec of registry) applyLook(rec, L);
}

/** Test / tuning hook: the pass materials of the visible hair meshes. */
export const hairPassMaterials = () => [...registry].filter(r => r.mesh.visible).flatMap(r => [r.outer, r.inner, r.blend].filter(Boolean));

/** Test / tuning hook: one entry per hair mesh with passes. */
export function hairPassState() {
  return [...registry].map(r => ({
    mesh: r.mesh.name, visible: r.mesh.visible, mode: r.mode, passes: [].concat(r.mesh.material).map(m => m.name),
    groups: r.mesh.geometry.groups.length, meanLum: +r.info.meanLum.toFixed(3), coverage: +r.info.coverage.toFixed(3),
    strandAngleDeg: +(r.info.strandAngle * 180 / Math.PI).toFixed(1), coherence: +r.info.coherence.toFixed(2),
    anisotropy: r.outer.anisotropy, roughness: +r.outer.roughness.toFixed(3), blendOpacity: r.blend?.opacity ?? null, blendVisible: r.blend?.visible ?? null,
    rootReads: [].concat(r.mesh.material).map(m => m.userData.ccRootReads ?? null),
  }));
}
