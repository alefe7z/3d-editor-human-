# CharacterCreator - agent rules

The character system (`character-system/` is the product; XR and the compare
page are demo hosts). Plan: `docs/ROADMAP.md`. Status/todo: `docs/STATUS.md`.
Read `docs/BLENDER_WORKFLOW.md` before touching `blender/`.
Sister repos: CharacterCreatorXR and CharacterCreatorBaseline (vanilla MPFB
baseline + the live compare site).

Placeholders used in all committed files: `<scratch>` = the local scratch/work
directory, `<blender>` = the Blender executable, `<tools>` = local tool installs.
Never commit real machine paths, host names, IPs, users or key paths. Local,
machine-specific notes go in `AGENTS.local.md` (git-ignored).

## Git: one worktree per agent

- Never work in, `git checkout`/`git switch` in, or commit from the shared main
  working directory. Each agent gets its own worktree under `<scratch>`:
  `git worktree add <scratch>/wt/<name> -b <branch> master`
  and removes it (`git worktree remove`) when done.
- Never commit to `master`. Work on a named branch (`phase<N>/<milestone>`,
  `spike/<name>`). This repo's clothing spike is `spike/clothing-standard-cc`
  (not to be confused with Baseline's `spike/clothing-standard`).
- Never `git add -A` / `git add .`; stage exact paths.
- Never change or delete a ref someone else made without a backup tag on its
  SHA first (`backup/<context>/<name>-<sha7>`). Never `git reset --hard` or
  `git clean` in a main working directory. Never delete untracked files before
  `git diff --no-index` against the committed version shows they are identical.
- Do not touch other agents' worktrees.

## Deploy

- Do NOT deploy to `webxr/charactercreator/` from this repo. This repo's
  `deploy.ps1` (git-ignored) must not target `charactercreator`: that path is
  the live compare site and is written ONLY by CharacterCreatorBaseline's
  `deploy.ps1`.
- Rule for the local `deploy.ps1` (it is git-ignored, so this file is where the
  rule is recorded; re-apply it if the script is ever recreated from an old
  copy):
  - `-Name` has no default and is required.
  - The target `charactercreator` is refused (case-insensitively) in every mode,
    including `-DryRun`, `-StageOnly` and `-VerifyOnly`, with exit code 3.
  - Check (PowerShell): `.\deploy.ps1 -Name charactercreator -DryRun` must print
    `REFUSED: ...` and give `$LASTEXITCODE` 3.
- The live compare site is built from CharacterCreatorBaseline
  (`web/compare` + `build/baseline`) and deployed with that repo's
  `deploy.ps1` (`-DryRun`, `-VerifyOnly`, `-Rollback [-DryRun]`). Its server
  notes (vhost snippet for `.glb` MIME type, gzip and Cache-Control) are in
  CharacterCreatorBaseline `docs/SERVER_NOTES.md`.
- Agents never deploy anywhere. A deploy or server change happens only after
  the owner says yes to that specific action. Dry runs are fine (use
  PowerShell, not Git Bash, which rewrites Linux paths).

## Nothing public without the owner's yes

No push, fork, issue, comment, PR, release, tag push or deploy without the
owner's explicit yes for that action. Agents make drafts, local branches and
local tags only. MPFB contributions are written in a separate clone under
`<scratch>`. This repo is MIT (LICENSE, LICENSE-NOTES.md); new source files start
with `SPDX-License-Identifier: MIT`. Files derived from or linking to GPL code
(MPFB, Blender `bpy`) stay `GPL-3.0-or-later`; the list is in LICENSE-NOTES.md.
Third-party code: any licence that allows it, keep its notice; never code with
no licence. MPFB code still stays out of the viewer (architecture rule,
ROADMAP section 3).

## Images

Agents produce images/screenshots and measure numerically; agents running on
Opus do not view them. Visual review is done by Luna (and the owner). An
agent's acceptance criterion is always numeric; visual review is a separate gate.

## Commands

- Build: `<blender> -b --python blender/build_base.py -- output/base_body.glb`
- Scratch files go in `<scratch>`, finished assets in `output/`.
- Long runs (> ~2 min) go in the background with a log under `<scratch>`.

## For every coding agent (Codex, Claude Code, ...)

This file is the shared instruction file: Codex reads `AGENTS.md`, Claude Code
reads `CLAUDE.md` (which imports this file). Keep new rules here, not in a
tool-specific file. Status and numbers go in `docs/STATUS.md`.

### Owner preferences
- The owner writes Portuguese (pt-BR): answer in Portuguese; code, comments,
  commit messages and docs stay in English.
- Act on clear requests; ask only for decisions that are the owner's.
- Push only after an explicit "pode fazer push" for that push (see above).
- Prints / screenshots: produce them and send them, measure numerically,
  do not judge them visually (see "Images").

### Code map
- Main viewer (the editor): `web/index.html` + `web/main.js` on the baked GLBs in
  `output/` (built in Blender: `blender/build_base.py`). Sliders -> morphs:
  `web/character.js`. Materials: `web/materials.js`. Export: `web/export/`.
- Hair look (2026-11-27): `web/hairpasses.js` + `web/hairatlas.js` (MIT, ours)
  around the vendored `web/third_party/threejs-hair-shader/` (MIT, keep it
  byte-identical; `tests/hairpasses.test.mjs` checks its SHA-256 and the shader
  anchors we rewrite). `?hairShader=0` = old single pass. Details and measured
  numbers: `docs/HAIR_SHADER.md`.
- Runtime generator (MakeHuman targets summed in the browser, no Blender):
  `web/runtime.html` + `web/runtime.js`, `web/mh/human.js` (GPL: follows MPFB's
  target stack), `web/mh/details.js` (MIT: face / chest detail sliders).
  Data: `python tools/export_data.py [MPFB_DATA_DIR] [OUT]` -> `web/data/`
  (git-ignored). Doc: `docs/RUNTIME_PROTOTYPE.md`.

### Verify before you commit
- `npm test` (about 4-5 min, run it in the background). Expected today:
  all pass except 2 `# TODO KNOWN FAULT` tests (need Blender) and
  `tests/cloth.test.mjs` "long coat ... (chaotic)", which already failed
  before 2026-11-27 (5 of 8 perturbations, needs 6). Anything else is yours.
- Browser checks (headless Chromium / Playwright): serve `web/` + `output/`
  together over HTTP (the page needs HTTP, not `file://`). three.js comes from
  cdn.jsdelivr.net (`three@0.170.0`); where that host is blocked, install
  `three@0.170.0` from npm and route the CDN URLs to it with `page.route`.
  Use `--use-angle=swiftshader` without a GPU.
- Headless pages may not run the animation loop: call
  `__cloth.manual(true)` and `__cloth.advance(seconds)` (fixed 1/60 s steps).
- Test hooks: `__set(key, value)`, `__values()`, `__view(name)`,
  `__camTo(pos, target)`, `__export(options)` (-> GLB ArrayBuffer),
  `__hairPasses()`, `__hairState()`, `__breast()`, `__eyes`, `__anim`;
  runtime page: `__set`, `__camTo`, `__bbox`, `__ready` / `__error`.
- Acceptance is numeric: e.g. parts follow the skin within mm, GPU render vs
  CPU positions, pixel counts against a reference render, export byte size.

### Things learned the hard way (do not re-break)
- MPFB's macro interpolation uses STRICT bounds on purpose; `macro.json`
  widens the outer bounds (-0.01 / 1.01). Not a bug.
- Breast macros (cupsize / firmness) are female-only targets NOT scaled by the
  gender weight (MPFB behaviour); no baby targets; no averagecup-averagefirmness.
- `tools/export_data.py`: the int16 step is derived from the largest delta
  (baby targets reach 10.67 dm); a fixed step clipped them silently.
- Runtime normals are computed on the welded body mesh (UV seams split
  vertices: 14 517 render vs 13 380 body vertices).
- three.js: `MeshStandardMaterial.copy` drops the `PHYSICAL` define; the shadow
  pass copies `alphaTest` / `alphaMap` from the material every frame (hair uses
  a depth material with the cut in the shader); anisotropy needs a smooth
  surface to be visible.
- MakeHuman hair alpha is ~binary (density > 1.2 saturates); `braid01` is an
  opaque painted mesh, not cards; afro01 / ponytail01 / short02 have no single
  strand direction.
- If the face looks out of place in a browser but the numbers are fine, suspect
  a stale `build/site` or browser cache (old GLB + new joints sidecar).

### Open work (owner's order of interest)
1. Hair stage 2: strand physics / natural fall (start from
   `experiments/cloth/hair.mjs` and `docs/CLOTH_SOLVER_REPORT.md`: XPBD chains,
   0 penetrations for long hair). Stage 3: length / volume sliders.
2. Runtime generator: skeleton + skin weights from MPFB `rigs/standard`
   (`rig.game_engine.json`: bone heads/tails = mean of `joint-*` helper
   vertices, so `export_data.py` must also pack those helper vertices).
3. Save the hair look values in settings / share links; brows and lashes on the
   new hair passes.
4. Owner's name in `LICENSE` (ask; keep the existing notice).
5. A clean-room MIT rewrite of the GPL files (list in LICENSE-NOTES.md) may only
   be done by an agent that has NOT read MPFB's source (docs/PROVENANCE.md).
