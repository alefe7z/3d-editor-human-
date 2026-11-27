# Desktop app (Electron)

The editor (`web/index.html`) and the runtime generator (`web/runtime.html`) in their own window, offline.
Code: `desktop/` (MIT). Electron 33.4.11, electron-builder 25.1.8, three.js 0.170.0 bundled.

## Use it (Windows, on the owner's PC)
Needs Node.js 22+. In a terminal (PowerShell) in the repo:

    cd desktop
    npm install            # once: Electron, electron-builder, three.js
    npm start              # runs the app from the repo (web/ + output/ as they are now)
    npm run dist           # builds dist\CharacterCreator Setup 0.1.0.exe (installer) and dist\CharacterCreator 0.1.0.exe (portable)

From the repo root: `npm run desktop` / `npm run desktop:dist` do the same. Rebuild after changing `web/` or `output/`:
the installer carries a copy of both. The exe is not code-signed, so Windows SmartScreen asks "Run anyway" the first
time (signing needs a certificate: electron-builder `win.certificateFile`).

## How it works (`desktop/main.cjs`, `desktop/resolve.cjs`)
- Pages are served through a private `app://charactercreator/` scheme: no local server, no open port. Files resolve
  like the staged site: `web/` first, then `output/` (so `./base_body.glb` finds `output/base_body.glb`).
- The pages' import map points at cdn.jsdelivr.net; the app rewrites it on the fly to its own three.js
  (`app://charactercreator/vendor/three/...`), so no network is needed. `web/` itself is unchanged and still works in a
  browser.
- Packaged: `resources/app/{web,output,three}`. three.js is an extra resource, not a node module, because
  electron-builder drops `node_modules/*/examples` by default and the addons (GLTFLoader, OrbitControls) live in
  `three/examples/jsm`.
- Window: context isolation + sandbox, no Node in the page; links to the web open in the system browser; the window
  never navigates away from `app://`. Menu (pt-BR): Editor (Ctrl+1), runtime generator (Ctrl+2, only when `web/data`
  exists), reload, dev tools, zoom, full screen. `web/data` (the generator's 29 MB) is NOT packaged; run
  `python tools/export_data.py` and use `npm start` for the generator.
- The export (Export glTF) shows a save dialog; settings load / save work as in the browser.

## Verified (2026-11-27, Linux container, Xvfb + swiftshader, Playwright's Electron driver)
- `npm start` and the packaged Linux build (`electron-builder --linux dir`, 320 MB unpacked): editor ready, no console
  errors, 0 requests outside `app://` (the CDN is blocked in that container, so offline really works), hair passes
  active, `__export()` -> 4 130 956-byte GLB. Runtime generator with data: loads, sliders update.
- Windows: the portable exe builds (92 MB) with `-c.win.signAndEditExecutable=false` (Linux has no Wine); the NSIS
  installer needs Windows (or Wine). Neither was run on Windows here.
- `tests/desktop.test.mjs`: URL -> file mapping, path traversal refused, import map rewrite, MIME types.
