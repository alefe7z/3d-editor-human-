# threejs-hair-shader (vendored, unmodified)

- Source: <https://github.com/creategamecharacters/threejs-hair-shader>, file `src/hair-shader.js`
- Commit: `f0d6cf0d4d309c55b9c5d11370e0a04d04ad05d3` (2026-10-01), copied 2026-11-27
- Author: Sander Mørch-Jensen, creategamecharacters.com
- Licence: MIT, see [LICENSE](LICENSE) (keep this notice and the LICENSE file with the code)
- Changes: none. `hair-shader.js` is byte-identical to the upstream file. The project's own glue (atlas from
  the MakeHuman hair texture, root-to-tip from the `_CCHAIR` vertex attribute, collision, shared live
  uniforms, shadows, export) is in `web/hairpasses.js`, which only imports this file.

To update: copy the new upstream `src/hair-shader.js` over this one, update the commit above, run
`npm test` and the hair checks in `tests/hairpasses.test.mjs`; `web/hairpasses.js` warns in the console if
a shader anchor it rewrites is gone.
