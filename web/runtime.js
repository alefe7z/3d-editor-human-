// SPDX-License-Identifier: MIT
// Prototype: MakeHuman macro targets applied at runtime in three.js (no Blender, no baked morphs).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Human, browserLoader, DEFAULT_MACROS, normalizeRace } from './mh/human.js';
import { DETAIL_SLIDERS, detailWeights } from './mh/details.js';
import { pickLang } from './i18n.js';

// UI texts (pt / da / en, web/i18n.js pickLang). Detail sliders: Danish labels come from web/character.js.
const TXT = {
  pt: { macro: 'Macros do MakeHuman', gender: 'Sexo (F=0 · M=1)', age: 'Idade (bebê 0 · jovem 0.5 · idoso 1)', muscle: 'Músculos',
    weight: 'Peso', height: 'Altura', proportions: 'Proporções', face: 'Rosto', chest: 'Seios (corpo feminino)', cupsize: 'Tamanho',
    firmness: 'Firmeza', race: 'Etnia (normalizada)', asian: 'asiática', caucasian: 'caucasiana', african: 'africana', skin: 'Pele',
    reset: 'Redefinir', noData: 'Não foi possível carregar os dados', run: 'Rode', missing: 'formas faltando em web/data (rode tools/export_data.py de novo)',
    error: 'Erro', height_m: 'altura', targets: 'formas',
    noseWidth: 'Largura do nariz', noseLength: 'Comprimento do nariz', noseHeight: 'Altura do nariz', jawWidth: 'Largura da mandíbula',
    chin: 'Queixo', cheekbones: 'Maçãs do rosto', eyeSize: 'Tamanho dos olhos', eyeSpacing: 'Distância entre os olhos',
    eyeTilt: 'Inclinação dos olhos', lips: 'Lábios', mouthWidth: 'Largura da boca', earSize: 'Tamanho das orelhas',
    forehead: 'Altura da testa', breastHeight: 'Posição (baixa ↔ alta)', breastSpacing: 'Afastamento', breastProjection: 'Forma (redonda ↔ pontuda)' },
  da: { macro: 'MakeHuman makro', gender: 'Køn (K=0 · M=1)', age: 'Alder (baby 0 · ung 0.5 · gammel 1)', muscle: 'Muskler',
    weight: 'Vægt', height: 'Højde', proportions: 'Proportioner', face: 'Ansigt', chest: 'Bryst (kvindelig krop)', cupsize: 'Størrelse',
    firmness: 'Fasthed', race: 'Race (normaliseres)', asian: 'asian', caucasian: 'caucasian', african: 'african', skin: 'Hud',
    reset: 'Nulstil', noData: 'Kunne ikke indlæse data', run: 'Kør', missing: 'targets mangler i web/data (kør tools/export_data.py igen)',
    error: 'Fejl', height_m: 'højde', targets: 'targets' },
  en: { macro: 'MakeHuman macros', gender: 'Sex (F=0 · M=1)', age: 'Age (baby 0 · young 0.5 · old 1)', muscle: 'Muscle',
    weight: 'Weight', height: 'Height', proportions: 'Proportions', face: 'Face', chest: 'Chest (female body)', cupsize: 'Size',
    firmness: 'Firmness', race: 'Ethnicity (normalised)', asian: 'asian', caucasian: 'caucasian', african: 'african', skin: 'Skin',
    reset: 'Reset', noData: 'Could not load the data', run: 'Run', missing: 'targets missing in web/data (run tools/export_data.py again)',
    error: 'Error', height_m: 'height', targets: 'targets',
    noseWidth: 'Nose width', noseLength: 'Nose length', noseHeight: 'Nose height', jawWidth: 'Jaw width', chin: 'Chin',
    cheekbones: 'Cheekbones', eyeSize: 'Eye size', eyeSpacing: 'Eye spacing', eyeTilt: 'Eye tilt', lips: 'Lips',
    mouthWidth: 'Mouth width', earSize: 'Ear size', forehead: 'Forehead height', breastHeight: 'Position (low ↔ high)',
    breastSpacing: 'Spacing', breastProjection: 'Shape (round ↔ pointed)' },
};
const lang = pickLang(new URLSearchParams(location.search));
document.documentElement.lang = lang;
const T = k => TXT[lang][k] ?? TXT.en[k] ?? k;
const sliderLabel = s => TXT[lang][s.id] ?? (lang === 'da' ? s.label : TXT.en[s.id]) ?? s.label;

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
  info.textContent = `${T('noData')} (${e.message}). ${T('run')}: python tools/export_data.py`;
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
        const miss = human.lastMissing.length ? ` · ${human.lastMissing.length} ${T('missing')}` : '';
        info.textContent = `${human.lastStack.length} ${T('targets')}, ${ms.toFixed(0)} ms, ${T('height_m')} ${hgt.toFixed(2)} m${miss}`;
        const missKey = human.lastMissing.join();
        if (miss && missKey !== lastMissKey) console.warn('[runtime] targets missing from web/data:', human.lastMissing);
        lastMissKey = missKey;
      }
    } catch (e) {
      console.error(e);
      info.textContent = `${T('error')}: ${e.message}`;   // the UI stays usable; the next change retries
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
h(T('macro'));
for (const k of ['gender', 'age', 'muscle', 'weight', 'height', 'proportions'])
  slider(T(k), () => m[k], v => m[k] = v);
h(T('face'));
for (const s of DETAIL_SLIDERS.filter(x => x.group === 'face')) slider(sliderLabel(s), () => d[s.id], v => d[s.id] = v, -1);
// MPFB applies the breast macros to any body with a female part and does not scale them by gender
h(T('chest'));
slider(T('cupsize'), () => m.cupsize, v => m.cupsize = v);
slider(T('firmness'), () => m.firmness, v => m.firmness = v);
for (const s of DETAIL_SLIDERS.filter(x => x.group === 'breast')) slider(sliderLabel(s), () => d[s.id], v => d[s.id] = v, -1);
h(T('race'));
for (const k of ['asian', 'caucasian', 'african']) slider(T(k), () => m.race[k], v => m.race[k] = v);
h(T('skin'));
const c = Object.assign(document.createElement('input'), { type: 'color', value: '#c99a80' });
c.oninput = () => mat.color.set(c.value); ui.append(c);
const reset = Object.assign(document.createElement('button'), { textContent: T('reset') });
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
