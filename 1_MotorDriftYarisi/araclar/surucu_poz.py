# Karakteri motor surucusu pozuna sokar (IK ile), pozu sabitler, statik GLB olarak verir.
# Koordinat: motor cercevesi (on = +Y, zemin z=0, merkez x=0). Standart spor motor (boy 2.1 m).
# kullanim: blender -b -P surucu_poz.py -- <karakter.glb> <cikti.glb> <onizleme.png> [boy_m]
import bpy, sys, os, math
from mathutils import Vector, Matrix

a = sys.argv[sys.argv.index('--') + 1:]
src, out, png = a[0], a[1], a[2]
BOY = float(a[3]) if len(a) > 3 else 1.82

# motor uzerindeki temas noktalari
SELE = Vector((0, -0.58, 0.90))
GIDON = Vector((0.30, 0.28, 1.06))
PEDAL = Vector((0.21, -0.42, 0.44))
BAS = Vector((0, 0.20, 1.34))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']

ADLAR = {
    'hips': ['Hips', 'mixamorig:Hips', 'mixamorig_Hips'],
    'spine': ['Spine', 'mixamorig:Spine'],
    'neck': ['Neck', 'mixamorig:Neck'],
    'head': ['Head', 'mixamorig:Head'],
}
for yan, Y in (('L', 'Left'), ('R', 'Right')):
    ADLAR['upperarm' + yan] = [Y + 'UpperArm', 'mixamorig:' + Y + 'Arm', 'mixamorig_' + Y + 'Arm']
    ADLAR['forearm' + yan] = [Y + 'LowerArm', 'mixamorig:' + Y + 'ForeArm', 'mixamorig_' + Y + 'ForeArm']
    ADLAR['hand' + yan] = [Y + 'Hand', 'mixamorig:' + Y + 'Hand']
    ADLAR['thigh' + yan] = [Y + 'UpperLeg', 'mixamorig:' + Y + 'UpLeg', 'mixamorig_' + Y + 'UpLeg']
    ADLAR['shin' + yan] = [Y + 'LowerLeg', 'mixamorig:' + Y + 'Leg', 'mixamorig_' + Y + 'Leg']
    ADLAR['foot' + yan] = [Y + 'Foot', 'mixamorig:' + Y + 'Foot']
    ADLAR['toe' + yan] = [Y + 'Toes', 'mixamorig:' + Y + 'ToeBase', 'mixamorig_' + Y + 'ToeBase']

def kemik(k):
    for n in ADLAR[k]:
        if n in arm.pose.bones:
            return arm.pose.bones[n]
    return None

eksik = [k for k in ADLAR if kemik(k) is None and not k.startswith('toe')]
if eksik:
    print('## EKSIK KEMIK', eksik, [b.name for b in arm.data.bones][:20])
    sys.exit(1)

def dunya(pb, uc=False):
    return arm.matrix_world @ (pb.tail if uc else pb.head)

bpy.context.view_layer.update()
# 1) boyu olc ve olcekle
def deforme_z():
    dg = bpy.context.evaluated_depsgraph_get()
    zs = []
    for m in meshes:
        e = m.evaluated_get(dg); me = e.to_mesh()
        zs += [(e.matrix_world @ v.co).z for v in me.vertices]
        e.to_mesh_clear()
    return zs
zs = deforme_z()
bacak = (dunya(kemik('thighL')) - dunya(kemik('footL'))).length
olcek = 0.48 * BOY / bacak
print('## BOY ham', round(max(zs) - min(zs), 3), 'statik', round(max((m.matrix_world @ v.co).z for m in meshes for v in m.data.vertices) - min((m.matrix_world @ v.co).z for m in meshes for v in m.data.vertices), 3), 'bacak', round((dunya(kemik('thighL')) - dunya(kemik('footL'))).length, 3))
arm.scale = arm.scale * olcek
bpy.context.view_layer.update()
# 2) yuzu +Y'ye cevir: ayak -> ayak ucu yonu
ay = kemik('footL'); tu = kemik('toeL')
ileri = (dunya(tu) if tu else dunya(ay, True)) - dunya(ay)
ileri.z = 0
aci = math.atan2(ileri.x, ileri.y)          # +Y'den sapma
arm.rotation_mode = 'XYZ'
arm.rotation_euler.z += aci
bpy.context.view_layer.update()
# 3) kalcayi seleye tasi
h = dunya(kemik('hips'))
arm.location += SELE + Vector((0, 0, 0.06)) - h
bpy.context.view_layer.update()

def bos(ad, p):
    e = bpy.data.objects.new(ad, None)
    bpy.context.scene.collection.objects.link(e)
    e.location = p
    return e

def ik(pb, hedef, zincir, kutup=None, kutup_aci=0.0):
    c = pb.constraints.new('IK')
    c.target = hedef
    c.chain_count = zincir
    if kutup:
        c.pole_target = kutup
        c.pole_angle = math.radians(kutup_aci)
    return c

# gövde: kafayı öne-aşağı (yarış duruşu)
ik(kemik('neck'), bos('bas', BAS), 4)
bpy.context.view_layer.update()

def orta_eklem(H, P, L1, L2, bukum):
    """iki kemikli uzuv: H kok, P uc hedefi; diz/dirsek noktasi (bukum yonune dogru)"""
    d = (P - H).length
    d = min(max(d, abs(L1 - L2) + 0.01), (L1 + L2) * 0.995)
    u = (P - H).normalized()
    P2 = H + u * d
    a = (L1 * L1 - L2 * L2 + d * d) / (2 * d)
    h = math.sqrt(max(L1 * L1 - a * a, 0.0))
    w = bukum - u * bukum.dot(u)
    return H + u * a + w.normalized() * h, P2

def cevir(pb, cocuk, hedef_dunya):
    """pb kemigini dondur: kendi basi -> cocugun basi vektoru hedefe baksin (kemik eksenlerinden bagimsiz)"""
    bpy.context.view_layer.update()
    inv = arm.matrix_world.inverted()
    bas = pb.head.copy()
    v = cocuk.head - bas
    t = inv @ hedef_dunya - bas
    q = v.rotation_difference(t)
    pb.matrix = Matrix.Translation(bas) @ q.to_matrix().to_4x4() @ Matrix.Translation(-bas) @ pb.matrix
    bpy.context.view_layer.update()

def uzuv(a, b, c, uc_hedef, bukum):
    A, B, C = kemik(a), kemik(b), kemik(c)
    H = dunya(A); L1 = (dunya(B) - H).length; L2 = (dunya(C) - dunya(B)).length
    orta, uc = orta_eklem(H, uc_hedef, L1, L2, bukum)
    cevir(A, B, orta)
    cevir(B, C, uc)
    return orta

for yan, s in (('L', 1), ('R', -1)):
    # karakterin solu motorun solu (-X) olmali: yuzu +Y iken sol = -X
    g = GIDON.copy(); g.x = -s * GIDON.x
    p = PEDAL.copy(); p.x = -s * PEDAL.x
    # bacak: diz one-yukari ve hafif disa (depoyu sikar gibi); kol: dirsek disa-asagi
    diz = uzuv('thigh' + yan, 'shin' + yan, 'foot' + yan, p, Vector((-s * 0.3, 1.0, 0.35)))
    dirsek = uzuv('upperarm' + yan, 'forearm' + yan, 'hand' + yan, g, Vector((-s * 1.0, -0.2, -0.6)))
    print('## UZUV', yan, 'diz', tuple(round(x, 2) for x in diz), 'dirsek', tuple(round(x, 2) for x in dirsek))
bpy.context.view_layer.update()

# pozu sabitle: armature modifiyerini uygula
for m in meshes:
    bpy.context.view_layer.objects.active = m
    for md in list(m.modifiers):
        if md.type == 'ARMATURE':
            bpy.ops.object.modifier_apply(modifier=md.name)
for m in meshes:
    mw = m.matrix_world.copy()
    m.parent = None
    m.matrix_world = mw
bpy.data.objects.remove(arm, do_unlink=True)
for o in list(bpy.context.scene.objects):
    if o.type == 'EMPTY':
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if len(meshes) > 1:
    bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active
# hafiflet
if len(ob.data.polygons) > 14000:
    md = ob.modifiers.new('sade', 'DECIMATE'); md.ratio = 14000 / len(ob.data.polygons)
    bpy.ops.object.modifier_apply(modifier='sade')
for im in bpy.data.images:
    if im.size[0] > 512:
        k = 512 / max(im.size)
        im.scale(int(im.size[0] * k), int(im.size[1] * k)); im.pack()
ob.name = 'surucu'
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_yup=True,
                          export_image_format='JPEG', export_jpeg_quality=85)
_v=[ob.matrix_world @ v.co for v in ob.data.vertices]
print('## KUTU z', round(min(v.z for v in _v),2), round(max(v.z for v in _v),2), 'y', round(min(v.y for v in _v),2), round(max(v.y for v in _v),2))
print('## SURUCU', os.path.basename(out), len(ob.data.polygons), 'poly')

# onizleme: referans motor (varsa) + surucu, yandan
ref = os.environ.get('REF_MOTOR')
if ref and os.path.exists(ref):
    once = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=ref)
    if os.environ.get('REF_TERS') == '1':
        for o in set(bpy.context.scene.objects) - once:
            if o.parent is None:
                o.rotation_mode = 'XYZ'; o.rotation_euler.z += math.pi
cam = bpy.data.objects.new('kam', bpy.data.cameras.new('kam'))
bpy.context.scene.collection.objects.link(cam)
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.7
cam.location = (5, 0, 0.95); cam.rotation_euler = (math.radians(90), 0, math.radians(90))
sc = bpy.context.scene; sc.camera = cam
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.color_type = 'TEXTURE'
sc.render.resolution_x, sc.render.resolution_y = 380, 380
sc.render.filepath = png
bpy.ops.render.render(write_still=True)
# onden
cam.location = (0, 5, 0.95); cam.rotation_euler = (math.radians(90), 0, math.radians(180))
sc.render.filepath = png.replace('.png', '_on.png')
bpy.ops.render.render(write_still=True)
