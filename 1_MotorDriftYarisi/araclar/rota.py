# Yol parcalarinin "Road" yuzlerinden orta hatti cikarir -> Godot koordinatinda JSON
import bpy, bmesh, json, sys, math
from mathutils import Vector
from mathutils.kdtree import KDTree
out = sys.argv[sys.argv.index('--') + 1]

pts = []      # yol yuzey noktalari (dunya)
for o in bpy.context.scene.objects:
    if o.type != 'MESH' or not o.name.startswith('Road_Part'):
        continue
    dg = bpy.context.evaluated_depsgraph_get()
    me = o.evaluated_get(dg).to_mesh()
    names = [s.material.name if s.material else '' for s in o.material_slots]
    for p in me.polygons:
        if names[p.material_index] != 'Road':
            continue
        # yuzeyi duzgun orneklemek icin kose + merkez
        c = o.matrix_world @ p.center
        pts.append(c)
        for vi in p.vertices:
            pts.append(o.matrix_world @ me.vertices[vi].co)
print('## yol noktasi', len(pts))

# 4 m'lik izgarada ortala (genislik boyunca yayilmayi azaltir)
CELL = 4.0
grid = {}
for p in pts:
    k = (round(p.x / CELL), round(p.y / CELL))
    grid.setdefault(k, []).append(p)
cells = [sum(v, Vector()) / len(v) for v in grid.values()]
print('## hucre', len(cells))

# yol eksenine yaklastir: her noktayi 9 m yaricapli komsularinin ortalamasina cek (3 tur)
for _ in range(3):
    kd = KDTree(len(cells))
    for i, c in enumerate(cells): kd.insert(c, i)
    kd.balance()
    cells = [sum((q for q, _, _ in kd.find_range(c, 9.0)), Vector()) / max(1, len(kd.find_range(c, 9.0))) for c in cells]
# tekrar seyrelt
grid = {}
for p in cells:
    k = (round(p.x / 3.0), round(p.y / 3.0))
    grid.setdefault(k, []).append(p)
cells = [sum(v, Vector()) / len(v) for v in grid.values()]

# en yakin komsu zinciri
kd = KDTree(len(cells))
for i, c in enumerate(cells): kd.insert(c, i)
kd.balance()
used = [False] * len(cells)
cur = min(range(len(cells)), key=lambda i: cells[i].x)
chain = [cur]; used[cur] = True
while True:
    best = None
    for (co, i, d) in kd.find_n(cells[cur], 24):
        if not used[i]:
            best = i; break
    if best is None or (cells[best] - cells[cur]).length > 25:
        break
    used[best] = True; chain.append(best); cur = best
line = [cells[i] for i in chain]
print('## zincir', len(line), 'kullanilmayan', used.count(False), 'bas-son mesafe', round((line[0] - line[-1]).length, 1))

# yumusat (kapali dongu varsay)
closed = (line[0] - line[-1]).length < 30
for _ in range(25):
    n = len(line)
    line = [(line[(i - 1) % n] + line[i] * 2 + line[(i + 1) % n]) / 4 if closed or 0 < i < n - 1 else line[i] for i in range(n)]
# 2 m araliklarla yeniden ornekle
res = [line[0]]
acc = 0.0
seq = line + ([line[0]] if closed else [])
for a, b in zip(seq, seq[1:]):
    seg = (b - a).length
    t = 0.0
    while acc + seg - t >= 2.0:
        t += 2.0 - acc
        res.append(a.lerp(b, t / seg)); acc = 0.0
    acc += seg - t
length = sum((b - a).length for a, b in zip(res, res[1:]))

# her noktada yol yari-genisligi: dik yonde yol noktalari
kdp = KDTree(len(pts))
for i, p in enumerate(pts): kdp.insert(p, i)
kdp.balance()
widths = []
for i, c in enumerate(res):
    t = (res[(i + 1) % len(res)] - res[i - 1]); t.z = 0; t.normalize()
    nrm = Vector((-t.y, t.x, 0))
    side = [ (q - c).dot(nrm) for q, _, _ in kdp.find_range(c, 14.0) if abs((q - c).dot(t)) < 3.0 ]
    widths.append((min(side) if side else -5.0, max(side) if side else 5.0))
# yuksekligi yol yuzeyine oturt
for i, c in enumerate(res):
    near = kdp.find_n(c, 6)
    c.z = sum(q.z for q, _, _ in near) / len(near)

data = {
    'kapali': closed, 'uzunluk': round(length, 1),
    # Blender (x, y, z) -> Godot (x, z, -y)
    'noktalar': [[round(c.x, 3), round(c.z, 3), round(-c.y, 3)] for c in res],
    # [sol kenara uzaklik, sag kenara uzaklik] (gidis yonune gore)
    'genislik': [[round(max(0.5, w[1]), 2), round(max(0.5, -w[0]), 2)] for w in widths],
}
json.dump(data, open(out, 'w'))
print('## rota', len(res), 'nokta, uzunluk', round(length), 'm, kapali', closed, 'ort genislik', round(sum(b - a for a, b in widths) / len(widths), 1))
