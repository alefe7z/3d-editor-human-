# Runtime prototype: MakeHuman targets in three.js (no Blender, no baked morphs)

Page: `web/runtime.html` (+ `runtime.js`, `mh/human.js`). Needs `web/data/` (below); `?shot` keeps the drawing buffer for screenshots.

## How it works
- `tools/export_data.py` packs CC0 MakeHuman data from the installed MPFB (`...\extensions\user_default\mpfb\data`) into `web/data/` (git-ignored, regenerate with `python tools/export_data.py`):
  `mesh.bin` (base positions, uv, vertex map, triangles; body group only = 13 380 verts), `macro.json`, `meta.json`, `targets/*.bin` (348 sparse macro targets, int16 deltas, 28.5 MB total, loaded on demand). The int16 step (`meta.deltaStep`) is derived from the largest |delta| (10.67 dm, the baby race targets), so nothing is clipped; the earlier fixed 0.0003 dm step clipped 6 baby targets at 9.83 dm (babies up to 80 mm off, children 37 mm). Regenerate `web/data/` made before this fix.
- `web/mh/human.js` ports MPFB `TargetService.calculate_target_stack_from_macro_info_dict`: macro sliders -> interpolated weights (race x gender x age, universal gender-age-muscle-weight, height, proportions) -> `positions = base + sum(w_i * target_i)`. Engine-agnostic (typed arrays + a loader).
- `runtime.js` drives a THREE.BufferGeometry from it. `Human` computes the normals on the welded body mesh (before the UV-seam split), so there are no lighting seams. `apply()` calls are serialised (overlapping calls never mix in the shared buffer), targets are fetched in parallel, a failed fetch is not cached (retried on the next change), and the page reports load / update errors on screen instead of freezing. All race sliders at 0 fall back to the equal mix. 3-140 ms per update, depending on how many new targets must be fetched.
- Tests: `tests/runtime.test.mjs` (synthetic data, no `web/data/` needed).

## Verification against MPFB (Blender)
`<scratch>/scripts/dump_reference.py` (local, not committed) dumps MPFB's own vertex positions for 5 macro profiles, `compare.mjs` diffs them against the JS runtime:
max error 0.6-1.1 mm (3.6 mm for the child case) on a ~1.7 m body, i.e. visually identical.
Re-checked 2026-11-27 against an unquantised float sum of the MPFB `.target.gz` files (default, old tall male, child, baby, heavy african female): max error 0.013-0.038 mm with the derived step (before: 37 mm child, 80 mm baby).
Axis mapping: OBJ (x, y, z) -> Blender (x, -z, y); units are decimetres (x0.1 = metres).

## Not done yet
- Skeleton + skin weights (`rig.game_engine.json`/`weights.*.json`) and joint repositioning per morph.
- Detail targets (face, ears, nose, ...; thousands of micro targets), cupsize/firmness, baby proportions.
- Clothes (`.mhclo` proxy fitting), hair, eyes/teeth, skin textures (MakeHuman skin blending by race).
- Data size: 28.5 MB of targets; consider gzip on the server, float16 and dropping rarely used targets.
