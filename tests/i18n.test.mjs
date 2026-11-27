// SPDX-License-Identifier: MIT
// UI language (web/i18n.js): language choice, Portuguese catalog labels for every clothing / hair entry, and the
// Portuguese dictionaries of the editor (web/main.js) and the exporter (web/export/exporter.js) cover every key
// the English ones have. main.js / exporter.js import three.js, so their dictionaries are read as text here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pickLang, catalogLabel, presetLabel, PT_CATALOG, PT_PRESETS, DEFAULT_LANG } from '../web/i18n.js';

const read = rel => fs.readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');
const P = s => new URLSearchParams(s);

test('pickLang: ?lang wins, then the system languages, then Portuguese', () => {
  assert.equal(pickLang(P('lang=da'), ['pt-BR']), 'da');
  assert.equal(pickLang(P('lang=en'), []), 'en');
  assert.equal(pickLang(P('lang=xx'), ['pt-BR']), 'pt');
  assert.equal(pickLang(P(''), ['pt-BR', 'en-US']), 'pt');
  assert.equal(pickLang(P(''), ['de-DE', 'da-DK']), 'da');
  assert.equal(pickLang(P(''), ['en_GB']), 'en');
  assert.equal(pickLang(P(''), ['de-DE', 'fr']), DEFAULT_LANG);
  assert.equal(pickLang(P(''), []), 'pt');
});

test('catalog labels: every clothing slot / item and hair style has a Portuguese label', () => {
  const clothing = JSON.parse(read('output/clothing.json')), hair = JSON.parse(read('output/hair.json'));
  const keys = [
    ...Object.keys(clothing.slotLabels).map(k => [clothing.slotLabels[k], `slot:${k}`]),
    ...clothing.items.map(i => [i.label, `item:${i.id}`]),
    ...hair.styles.map(s => [s.label, `hair:${s.id}`]),
  ];
  for (const [label, key] of keys) {
    assert.ok(PT_CATALOG[key], `no Portuguese label for ${key}`);
    assert.equal(catalogLabel(label, 'pt', key), label.pt ?? PT_CATALOG[key]);
    assert.equal(catalogLabel(label, 'da', key), label.da);
    assert.equal(catalogLabel(label, 'en', key), label.en);
  }
  assert.equal(catalogLabel(undefined, 'pt', 'item:new', 'new'), 'new');
  assert.equal(catalogLabel({ da: 'Hat' }, 'pt', 'item:hat', 'hat'), 'Hat');
});

// keys of one language block `<lang>: { ... }` inside `const I18N = { ... }` (keys are plain identifiers)
function dictKeys(src, lang) {
  const start = src.indexOf('const I18N = {');
  const a = src.indexOf(`\n  ${lang}: {`, start);
  assert.ok(start >= 0 && a > start, `I18N.${lang} not found`);
  const b = src.indexOf('\n  },', a);
  const block = src.slice(a, b).replace(/'(?:[^'\\]|\\.)*'/g, "''");   // drop string values ('Missing morphs:' is not a key)
  return new Set([...block.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*:/g)].map(m => m[1]).filter(k => k !== lang));
}

for (const file of ['web/main.js', 'web/export/exporter.js']) {
  test(`${file}: the Portuguese dictionary has every English key`, () => {
    const src = read(file), en = dictKeys(src, 'en'), pt = dictKeys(src, 'pt');
    const missing = [...en].filter(k => !pt.has(k));
    assert.deepEqual(missing, []);
    assert.ok(en.size > 20, `${en.size} keys`);
  });
}

test('hair colour presets: a Portuguese name for every preset of the vendored shader', () => {
  const src = read('web/third_party/threejs-hair-shader/hair-shader.js');
  const block = src.slice(src.indexOf('export const HAIR_COLOR_STYLES = {'), src.indexOf('};', src.indexOf('export const HAIR_COLOR_STYLES = {')));
  const names = [...block.matchAll(/^\s*'([^']+)':\s*\{/gm)].map(m => m[1]);
  assert.equal(names.length, 13);
  for (const n of names) { assert.ok(PT_PRESETS[n], n); assert.notEqual(presetLabel(n, 'pt'), n); assert.equal(presetLabel(n, 'en'), n); }
});
