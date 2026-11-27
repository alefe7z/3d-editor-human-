# Hair shader (stage 1: fine, fluid strands)

The viewer (`web/index.html`) draws the MakeHuman hair cards with the vendored
[threejs-hair-shader](https://github.com/creategamecharacters/threejs-hair-shader) (MIT, `web/third_party/`,
unmodified). `?hairShader=0` keeps the old single-pass hair for comparison.

## What it adds
- Two passes on the same mesh (two geometry groups over the same triangles, so skeleton, morphs, visibility and
  collision stay shared): an alpha-to-coverage pass with no hard alpha cut (anti-aliased, finer strand edges) and
  a soft transparent fringe on top. Without MSAA the shader's own fallback (transparent outer + opaque core) is used.
- Anisotropic highlight along the strands, per-strand brightness / roughness variation (from the texture's own
  strand contrast), self-shadowing of edge-on cards, optional two-colour root (root colour fading to the tip).
- UI (section "Colours and hair", da/en): colour presets (the shader's 13 swatches), root colour + strength,
  shine, soft tips, density (thin <-> thick), strand variation. `__set(key, value)` for each, plus
  `__set('hairPreset', name)`; `window.__hairPasses()` reports the state per mesh.

## How the MakeHuman hair is adapted (`web/hairpasses.js`, `web/hairatlas.js`)
- Atlas from the colour texture: R = G = alpha (coverage; G is what the stock shadow shader reads), B = texel
  brightness / style mean, scaled so the shader's seed variation 0.36 reproduces the texture's contrast.
  The colour texture's mean brightness moves into the tint gain, so the colour picker keeps its meaning.
- Root -> tip from the `_CCHAIR` vertex attribute (distance from the scalp): the shader's atlas reads are
  rewritten to `ccRootT` (counted; a console warning if the vendored file changes). The project's own patch
  (shoulder collision, root/tip tone) runs on both passes.
- Strand direction per texture from the structure tensor of the alpha. The highlight stretches along it only on
  cut-out cards with a clear direction (coverage < 0.95, coherence >= 0.3): long01, bob01, bob02, short04 yes;
  afro01, ponytail01, short02 (no single direction) and braid01 (opaque painted mesh) no. Shine also sets the
  roughness (0.5 -> 0.62, close to the old 0.66), otherwise the highlight would not show.
- Shadows: a per-mesh depth material cuts at the old alpha cutoff 0.35.
- Export: the GLB keeps the original textured material (`ccExportSource`); the tint is handed on to it.

## Measured (headless Chromium, swiftshader, 4x MSAA; female body, no clothes)
- Hair area on screen vs the old single pass: ratio 1.000-1.007 (long, bob, short; front and back), 1.05 short front.
- Mean hair brightness, long01: back 21.2 -> 24.6, front 36.5 -> 33.3 (0..255).
- Hair shadow on the skin: identical to the old one (1697 px, mean darkening 23.1).
- Export: identical GLB (3 887 068 bytes, same hair material, texture and cutoff, no duplicated triangles).
- Controls (pixels changed > 12 levels, long01): root colour 143 764; shine 0 -> 1 7 651 (side view); soft tips
  0 vs 0.4 2 199 (edges); density 0.8 vs 1.2 2 039, above 1.2 none (the MakeHuman alpha is ~binary, so the slider
  stops at 1.5); strand variation is subtle on the dark default colour (mean 0.93).
- No console errors; collision code in both passes, collider radii unchanged.

## Not done (later stages)
- Strand physics (natural fall / sway) and length / volume sliders (stages 2 and 3).
- The new hair look values are not in the saved settings / share links yet.
- Brows and lashes keep the old single pass.
- Only checked in software rendering here: a real GPU and the visual result still need a look.
