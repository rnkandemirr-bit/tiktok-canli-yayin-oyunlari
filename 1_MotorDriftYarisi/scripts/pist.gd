class_name Pist
extends RefCounted
## Yarış çizgisi: rota.json'daki 2 m aralıklı orta hat noktaları (kapalı tur).
## s = turun başından itibaren metre cinsinden mesafe.

var p: PackedVector3Array = []      # orta hat noktaları
var d: PackedFloat32Array = []      # her noktanın tur başından uzaklığı
var egri: PackedFloat32Array = []   # işaretli eğrilik (1/m), + = sola dönüş
var sol: PackedFloat32Array = []    # sol kenara uzaklık
var sag: PackedFloat32Array = []    # sağ kenara uzaklık
var uzunluk := 0.0

func yukle(yol: String) -> bool:
	var f := FileAccess.open(yol, FileAccess.READ)
	if f == null:
		push_error("rota bulunamadı: " + yol)
		return false
	var j = JSON.parse_string(f.get_as_text())
	for n in j["noktalar"]:
		p.append(Vector3(n[0], n[1], n[2]))
	for g in j["genislik"]:
		sol.append(float(g[0]))
		sag.append(float(g[1]))
	var t := 0.0
	for i in p.size():
		d.append(t)
		t += p[i].distance_to(p[(i + 1) % p.size()])
	uzunluk = t
	# eğrilik: yön açısının metre başına değişimi (±6 m pencereyle, sonra yumuşat)
	var ham := PackedFloat32Array()
	var n := p.size()
	for i in n:
		var a := p[(i - 3 + n) % n]
		var b := p[i]
		var c := p[(i + 3) % n]
		var h1 := atan2(b.x - a.x, -(b.z - a.z))
		var h2 := atan2(c.x - b.x, -(c.z - b.z))
		var dh := wrapf(h2 - h1, -PI, PI)
		ham.append(-dh / max(0.5, a.distance_to(b) * 0.5 + b.distance_to(c) * 0.5))
	egri = ham
	for _k in 4:
		var y := PackedFloat32Array()
		for i in n:
			y.append((egri[(i - 1 + n) % n] + egri[i] * 2.0 + egri[(i + 1) % n]) * 0.25)
		egri = y
	return true

func _idx(s: float) -> Vector2:
	s = fposmod(s, uzunluk)
	# 2 m'lik eşit aralık varsayımıyla tahmin et, sonra düzelt
	var n := p.size()
	var i := clampi(int(s / uzunluk * n), 0, n - 1)
	while i > 0 and d[i] > s:
		i -= 1
	while i < n - 1 and d[i + 1] <= s:
		i += 1
	var seg := (d[i + 1] if i < n - 1 else uzunluk) - d[i]
	return Vector2(i, (s - d[i]) / max(0.001, seg))

func konum(s: float) -> Vector3:
	var k := _idx(s)
	var i := int(k.x)
	return p[i].lerp(p[(i + 1) % p.size()], k.y)

func yon(s: float) -> Vector3:
	var a := konum(s - 2.0)
	var b := konum(s + 2.0)
	var v := b - a
	return v.normalized() if v.length() > 0.001 else Vector3.FORWARD

func sol_vektor(s: float) -> Vector3:
	var t := yon(s)
	t.y = 0.0
	return Vector3.UP.cross(t.normalized()).normalized()

func egrilik(s: float) -> float:
	var k := _idx(s)
	var i := int(k.x)
	return lerpf(egri[i], egri[(i + 1) % p.size()], k.y)

func kenar(s: float) -> Vector2:
	var i := int(_idx(s).x)
	return Vector2(sol[i], sag[i])

## Yanal kaydırmalı (+ = sola) dünya konumu
func nokta(s: float, yanal: float) -> Vector3:
	return konum(s) + sol_vektor(s) * yanal
