"""Build the Magic City street characters with Blender and MPFB 2.0.18.

Run Blender with this script, then -- ASSET_PACK_DIRECTORY OUTPUT_DIRECTORY [--driver-only | --counters-only].
The MPFB extension must be installed in Blender's user_default repository.
"""
import importlib
import math
import sys
from pathlib import Path

import addon_utils
import bpy
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree

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


def felt_hat(rig, body, flat=False):
    """Fit a felt cloche to the baked scalp and bind it to the head bone."""
    neck = rig.data.bones["head"].head_local.z
    scalp = [v.co for v in body.data.vertices if v.co.z > neck + 0.05]
    top = max(p.z for p in scalp)
    center = (max(p.y for p in scalp) + min(p.y for p in scalp)) * 0.5
    width = max(abs(p.x) for p in scalp) + 0.018
    depth = (max(p.y for p in scalp) - min(p.y for p in scalp)) * 0.5 + 0.020
    rings = [(1.22,-.048),(1.25,-.043),(1.14,-.034),(1.10,-.023),
             (1.08,.002),(.94,.029),(.68,.048),(.32,.056),(.01,.060)]
    if flat:
        rings = [(1.24,-.046),(1.30,-.038),(1.17,-.031),(1.14,-.016),
                 (1.06,.010),(.85,.027),(.48,.035),(.01,.036)]
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
    mesh = bpy.data.meshes.new("Wool newsboy cap" if flat else "Felt cloche")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    hat = bpy.data.objects.new(mesh.name, mesh)
    bpy.context.collection.objects.link(hat)
    material = bpy.data.materials.new("Garnet felt")
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (.12,.078,.053,1) if flat else (0.15,0.031,0.034,1)
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


def limb_solver(rig):
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

    return rest, solve_limb


def bake_driver(rig):
    scene = bpy.context.scene
    pose_bones = rig.pose.bones
    unit = Vector((1, 1, 1))
    rest, solve_limb = limb_solver(rig)

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



def cloth(name, color, roughness=.86, metallic=0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return material


def rigid_accessory(rig, obj, bone_name):
    obj.parent = rig
    bone = obj.vertex_groups.new(name=bone_name)
    bone.add(list(range(len(obj.data.vertices))), 1, "REPLACE")
    obj.modifiers.new("Armature", "ARMATURE").object = rig


def counter_apron(rig, garment, lunch):
    # Measure the fitted outfit so the apron follows the shirt instead of
    # sharing a fixed shape across the two figures.
    vertices = [v.co.copy() for v in garment.data.vertices]
    surface = BVHTree.FromPolygons(vertices, [list(face.vertices) for face in garment.data.polygons])
    hips = rig.data.bones["pelvis"].head_local.z
    chest = rig.data.bones["spine_03"].head_local.z + .034 if lunch else hips + .108
    hem = hips - .34
    points, faces, weights = [], [], []
    columns, rows = 16, 26

    def front(x,z):
        hit, _, _, _ = surface.ray_cast(Vector((x,-.65,z)),Vector((0,1,0)),.75)
        return hit.y if hit is not None else -.145

    for row in range(rows+1):
        t = row/rows
        z = hem + (chest-hem)*t
        bib = min(1,max(0,(t-.56)/.34)) if lunch else 0
        width = (.204 - .038*t - .046*bib) * (1 if lunch else .96)
        for column in range(columns+1):
            u = 2*column/columns-1
            x = width*u
            fall = .031 + .046*(1-t)*(1-u*u) + .011*math.cos(u*13.5)*math.sin(math.pi*t)
            points.append((x,front(x,z)-fall,z))
            w_chest = max(0,min(1,(t-.55)/.3)) if lunch else 0
            w_waist = max(0,1-abs(t-.50)/.27)*(1-w_chest)
            weights.append((1-w_chest-w_waist,w_waist,w_chest))
            if row and column:
                a = (row-1)*(columns+1)+column-1
                faces.append((a,a+1,a+columns+2,a+columns+1))

    # Sewn shoulder straps and a front ticket pocket stand proud of the bib.
    if lunch:
        for x in [-.105,.105]:
            a = len(points)
            for z in [chest-.014,chest+.117]:
                points.extend([(x-.022,front(x-.022,z)-.049,z),(x+.022,front(x+.022,z)-.049,z)])
            faces.append((a,a+1,a+3,a+2))
            weights.extend([(0,0,1)]*4)
    pocket = len(points)
    for z in [hips-.112,hips+.010]:
        for x in [-.12,.08]:
            points.append((x,front(x,z)-.075,z))
    faces.append((pocket,pocket+1,pocket+3,pocket+2))
    weights.extend([(.22,.78,0)]*4)
    mesh = bpy.data.meshes.new("Counter apron")
    mesh.from_pydata(points,[],faces)
    mesh.update()
    apron = bpy.data.objects.new("Counter apron",mesh)
    bpy.context.collection.objects.link(apron)
    apron.parent = rig
    apron.modifiers.new("Armature","ARMATURE").object = rig
    for slot, name in enumerate(("pelvis","spine_01","spine_03")):
        group = apron.vertex_groups.new(name=name)
        for i, weight in enumerate(weights):
            if weight[slot] > 0:
                group.add([i],weight[slot],"REPLACE")
    main = (.357,.114,.085) if lunch else (.82,.77,.62)
    seam = (.51,.22,.161) if lunch else (.63,.56,.43)
    mesh.materials.append(cloth("Cotton apron",main))
    mesh.materials.append(cloth("Apron tapes and sewing",seam))
    for i, face in enumerate(mesh.polygons):
        if i >= columns*rows or i%columns in (0,columns-1) or (lunch and i%columns in (4,11)):
            face.material_index = 1


def spectacles(rig, eyes):
    vertices = [vertex.co for vertex in eyes.data.vertices]
    y = min(p.y for p in vertices) - .005
    z = (max(p.z for p in vertices)+min(p.z for p in vertices)) * .5
    width = max(abs(p.x) for p in vertices) * .69
    pieces = []
    for sign in (-1,1):
        bpy.ops.mesh.primitive_torus_add(major_segments=28,minor_segments=8,
                                        location=(sign*width,y,z),rotation=(math.pi/2,0,0),
                                        major_radius=.025,minor_radius=.0018)
        pieces.append(bpy.context.object)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,y+.001,z+.008))
    bridge = bpy.context.object
    bridge.scale = (.018,.005,.0035)
    pieces.append(bridge)
    bpy.ops.object.select_all(action="DESELECT")
    for part in pieces:
        part.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    bpy.ops.object.join()
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    frame = bpy.context.object
    frame.name = "Round nickel spectacles"
    frame.data.materials.append(cloth("Polished nickel",(.36,.28,.19),.29,.72))
    rigid_accessory(rig,frame,"head")


COUNTER_SCALE = .97
SERVE_MARKS = [
    # frame, body lean, hand placement; drink held from pickup to release
    (0, .04, (-.26,.96,.24)),
    (15,.17, (-.37,1.125,.40)),
    (23,.20, (-.333,1.23,.60)),
    (34,.21, (-.333,1.23,.60)),
    (41,.22, (-.333,1.23,.60)),
    (53,.34, (-.18,1.125,.744)),
    (60,.08, (-.26,1.00,.40)),
    (68,.04, (-.26,.96,.24)),
]


def bake_counter(rig):
    pose = rig.pose.bones
    rest, solve = limb_solver(rig)
    neutral = Quaternion()
    scene = bpy.context.scene

    def point(mark):
        x,y,z = mark
        return Vector((x,-z,y))/COUNTER_SCALE

    def blend_mark(frame):
        for a,b in zip(SERVE_MARKS,SERVE_MARKS[1:]):
            if frame <= b[0]:
                t = (frame-a[0])/(b[0]-a[0])
                t = t*t*(3-2*t)
                return a[1]+(b[1]-a[1])*t,tuple(x+(y-x)*t for x,y in zip(a[2],b[2]))
        return SERVE_MARKS[-1][1:]

    for name,length in (("Greet",34),("Speak",56),("Serve",68)):
        action = bpy.data.actions.new(name)
        rig.animation_data.action = action
        for frame in range(length+1):
            scene.frame_set(frame)
            t = frame/length
            beat = math.sin(math.pi*t)**2
            for bone in pose:
                bone.rotation_mode = "QUATERNION"
                bone.rotation_quaternion = Quaternion()
                bone.location = (0,0,0)
                bone.scale = (1,1,1)
            if name == "Serve":
                lean, hand = blend_mark(frame)
            elif name == "Speak":
                lean = .04+.10*beat
                hand = (-.23-.10*beat,.96+.22*beat,.24+.17*beat)
            else:
                lean = .04+.07*beat
                hand = (-.26,.96+.217*beat,.24+.21*beat)
            hips = pose["pelvis"].bone.matrix_local.copy()
            hips.translation.y -= .10 * min(1,lean/.32)
            hips.translation.z -= .033 * min(1,lean/.32)
            pose["pelvis"].matrix = hips
            spine = rest["spine_01"]
            pose["spine_01"].rotation_quaternion = spine.inverted() @ Quaternion((1,0,0),lean) @ spine
            head = rest["head"]
            nod = .16*math.sin(2*math.pi*t)*beat if name == "Greet" else .065*math.sin(t*math.tau)*beat
            pose["head"].rotation_quaternion = head.inverted() @ Quaternion((1,0,0),nod-lean*.33) @ head
            bpy.context.view_layer.update()
            for side,sign in SIDES:
                foot = pose[f"foot_{side}"].bone.head_local.copy()
                foot.y -= .03 * sign
                solve(f"thigh_{side}",f"calf_{side}",f"foot_{side}",foot,Vector((sign*.11,-1,.03)),neutral)
                target = (.26,1.00,.26+beat*.075) if sign>0 else hand
                solve(f"upperarm_{side}",f"lowerarm_{side}",f"hand_{side}",point(target),Vector((sign*.6,.34,-.65)),neutral)
                for finger in ("index","middle","ring","pinky"):
                    for segment in ("02","03"):
                        curl = .52 if name == "Serve" and sign<0 and 15 <= frame <= 53 else .18
                        pose[f"{finger}_{segment}_{side}"].rotation_quaternion = Quaternion((1,0,0),curl)
            for bone in pose:
                bone.keyframe_insert(data_path="rotation_quaternion",frame=frame,group=bone.name)
                bone.keyframe_insert(data_path="location",frame=frame,group=bone.name)
        track = rig.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name,0,action)
        rig.animation_data.action = None
    scene.frame_set(0)


def add_counter_face(body, female):
    """Keep lip shapes and eyelids on the fitted head as exportable morph targets."""
    targets = service("targetservice", "TargetService")
    faces = service("faceservice", "FaceService")
    root = Path(importlib.import_module(MODULE).__file__).parent / "data/targets/expression/units"
    units = root / ("caucasian" if female else "african")
    for name, unit in {
        "eyeBlinkLeft": "eye-left-closure",
        "eyeBlinkRight": "eye-right-closure",
        "jawOpen": "mouth-open",
        "mouthClose": "mouth-compression",
        "mouthPucker": "mouth-pursing",
        "mouthStretchLeft": "mouth-part-later",
        "mouthSmileLeft": "mouth-corner-puller",
        "browOuterUpLeft": "eyebrows-left-extern-up",
        "browOuterUpRight": "eyebrows-right-extern-up",
    }.items():
        targets.load_target(body, units / (unit + ".target.gz"), name=name)
    # Transfer the eyelid and brow shape changes to the lash and brow cards.
    faces.interpolate_targets(body)


def build(asset_path, output, female=False, driver=False, staff=None, worker=False):
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
    if staff:
        state.update(age=.57 if female else .67)
    if worker:
        state.update(age=.36,muscle=.69)
    body = humans.create_human(macro_detail_dict=state)
    skin_name = "young_caucasian_female.mhmat" if female else "young_african_male.mhmat"
    if staff:
        skin_name = "middleage_caucasian_female.mhmat" if female else "middleage_african_male.mhmat"
    if worker:
        skin_name = "young_caucasian_male2.mhmat"
    skin = assets.find_asset_absolute_path(skin_name, asset_subdir="skins")
    if not skin:
        raise RuntimeError(f"Missing skin {skin_name}")
    humans.set_character_skin(skin, body, skin_type="GAMEENGINE")
    humans.add_builtin_rig(body, "game_engine")
    outfit = "female_elegantsuit01.mhclo" if female else "toigo_male_double-breasted_suit.mhclo"
    if driver or staff == "chemist":
        outfit = "toigo_male_suit_tie_and_jacket.mhclo"
    if staff == "lunch":
        outfit = "toigo_female_suit.mhclo"
    if worker:
        outfit = "male_worksuit01.mhclo"
    pieces = [
        ("eyes", "low-poly.mhclo", "Eyes"),
        ("eyebrows", "eyebrow001.mhclo", "Eyebrows"),
        ("eyelashes", "eyelashes01.mhclo", "Eyelashes"),
        ("hair", "short01.mhclo", "Hair"),
        ("clothes", "shoes01.mhclo", "Clothes"),
        ("clothes", outfit, "Clothes"),
    ]
    if not female and not staff and not worker:
        pieces.append(("clothes", "fedora_cocked.mhclo" if driver else "fedora01.mhclo", "Clothes"))
    for directory, filename, kind in pieces:
        attach_asset(humans, assets, body, directory, filename, kind)

    bpy.context.view_layer.update()
    rig = exports.create_character_copy(body, name_suffix="_street")
    export_body = objects.find_object_of_type_amongst_nearest_relatives(rig, "Basemesh")
    if staff:
        bpy.context.view_layer.objects.active = export_body
        # The expression targets use the original vertex IDs.
        if export_body.data.shape_keys:
            bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
        add_counter_face(export_body, female)
    exports.bake_modifiers_remove_helpers(
        export_body, bake_masks=True, bake_subdiv=False, remove_helpers=True, also_proxy=True
    )
    if not staff and export_body.data.shape_keys:
        bpy.context.view_layer.objects.active = export_body
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    if (female and not staff) or worker:
        felt_hat(rig, export_body, flat=worker)
    if staff:
        wardrobe = objects.get_list_of_children(rig)
        garment = next(obj for obj in wardrobe if outfit.removesuffix(".mhclo") in obj.name)
        counter_apron(rig,garment,staff == "lunch")
        if staff == "chemist":
            eyes = next(obj for obj in wardrobe if "low-poly" in obj.name)
            spectacles(rig,eyes)
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
    if staff:
        bake_counter(rig)

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
    if "--counters-only" not in arguments:
        if "--driver-only" not in arguments:
            build(asset_root, out_dir / "bank-clerk.glb")
            build(asset_root, out_dir / "shopkeeper.glb", female=True)
        build(asset_root, out_dir / "detective.glb", driver=True)
    if "--driver-only" not in arguments:
        build(asset_root, out_dir / "pharmacist.glb", staff="chemist")
        build(asset_root, out_dir / "crown-proprietor.glb", female=True, staff="lunch")
        build(asset_root, out_dir / "street-worker.glb", worker=True)
