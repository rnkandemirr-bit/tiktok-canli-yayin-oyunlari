# motor + surucu (sele ofsetli) yandan render: args motor.glb surucu.glb ileri yukari out.png
import bpy, sys, math
a = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=a[0])
once = set(bpy.context.scene.objects)
bpy.ops.import_scene.gltf(filepath=a[1])
for o in set(bpy.context.scene.objects) - once:
    if o.parent is None:
        o.location.y += float(a[2]); o.location.z += float(a[3])
cam = bpy.data.objects.new('kam', bpy.data.cameras.new('kam')); bpy.context.scene.collection.objects.link(cam)
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.6
cam.location = (5, 0, 0.8); cam.rotation_euler = (math.radians(90), 0, math.radians(90))
sc = bpy.context.scene; sc.camera = cam; sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.color_type = 'MATERIAL'
sc.render.resolution_x = sc.render.resolution_y = 360; sc.render.filepath = a[4]
bpy.ops.render.render(write_still=True)
