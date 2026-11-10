# Motor modelini Godot icin hazirlar: yon (on = Blender +Y), boy, zemine oturtma, sadelestirme,
# Unity malzemelerini baglama, doku kucultme -> GLB + yandan onizleme PNG
# kullanim: blender -b -P motor_cevir.py -- <kaynak> <cikti.glb> <onizleme.png> <boy_m> <ters:0|1> <malzemeler.json> <hedef_poly>
import bpy, sys, os, json, math, re
from mathutils import Vector, Matrix

a = sys.argv[sys.argv.index('--') + 1:]
src, out_glb, out_png, boy, ters, matjson, hedef_poly = a[0], a[1], a[2], float(a[3]), a[4] == '1', a[5], int(a[6])
bpy.ops.wm.read_factory_settings(use_empty=True)
if src.lower().endswith('.fbx'):
    bpy.ops.import_scene.fbx(filepath=src)
else:
    bpy.ops.import_scene.gltf(filepath=src)

# kamera/isik vb. sil
for o in list(bpy.context.scene.objects):
    if o.type in ('CAMERA', 'LIGHT'):
        bpy.data.objects.remove(o, do_unlink=True)

def meshler():
    return [o for o in bpy.context.scene.objects if o.type == 'MESH']

def kutu(obs):
    # bound_box veri degisince hemen guncellenmiyor: kose noktalarindan hesapla
    vs = [o.matrix_world @ v.co for o in obs for v in o.data.vertices]
    mn = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    mx = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    return mn, mx

# yardimci kup vb. (cok az yuzlu) parcalari at
for o in meshler():
    if len(o.data.polygons) <= 12:
        bpy.data.objects.remove(o, do_unlink=True)
# hepsini tek nesnede birlestir (donusumler uygulanir)
obs = meshler()
bpy.ops.object.select_all(action='DESELECT')
for o in obs:
    o.select_set(True)
bpy.context.view_layer.objects.active = obs[0]
# ebeveynlerden kurtar
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if len(obs) > 1:
    bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active
for o in list(bpy.context.scene.objects):
    if o != ob:
        bpy.data.objects.remove(o, do_unlink=True)

# zemin/golge plakasi gibi buyuk duz parcalari at (ayri parcalar olarak)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='DESELECT')
bpy.ops.object.mode_set(mode='OBJECT')

# en uzun yatay ekseni Y'ye cevir
mn, mx = kutu([ob])
sz = mx - mn
# motor: en buyuk olcu = boy (Y), en kucuk = genislik (X), ortanca = yukseklik (Z)
if sz.z >= sz.x and sz.z >= sz.y:      # dik duruyor -> yatir
    ob.data.transform(Matrix.Rotation(math.radians(90), 4, 'X'))
mn, mx = kutu([ob]); sz = mx - mn
if sz.x > sz.y:
    ob.data.transform(Matrix.Rotation(math.radians(90), 4, 'Z'))
mn, mx = kutu([ob]); sz = mx - mn
if sz.x > sz.z:                         # yan yatmis -> dogrult
    ob.data.transform(Matrix.Rotation(math.radians(-90), 4, 'Y'))
if os.environ.get('BAS_ASAGI') == '1':
    ob.data.transform(Matrix.Rotation(math.radians(180), 4, 'Y'))
if ters:
    ob.data.transform(Matrix.Rotation(math.radians(180), 4, 'Z'))
mn, mx = kutu([ob]); sz = mx - mn
olcek = boy / sz.y
ob.data.transform(Matrix.Scale(olcek, 4))
mn, mx = kutu([ob])
ob.data.transform(Matrix.Translation(Vector((-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z))))
ob.data.update()

# Unity malzemeleri (FBX)
if src.lower().endswith('.fbx') and os.path.exists(matjson):
    M = json.load(open(matjson))
    sade = lambda s: re.sub(r'[^a-z0-9]', '', s.lower())
    eslem = {sade(k): v for k, v in M.items()}
    for slot in ob.material_slots:
        mat = slot.material
        if not mat:
            continue
        b = eslem.get(sade(mat.name)) or eslem.get(sade(re.sub(r'\.\d+$', '', mat.name)))
        if not b:
            print('## eslesmeyen malzeme', mat.name)
            continue
        mat.use_nodes = True
        nt = mat.node_tree
        bs = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bs is None:
            bs = nt.nodes.new('ShaderNodeBsdfPrincipled')
            outn = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
            nt.links.new(bs.outputs[0], outn.inputs[0])
        for l in list(bs.inputs['Base Color'].links):
            nt.links.remove(l)
        c = b.get('color') or [1, 1, 1, 1]
        bs.inputs['Base Color'].default_value = (c[0], c[1], c[2], 1)
        tex = b.get('tex', {})
        ana = tex.get('_BaseMap') or tex.get('_MainTex')
        if ana and os.path.exists(ana):
            im = nt.nodes.new('ShaderNodeTexImage')
            im.image = bpy.data.images.load(ana, check_existing=True)
            if c[:3] != [1, 1, 1] and c[:3] != [1.0, 1.0, 1.0]:
                mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
                mix.inputs['Factor'].default_value = 1.0
                nt.links.new(im.outputs['Color'], mix.inputs[6])
                mix.inputs[7].default_value = (c[0], c[1], c[2], 1)
                nt.links.new(mix.outputs[2], bs.inputs['Base Color'])
            else:
                nt.links.new(im.outputs['Color'], bs.inputs['Base Color'])
        nrm = tex.get('_BumpMap')
        if nrm and os.path.exists(nrm):
            im = nt.nodes.new('ShaderNodeTexImage')
            im.image = bpy.data.images.load(nrm, check_existing=True)
            im.image.colorspace_settings.name = 'Non-Color'
            nm = nt.nodes.new('ShaderNodeNormalMap')
            nt.links.new(im.outputs['Color'], nm.inputs['Color'])
            nt.links.new(nm.outputs['Normal'], bs.inputs['Normal'])
        met = b.get('metal'); sm = b.get('smooth')
        bs.inputs['Metallic'].default_value = min(0.85, (met or 0.0) * 0.75)
        bs.inputs['Roughness'].default_value = max(0.12, 1.0 - (sm if sm is not None else 0.5) * 0.85)
        if b.get('mode') == 3 or b.get('surface') == 1:
            bs.inputs['Alpha'].default_value = max(0.25, c[3])
            try:
                mat.surface_render_method = 'BLENDED'
            except Exception:
                pass

# sadelestir
poly = len(ob.data.polygons)
if poly > hedef_poly:
    md = ob.modifiers.new('sade', 'DECIMATE')
    md.ratio = hedef_poly / poly
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier='sade')

# dokulari kucult (en fazla 1024)
for im in bpy.data.images:
    if im.size[0] > 1024 or im.size[1] > 1024:
        k = 1024 / max(im.size[0], im.size[1])
        im.scale(max(1, int(im.size[0] * k)), max(1, int(im.size[1] * k)))
        im.pack()
ob.name = os.path.splitext(os.path.basename(out_glb))[0]
mn, mx = kutu([ob])
print('## SONUC', os.path.basename(out_glb), 'poly', len(ob.data.polygons), 'boyut', tuple(round(v, 2) for v in (mx - mn)))

# ---------------- tekerleri bul ve ayir (on = +Y)
import bmesh
me = ob.data
V = [v.co.copy() for v in me.vertices]
yer = [v for v in V if v.z < 0.035 and abs(v.x) < 0.2]
bilgi = {'tekerler': []}
if yer:
    ys = sorted(v.y for v in yer)
    # iki kume: en buyuk bosluktan bol
    bosluk = max(range(1, len(ys)), key=lambda i: ys[i] - ys[i - 1]) if len(ys) > 1 else 0
    kumeler = [ys[:bosluk], ys[bosluk:]] if bosluk else [ys]
    for k in kumeler:
        if not k:
            continue
        yc = (k[0] + k[-1]) / 2
        # yaricap: lastik dis yuzeyine en cok nokta dusen deger
        en_iyi, en_r = -1, 0.3
        for i in range(0, 41):
            r = 0.18 + i * 0.005
            say = sum(1 for v in V if abs(v.x) < 0.15 and abs(math.hypot(v.y - yc, v.z - r) - r) < 0.008)
            if say > en_iyi:
                en_iyi, en_r = say, r
        bilgi['tekerler'].append((yc, en_r))
    bpy.context.view_layer.objects.active = ob
    for yc, r in bilgi['tekerler']:
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.mode_set(mode='EDIT')
        bm = bmesh.from_edit_mesh(ob.data)
        n = 0
        for f in bm.faces:
            ic = all(abs(v.co.x) < 0.17 and math.hypot(v.co.y - yc, v.co.z - r) < r * 1.02 for v in f.verts)
            f.select = ic
            n += ic
        bmesh.update_edit_mesh(ob.data)
        if n > 20:
            bpy.ops.mesh.separate(type='SELECTED')
        bpy.ops.object.mode_set(mode='OBJECT')
        if n > 20:
            t = [o for o in bpy.context.selected_objects if o != ob][0]
            t.name = 'teker_%s_r%d' % ('on' if yc > 0 else 'arka', round(r * 1000))
            # merkez = aks
            t.data.transform(Matrix.Translation(Vector((0, -yc, -r))))
            t.location = (0, yc, r)
        print('## TEKER y=%.2f r=%.3f yuz=%d' % (yc, r, n))

# ---------------- sele: arka teker ile orta arasinda ust yuzeyin en alcak yeri
V = [v.co for v in ob.data.vertices]
arka_y = min((t[0] for t in bilgi['tekerler']), default=-0.7)
en_alt = None
y = arka_y + 0.12
while y < 0.15:
    ust = [v.z for v in V if abs(v.x) < 0.1 and abs(v.y - y) < 0.03]
    if ust:
        z = max(ust)
        if en_alt is None or z < en_alt[1]:
            en_alt = (y, z)
    y += 0.04
if en_alt:
    print('## SELE %.3f %.3f' % en_alt)

# ---------------- Kawasaki: kaporta yesil, alt ve mekanik siyah
if os.environ.get('BOYA') == 'kawasaki':
    def malz(ad, renk, met, rough):
        m = bpy.data.materials.new(ad); m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = renk
        b.inputs['Metallic'].default_value = met
        b.inputs['Roughness'].default_value = rough
        try: b.inputs['Coat Weight'].default_value = 0.8
        except Exception: pass
        return m
    yesil = malz('kawasaki_yesil', (0.12, 0.55, 0.05, 1), 0.35, 0.25)
    siyah = malz('kawasaki_siyah', (0.025, 0.025, 0.028, 1), 0.2, 0.45)
    metal = malz('kawasaki_metal', (0.35, 0.35, 0.37, 1), 0.85, 0.3)
    for o in meshler():
        o.data.materials.clear()
        if o.name.startswith('teker'):
            o.data.materials.append(siyah)
            o.data.materials.append(metal)
            for p in o.data.polygons:   # jant ortasi metal, lastik siyah
                c = p.center
                p.material_index = 1 if math.hypot(c.y, c.z) < 0.6 * max(0.01, max(math.hypot(v.co.y, v.co.z) for v in o.data.vertices)) else 0
            continue
        o.data.materials.append(siyah); o.data.materials.append(yesil); o.data.materials.append(metal)
        me = o.data
        for p in me.polygons:
            c = p.center; nz = p.normal
            disarida = abs(nz.x) > 0.35 or nz.z > 0.55 or nz.y > 0.6
            if 0.42 < c.z < 1.25 and disarida and abs(c.x) > 0.03:
                p.material_index = 1
            elif c.z < 0.45 and abs(c.x) < 0.2:
                p.material_index = 2   # motor blok / egzoz
            else:
                p.material_index = 0

bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB', use_selection=False, export_apply=True,
                          export_image_format='JPEG', export_jpeg_quality=88, export_yup=True)

# yandan onizleme: on (+Y) resmin SAGINDA olmali
cam = bpy.data.objects.new('kam', bpy.data.cameras.new('kam'))
bpy.context.scene.collection.objects.link(cam)
cam.data.type = 'ORTHO'; cam.data.ortho_scale = boy * 1.25
cam.location = (6, 0, 0.6); cam.rotation_euler = (math.radians(90), 0, math.radians(90))
bpy.context.scene.camera = cam
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.color_type = 'TEXTURE'
sc.display.shading.light = 'STUDIO'
sc.render.resolution_x, sc.render.resolution_y = 420, 260
sc.render.filepath = out_png
bpy.ops.render.render(write_still=True)
