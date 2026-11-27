# Character creation pipeline

The web editor builds a rigged human from the body, face, clothing and hair
catalogs. **Skin and hair detail** controls pores, roughness, light scattering,
rim lighting for fine fuzz, age-weighted wrinkle detail, anisotropic hair shine
and spring motion on long hair cards. The settings JSON and portable GLB metadata
carry those choices. A GLB by itself uses ordinary PBR materials, so web shader
effects and animation-driven hair motion depend on the host.

In **Chest**, the female body has additional controls for areola pigmentation,
pigment coverage, and nipple relief height, width and tip shape. Increase the
relief height to reveal changes in width and tip shape. Size and shape presets
set the same breast sliders that can then be adjusted manually. The numeric
breast size control accepts values beyond the ordinary slider range. Values
above 1 or below -1 extrapolate the mesh deformers and are preserved in saved
presets. Extreme values can cause overlapping geometry and garment clipping. These settings use the existing
skin-region mask and follow the age and sex gate used by the chest controls.
The relief changes shading without displacing the mesh. JSON presets and GLB
metadata preserve the values. The local skin effects require the web shader.

## Use the creator from a web host

Use `python tools/serve_offline.py` to serve the editor and bundled assets
locally without internet access. The editor exposes
one character session at `contentWindow.characterCreator` after the iframe's
`__ready` flag is true. The host and iframe must share an origin to use this API.

```js
const creator = iframe.contentWindow.characterCreator;
await creator.set('sex', 'female');
creator.set('height', 0.25);
await creator.set('hair', 'long01');
creator.set('skinPores', 0.6);
const preset = creator.getSettings();
await creator.applySettings(preset);
const glb = await creator.exportGlb({ animations: 'all', quantize: false });
```

Save the JSON for subsequent editing and the GLB for instantiation in the game.
Leave **Compress morphs** unchecked for Godot. Godot's stock GLB loader rejects
files that require `KHR_mesh_quantization`, including the prebuilt source body in
`output/`. Export a character through the editor for Godot.

## Instantiate a character in Godot

Copy the `godot/` scripts into the game project. For regular editor imports,
assign `import_character.gd` as the GLB's import script and reimport. For
player-generated files use the factory directly.

```gdscript
const CharacterFactory = preload("res://godot/character_factory.gd")

func spawn_character(path: String) -> void:
    var character := CharacterFactory.create(path)
    if character != null:
        add_child(character)
```

The factory loads the skinned mesh and the exported animation clips, reads the
appearance metadata, and configures Godot skin and hair-card materials. The
Godot material pass applies pore detail, roughness, skin SSS, rim lighting and hair
anisotropy. The editor's procedural wrinkle detail and web hair-card motion
are specific to the web shader. The factory instantiates the exported appearance.
The web editor handles interactive body, face and outfit changes.

## Author hair and visible fur in Blender

Groom a Hair Curves object on the same rest head and rig you will use in Godot.
To produce cards, use a small set of styled guide curves and a strand atlas
material with alpha. Excessive numbers of guides produce equally many ribbons.
The converter generates tapered UV strips with root-to-tip UVs and exports a
geometry asset. Author rig weights and fit your card asset to the intended heads
before replacing a catalog hairstyle. The same ribbon geometry can be used for
short visible hair such as brows or beard stubble.

```sh
<blender> -b character.blend --python-exit-code 1 --python blender/tools/groom_to_cards.py -- Groom cards.glb --material Hair_Atlas
```

## Load a strand groom in Godot

The factory can use an optional [TressFX integration](https://github.com/ismailivanov/TressFX-Godot)
on Godot 4.7+ with a RenderingDevice renderer. Use its
[Blender exporter](https://github.com/ismailivanov/Blender-to-Godot-Hair) to author
a matching `.tfx` and `.tfxbone`. Export closed skinned proxies to `.tfxmesh`
for head and shoulder collisions. The extension, collaborator-authored grooms and
GPU binaries are separate inputs.

```gdscript
var character := CharacterFactory.create(path, {
    "strands": "res://grooms/braid.tfx",
    "weights": "res://grooms/braid.tfxbone",
    "color": "#39291e",
    "colliders": ["res://grooms/head.tfxmesh", "res://grooms/shoulders.tfxmesh"],
})
```

The rig and the groom must match the character's head in rest pose. Use the
original hair cards on clients without TressFX or GPU compute. The Godot factory
falls back to cards when the extension, shader or required files are unavailable.
