# SPDX-License-Identifier: GPL-3.0-or-later
extends RefCounted

const CharacterMaterials = preload("character_materials.gd")
const STRAND_SHADER = "res://addons/tressfx/shaders/tressfx_strand.gdshader"

## Load a character GLB exported by the editor, including its rig and clips.
## Supply groom paths exported from Blender to replace cards on supported devices.
static func create(path: String, groom: Dictionary = {}) -> Node3D:
	var document := GLTFDocument.new()
	var state := GLTFState.new()
	var error := document.append_from_file(path, state)
	if error != OK:
		push_error("Character GLB could not be loaded: %s (%s)" % [path, error_string(error)])
		return null
	var character := document.generate_scene(state) as Node3D
	if character == null:
		return null
	CharacterMaterials.new().apply(character, path)
	if not groom.is_empty() and not _add_groom(character, groom):
		push_warning("Strand groom unavailable. Using the character's hair cards.")
	return character

static func _add_groom(character: Node3D, groom: Dictionary) -> bool:
	if not ClassDB.class_exists("TressFXHair") or RenderingServer.get_rendering_device() == null:
		return false
	var strands := String(groom.get("strands", ""))
	var weights := String(groom.get("weights", ""))
	if strands.is_empty() or weights.is_empty() or not FileAccess.file_exists(strands) or not FileAccess.file_exists(weights):
		return false
	var rigs := character.find_children("*", "Skeleton3D", true, false)
	var shader := load(STRAND_SHADER) as Shader if ResourceLoader.exists(STRAND_SHADER) else null
	if rigs.is_empty() or shader == null:
		return false
	var hair := ClassDB.instantiate("TressFXHair") as Node3D
	if hair == null:
		return false
	var material := ShaderMaterial.new()
	material.shader = shader
	var color := Color.from_string(String(groom.get("color", "#3b2a1e")), Color.SADDLE_BROWN)
	material.set_shader_parameter("base_color", color.darkened(0.14))
	material.set_shader_parameter("tip_color", color.lightened(0.08))
	hair.set("material", material)
	hair.set("tfx_path", strands)
	hair.set("tfxbone_path", weights)
	hair.set("hair_skeleton", rigs[0])
	character.add_child(hair)
	_add_colliders(character, hair, rigs[0], groom.get("colliders", []))
	var invisible := StandardMaterial3D.new()
	invisible.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR
	invisible.albedo_color = Color.TRANSPARENT
	for mesh: MeshInstance3D in character.find_children("*", "MeshInstance3D", true, false):
		if mesh.mesh == null:
			continue
		for surface in mesh.mesh.get_surface_count():
			var surface_material := mesh.get_active_material(surface)
			if surface_material != null and surface_material.resource_name.to_lower().begins_with("hair_"):
				mesh.set_surface_override_material(surface, invisible)
	return true

static func _add_colliders(character: Node3D, hair: Node3D, rig: Skeleton3D, paths: Array) -> void:
	if not ClassDB.class_exists("TressFXCollisionMesh"):
		return
	var colliders: Array[NodePath] = []
	for entry in paths:
		var path := String(entry)
		if not FileAccess.file_exists(path):
			continue
		var collider := ClassDB.instantiate("TressFXCollisionMesh") as Node3D
		if collider == null:
			continue
		collider.set("tfxmesh_path", path)
		collider.set("hair_skeleton", rig)
		character.add_child(collider)
		colliders.append(hair.get_path_to(collider))
	hair.set("collision_meshes", colliders)
