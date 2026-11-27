// SPDX-License-Identifier: MIT
// Pure helpers of the desktop app (no Electron import, so node tests can run them): app:// URL -> file on disk,
// MIME types, and the HTML rewrite that points the pages' import map at the bundled three.js instead of the CDN.
'use strict';
const path = require('node:path');

const SCHEME = 'app';
const HOST = 'charactercreator';
const ORIGIN = `${SCHEME}://${HOST}`;
const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.170.0/';
const THREE_LOCAL = `${ORIGIN}/vendor/three/`;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};
const mimeOf = file => MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';

/** Joins rel onto root; null if the result would leave root (../, absolute paths, encoded traversal). */
function inside(root, rel) {
  const full = path.resolve(root, '.' + path.posix.sep + rel);
  const r = path.resolve(root);
  return full === r || full.startsWith(r + path.sep) ? full : null;
}

/**
 * app://charactercreator/<path> -> candidate files, in order. The site layout is the staged one (README "Run
 * locally"): web/ and output/ side by side at the root, so `./base_body.glb` next to index.html resolves to
 * output/. `/vendor/three/...` is the bundled three.js package.
 * @param {string} url  @param {{ web: string, output: string, three: string }} roots
 * @returns {string[]} absolute paths to try (empty when the URL is not ours or leaves the roots)
 */
function candidates(url, roots) {
  let u;
  try { u = new URL(url); } catch { return []; }
  if (u.protocol !== `${SCHEME}:` || u.host !== HOST) return [];
  let rel;
  try { rel = decodeURIComponent(u.pathname).replace(/^\/+/, ''); } catch { return []; }
  if (rel === '') rel = 'index.html';
  if (rel.includes('\0')) return [];
  if (rel.startsWith('vendor/three/')) {
    const f = inside(roots.three, rel.slice('vendor/three/'.length));
    return f ? [f] : [];
  }
  return [roots.web, roots.output].map(r => inside(r, rel)).filter(Boolean);
}

/** The pages load three.js from the CDN through an import map; the app serves its own copy (works offline). */
const rewriteHtml = html => html.split(THREE_CDN).join(THREE_LOCAL);

/** True for URLs the window may navigate to (everything else opens in the system browser or is refused). */
const isAppUrl = url => { try { const u = new URL(url); return u.protocol === `${SCHEME}:` && u.host === HOST; } catch { return false; } };
const isExternalWeb = url => { try { return ['http:', 'https:'].includes(new URL(url).protocol); } catch { return false; } };

module.exports = { SCHEME, HOST, ORIGIN, THREE_CDN, THREE_LOCAL, mimeOf, candidates, rewriteHtml, isAppUrl, isExternalWeb, inside };
