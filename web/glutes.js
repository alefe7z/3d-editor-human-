// SPDX-License-Identifier: GPL-3.0-or-later
import { BufferAttribute, BufferGeometry } from 'three';
import { refineExternalAnatomy } from './refine-pelvis.js';

export const GLUTE_MOTION = 'dyn_glute_vertical';
export const FRONT_HIP_MOTION = 'dyn_front_hip';
export const EXTERNAL_MOTION = 'dyn_external_anatomy';
const installed = new WeakSet();

function smooth(lo, hi, value) {
  const t = Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

/** Rest-space displacement. The bundled human faces +Z and uses metres. */
export function pelvisDeltas(x, y, z, external = false) {
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
    ...(external ? externalDeltas(x, y, z) : {}),
  };
}

// External landmarks in neutral rest space. These contours are part of one continuous skin surface.
function externalDeltas(x, y, z) {
  const side = Math.abs(x);
  const anterior = smooth(0.014, 0.054, z);
  const vertical = smooth(0.755, 0.783, y) * (1 - smooth(0.807, 0.839, y));
  const contour = anterior * vertical * (1 - smooth(0.022, 0.062, side));
  const pubic = anterior * smooth(0.793, 0.824, y) * (1 - smooth(0.848, 0.890, y))
    * (1 - smooth(0.023, 0.073, side));
  const band = (value, center, radius) => Math.exp(-(((value - center) / radius) ** 2));
  const outer = band(side, 0.023, 0.012) * band(y, 0.785, 0.029) * contour;
  const innerCenter = 0.007 + 0.004 * band(y, 0.785, 0.016);
  const inner = band(side, innerCenter, 0.0045) * band(y, 0.786, 0.017) * contour;
  const hood = band(side, 0.003, 0.006) * band(y, 0.804, 0.007) * anterior;
  const vestibule = band(side, 0, 0.006) * band(y, 0.781, 0.011) * contour;
  const glans = band(side, 0, 0.004) * band(y, 0.8, 0.0045) * anterior;
  const glansShoulder = band(side, 0, 0.0065) * band(y, 0.8, 0.007) * anterior;
  const urethral = band(side, 0, 0.0022) * band(y, 0.791, 0.0028) * anterior;
  const introitus = band(side, 0, 0.006) * band(y, 0.776, 0.006) * anterior;
  const lateral = Math.sign(x) * smooth(0, 0.006, side);
  return {
    externalFullness: [0, 0, 0.011 * pubic],
    externalWidth: [x * 0.38 * contour, 0, 0],
    externalOuterContour: [0, 0, 0.008 * outer],
    externalFoldRelief: [0, 0, 0.006 * inner],
    externalOuterSeparation: [lateral * 0.0045 * outer, 0, 0],
    externalInnerSeparation: [lateral * 0.0035 * inner, 0, 0],
    externalInnerLength: [0, (y - 0.786) * inner * 0.65, 0],
    externalAsymmetry: [0, 0, lateral * (0.003 * outer + 0.002 * inner)],
    externalHood: [0, 0, 0.0035 * hood],
    externalGlansSize: [x * 0.6 * glansShoulder, (y - 0.8) * 0.55 * glansShoulder, 0.0015 * glansShoulder],
    externalGlansProjection: [0, 0, 0.003 * glans],
    externalUrethralRelief: [0, 0, -0.0012 * urethral],
    externalIntroitusRelief: [0, 0, -0.0035 * introitus],
    externalVestibule: [0, 0, -0.004 * vestibule],
    [EXTERNAL_MOTION]: [0, 0.0025 * contour, 0.001 * contour],
  };
}

export function installPelvisMorphs(mesh, { external = false } = {}) {
  const geometry = mesh.geometry;
  if (!geometry?.attributes.position || installed.has(geometry) || !geometry.morphTargetsRelative) return;
  if (external) refineExternalAnatomy(geometry);
  const position = geometry.attributes.position;
  const deltas = Object.fromEntries(Object.keys(pelvisDeltas(0, 0, 0, external))
    .map(name => [name, new Float32Array(position.count * 3)]));
  const base = new Float32Array(position.count * 3);
  let affected = false;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    base.set([x, y, z], 3 * i);
    if (y <= 0.66 || y >= 1.10 || Math.abs(x) >= 0.21) continue;
    for (const [name, delta] of Object.entries(pelvisDeltas(x, y, z, external))) {
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
