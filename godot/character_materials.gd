# SPDX-License-Identifier: GPL-3.0-or-later
@tool
extends RefCounted

var appearance: Dictionary = {}
var detail_normal: ImageTexture
var upgraded: Dictionary = {}

func apply(scene: Node, source_path: String) -> void:
	appearance = _read_appearance(source_path)
	detail_normal = _make_detail_normal()
	upgraded.clear()
	_apply_materials(scene)

func _read_appearance(source_path: String) -> Dictionary:
	var file := FileAccess.open(source_path, FileAccess.READ)
	if file == null or file.get_32() != 0x46546c67 or file.get_32() != 2:
		return {}
	file.get_32()
	var length := file.get_32()
	if file.get_32() != 0x4e4f534a or length > file.get_length() - 20:
		return {}
	var json = JSON.parse_string(file.get_buffer(length).get_string_from_utf8())
	if json is Dictionary:
		var settings = json.get("extras", {}).get("characterCreator", {}).get("settings", {})
		var profile = settings.get("appearance", {})
		if profile is Dictionary:
			return profile
	return {}

func _setting(key: String, fallback: float) -> float:
	var value = appearance.get(key, fallback)
	return clampf(value, 0.0, 1.0) if value is float or value is int else fallback

func _apply_materials(node: Node) -> void:
	if node is MeshInstance3D and node.mesh != null:
		for surface in node.mesh.get_surface_count():
			var source := node.get_active_material(surface) as StandardMaterial3D
			if source == null:
				continue
			var role := source.resource_name.to_lower()
			if role != "skin" and not role.begins_with("hair_"):
				continue
			if not upgraded.has(source):
				var material := source.duplicate() as StandardMaterial3D
				if role == "skin":
					_configure_skin(material)
				else:
					_configure_hair(material)
				upgraded[source] = material
			node.set_surface_override_material(surface, upgraded[source])
	for child in node.get_children():
		_apply_materials(child)

func _configure_skin(material: StandardMaterial3D) -> void:
	var scattering := _setting("skinScattering", 1.0)
	material.subsurf_scatter_enabled = scattering > 0.0
	material.subsurf_scatter_skin_mode = true
	material.subsurf_scatter_strength = scattering * 0.3
	material.rim_enabled = _setting("skinFuzz", 0.22) > 0.0
	material.rim = _setting("skinFuzz", 0.22) * 0.35
	material.roughness = clampf(_setting("skinRoughness", 0.56), 0.25, 0.95)
	material.detail_enabled = _setting("skinPores", 0.35) > 0.0
	material.detail_normal = detail_normal
	material.detail_uv_layer = BaseMaterial3D.DETAIL_UV_1

func _configure_hair(material: StandardMaterial3D) -> void:
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_HASH
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	material.anisotropy_enabled = true
	material.anisotropy = 0.7
	material.roughness = lerpf(0.85, 0.28, _setting("hairShine", 0.55))

func _make_detail_normal() -> ImageTexture:
	var size := 128
	var height := PackedFloat32Array()
	height.resize(size * size)
	var random := RandomNumberGenerator.new()
	random.seed = 119
	for pore in 700:
		var cx := random.randi_range(0, size - 1)
		var cy := random.randi_range(0, size - 1)
		for y in range(-2, 3):
			for x in range(-2, 3):
				var pixel := posmod(cy + y, size) * size + posmod(cx + x, size)
				height[pixel] -= exp(-float(x * x + y * y))
	var image := Image.create_empty(size, size, false, Image.FORMAT_RGB8)
	var strength := _setting("skinPores", 0.35) * 1.6
	for y in size:
		for x in size:
			var dx := height[y * size + posmod(x - 1, size)] - height[y * size + posmod(x + 1, size)]
			var dy := height[posmod(y - 1, size) * size + x] - height[posmod(y + 1, size) * size + x]
			var normal := Vector3(dx * strength, dy * strength, 1.0).normalized() * 0.5 + Vector3.ONE * 0.5
			image.set_pixel(x, y, Color(normal.x, normal.y, normal.z))
	image.generate_mipmaps(true)
	return ImageTexture.create_from_image(image)
