// SPDX-License-Identifier: MIT
// Desktop app (desktop/, Electron): the pure URL -> file mapping and HTML rewrite in desktop/resolve.cjs.
// The app itself is checked by launching it (docs/DESKTOP.md); this needs no Electron.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const R = require('../desktop/resolve.cjs');
const repo = fileURLToPath(new URL('..', import.meta.url));
const roots = { web: path.join(repo, 'web'), output: path.join(repo, 'output'), three: path.join(repo, 'desktop', 'node_modules', 'three') };

test('app:// URLs map to web/ first, then output/ (the staged site layout)', () => {
  assert.deepEqual(R.candidates('app://charactercreator/index.html', roots), [path.join(roots.web, 'index.html'), path.join(roots.output, 'index.html')]);
  assert.deepEqual(R.candidates('app://charactercreator/', roots)[0], path.join(roots.web, 'index.html'));
  const glb = R.candidates('app://charactercreator/base_body.glb?v=1#x', roots);
  assert.ok(glb.some(f => fs.existsSync(f) && f.startsWith(roots.output)), 'base_body.glb found in output/');
  assert.deepEqual(R.candidates('app://charactercreator/mh/human.js', roots)[0], path.join(roots.web, 'mh', 'human.js'));
  assert.deepEqual(R.candidates('app://charactercreator/vendor/three/build/three.module.js', roots), [path.join(roots.three, 'build', 'three.module.js')]);
});

test('nothing outside the roots: traversal, encoded traversal, other hosts and schemes are refused', () => {
  for (const u of ['app://charactercreator/../package.json', 'app://charactercreator/%2e%2e/%2e%2e/etc/passwd',
    'app://charactercreator/vendor/three/../../../package.json', 'app://charactercreator/a%00b', 'app://other/index.html',
    'https://charactercreator/index.html', 'file:///etc/passwd', 'not a url', 'app://charactercreator/%E0%A4%A']) {
    const c = R.candidates(u, roots);
    assert.ok(c.every(f => [roots.web, roots.output, roots.three].some(r => f === r || f.startsWith(r + path.sep))), `${u} -> ${c}`);
    assert.ok(!c.some(f => f.endsWith(`${path.sep}package.json`) && !f.startsWith(roots.web) && !f.startsWith(roots.output)), `${u}`);
  }
  assert.deepEqual(R.candidates('app://other/index.html', roots), []);
  assert.deepEqual(R.candidates('file:///etc/passwd', roots), []);
  assert.equal(R.inside('/a/b', '../c'), null);
  assert.equal(R.inside('/a/b', 'c/../../d'), null);
});

test('the pages\' three.js import map is pointed at the bundled copy (works offline)', () => {
  for (const page of ['index.html', 'runtime.html']) {
    const html = fs.readFileSync(path.join(roots.web, page), 'utf8');
    assert.ok(html.includes(R.THREE_CDN), `${page} uses ${R.THREE_CDN} (update THREE_CDN when three.js is upgraded)`);
    const out = R.rewriteHtml(html);
    assert.ok(!out.includes('https://cdn.jsdelivr.net/npm/three'), `${page}: a three.js CDN URL is left`);   // the boot message may still name the CDN
    assert.ok(out.includes(`"three":"${R.THREE_LOCAL}build/three.module.js"`), page);
  }
  // the bundled three.js is the version the pages ask for
  const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'desktop', 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies.three, R.THREE_CDN.match(/three@([\d.]+)\//)[1]);
});

test('MIME types the editor needs; navigation stays inside the app', () => {
  assert.match(R.mimeOf('a/b.js'), /^text\/javascript/);
  assert.match(R.mimeOf('x.HTML'), /^text\/html/);
  assert.equal(R.mimeOf('m.glb'), 'model/gltf-binary');
  assert.equal(R.mimeOf('d.json'), 'application/json');
  assert.equal(R.mimeOf('t.bin'), 'application/octet-stream');
  assert.ok(R.isAppUrl('app://charactercreator/runtime.html') && !R.isAppUrl('https://example.org/'));
  assert.ok(R.isExternalWeb('https://example.org/') && !R.isExternalWeb('javascript:alert(1)') && !R.isExternalWeb('file:///x'));
});
