"""Bake the existing fitted suit assets into two static Walker window forms.

Run Blender in the repository root, then pass the destination GLB after --.
The photographed wool patterns in the GLBs belong to the existing CC0 suits.
"""
from array import array
import bmesh
import bpy
import math
import sys
from pathlib import Path


VARIANTS = (
    ("bank-clerk", "Navy serge", (.16,.24,.31)),
    ("detective", "Tobacco herringbone", (.38,.27,.18)),
)


def painted_wood():
    material = bpy.data.materials.new("Turned beech form")
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (.40,.244,.122,1)
    shader.inputs["Roughness"].default_value = .47
    return material


def retint_cloth(material, style, color):
    if not material or not material.use_nodes:
        return
    shader = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"),None)
    if shader is None or not shader.inputs["Base Color"].links:
        return
    image_node = shader.inputs["Base Color"].links[0].from_node
    if image_node.type != "TEX_IMAGE" or not image_node.image:
        return
    source = image_node.image
    w,h = source.size
    texels = array("f",[0])*(w*h*4)
    source.pixels.foreach_get(texels)
    for yy in range(h):
        for xx in range(w):
            pixel = (yy*w + xx)*4
            r,g,b = texels[pixel:pixel+3]
            luma = .21*r+.72*g+.07*b
            # Preserve light shirts and ties while dyeing the dark wool.
            blend = min(1,max(0,(.59-luma)/.25))
            if not blend:
                continue
            if style == "Navy serge":
                thread = .014*math.cos((xx+yy)*math.pi*.47)
            else:
                slant = xx + yy if (xx//8)%2 else xx - yy
                thread = .019*math.cos(slant*math.pi*.67)
            scale = .67 + luma * 1.57
            for c,base in enumerate(color):
                texels[pixel+c] = max(0,min(1,texels[pixel+c]*(1-blend) + (base*scale+thread)*blend))
    dyed = bpy.data.images.new(style+" weave",width=w,height=h,alpha=True)
    dyed.pixels.foreach_set(texels)
    dyed.pack()
    image_node.image = dyed
    shader.inputs["Roughness"].default_value = .83


def posed_mesh(obj, graph):
    snapshot = obj.evaluated_get(graph)
    mesh = bpy.data.meshes.new_from_object(snapshot,preserve_all_data_layers=True,depsgraph=graph)
    mesh.transform(snapshot.matrix_world)
    return mesh


def dress_form(repo, source, style, color, wood):
    old = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(repo/"data/art"/(source+".glb")))
    imported = set(bpy.data.objects)-old
    rig = next(obj for obj in imported if obj.type == "ARMATURE")
    if rig.animation_data:
        tracks = list(rig.animation_data.nla_tracks)
        idle = next((track for track in tracks if track.name.startswith("Idle")), None)
        if idle:
            rig.animation_data.action = None
            for track in tracks:
                track.mute = track is not idle
            bpy.context.scene.frame_set(round(idle.strips[0].frame_start+4))
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    neck = rig.matrix_world @ rig.pose.bones["head"].head
    root = bpy.data.objects.new(style,None)
    bpy.context.collection.objects.link(root)
    garments = [obj for obj in imported if obj.type == "MESH" and "toigo_male" in obj.name]
    shoes = [obj for obj in imported if obj.type == "MESH" and "shoes01" in obj.name]
    skin = next(obj for obj in imported if obj.type == "MESH" and obj.name.startswith("Human_street"))
    for garment in sorted(garments,key=lambda obj:obj.name):
        mesh = posed_mesh(garment,graph)
        for i,mat in enumerate(mesh.materials):
            if mat:
                mesh.materials[i] = mat.copy()
                retint_cloth(mesh.materials[i],style,color)
        obj = bpy.data.objects.new("Fitted wool suit",mesh)
        bpy.context.collection.objects.link(obj)
        obj.parent = root

    for shoe in shoes:
        obj = bpy.data.objects.new("Oxford shoes",posed_mesh(shoe,graph))
        bpy.context.collection.objects.link(obj)
        obj.parent = root

    parts = posed_mesh(skin,graph)
    bm = bmesh.new()
    bm.from_mesh(parts)
    level = neck.z-.035
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
                          dist=.0005,plane_co=(0,0,level),plane_no=(0,0,1),clear_outer=True)
    bm.to_mesh(parts)
    bm.free()
    parts.materials.clear()
    parts.materials.append(wood)
    obj = bpy.data.objects.new("Beech neck and hands",parts)
    bpy.context.collection.objects.link(obj)
    obj.parent = root

    bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,radius=1,location=(neck.x,neck.y,level-.012))
    cap = bpy.context.object
    cap.name = "Turned neck cap"
    cap.scale = (.083,.074,.039)
    cap.data.materials.append(wood)
    cap.parent = root
    for obj in imported:
        bpy.data.objects.remove(obj,do_unlink=True)
    return root


def main():
    repo = Path.cwd()
    output = Path(sys.argv[sys.argv.index("--")+1]).resolve()
    output.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    wood = painted_wood()
    for source,style,color in VARIANTS:
        dress_form(repo,source,style,color,wood)
    bpy.ops.export_scene.gltf(filepath=str(output),export_format="GLB",export_animations=False,
        export_skins=False,export_image_format="WEBP",export_image_quality=85,export_image_webp_fallback=False)


if __name__ == "__main__":
    main()
