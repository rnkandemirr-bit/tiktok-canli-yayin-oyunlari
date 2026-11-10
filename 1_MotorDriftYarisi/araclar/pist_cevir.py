# Track.blend -> Godot icin pist.glb (modifiyerler uygulanir, gorunmez carpisma/sis parcalari atilir,
# EXR normal haritasi PNG'ye cevrilir, buyuk dokular 2048'e indirilir)
import bpy, sys, os
out = sys.argv[sys.argv.index('--') + 1]
for o in list(bpy.context.scene.objects):
    if o.type != 'MESH' or o.name.startswith(('Collidior', 'Volume')):
        bpy.data.objects.remove(o, do_unlink=True)
eksik = []
for im in bpy.data.images:
    if im.source != 'FILE':
        continue
    yol = bpy.path.abspath(im.filepath)
    if not os.path.exists(yol):
        # klasor adi buyuk/kucuk harf veya 'Textures' farki
        alt = os.path.join(os.path.dirname(bpy.data.filepath), 'Textures', os.path.basename(yol))
        if os.path.exists(alt):
            im.filepath = alt
        else:
            eksik.append(im.name)
            continue
    try:
        im.reload()
        if im.size[0] == 0:
            eksik.append(im.name); continue
        if im.file_format == 'OPEN_EXR' or yol.lower().endswith('.exr'):
            im.file_format = 'PNG'
        lim = 2048 if any(k in im.name.lower() for k in ('asphalt', 'road', 'grass', 'kerb')) else 1024
        if max(im.size) > lim:
            k = lim / max(im.size)
            im.scale(int(im.size[0] * k), int(im.size[1] * k))
        im.pack()
    except Exception as e:
        eksik.append(im.name + ' ' + str(e))
print('## eksik doku', eksik)
print('## nesne', len(bpy.context.scene.objects))
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_yup=True,
                          export_image_format='AUTO', export_lights=False, export_cameras=False)
print('## bitti', os.path.getsize(out) // 1048576, 'MB')
