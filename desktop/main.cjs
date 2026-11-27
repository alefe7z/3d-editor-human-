// SPDX-License-Identifier: MIT
// CharacterCreator desktop app (Electron): the editor in its own window, offline. The pages are served from disk
// through a private app:// scheme (no local server, no open port); three.js comes from this package's own
// node_modules instead of the CDN. Development: `npm start` in desktop/ serves ../web and ../output; the packaged
// app carries copies of both in its resources folder (see package.json "build").
'use strict';
const { app, BrowserWindow, Menu, protocol, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { SCHEME, HOST, ORIGIN, mimeOf, candidates, rewriteHtml, isAppUrl, isExternalWeb } = require('./resolve.cjs');

protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}]);

let rootsCache = null;
function roots() {
  if (rootsCache) return rootsCache;
  const base = app.isPackaged ? path.join(process.resourcesPath, 'app') : path.resolve(__dirname, '..');
  rootsCache = {
    web: path.join(base, 'web'),
    output: path.join(base, 'output'),
    // packaged: an extra resource (electron-builder drops node_modules/*/examples, where the addons live);
    // development: this package's node_modules (three's "exports" hides package.json from require.resolve)
    three: app.isPackaged ? path.join(base, 'three') : path.join(__dirname, 'node_modules', 'three'),
  };
  return rootsCache;
}

async function serve(request) {
  const R = roots();
  for (const file of candidates(request.url, R)) {
    let data;
    try { data = await fs.promises.readFile(file); } catch { continue; }   // missing / a folder: try the next root
    const type = mimeOf(file);
    const body = type.startsWith('text/html') ? rewriteHtml(data.toString('utf8')) : data;
    return new Response(body, { status: 200, headers: { 'content-type': type, 'cache-control': 'no-cache' } });
  }
  return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } });
}

const PAGES = { editor: `${ORIGIN}/index.html`, runtime: `${ORIGIN}/runtime.html` };
let win = null;

function hasRuntimeData() { return fs.existsSync(path.join(roots().web, 'data', 'meta.json')); }

function buildMenu() {
  const go = url => () => win?.loadURL(url);
  const template = [
    {
      label: 'CharacterCreator',
      submenu: [
        { label: 'Editor', accelerator: 'CmdOrCtrl+1', click: go(PAGES.editor) },
        {
          label: 'Gerador MakeHuman (runtime)', accelerator: 'CmdOrCtrl+2', click: () => {
            if (hasRuntimeData()) return go(PAGES.runtime)();
            dialog.showMessageBox(win, { type: 'info', message: 'Sem dados do gerador',
              detail: 'Gere os dados com: python tools/export_data.py (eles ficam em web/data).' });
          },
        },
        { type: 'separator' },
        { role: 'quit', label: 'Sair' },
      ],
    },
    {
      label: 'Exibir',
      submenu: [
        { role: 'reload', label: 'Recarregar' }, { role: 'forceReload', label: 'Recarregar (sem cache)' },
        { role: 'toggleDevTools', label: 'Ferramentas do desenvolvedor' }, { type: 'separator' },
        { role: 'resetZoom', label: 'Zoom normal' }, { role: 'zoomIn', label: 'Mais zoom' }, { role: 'zoomOut', label: 'Menos zoom' },
        { type: 'separator' }, { role: 'togglefullscreen', label: 'Tela cheia' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 800, minHeight: 560, backgroundColor: '#1b1d22', title: 'CharacterCreator',
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  win.once('ready-to-show', () => win.show());
  // links to the web open in the system browser; the window itself only ever shows app:// pages
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalWeb(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (isAppUrl(url)) return;
    e.preventDefault();
    if (isExternalWeb(url)) shell.openExternal(url);
  });
  win.loadURL(process.env.CC_START_URL && isAppUrl(process.env.CC_START_URL) ? process.env.CC_START_URL : PAGES.editor);
  win.on('closed', () => { win = null; });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    protocol.handle(SCHEME, serve);
    buildMenu();
    createWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}

module.exports = { HOST };
