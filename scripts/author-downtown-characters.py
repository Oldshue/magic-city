"""Build the Magic City street characters with Blender and MPFB 2.0.18.

Run Blender with this script, then -- ASSET_PACK_DIRECTORY OUTPUT_DIRECTORY [--driver-only].
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


# Car-space marks measured from the Packard mesh. The garage model uses Y up
# and +Z forward; Blender's fitted character uses Z up and -Y forward.
DRIVER_SCALE = 0.94


def actor_point(mark):
    x, y, z = mark
    return Vector((x, -z, y)) / DRIVER_SCALE


def wheel_grip(roll, side):
    phase = (0.38 if side > 0 else math.pi - 0.38) + roll
    height = 0.146 * math.sin(phase)
    return (
        0.35 + 0.152 * math.cos(phase) + 0.021 * side,
        1.23 + math.cos(0.38) * height,
        0.102 - math.sin(0.38) * height,
    )


# Hips, heading, chest pitch, reaching hand, free hand, and both ankle
# marks. The outside foot stays on the running board while the other
# clears the sill. The final pose matches the driving cycle at zero lock.
ENTRY_MARKS = [
    (0, (1.54,.86,-.18), -72, .02, (1.57,.78,-.36), (1.43,.77,.06), (1.65,.101,-.21), (1.43,.101,.02)),
    (8, (1.49,.86,-.16), -72, .15, (1.65,.78,-.31), (.898,.981,-.498), (1.65,.101,-.21), (1.43,.101,.02)),
    (15, (1.49,.89,-.17), -59, .22, (1.56,.94,-.48), (1.34,1.057,-.46), (1.67,.101,-.23), (1.14,.33,.017)),
    (23, (1.09,1.045,-.21), -36, .35, (1.49,1.04,-.42), (.90,1.17,.09), (1.02,.52,-.28), (.62,.56,.13)),
    (31, (.72,.98,-.22), -15, .41, (1.18,1.052,-.50), (.67,1.26,.12), (.94,.55,-.26), (.25,.62,.38)),
    (39, (.39,.926,-.24), -7, .18, (1.05,1.014,-.40), (.254,1.262,.08), (.51,.65,.22), (.19,.625,.36)),
    (48, (.35,.942,-.24), 0, .09, wheel_grip(0, 1), wheel_grip(0, -1), (.495,.625,.35), (.20,.625,.38)),
]


def bake_driver(rig):
    scene = bpy.context.scene
    pose_bones = rig.pose.bones
    rest = {bone.name: bone.bone.matrix_local.to_quaternion() for bone in pose_bones}
    # Rig bones point along their local Y axes.
    bone_axis = Vector((0, 1, 0))
    unit = Vector((1, 1, 1))

    def steer_bone(name, start, end, rotation):
        turned = rotation @ rest[name]
        correction = (turned @ bone_axis).rotation_difference((end - start).normalized())
        pose_bones[name].matrix = Matrix.LocRotScale(start, correction @ turned, unit)
        bpy.context.view_layer.update()

    def solve_limb(upper, lower, end, target, pole, yaw):
        start = pose_bones[upper].head.copy()
        direction = target - start
        distance = direction.length
        direction.normalize()
        a, b = pose_bones[upper].bone.length, pose_bones[lower].bone.length
        distance = max(abs(a-b) + .01, min(distance, (a+b)*.993))
        target = start + direction * distance
        projection = (a*a + distance*distance - b*b)/(2*distance)
        pole -= direction * pole.dot(direction)
        pole.normalize()
        joint = start + direction * projection + pole * math.sqrt(max(0, a*a - projection*projection))
        steer_bone(upper, start, joint, yaw)
        steer_bone(lower, joint, target, yaw)
        if end.startswith("foot"):
            orientation = yaw @ rest[end]
        else:
            orientation = pose_bones[lower].matrix.to_quaternion() @ rest[lower].inverted() @ rest[end]
        pose_bones[end].matrix = Matrix.LocRotScale(target, orientation, unit)
        bpy.context.view_layer.update()

    def set_pose(marks):
        hips, heading, lean, hand_l, hand_r, foot_l, foot_r = marks
        for bone in pose_bones:
            bone.rotation_mode = "QUATERNION"
            bone.rotation_quaternion = Quaternion()
            bone.location = (0, 0, 0)
            bone.scale = unit
        yaw = Quaternion((0, 0, 1), math.radians(heading))
        pose_bones["pelvis"].matrix = Matrix.LocRotScale(actor_point(hips), yaw @ rest["pelvis"], unit)
        spine = rest["spine_01"]
        pose_bones["spine_01"].rotation_quaternion = spine.inverted() @ Quaternion((1, 0, 0), lean) @ spine
        bpy.context.view_layer.update()
        for side, sign in SIDES:
            left = sign > 0
            solve_limb(f"thigh_{side}", f"calf_{side}", f"foot_{side}",
                       actor_point(foot_l if left else foot_r), yaw @ Vector((sign*.22, -1, .02)), yaw)
            solve_limb(f"upperarm_{side}", f"lowerarm_{side}", f"hand_{side}",
                       actor_point(hand_l if left else hand_r), yaw @ Vector((sign*.68, .31, -.70)), yaw)
            for finger in ("index", "middle", "ring", "pinky"):
                for segment, angle in (("02", .39), ("03", .24)):
                    pose_bones[f"{finger}_{segment}_{side}"].rotation_quaternion = Quaternion((1, 0, 0), angle)

    def lerp_mark(a, b, alpha):
        if isinstance(a, tuple):
            return tuple(x + (y-x)*alpha for x, y in zip(a, b))
        return a + (b-a)*alpha

    def entry_pose(frame):
        for before, after in zip(ENTRY_MARKS, ENTRY_MARKS[1:]):
            if frame <= after[0]:
                alpha = (frame-before[0])/(after[0]-before[0])
                # Keep movement in motion across the marks and ease both ends.
                if before[0] == 0:
                    alpha *= 2*alpha - alpha*alpha
                if after[0] == 48:
                    alpha = alpha + alpha*alpha*(1-alpha)
                return [lerp_mark(a,b,alpha) for a,b in zip(before[1:],after[1:])]
        return ENTRY_MARKS[-1][1:]

    def wheel_pose(frame):
        hips, heading, lean, _, _, foot_l, foot_r = ENTRY_MARKS[-1][1:]
        roll = ((frame / 24) * 2 - 1) * .693
        return (hips, heading, lean, wheel_grip(roll,1), wheel_grip(roll,-1), foot_l, foot_r)

    for name, length, pose_at in (("Board", 48, entry_pose), ("Steer", 24, wheel_pose)):
        action = bpy.data.actions.new(name)
        rig.animation_data.action = action
        for frame in range(length + 1):
            scene.frame_set(frame)
            set_pose(pose_at(frame))
            for bone in pose_bones:
                bone.keyframe_insert(data_path="rotation_quaternion", frame=frame, group=bone.name)
                bone.keyframe_insert(data_path="location", frame=frame, group=bone.name)
        track = rig.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 0, action)
        rig.animation_data.action = None
    scene.frame_set(0)


def build(asset_path, output, female=False, driver=False):
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
    state.update(gender=0.0 if female else 1.0, age=0.41 if female else 0.65 if driver else 0.48)
    body = humans.create_human(macro_detail_dict=state)
    skin_name = "young_caucasian_female.mhmat" if female else "young_african_male.mhmat"
    skin = assets.find_asset_absolute_path(skin_name, asset_subdir="skins")
    if not skin:
        raise RuntimeError(f"Missing skin {skin_name}")
    humans.set_character_skin(skin, body, skin_type="GAMEENGINE")
    humans.add_builtin_rig(body, "game_engine")
    outfit = "female_elegantsuit01.mhclo" if female else "toigo_male_double-breasted_suit.mhclo"
    if driver:
        outfit = "toigo_male_suit_tie_and_jacket.mhclo"
    pieces = [
        ("eyes", "low-poly.mhclo", "Eyes"),
        ("eyebrows", "eyebrow001.mhclo", "Eyebrows"),
        ("eyelashes", "eyelashes01.mhclo", "Eyelashes"),
        ("hair", "short01.mhclo", "Hair"),
        ("clothes", "shoes01.mhclo", "Clothes"),
        ("clothes", outfit, "Clothes"),
    ]
    if not female:
        pieces.append(("clothes", "fedora_cocked.mhclo" if driver else "fedora01.mhclo", "Clothes"))
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
    if driver:
        bake_driver(rig)

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
    asset_root, out_dir = (Path(value).resolve() for value in arguments[:2])
    out_dir.mkdir(parents=True, exist_ok=True)
    if "--driver-only" not in arguments:
        build(asset_root, out_dir / "bank-clerk.glb")
        build(asset_root, out_dir / "shopkeeper.glb", female=True)
    build(asset_root, out_dir / "detective.glb", driver=True)
