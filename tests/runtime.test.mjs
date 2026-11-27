// SPDX-License-Identifier: MIT
// Runtime prototype (web/mh/human.js): macro target stack vs MPFB semantics, the packed-data loader and apply().
// Synthetic data only, so it runs without web/data (git-ignored, made by tools/export_data.py).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Human, targetStack, normalizeRace, parseTarget, DEFAULT_MACROS } from '../web/mh/human.js';
import { DETAIL_SLIDERS, DETAIL_TARGET_FILES, detailWeights, expandSided } from '../web/mh/details.js';
import { FACE_SLIDERS, BREAST_SLIDERS } from '../web/character.js';

// macro.json part bounds (CC0 MakeHuman data via MPFB), only the fields targetStack reads
const P = (lowest, highest, low, high) => ({ lowest, highest, low, high });
const MACRO = { macrotargets: {
  gender: { parts: [P(-0.01, 1.01, 'female', 'male')] },
  age: { parts: [P(-0.01, 0.1874998, 'baby', 'child'), P(0.1874999, 0.49998, 'child', 'young'), P(0.49999, 1.01, 'young', 'old')] },
  muscle: { parts: [P(-0.01, 0.49998, 'minmuscle', 'averagemuscle'), P(0.49999, 1.01, 'averagemuscle', 'maxmuscle')] },
  weight: { parts: [P(-0.01, 0.49998, 'minweight', 'averageweight'), P(0.49999, 1.01, 'averageweight', 'maxweight')] },
  proportions: { parts: [P(-0.01, 0.4999, 'uncommonproportions', ''), P(0.5, 1.01, '', 'idealproportions')] },
  height: { parts: [P(-0.01, 0.49, 'minheight', ''), P(0.51, 1.01, '', 'maxheight')] },
  cupsize: { parts: [P(-0.01, 0.49998, 'mincup', 'averagecup'), P(0.49999, 1.01, 'averagecup', 'maxcup')] },
  firmness: { parts: [P(-0.01, 0.4998, 'minfirmness', 'averagefirmness'), P(0.4999, 1.01, 'averagefirmness', 'maxfirmness')] },
} };

const near = (a, b, e = 2e-4) => Math.abs(a - b) <= e;
const asMap = s => Object.fromEntries(s);

test('targetStack: default macros = 3 race targets per sex + 2 universal, no height / proportions', () => {
  const s = asMap(targetStack(MACRO, {}));
  const names = Object.keys(s).sort();
  assert.deepEqual(names, [
    'macrodetails/african-female-young', 'macrodetails/african-male-young', 'macrodetails/asian-female-young',
    'macrodetails/asian-male-young', 'macrodetails/caucasian-female-young', 'macrodetails/caucasian-male-young',
    'macrodetails/universal-female-young-averagemuscle-averageweight', 'macrodetails/universal-male-young-averagemuscle-averageweight']);
  // gender 0.5 -> female/male ~0.5 each, age 0.5 -> young 1, race 1/3
  assert.ok(near(s['macrodetails/asian-male-young'], 0.5 / 3, 1e-3));
  assert.ok(near(s['macrodetails/universal-female-young-averagemuscle-averageweight'], 0.5, 1e-3));
});

test('targetStack: extremes 0 and 1 each fall in exactly one part (no doubled weights)', () => {
  for (const age of [0, 1]) {
    const s = targetStack(MACRO, { age, gender: 1 });
    const names = s.map(x => x[0]);
    assert.equal(new Set(names).size, names.length, `duplicate targets at age ${age}`);
    const race = s.filter(([n]) => /^macrodetails\/(african|asian|caucasian)-/.test(n));
    // the outer bounds are -0.01 / 1.01, so the extremes are ~0.98-0.99, minus what the 0.01 cutoff drops
    const sum = race.reduce((a, [, w]) => a + w, 0);
    assert.ok(sum > 0.95 && sum <= 1, `race weights sum ${sum} at age ${age}`);
  }
});

test('targetStack: babies get no proportions targets (none exist on disk); height uses maxheight', () => {
  const baby = targetStack(MACRO, { age: 0, proportions: 1 });
  assert.ok(!baby.some(([n]) => n.startsWith('macrodetails/proportions/') && n.includes('-baby-')));
  assert.ok(baby.some(([n]) => n.includes('-baby-')), 'age 0 is mostly baby');
  const tall = asMap(targetStack(MACRO, { height: 1, proportions: 1 }));
  assert.ok(Object.keys(tall).some(n => n.startsWith('macrodetails/height/') && n.endsWith('-maxheight')));
  assert.ok(Object.keys(tall).some(n => n.startsWith('macrodetails/proportions/') && n.endsWith('-idealproportions')));
});

test('targetStack: out-of-range / NaN macro values are clamped, not dropped', () => {
  assert.deepEqual(targetStack(MACRO, { age: 7 }), targetStack(MACRO, { age: 1 }));
  assert.deepEqual(targetStack(MACRO, { weight: -3 }), targetStack(MACRO, { weight: 0 }));
  assert.deepEqual(targetStack(MACRO, { muscle: NaN }), targetStack(MACRO, {}));
});

test('normalizeRace: sums to 1; all zero falls back to the default equal mix', () => {
  const r = normalizeRace({ asian: 2, caucasian: 1, african: 1 });
  assert.ok(near(r.asian, 0.5, 1e-9) && near(r.african, 0.25, 1e-9));
  assert.deepEqual(normalizeRace({ asian: 0, caucasian: 0, african: 0 }), DEFAULT_MACROS.race);
  assert.deepEqual(normalizeRace({ asian: -1, caucasian: NaN, african: 0 }), DEFAULT_MACROS.race);
  // the stack never loses its race targets
  assert.ok(targetStack(MACRO, { race: normalizeRace({ asian: 0, caucasian: 0, african: 0 }) }).some(([n]) => n.includes('asian-')));
});

// --- synthetic packed data: a unit quad split by a UV seam (4 body verts, 6 render verts, 2 triangles) ---
function pack({ deltaStep = 0.001, targets = {} } = {}) {
  const base = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
  const orig = new Uint32Array([0, 1, 2, 0, 2, 3]);     // render verts 3 and 4 duplicate body verts 0 and 2
  const uv = new Float32Array(orig.length * 2);
  const index = new Uint32Array([0, 1, 2, 3, 4, 5]);
  const mesh = new Uint8Array(base.byteLength + uv.byteLength + orig.byteLength + index.byteLength);
  let o = 0; for (const a of [base, uv, orig, index]) { mesh.set(new Uint8Array(a.buffer), o); o += a.byteLength; }
  const files = { 'mesh.bin': mesh.buffer };
  for (const [name, { idx, d }] of Object.entries(targets)) {
    const b = new ArrayBuffer(2 + idx.length * 8);
    new Uint16Array(b, 0, 1)[0] = idx.length; new Uint16Array(b, 2, idx.length).set(idx); new Int16Array(b, 2 + idx.length * 2).set(d);
    files[`targets/${name.replace(/\//g, '__')}.bin`] = b;
  }
  const json = { 'meta.json': { nBody: 4, nVerts: 6, nIdx: 6, deltaStep }, 'macro.json': MACRO };
  return { files, json };
}
function loader(data, { fail = new Set(), delay = () => 0, log = [] } = {}) {
  return {
    log,
    bytes: async p => {
      log.push(p); await new Promise(r => setTimeout(r, delay(p)));
      if (fail.has(p)) throw new Error(`HTTP 404 ${p}`);
      if (!(p in data.files)) throw new Error(`HTTP 404 ${p}`);
      return data.files[p].slice(0);
    },
    json: async p => structuredClone(data.json[p]),
  };
}
// every target the default / test stacks can ask for, as zero deltas, plus one that moves vertex 2 up
function fullData(extra = {}) {
  const targets = {};
  for (const age of [0, 0.5, 1]) for (const [n] of targetStack(MACRO, { age })) targets[n] = { idx: [0], d: [0, 0, 0] };
  return pack({ targets: { ...targets, ...extra } });
}

test('parseTarget: rejects truncated or non-buffer data instead of reading garbage', () => {
  assert.throws(() => parseTarget(new ArrayBuffer(0)));
  assert.throws(() => parseTarget('<html>404</html>'));
  const b = new ArrayBuffer(2 + 8); new Uint16Array(b, 0, 1)[0] = 2;   // claims 2 vertices, holds 1
  assert.throws(() => parseTarget(b), /expected 18/);
});

test('Human.init: a mesh.bin that does not match meta.json is an error', async () => {
  const d = pack(); d.json['meta.json'].nIdx = 9;
  await assert.rejects(new Human(loader(d)).init(), /mesh\.bin/);
});

test('Human.apply: positions in metres, deltas scaled by deltaStep and weight', async () => {
  const name = 'macrodetails/universal-female-young-averagemuscle-averageweight';
  const d = fullData({ [name]: { idx: [2], d: [0, 0, 1000] } });   // 1000 steps * 0.001 dm = 1 dm at weight 1
  const h = await new Human(loader(d)).init();
  const p = await h.apply({ gender: 0 });
  assert.ok(near(p[3], 0.1, 1e-7) && p[4] === 0 && p[5] === 0);   // vertex 1 = (1 dm, 0, 0) -> 0.1 m
  const w = asMap(h.lastStack)[name];                              // ~0.99 at gender 0
  assert.ok(near(p[8], 0.1 * w * 1000 * 0.001, 1e-6), `z of vertex 2: ${p[8]}`);
});

test('Human.apply: UV-seam duplicates get one shared, unit normal', async () => {
  const name = 'macrodetails/universal-female-young-averagemuscle-averageweight';
  const h = await new Human(loader(fullData({ [name]: { idx: [2], d: [0, 0, 3000] } }))).init();
  await h.apply({ gender: 0 });
  const n = i => Array.from(h.normals.slice(i * 3, i * 3 + 3));
  for (const [a, b] of [[0, 3], [2, 4]]) assert.deepEqual(n(a), n(b), `seam pair ${a}/${b}`);
  for (let i = 0; i < 6; i++) assert.ok(near(Math.hypot(...n(i)), 1, 1e-5));
});

test('Human.apply: overlapping calls are serialised; each resolves with its own result, the last wins', async () => {
  const name = 'macrodetails/universal-male-old-averagemuscle-averageweight';
  const d = fullData({ [name]: { idx: [1], d: [5000, 0, 0] } });
  // the first call's targets arrive late: without serialising, its sum would land after the second call's
  const h = await new Human(loader(d, { delay: p => p.includes('young') ? 30 : 0 })).init();
  const a = h.apply({ age: 0.5, gender: 1 }), b = h.apply({ age: 1, gender: 1 });
  const ax = (await a)[3]; const bx = (await b)[3];
  const w = asMap(targetStack(MACRO, { age: 1, gender: 1 }))[name];
  assert.ok(near(ax, 0.1, 1e-6), `first call x ${ax}`);
  assert.ok(near(bx, 0.1 + 0.1 * w * 5000 * 0.001, 1e-5), `second call x ${bx}`);
  assert.ok(near(h.positions[3], bx, 1e-9), 'the last call is what stays in positions');
});

test('Human.target: a failed fetch is not cached; the next apply retries it', async () => {
  const d = fullData();
  const miss = 'targets/macrodetails__asian-female-young.bin';
  const fail = new Set([miss]), l = loader(d, { fail });
  const h = await new Human(l).init();
  await assert.rejects(h.apply({}), /asian-female-young/);
  fail.clear();
  await h.apply({});   // must not reject with the old cached error
  assert.equal(l.log.filter(p => p === miss).length, 2);
  // and a later failure does not break the queue for good
  assert.ok(await h.apply({ gender: 0.2 }));
});

// ---- breast macros (cupsize / firmness) and detail sliders ----
const breastOf = s => s.filter(([n]) => n.startsWith('breast/'));

test('targetStack breast: neutral cup + firmness (the default) adds no breast target', () => {
  assert.equal(breastOf(targetStack(MACRO, {})).length, 0);
  assert.equal(breastOf(targetStack(MACRO, { gender: 0 })).length, 0);
});

test('targetStack breast: female targets only, never averagecup-averagefirmness or baby', () => {
  for (const v of [{ gender: 0, cupsize: 1 }, { gender: 0, cupsize: 0, firmness: 1, age: 0.9 }, { age: 0, cupsize: 1 }, { gender: 0.3, cupsize: 0.7, firmness: 0.2 }]) {
    const b = breastOf(targetStack(MACRO, v));
    assert.ok(b.length > 0, JSON.stringify(v));
    for (const [n] of b) {
      assert.match(n, /^breast\/female-(child|young|old)-(min|average|max)muscle-(min|average|max)weight-(min|average|max)cup-(min|average|max)firmness$/);
      assert.ok(!n.includes('averagecup-averagefirmness'), n);
    }
  }
});

test('targetStack breast: like MPFB, the weight is not scaled by gender (there are no male targets)', () => {
  const w = s => asMap(breastOf(s))['breast/female-young-averagemuscle-averageweight-maxcup-averagefirmness'];
  const female = w(targetStack(MACRO, { gender: 0, cupsize: 1 })), mid = w(targetStack(MACRO, { gender: 0.5, cupsize: 1 }));
  assert.ok(female > 0.9 && near(female, mid, 1e-9), `${female} vs ${mid}`);
  // a male body still has a tiny female component (outer bound 1.01), so MPFB gives it the full breast target too
  assert.ok(near(w(targetStack(MACRO, { gender: 1, cupsize: 1 })), female, 1e-9));
});

test('detail sliders: same ids, sides and scales as the baked viewer (web/character.js)', () => {
  const baked = [...FACE_SLIDERS, ...BREAST_SLIDERS].filter(s => /^(face|bdet)_/.test(s.neg)).map(s => s.id);
  assert.deepEqual(DETAIL_SLIDERS.map(s => s.id), baked);
  assert.equal(DETAIL_SLIDERS.length, 16);
  assert.deepEqual(expandSided('L/eyes/eye-scale-incr'), ['eyes/l-eye-scale-incr', 'eyes/r-eye-scale-incr']);
  assert.deepEqual(detailWeights({}), {});
  assert.deepEqual(detailWeights({ noseWidth: -0.5 }), { 'nose/nose-scale-horiz-decr': 0.5 });
  assert.deepEqual(detailWeights({ eyeSize: 1 }), { 'eyes/l-eye-scale-incr': 0.7, 'eyes/r-eye-scale-incr': 0.7 });   // scale 0.7
  assert.deepEqual(detailWeights({ lips: 2 }), { 'mouth/mouth-upperlip-volume-incr': 1, 'mouth/mouth-lowerlip-volume-incr': 1 });   // clamped
  assert.deepEqual(detailWeights({ breastHeight: -1 }), { 'breast/breast-trans-down': 1 });
  assert.ok(DETAIL_TARGET_FILES.length === 44 && DETAIL_TARGET_FILES.every(f => !f.startsWith('L/')));
});

test('Human.apply: detail targets are added to the sum; targets missing from the data are skipped and reported', async () => {
  const name = 'nose/nose-trans-up';
  const d = fullData({ [name]: { idx: [2], d: [0, 2000, 0] } });
  d.json['meta.json'].targets = Object.keys(d.files).filter(f => f.startsWith('targets/'))
    .map(f => f.slice(8, -4).replace(/__/g, '/'));
  const h = await new Human(loader(d)).init();
  const p = await h.apply({}, { [name]: 0.5, 'mouth/not-packed': 1, 'chin/zero': 0 });
  assert.ok(near(p[7], 0.1 + 0.1 * 0.5 * 2000 * 0.001, 1e-6), `y of vertex 2: ${p[7]}`);
  assert.deepEqual(h.lastMissing, ['mouth/not-packed']);
  assert.ok(h.lastStack.some(([n, w]) => n === name && w === 0.5));
  assert.ok(!h.lastStack.some(([n]) => n === 'chin/zero'));
});
