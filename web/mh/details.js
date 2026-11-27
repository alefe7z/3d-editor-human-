// SPDX-License-Identifier: MIT
// Face / chest detail sliders for the runtime generator (web/mh/human.js): bipolar slider -1..1 -> weights of
// MakeHuman detail targets (CC0), packed by tools/export_data.py. Same sliders, target files and side scales as the
// baked viewer (web/character.js FACE_SLIDERS / BREAST_SLIDERS, blender/build_base.py FACE_TARGETS /
// BREAST_TARGETS), so a value means the same shape in both. "L/" = the l- and r- file of a sided target.
import { FACE_SLIDERS, BREAST_SLIDERS } from '../character.js';

/** stem -> [negative-side targets, positive-side targets] */
export const DETAIL_TARGETS = {
  nose_width: [['nose/nose-scale-horiz-decr'], ['nose/nose-scale-horiz-incr']],
  nose_length: [['nose/nose-scale-vert-decr'], ['nose/nose-scale-vert-incr']],
  nose_height: [['nose/nose-trans-down'], ['nose/nose-trans-up']],
  jaw_width: [['chin/chin-bones-decr'], ['chin/chin-bones-incr']],
  chin: [['chin/chin-prominent-decr'], ['chin/chin-prominent-incr']],
  cheekbones: [['L/cheek/cheek-bones-decr'], ['L/cheek/cheek-bones-incr']],
  eye_size: [['L/eyes/eye-scale-decr'], ['L/eyes/eye-scale-incr']],
  eye_spacing: [['L/eyes/eye-trans-in'], ['L/eyes/eye-trans-out']],
  eye_tilt: [['L/eyes/eye-corner2-down'], ['L/eyes/eye-corner2-up']],
  lips: [['mouth/mouth-upperlip-volume-decr', 'mouth/mouth-lowerlip-volume-decr'],
         ['mouth/mouth-upperlip-volume-incr', 'mouth/mouth-lowerlip-volume-incr']],
  mouth_width: [['mouth/mouth-scale-horiz-decr'], ['mouth/mouth-scale-horiz-incr']],
  ear_size: [['L/ears/ear-scale-decr'], ['L/ears/ear-scale-incr']],
  forehead: [['forehead/forehead-scale-vert-decr'], ['forehead/forehead-scale-vert-incr']],
  breast_dist: [['breast/breast-dist-decr'], ['breast/breast-dist-incr']],
  breast_point: [['breast/breast-point-decr'], ['breast/breast-point-incr']],
  breast_height: [['breast/breast-trans-down'], ['breast/breast-trans-up']],
};

export const expandSided = p => {
  if (!p.startsWith('L/')) return [p];
  const [cat, name] = p.slice(2).split(/\/(.*)/s);
  return [`${cat}/l-${name}`, `${cat}/r-${name}`];
};

const stemOf = morph => morph.replace(/^(face|bdet)_/, '').replace(/_(decr|incr)$/, '');
const sideScale = (s, side) => (typeof s.scale === 'number' ? s.scale : s.scale?.[side] ?? 1);

/** Detail sliders: { id, group 'face' | 'breast', label, stem, scale } (the macro sliders breastSize /
 *  breastFirmness are MakeHuman macros, cupsize / firmness, and stay in human.js). */
export const DETAIL_SLIDERS = [...FACE_SLIDERS, ...BREAST_SLIDERS]
  .filter(s => /^(face|bdet)_/.test(s.neg))
  .map(s => ({ id: s.id, group: s.group, label: s.label, stem: stemOf(s.neg), scale: s.scale }));

/** Every target file the detail sliders can ask for (tools/export_data.py packs at least these). */
export const DETAIL_TARGET_FILES = [...new Set(Object.values(DETAIL_TARGETS).flat(2).flatMap(expandSided))].sort();

/** { sliderId: -1..1 } -> { targetName: weight > 0 } for Human.apply(macros, details). */
export function detailWeights(values = {}) {
  const out = {};
  for (const s of DETAIL_SLIDERS) {
    const v = Math.max(-1, Math.min(1, Number(values[s.id]) || 0));
    if (!v) continue;
    const [neg, pos] = DETAIL_TARGETS[s.stem], side = v < 0 ? 'neg' : 'pos';
    const w = Math.abs(v) * sideScale(s, side);
    for (const t of (v < 0 ? neg : pos).flatMap(expandSided)) out[t] = (out[t] || 0) + w;
  }
  return out;
}
