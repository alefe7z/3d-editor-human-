// SPDX-License-Identifier: GPL-3.0-or-later
// MakeHuman macro-target runtime (port of MPFB TargetService.calculate_target_stack_from_macro_info_dict).
// Data: CC0 MakeHuman base mesh + targets, packed by tools/export_data.py. Engine-agnostic (plain typed arrays).
// positions = base + sum(weight_i * target_i); all in MakeHuman decimetres (multiply by 0.1 for metres).

export const DEFAULT_MACROS = {
  gender: 0.5, age: 0.5, muscle: 0.5, weight: 0.5, proportions: 0.5, height: 0.5, cupsize: 0.5, firmness: 0.5,
  race: { asian: 1 / 3, caucasian: 1 / 3, african: 1 / 3 },
};
const MACRO_KEYS = ['gender', 'age', 'muscle', 'weight', 'proportions', 'height', 'cupsize', 'firmness'];

const r4 = x => Math.round(x * 1e4) / 1e4;

// Strict bounds on purpose: identical to MPFB. macro.json widens the outer bounds (-0.01 / 1.01) and leaves
// tiny gaps between parts, so 0, 0.5 and 1 each fall in exactly one part.
export function interpolate(macroDef, value) {
  const out = [];
  for (const p of macroDef.parts) {
    if (value > p.lowest && value < p.highest) {
      const pct = (value - p.lowest) / (p.highest - p.lowest);
      if (p.low) out.push([p.low, r4(1 - pct)]);
      if (p.high) out.push([p.high, r4(pct)]);
    }
  }
  return out;
}

/** Race weights normalised to sum 1; all zero (or invalid) falls back to the default equal mix. */
export function normalizeRace(race) {
  const e = Object.entries(race || {}).map(([k, v]) => [k, Number.isFinite(+v) && +v > 0 ? +v : 0]);
  const total = e.reduce((a, [, v]) => a + v, 0);
  if (!(total > 0)) return { ...DEFAULT_MACROS.race };
  return Object.fromEntries(e.map(([k, v]) => [k, v / total]));
}

const clamp01 = v => Math.min(1, Math.max(0, Number.isFinite(+v) ? +v : 0.5));

/** Returns [[targetName, weight], ...] for the macro values (race-gender-age, universal, height, proportions). */
export function targetStack(macro, macros, cutoff = 0.01) {
  const m = { ...DEFAULT_MACROS, ...macros };
  const c = {};
  // cupsize / firmness are optional in the data (older macro.json): no parts -> no breast targets
  for (const k of MACRO_KEYS) c[k] = macro.macrotargets[k] ? interpolate(macro.macrotargets[k], clamp01(m[k])) : [];
  const t = [];
  for (const [race, rw] of Object.entries(m.race || {})) if (rw > 0.0001)
    for (const [a, aw] of c.age) for (const [g, gw] of c.gender) {
      const w = rw * gw * aw; if (w > cutoff) t.push([`macrodetails/${race}-${g}-${a}`, w]);
    }
  for (const [g, gw] of c.gender) for (const [a, aw] of c.age) for (const [mu, mw] of c.muscle) for (const [we, ww] of c.weight) {
    const w = gw * aw * mw * ww;
    if (w > cutoff) t.push([`macrodetails/universal-${g}-${a}-${mu}-${we}`, w]);
    for (const [h, hw] of c.height) {
      const w2 = w * hw; if (w2 > cutoff) t.push([`macrodetails/height/${g}-${a}-${mu}-${we}-${h}`, w2]);
    }
    for (const [p, pw] of c.proportions) {
      // there are no baby proportions targets on disk (MPFB excludes them the same way)
      const w2 = w * pw;
      if (w2 > cutoff && a !== 'baby') t.push([`macrodetails/proportions/${g}-${a}-${mu}-${we}-${p}`, w2]);
    }
    // breast macros: female targets only, and (like MPFB) NOT scaled by the gender weight, because there are no
    // male counterparts. No baby targets, and averagecup-averagefirmness is the neutral breast (no file).
    if (g === 'female' && a !== 'baby') for (const [cu, cw] of c.cupsize) for (const [fi, fw] of c.firmness) {
      const w2 = aw * mw * ww * cw * fw;
      if (w2 > cutoff && !(cu === 'averagecup' && fi === 'averagefirmness')) t.push([`breast/female-${a}-${mu}-${we}-${cu}-${fi}`, w2]);
    }
  }
  return t;
}

/** Parses one packed target (see tools/export_data.py). */
export function parseTarget(b) {
  if (!(b instanceof ArrayBuffer) || b.byteLength < 2) throw new Error('target: empty or not an ArrayBuffer');
  const n = new Uint16Array(b, 0, 1)[0];
  if (b.byteLength !== 2 + n * 8) throw new Error(`target: ${b.byteLength} bytes, expected ${2 + n * 8} for ${n} vertices`);
  return { n, idx: new Uint16Array(b, 2, n), d: new Int16Array(b, 2 + n * 2, n * 3) };
}

export class Human {
  /** @param loader { bytes(relativePath) -> Promise<ArrayBuffer>, json(relativePath) -> Promise<object> } */
  constructor(loader) { this.loader = loader; this.cache = new Map(); this.queue = Promise.resolve(); }

  async init() {
    this.meta = await this.loader.json('meta.json');
    this.macro = await this.loader.json('macro.json');
    const buf = await this.loader.bytes('mesh.bin'), { nBody, nVerts, nIdx } = this.meta;
    const expect = nBody * 12 + nVerts * 8 + nVerts * 4 + nIdx * 4;
    if (buf.byteLength !== expect) throw new Error(`mesh.bin: ${buf.byteLength} bytes, meta.json expects ${expect} (re-run tools/export_data.py)`);
    let o = 0;
    this.base = new Float32Array(buf, o, nBody * 3); o += nBody * 12;
    this.uv = new Float32Array(buf, o, nVerts * 2); o += nVerts * 8;
    this.orig = new Uint32Array(buf, o, nVerts); o += nVerts * 4;
    this.index = new Uint32Array(buf, o, nIdx);
    this.work = new Float32Array(nBody * 3);
    this.workN = new Float32Array(nBody * 3);
    this.available = Array.isArray(this.meta.targets) ? new Set(this.meta.targets) : null;   // null: not listed
    this.positions = new Float32Array(nVerts * 3);   // render positions in metres
    this.normals = new Float32Array(nVerts * 3);     // smooth across UV seams (computed on the welded body mesh)
    return this;
  }

  target(name) {
    let p = this.cache.get(name);
    if (!p) {
      p = this.loader.bytes(`targets/${name.replace(/\//g, '__')}.bin`).then(parseTarget, e => { throw new Error(`target ${name}: ${e.message}`); });
      // a failed fetch must not poison the cache: the next apply() retries it
      p.catch(() => { if (this.cache.get(name) === p) this.cache.delete(name); });
      this.cache.set(name, p);
    }
    return p;
  }

  /** True when the packed data has this target (always true for data without a target list). */
  has(name) { return !this.available || this.available.has(name); }

  /** Apply macro values plus optional detail targets ({ 'nose/nose-trans-up': 0.4, ... }, weights > 0; see
   *  web/mh/details.js). Returns the (re-used) render position array in metres. Targets missing from the packed
   *  data are skipped and listed in lastMissing (old web/data: re-run tools/export_data.py). Calls are serialised,
   *  so overlapping calls never mix their sums in the shared work buffer; each resolves after its own result. */
  apply(macros, details = {}) {
    const run = this.queue.then(() => this._apply(macros, details));
    this.queue = run.catch(() => {});
    return run;
  }

  async _apply(macros, details) {
    const full = targetStack(this.macro, macros);
    for (const [name, v] of Object.entries(details || {})) if (Number.isFinite(v) && v > 0) full.push([name, v]);
    const stack = full.filter(([n]) => this.has(n)), step = this.meta.deltaStep, w = this.work;
    this.lastMissing = full.filter(([n]) => !this.has(n)).map(([n]) => n);
    const targets = await Promise.all(stack.map(([name]) => this.target(name)));  // fetch in parallel
    w.set(this.base);
    for (let s = 0; s < stack.length; s++) {
      const t = targets[s], k = stack[s][1] * step;
      for (let i = 0; i < t.n; i++) {
        const v = t.idx[i] * 3, j = i * 3;
        w[v] += t.d[j] * k; w[v + 1] += t.d[j + 1] * k; w[v + 2] += t.d[j + 2] * k;
      }
    }
    this._normals();
    const p = this.positions, nr = this.normals, orig = this.orig, wn = this.workN;
    for (let i = 0; i < orig.length; i++) {
      const s = orig[i] * 3, d = i * 3;
      p[d] = w[s] * 0.1; p[d + 1] = w[s + 1] * 0.1; p[d + 2] = w[s + 2] * 0.1;
      nr[d] = wn[s]; nr[d + 1] = wn[s + 1]; nr[d + 2] = wn[s + 2];
    }
    this.lastStack = stack;
    return p;
  }

  // Area-weighted vertex normals on the body vertices (before the UV-seam split), so seams get one normal.
  _normals() {
    const w = this.work, n = this.workN, idx = this.index, orig = this.orig;
    n.fill(0);
    for (let f = 0; f < idx.length; f += 3) {
      const a = orig[idx[f]] * 3, b = orig[idx[f + 1]] * 3, c = orig[idx[f + 2]] * 3;
      const ux = w[b] - w[a], uy = w[b + 1] - w[a + 1], uz = w[b + 2] - w[a + 2];
      const vx = w[c] - w[a], vy = w[c + 1] - w[a + 1], vz = w[c + 2] - w[a + 2];
      const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
      n[a] += x; n[a + 1] += y; n[a + 2] += z; n[b] += x; n[b + 1] += y; n[b + 2] += z; n[c] += x; n[c + 1] += y; n[c + 2] += z;
    }
    for (let i = 0; i < n.length; i += 3) {
      const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
      n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
    }
  }
}

async function ok(base, p) {
  const r = await fetch(base + p);
  if (!r.ok) throw new Error(`${base + p}: HTTP ${r.status}`);
  return r;
}
export const browserLoader = base => ({
  bytes: async p => (await ok(base, p)).arrayBuffer(),
  json: async p => (await ok(base, p)).json(),
});
