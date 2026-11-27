// SPDX-License-Identifier: GPL-3.0-or-later
import { BufferAttribute } from 'three';

const inPatch = (x, y, z) => Math.abs(x) < 0.047 && y > 0.748 && y < 0.861 && z > -0.036;

/** Split only local triangles and their shared edges, preserving the base surface and UV seams. */
export function refineExternalAnatomy(geometry) {
  if (!geometry.index || !geometry.attributes.skinIndex || !geometry.attributes.skinWeight) return;
  for (let pass = 0; pass < 2; pass++) refine(geometry);
}

function refine(geometry) {
  const { position, skinIndex, skinWeight } = geometry.attributes;
  const indices = geometry.index.array;
  const edgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
  // UV islands can duplicate positions. Both sides of a duplicated edge must split.
  const pointKeys = Array.from({ length: position.count }, (_, i) =>
    [position.getX(i), position.getY(i), position.getZ(i)].map(v => Math.round(v * 1e6)).join(','));
  const marked = new Set();
  const edges = new Map();
  const pairs = [];
  const triangles = [];
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], c = indices[i + 2];
    const x = (position.getX(a) + position.getX(b) + position.getX(c)) / 3;
    const y = (position.getY(a) + position.getY(b) + position.getY(c)) / 3;
    const z = (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3;
    if (inPatch(x, y, z)) {
      for (const [u, v] of [[a, b], [b, c], [c, a]]) marked.add(edgeKey(pointKeys[u], pointKeys[v]));
    }
  }
  if (!marked.size) return;
  function midpoint(a, b) {
    const key = edgeKey(a, b);
    if (!edges.has(key)) {
      edges.set(key, position.count + pairs.length);
      pairs.push([a, b]);
    }
    return edges.get(key);
  }
  for (let i = 0; i < indices.length; i += 3) {
    const face = [indices[i], indices[i + 1], indices[i + 2]];
    const splits = face.map((a, j) => {
      const b = face[(j + 1) % 3];
      return marked.has(edgeKey(pointKeys[a], pointKeys[b])) ? midpoint(a, b) : -1;
    });
    if (splits.every(m => m >= 0)) {
      const [a, b, c] = face, [ab, bc, ca] = splits;
      triangles.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
      continue;
    }
    const split = [face];
    for (let j = 0; j < 3; j++) {
      const a = face[j], b = face[(j + 1) % 3];
      const m = splits[j];
      if (m < 0) continue;
      const t = split.findIndex(f => f.includes(a) && f.includes(b));
      const other = split[t].find(v => v !== a && v !== b);
      split.splice(t, 1, [a, m, other], [m, b, other]);
    }
    triangles.push(...split.flat());
  }

  const extend = (attribute, zone = false) => {
    const Type = zone ? Uint16Array : Float32Array;
    const data = new Type((attribute.count + pairs.length) * attribute.itemSize);
    for (let i = 0; i < attribute.count; i++) {
      for (let c = 0; c < attribute.itemSize; c++) data[i * attribute.itemSize + c] = attribute.getComponent(i, c);
    }
    for (let i = 0; i < pairs.length; i++) {
      const [a, b] = pairs[i], offset = (attribute.count + i) * attribute.itemSize;
      for (let c = 0; c < attribute.itemSize; c++) {
        const u = attribute.getComponent(a, c), v = attribute.getComponent(b, c);
        data[offset + c] = zone ? (u & v) : (u + v) * 0.5;
      }
    }
    const result = new BufferAttribute(data, attribute.itemSize);
    result.name = attribute.name;
    return result;
  };

  const joints = extend(skinIndex), weights = extend(skinWeight);
  const jointData = Uint16Array.from(joints.array);
  for (let i = 0; i < pairs.length; i++) {
    const combined = new Map();
    for (const vertex of pairs[i]) {
      for (let c = 0; c < 4; c++) {
        const joint = skinIndex.getComponent(vertex, c);
        combined.set(joint, (combined.get(joint) ?? 0) + skinWeight.getComponent(vertex, c) * 0.5);
      }
    }
    const leading = [...combined].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = leading.reduce((sum, [, weight]) => sum + weight, 0) || 1;
    const offset = (position.count + i) * 4;
    for (let c = 0; c < 4; c++) {
      const [joint, weight] = leading[c] ?? [0, 0];
      jointData[offset + c] = joint;
      weights.array[offset + c] = weight / total;
    }
  }
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    if (name !== 'skinIndex' && name !== 'skinWeight') geometry.setAttribute(name, extend(attribute, name === '_cczone'));
  }
  geometry.setAttribute('skinIndex', new BufferAttribute(jointData, 4));
  geometry.setAttribute('skinWeight', weights);
  for (const [type, attributes] of Object.entries(geometry.morphAttributes)) {
    geometry.morphAttributes[type] = attributes.map(attribute => extend(attribute));
  }
  geometry.setIndex(triangles);
  geometry.boundingBox = geometry.boundingSphere = null;
}
