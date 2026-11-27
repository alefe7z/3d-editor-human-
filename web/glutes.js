// SPDX-License-Identifier: GPL-3.0-or-later
import { BufferAttribute, BufferGeometry } from 'three';

export const GLUTE_MOTION = 'dyn_glute_vertical';
export const FRONT_HIP_MOTION = 'dyn_front_hip';
const installed = new WeakSet();

function smooth(lo, hi, value) {
  const t = Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

/** Rest-space displacement. The bundled human faces +Z and uses metres. */
export function pelvisDeltas(x, y, z) {
  const side = Math.abs(x);
  const back = 1 - smooth(-0.055, 0.012, z);
  const vertical = smooth(0.66, 0.77, y) * (1 - smooth(0.88, 1.01, y));
  const lateral = (1 - smooth(0.135, 0.21, side)) * smooth(0, 0.045, side);
  const area = back * vertical * lateral;
  const round = Math.exp(-(((side - 0.085) / 0.06) ** 2 + ((y - 0.827) / 0.074) ** 2));
  const fullness = area * (0.62 + 0.38 * round);
  const front = smooth(0.018, 0.075, z) * smooth(0.82, 0.90, y)
    * (1 - smooth(0.98, 1.10, y)) * (1 - smooth(0.10, 0.19, side));
  return {
    gluteVolume: [x * fullness * 0.30, (y - 0.82) * fullness * 0.42, -0.052 * fullness],
    gluteProjection: [0, 0, -0.057 * area * round],
    gluteWidth: [x * area * 0.57, 0, 0],
    gluteRoundness: [0, 0, -0.039 * area * (round - 0.46)],
    gluteLift: [0, 0.038 * area, 0],
    gluteSoftness: [0, -0.017 * area * (1 - smooth(0.78, 0.90, y)), -0.022 * area * (0.7 - round)],
    [GLUTE_MOTION]: [0, 0.009 * fullness, 0],
    [FRONT_HIP_MOTION]: [0, 0.010 * front, 0.005 * front],
  };
}

export function installPelvisMorphs(mesh) {
  const geometry = mesh.geometry;
  const position = geometry?.attributes.position;
  if (installed.has(geometry) || !position || !geometry.morphTargetsRelative) return;
  const deltas = Object.fromEntries(Object.keys(pelvisDeltas(0, 0, 0))
    .map(name => [name, new Float32Array(position.count * 3)]));
  const base = new Float32Array(position.count * 3);
  let affected = false;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    base.set([x, y, z], 3 * i);
    if (y <= 0.66 || y >= 1.10 || Math.abs(x) >= 0.21) continue;
    for (const [name, delta] of Object.entries(pelvisDeltas(x, y, z))) {
      deltas[name].set(delta, 3 * i);
      affected ||= delta.some(value => value !== 0);
    }
  }
  if (!affected) return;
  installed.add(geometry);

  const normals = geometry.morphAttributes.normal;
  const scratch = normals ? new BufferGeometry() : null;
  let originalNormals;
  if (scratch) {
    scratch.setIndex(geometry.index);
    scratch.setAttribute('position', new BufferAttribute(base, 3));
    scratch.computeVertexNormals();
    originalNormals = scratch.attributes.normal.array.slice();
  }
  for (const [name, delta] of Object.entries(deltas)) {
    const attribute = new BufferAttribute(delta, 3);
    attribute.name = name;
    (geometry.morphAttributes.position ??= []).push(attribute);
    if (normals) {
      scratch.setAttribute('position', new BufferAttribute(base.map((value, i) => value + delta[i]), 3));
      scratch.computeVertexNormals();
      normals.push(new BufferAttribute(scratch.attributes.normal.array.map((value, i) => value - originalNormals[i]), 3));
    }
  }
  scratch?.dispose();
  mesh.updateMorphTargets();
}
