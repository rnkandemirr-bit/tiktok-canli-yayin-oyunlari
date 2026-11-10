import bpy, sys, math
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=a[0])
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
bpy.context.view_layer.update()
hb = next(b for b in arm.pose.bones if b.name in ('Head', 'mixamorig:Head'))
h = arm.matrix_world @ hb.head
t = arm.matrix_world @ hb.tail
merkez = h + (t - h) * 0.5 if (t - h).length < 0.5 else h + Vector((0, 0, 0.08))
# karakterin baktigi yon: ayak -> ayak ucu
fb = next((b for b in arm.pose.bones if b.name in ('LeftFoot', 'mixamorig:LeftFoot')), None)
tb = next((b for b in arm.pose.bones if b.name in ('LeftToes', 'mixamorig:LeftToeBase')), None)
ileri = Vector((0, -1, 0))
if fb and tb:
    v = (arm.matrix_world @ tb.head) - (arm.matrix_world @ fb.head); v.z = 0
    if v.length > 1e-4: ileri = v.normalized()
boy = max((o.matrix_world @ Vector(c)).z for o in bpy.context.scene.objects if o.type == 'MESH' for c in o.bound_box) - min((o.matrix_world @ Vector(c)).z for o in bpy.context.scene.objects if o.type == 'MESH' for c in o.bound_box)
hb_len = (t - h).length
kb = next(b for b in arm.pose.bones if b.name in ('Hips', 'mixamorig:Hips'))
olcu = ((arm.matrix_world @ kb.head) - h).length * 0.62
merkez = h + Vector((0, 0, olcu * 0.12))
cam = bpy.data.objects.new('kam', bpy.data.cameras.new('kam')); bpy.context.scene.collection.objects.link(cam)
cam.data.type = 'ORTHO'; cam.data.ortho_scale = olcu
cam.location = merkez + ileri * 5 + Vector((0, 0, -olcu * 0.08))
d = (merkez - cam.location); cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
cam.data.clip_end = 100
sc = bpy.context.scene; sc.camera = cam
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
sc.display.shading.show_shadows = False
sc.world = bpy.data.worlds.new('w'); sc.render.film_transparent = False
sc.display.shading.background_type = 'VIEWPORT'; sc.display.shading.background_color = (float(a[2]), float(a[3]), float(a[4]))
sc.render.resolution_x = sc.render.resolution_y = 200
sc.render.filepath = a[1]
bpy.ops.render.render(write_still=True)
