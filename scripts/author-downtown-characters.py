"""Build the two Magic City street characters with Blender and MPFB 2.0.18.

Run Blender with this script, then -- ASSET_PACK_DIRECTORY OUTPUT_DIRECTORY.
The MPFB extension must be installed in Blender's user_default repository.
"""
import importlib
import math
import sys
from pathlib import Path

import addon_utils
import bpy
from mathutils import Matrix, Quaternion, Vector

MODULE = "bl_ext.user_default.mpfb"
STRIDE_SPEED = 1.10
WALK_FRAMES = 28
FPS = 30
SIDES = (("l", 1), ("r", -1))


def service(module, name):
    return getattr(importlib.import_module(f"{MODULE}.services.{module}"), name)


def attach_asset(human_service, assets, human, directory, filename, kind):
    path = assets.find_asset_absolute_path(filename, asset_subdir=directory)
    if not path:
        raise RuntimeError(f"Missing character source {directory}/{filename}")
    return human_service.add_mhclo_asset(
        path, human, asset_type=kind, material_type="GAMEENGINE", subdiv_levels=0
    )


def felt_hat(rig, body):
    """Fit a felt cloche to the baked scalp and bind it to the head bone."""
    neck = rig.data.bones["head"].head_local.z
    scalp = [v.co for v in body.data.vertices if v.co.z > neck + 0.05]
    top = max(p.z for p in scalp)
    center = (max(p.y for p in scalp) + min(p.y for p in scalp)) * 0.5
    width = max(abs(p.x) for p in scalp) + 0.018
    depth = (max(p.y for p in scalp) - min(p.y for p in scalp)) * 0.5 + 0.020
    rings = [(1.22,-.048),(1.25,-.043),(1.14,-.034),(1.10,-.023),
             (1.08,.002),(.94,.029),(.68,.048),(.32,.056),(.01,.060)]
    vertices = []
    faces = []
    for i, (radius, height) in enumerate(rings):
        for j in range(36):
            angle = math.tau * j / 36
            front = max(0, -math.sin(angle))
            drape = min(1, max(0, (0.045-height)*10))
            vertices.append((math.cos(angle)*width*radius,
                             center + math.sin(angle)*depth*radius,
                             top + height - front * drape * 0.011))
            if i:
                prev = (i-1)*36+j
                next_prev = (i-1)*36+(j+1)%36
                faces.append((prev,next_prev,next_prev+36,prev+36))
    mesh = bpy.data.meshes.new("Felt cloche")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    hat = bpy.data.objects.new(mesh.name, mesh)
    bpy.context.collection.objects.link(hat)
    material = bpy.data.materials.new("Garnet felt")
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (0.15,0.031,0.034,1)
    shader.inputs["Roughness"].default_value = 0.91
    mesh.materials.append(material)
    for face in mesh.polygons:
        face.use_smooth = True
    hat.parent = rig
    head = hat.vertex_groups.new(name="head")
    head.add(list(range(len(vertices))), 1, "REPLACE")
    skin = hat.modifiers.new("Armature", "ARMATURE")
    skin.object = rig
    return hat


def bake_walk(rig, meshes):
    scene = bpy.context.scene
    scene.render.fps = FPS
    rest = {bone.name: bone.bone.matrix_local.copy() for bone in rig.pose.bones}
    orientations = {name: matrix.to_quaternion() for name, matrix in rest.items()}
    frames_time = WALK_FRAMES / FPS
    stance = 0.55
    half_step = STRIDE_SPEED * frames_time * stance / 2
    neutral_hips = rig.data.bones["thigh_l"].head_local.z
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    sole = float("inf")
    for obj in meshes:
        if "shoe" not in obj.name.lower():
            continue
        evaluated = obj.evaluated_get(graph)
        mesh = evaluated.to_mesh()
        sole = min(sole, min((evaluated.matrix_world @ vertex.co).z for vertex in mesh.vertices))
        evaluated.to_mesh_clear()
    if not math.isfinite(sole):
        raise RuntimeError("Could not measure the shoe soles")
    ankle = rig.data.bones["foot_l"].head_local.z - sole
    relaxed_arms = {}
    for side, sign in SIDES:
        bone = rig.data.bones[f"upperarm_{side}"]
        direction = (bone.tail_local - bone.head_local).normalized()
        relaxed_arms[side] = direction.rotation_difference(Vector((sign * 0.11, -0.03, -1)).normalized())

    def rotate(name, rotation):
        initial = orientations[name]
        rig.pose.bones[name].rotation_quaternion = initial.inverted() @ rotation @ initial

    def foot_target(phase, side, sign, walking):
        source = rig.data.bones[f"foot_{side}"].head_local
        x, y = source.x, source.y
        x = sign * max(0.09, abs(x))
        lift, pitch = 0, 0
        if walking and phase < stance:
            y += STRIDE_SPEED * frames_time * phase - half_step
        elif walking:
            swing = (phase - stance) / (1 - stance)
            easing = swing * swing * (3 - 2 * swing)
            tangent = STRIDE_SPEED * frames_time * (1 - stance)
            y += half_step * (1 - 2 * easing) + tangent * (2 * swing**3 - 3 * swing**2 + swing)
            lift = 0.065 * math.sin(math.pi * swing) ** 2
            pitch = 0.10 * math.sin(math.tau * swing) * math.sin(math.pi * swing) ** 2
        return Vector((x, y, ankle + lift)), pitch

    rig.animation_data_create()
    for name, length in (("Idle", 72), ("Walk", WALK_FRAMES)):
        walking = name == "Walk"
        action = bpy.data.actions.new(name)
        rig.animation_data.action = action
        for frame in range(length + 1):
            scene.frame_set(frame)
            for bone in rig.pose.bones:
                bone.rotation_mode = "QUATERNION"
                bone.rotation_quaternion = Quaternion()
                bone.location = (0, 0, 0)
            phase = (frame / length) % 1
            targets = {
                side: foot_target((phase + (0 if side == "l" else 0.5)) % 1, side, sign, walking)
                for side, sign in SIDES
            }
            height = neutral_hips - sole - 0.008
            height -= 0.023 * (1 + math.cos(2 * math.tau * phase)) if walking else 0
            for side, _ in SIDES:
                thigh = rig.data.bones[f"thigh_{side}"]
                calf = rig.data.bones[f"calf_{side}"]
                end = targets[side][0]
                horizontal = (end.x - thigh.head_local.x)**2 + (end.y - thigh.head_local.y)**2
                reachable = max(0.001, ((thigh.length + calf.length) * 0.995)**2 - horizontal)
                height = min(height, end.z + math.sqrt(reachable))
            pelvis = rest["pelvis"].copy()
            pelvis.translation.z += height - neutral_hips
            rig.pose.bones["pelvis"].matrix = pelvis
            bpy.context.view_layer.update()
            for side, sign in SIDES:
                lower_name = f"calf_{side}"
                upper_name = f"thigh_{side}"
                hip = rig.pose.bones[upper_name].head.copy()
                foot, pitch = targets[side]
                direction = foot - hip
                distance = direction.length
                direction.normalize()
                thigh = rig.data.bones[upper_name].length
                calf = rig.data.bones[lower_name].length
                knee_projection = (thigh**2 - calf**2 + distance**2) / (2 * distance)
                bend = math.sqrt(max(0, thigh**2 - knee_projection**2))
                front = Vector((0, -1, 0))
                front = (front - direction * front.dot(direction)).normalized()
                knee = hip + direction * knee_projection + front * bend
                for key, start, end in ((upper_name, hip, knee), (lower_name, knee, foot)):
                    bone = rig.pose.bones[key]
                    base_direction = (bone.bone.tail_local - bone.bone.head_local).normalized()
                    rotation = base_direction.rotation_difference((end-start).normalized()) @ orientations[key]
                    bone.matrix = Matrix.LocRotScale(start, rotation, Vector((1, 1, 1)))
                    bpy.context.view_layer.update()
                foot_name = f"foot_{side}"
                rotation = Quaternion((1, 0, 0), pitch) @ orientations[foot_name]
                rig.pose.bones[foot_name].matrix = Matrix.LocRotScale(foot, rotation, Vector((1, 1, 1)))
                swing = sign * math.cos(math.tau * phase) * 0.19 if walking else 0
                rotate(f"upperarm_{side}", Quaternion((1, 0, 0), swing) @ relaxed_arms[side])
                rotate(f"lowerarm_{side}", Quaternion((1, 0, 0), 0.16))
                for finger in ("index", "middle", "ring", "pinky"):
                    for segment, angle in (("02", 0.17), ("03", 0.12)):
                        rig.pose.bones[f"{finger}_{segment}_{side}"].rotation_quaternion = Quaternion((1, 0, 0), angle)
            rotate("spine_02", Quaternion((1, 0, 0), 0.007 * math.sin(math.tau * phase)))
            rotate("head", Quaternion((0, 0, 1), 0.017 * math.sin(math.tau * phase)))
            for bone in rig.pose.bones:
                bone.keyframe_insert(data_path="rotation_quaternion", frame=frame, group=bone.name)
                bone.keyframe_insert(data_path="location", frame=frame, group=bone.name)
        track = rig.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 0, action)
        rig.animation_data.action = None
    scene.frame_start, scene.frame_end = 0, 72
    scene.frame_set(0)


def build(asset_path, output, female):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    addon_utils.enable(MODULE, default_set=True)
    bpy.context.preferences.addons[MODULE].preferences.mpfb_second_root = str(asset_path)
    service("locationservice", "LocationService").update_second_root()
    humans = service("humanservice", "HumanService")
    assets = service("assetservice", "AssetService")
    targets = service("targetservice", "TargetService")
    exports = service("exportservice", "ExportService")
    objects = service("objectservice", "ObjectService")

    state = targets.get_default_macro_info_dict()
    state.update(gender=0.0 if female else 1.0, age=0.41 if female else 0.48)
    body = humans.create_human(macro_detail_dict=state)
    skin_name = "young_caucasian_female.mhmat" if female else "young_african_male.mhmat"
    skin = assets.find_asset_absolute_path(skin_name, asset_subdir="skins")
    if not skin:
        raise RuntimeError(f"Missing skin {skin_name}")
    humans.set_character_skin(skin, body, skin_type="GAMEENGINE")
    humans.add_builtin_rig(body, "game_engine")
    pieces = [
        ("eyes", "low-poly.mhclo", "Eyes"),
        ("eyebrows", "eyebrow001.mhclo", "Eyebrows"),
        ("eyelashes", "eyelashes01.mhclo", "Eyelashes"),
        ("hair", "short01.mhclo", "Hair"),
        ("clothes", "shoes01.mhclo", "Clothes"),
        ("clothes", "female_elegantsuit01.mhclo" if female else "toigo_male_double-breasted_suit.mhclo", "Clothes"),
    ]
    if not female:
        pieces.append(("clothes", "fedora01.mhclo", "Clothes"))
    for directory, filename, kind in pieces:
        attach_asset(humans, assets, body, directory, filename, kind)

    bpy.context.view_layer.update()
    rig = exports.create_character_copy(body, name_suffix="_street")
    export_body = objects.find_object_of_type_amongst_nearest_relatives(rig, "Basemesh")
    exports.bake_modifiers_remove_helpers(
        export_body, bake_masks=True, bake_subdiv=False, remove_helpers=True, also_proxy=True
    )
    # The macro targets are baked at their fitted weights so the scalp and
    # clothing agree with the geometry the game actually loads.
    bpy.context.view_layer.objects.active = export_body
    if export_body.data.shape_keys:
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    if female:
        felt_hat(rig, export_body)
    export_objects = [rig] + objects.get_list_of_children(rig)
    meshes = [obj for obj in export_objects if obj.type == "MESH"]
    for obj in meshes:
        for face in obj.data.polygons:
            face.use_smooth = True
    for image in bpy.data.images:
        width, height = image.size
        if width and height and max(width, height) > 1024:
            factor = 1024 / max(width, height)
            image.scale(round(width * factor), round(height * factor))
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        for node in material.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                name = material.name.lower()
                if not any(layer in name for layer in ("eyebrow", "eyelash", "short01")):
                    for link in list(node.inputs["Alpha"].links):
                        material.node_tree.links.remove(link)
                    node.inputs["Alpha"].default_value = 1
                if "suit" in name or "fedora" in name:
                    node.inputs["Roughness"].default_value = 0.84
                    for link in list(node.inputs["Roughness"].links):
                        material.node_tree.links.remove(link)
            if node.type == "NORMAL_MAP":
                node.inputs["Strength"].default_value *= 0.29
    bake_walk(rig, meshes)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in export_objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=str(output), export_format="GLB", use_selection=True, export_skins=True,
        export_animations=True, export_animation_mode="NLA_TRACKS", export_anim_slide_to_zero=True,
        export_image_format="WEBP", export_image_quality=86, export_image_webp_fallback=False,
    )
    print("Finished character:", output.name, output.stat().st_size)


if __name__ == "__main__":
    arguments = sys.argv[sys.argv.index("--") + 1:]
    asset_root, out_dir = (Path(value).resolve() for value in arguments)
    out_dir.mkdir(parents=True, exist_ok=True)
    build(asset_root, out_dir / "bank-clerk.glb", female=False)
    build(asset_root, out_dir / "shopkeeper.glb", female=True)
