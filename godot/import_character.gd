# SPDX-License-Identifier: GPL-3.0-or-later
@tool
extends EditorScenePostImport

const CharacterMaterials = preload("character_materials.gd")

func _post_import(scene: Node) -> Object:
	CharacterMaterials.new().apply(scene, get_source_file())
	return scene
