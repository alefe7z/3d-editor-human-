# SPDX-License-Identifier: GPL-3.0-or-later
"""Convert evaluated Blender Hair Curves to tapered UV ribbons for glTF."""
import argparse
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def build_cards(groom, width):
    evaluated = groom.evaluated_get(bpy.context.evaluated_depsgraph_get())
    data = evaluated.data
    positions = data.attributes["position"].data
    vertices, faces, uvs = [], [], []
    for curve in data.curves:
        start = curve.first_point_index
        points = []
        for index in range(start, start + curve.points_length):
            point = positions[index].vector.copy()
            if not points or (point - points[-1]).length_squared > 1e-12:
                points.append(point)
        if len(points) < 2:
            continue
        distances = [0.0]
        for first, second in zip(points, points[1:]):
            distances.append(distances[-1] + (second - first).length)
        root = len(vertices)
        side = None
        for i, point in enumerate(points):
            tangent = (points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]).normalized()
            if tangent.length_squared < 1e-12:
                tangent = (points[i] - points[i - 1]).normalized()
            if side is not None:
                side = side - tangent * side.dot(tangent)
            if side is None or side.length_squared < 1e-8:
                axis = Vector((0, 0, 1)) if abs(tangent.z) < 0.9 else Vector((0, 1, 0))
                side = tangent.cross(axis)
            side.normalize()
            along = distances[i] / distances[-1]
            offset = side * width * 0.5 * (1 - 0.85 * along**3)
            vertices.extend((point - offset, point + offset))
            uvs.extend(((0, 1 - along), (1, 1 - along)))
            if i:
                j = root + 2 * i
                faces.append((j - 2, j - 1, j + 1, j))
    if not faces:
        raise ValueError("The groom has no non-degenerate curves")
    mesh = bpy.data.meshes.new("GroomCards")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv = mesh.uv_layers.new(name="UVMap")
    for loop in mesh.loops:
        uv.data[loop.index].uv = uvs[loop.vertex_index]
    cards = bpy.data.objects.new("GroomCards", mesh)
    bpy.context.collection.objects.link(cards)
    cards.matrix_world = groom.matrix_world.copy()
    return cards


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("groom", help="Name of the Blender Hair Curves object")
    parser.add_argument("output", type=Path)
    parser.add_argument("--width", type=float, default=0.008, help="Root ribbon width in Blender units")
    parser.add_argument("--material", help="Existing Blender hair material with a strand atlas")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    groom = bpy.data.objects.get(args.groom)
    if groom is None or groom.type != "CURVES":
        parser.error("groom must name a Hair Curves object")
    if not 0 < args.width < float("inf") or args.output.suffix.lower() != ".glb":
        parser.error("provide a positive width and a .glb output path")
    material = bpy.data.materials.get(args.material) if args.material else None
    if args.material and material is None:
        parser.error("material does not exist")
    cards = build_cards(groom, args.width)
    if material is not None:
        cards.data.materials.append(material)
    bpy.ops.object.select_all(action="DESELECT")
    cards.select_set(True)
    bpy.context.view_layer.objects.active = cards
    bpy.ops.export_scene.gltf(filepath=str(args.output), export_format="GLB", use_selection=True)


if __name__ == "__main__":
    main()
