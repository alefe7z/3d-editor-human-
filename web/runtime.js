// SPDX-License-Identifier: GPL-3.0-or-later
// Prototype: MakeHuman macro targets applied at runtime in three.js (no Blender, no baked morphs).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Human, browserLoader, DEFAULT_MACROS, normalizeRace } from './mh/human.js';
import { DETAIL_SLIDERS, detailWeights } from './mh/details.js';

const info = document.getElementById('info');
const shot = new URLSearchParams(location.search).has('shot');   // screenshots need the drawing buffer kept
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: shot });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2a2d34);
const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 50); cam.position.set(0, 1.0, 4.2);
const ctl = new OrbitControls(cam, renderer.domElement); ctl.target.set(0, 0.85, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 2); key.position.set(2, 3, 3); scene.add(key);
scene.add(new THREE.GridHelper(4, 16, 0x555555, 0x333333));
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });
renderer.setAnimationLoop(() => { ctl.update(); renderer.render(scene, cam); });

let human;
try {
  human = await new Human(browserLoader('./data/')).init();
} catch (e) {
  console.error(e);
  info.textContent = `Kunne ikke indlæse data (${e.message}). Kør: python tools/export_data.py`;
  window.__error = e.message;
  throw e;
}
const geo = new THREE.BufferGeometry();
const posAttr = new THREE.BufferAttribute(human.positions, 3); posAttr.setUsage(THREE.DynamicDrawUsage);
const nrmAttr = new THREE.BufferAttribute(human.normals, 3); nrmAttr.setUsage(THREE.DynamicDrawUsage);
geo.setAttribute('position', posAttr);
geo.setAttribute('normal', nrmAttr);
geo.setAttribute('uv', new THREE.BufferAttribute(human.uv, 2));
geo.setIndex(new THREE.BufferAttribute(human.index, 1));
const mat = new THREE.MeshStandardMaterial({ color: '#c99a80', roughness: 0.6 });
const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; scene.add(mesh);

// Start values: MPFB defaults, except the chest, which starts where the baked viewer starts (web/character.js
// breastSize 0.35 / breastFirmness 0.45 on its -1..1 scale = cupsize 0.675 / firmness 0.725 here).
const START = { ...structuredClone(DEFAULT_MACROS), cupsize: 0.675, firmness: 0.725 };
const m = structuredClone(START);
const d = Object.fromEntries(DETAIL_SLIDERS.map(s => [s.id, 0]));   // face / chest detail sliders, -1..1
// One update in flight at a time; changes made meanwhile are coalesced into one follow-up run.
// `pending` resolves once the state current at call time is on screen (used by __set and tests).
let running = null, dirty = false, lastMissKey = '';
function refresh() {
  dirty = true;
  if (!running) running = (async () => {
    try {
      while (dirty) {
        dirty = false;
        const t0 = performance.now();
        await human.apply({ ...m, race: normalizeRace(m.race) }, detailWeights(d));
        posAttr.needsUpdate = true; nrmAttr.needsUpdate = true;
        geo.computeBoundingBox(); geo.computeBoundingSphere();
        mesh.position.y = -geo.boundingBox.min.y;   // keep feet on the ground
        const ms = performance.now() - t0, hgt = geo.boundingBox.max.y - geo.boundingBox.min.y;
        const miss = human.lastMissing.length ? ` · ${human.lastMissing.length} targets mangler i web/data (kør tools/export_data.py igen)` : '';
        info.textContent = `${human.lastStack.length} targets, ${ms.toFixed(0)} ms, height ${hgt.toFixed(2)} m${miss}`;
        const missKey = human.lastMissing.join();
        if (miss && missKey !== lastMissKey) console.warn('[runtime] targets missing from web/data:', human.lastMissing);
        lastMissKey = missKey;
      }
    } catch (e) {
      console.error(e);
      info.textContent = `Fejl: ${e.message}`;   // the UI stays usable; the next change retries
    } finally { running = null; }
  })();
  return running;
}

const ui = document.getElementById('ui');
const sliders = [];
function slider(label, get, set, min = 0) {
  const l = document.createElement('label'); l.textContent = label;
  const v = Object.assign(document.createElement('span'), { className: 'v' }); l.append(v);
  const r = Object.assign(document.createElement('input'), { type: 'range', min, max: 1, step: 0.01, value: get() });
  const show = () => { v.textContent = (+r.value).toFixed(2); };
  r.oninput = () => { set(+r.value); show(); refresh(); };
  ui.append(l, r); sliders.push({ r, get, show }); show(); return r;
}
const sync = () => { for (const s of sliders) { s.r.value = s.get(); s.show(); } };
const h = t => { const e = document.createElement('h3'); e.textContent = t; ui.append(e); };
h('MakeHuman makro');
for (const [k, lab] of [['gender', 'Køn (K=0 · M=1)'], ['age', 'Alder (baby 0 · ung 0.5 · gammel 1)'], ['muscle', 'Muskler'], ['weight', 'Vægt'], ['height', 'Højde'], ['proportions', 'Proportioner']])
  slider(lab, () => m[k], v => m[k] = v);
h('Ansigt');
for (const s of DETAIL_SLIDERS.filter(x => x.group === 'face')) slider(s.label, () => d[s.id], v => d[s.id] = v, -1);
// MPFB applies the breast macros to any body with a female part and does not scale them by gender
h('Bryst (kvindelig krop)');
slider('Størrelse', () => m.cupsize, v => m.cupsize = v);
slider('Fasthed', () => m.firmness, v => m.firmness = v);
for (const s of DETAIL_SLIDERS.filter(x => x.group === 'breast')) slider(s.label, () => d[s.id], v => d[s.id] = v, -1);
h('Race (normaliseres)');
for (const k of ['asian', 'caucasian', 'african']) slider(k, () => m.race[k], v => m.race[k] = v);
h('Hud');
const c = Object.assign(document.createElement('input'), { type: 'color', value: '#c99a80' });
c.oninput = () => mat.color.set(c.value); ui.append(c);
const reset = Object.assign(document.createElement('button'), { textContent: 'Nulstil' });
reset.onclick = () => { Object.assign(m, structuredClone(START)); for (const k in d) d[k] = 0; sync(); refresh(); };
ui.append(reset);

window.__set = (k, v) => {
  if (k in m.race) m.race[k] = +v; else if (k in DEFAULT_MACROS && k !== 'race') m[k] = +v;
  else if (k in d) d[k] = +v;
  else throw new Error(`__set: unknown macro or slider '${k}'`);
  sync(); return refresh();
};
// camera hook for tests / screenshots (same as the baked viewer's __camTo); __bbox() = mesh bounds in metres
window.__camTo = (p, t) => { cam.position.set(...p); ctl.target.set(...t); ctl.update(); };
window.__bbox = () => { const b = geo.boundingBox.clone().translate(mesh.position); return [b.min.toArray(), b.max.toArray()]; };
await refresh();
window.__ready = true;
