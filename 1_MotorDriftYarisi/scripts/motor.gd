class_name Motor
extends Node3D
## Pist üzerinde yarışan tek bir motosiklet: hız, sollama, yatma, drift, ön kaldırma, duman.
## Fizik değil "TV yarışı" kinematiği: gerçekçi görünmesi için yatma açısı v²·k/g ile,
## drift ise yanal ivme sınırı aşılınca kuyruk dışarı kayacak şekilde hesaplanır.

const G := 9.81

var pist: Pist
var sira_no := 0            # motor kalitesi sırası (0 = en güzel/en iyi)
var kullanici := ""         # TikTok kullanıcı kimliği ("" = bot)
var isim := ""
var motor_adi := ""
var renk := Color.WHITE

# durum
var s := 0.0                # toplam kat edilen mesafe (turlar dahil)
var yanal := 0.0            # orta hatta göre yan konum (+ sol)
var hedef_yanal := 0.0
var hiz := 0.0
var azami_hiz := 46.0
var ivme := 7.5
var yanal_tutus := 11.0     # bu yanal ivmeden sonrası drift
var bitti := false
var bitis_zamani := 0.0
var aktif := false          # yarış başladı mı

var _yatma := 0.0
var _kayma := 0.0           # drift açısı (rad)
var _on_kaldir := 0.0       # ön kaldırma açısı (rad)
var _on_kaldir_sure := 0.0
var _nitro := 0.0
var _form := 1.0            # o yarışa özel küçük form farkı
var _gosteri_bekle := 0.0
var _gurultu := 0.0

# düğümler
var yalpa: Node3D           # yatma (ileri eksen etrafında)
var arka: Node3D            # ön kaldırma için arka teker ekseni
var model: Node3D
var etiket: Label3D          # isim
var alt_etiket: Label3D      # motor modeli + güç
var kunye: Node3D
var foto: Sprite3D
var duman: GPUParticles3D
var nitro_alev: GPUParticles3D
var uzunluk := 2.1          # model boyu (m)

signal iz_birak(konum: Vector3, yon: Vector3, guc: float)

var govde: Node3D           # motor + sürücü (motor çerçevesi: ön = -Z, zemin y=0)
var surucu: Node3D
var sele_ofset := Vector3.ZERO
var tekerler: Array = []    # [düğüm, yarıçap]

## bilgi: motorlar.json satırı -> ters (model arkaya bakıyorsa), sele [ileri, yukarı] düzeltmesi
func kur(p: Pist, sahne: PackedScene, boy: float, bilgi: Dictionary = {}) -> void:
	pist = p
	uzunluk = boy
	yalpa = Node3D.new()
	add_child(yalpa)
	arka = Node3D.new()
	arka.position = Vector3(0, 0, boy * 0.5)
	yalpa.add_child(arka)
	govde = Node3D.new()
	govde.position = Vector3(0, 0, -boy * 0.5)
	arka.add_child(govde)
	model = sahne.instantiate()
	if bilgi.get("ters", false):
		model.rotation.y = PI
	govde.add_child(model)
	var sl: Array = bilgi.get("sele", [0.0, 0.0])
	sele_ofset = Vector3(0, float(sl[1]), -float(sl[0]))
	for m in model.find_children("*", "GeometryInstance3D", true, false):
		(m as GeometryInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	# boya: "renk" verilmişse gövde desen dokusu (sportmat) olan malzemeler o renge boyanır
	if bilgi.has("renk"):
		var boya := Color(str(bilgi["renk"]))
		for mi in model.find_children("*", "MeshInstance3D", true, false):
			var mm := mi as MeshInstance3D
			for k in mm.mesh.get_surface_count():
				var mat := mm.mesh.surface_get_material(k) as StandardMaterial3D
				if mat == null:
					continue
				var desen := mat.albedo_texture != null and mat.albedo_texture.resource_path.contains("sportmat")
				var duz_acik := mat.albedo_texture == null and mat.albedo_color.get_luminance() > 0.5
				if desen or duz_acik:
					var yeni := mat.duplicate() as StandardMaterial3D
					yeni.albedo_color = boya
					yeni.metallic = 0.55
					yeni.roughness = 0.3
					mm.set_surface_override_material(k, yeni)
	# dönen tekerler: Blender'da ayrılan teker_on_r310 / teker_arka_r305 (aks merkezli, r = mm)
	for t in model.find_children("teker*", "Node3D", true, false):
		var rx := RegEx.create_from_string("_r([0-9]+)")
		var mt := rx.search(t.name)
		tekerler.append([t, float(mt.get_string(1)) / 1000.0 if mt else 0.31])

	# künye: yuvarlak profil fotoğrafı, altında isim, onun altında motor modeli + güç
	# (hepsi ekranda sabit boyutlu; aynı noktaya bağlı, piksel ofsetleriyle dizilir)
	kunye = Node3D.new()
	kunye.position = Vector3(0, 2.15, 0)
	add_child(kunye)
	foto = Sprite3D.new()
	foto.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	foto.no_depth_test = true
	foto.fixed_size = true
	foto.pixel_size = 0.00048
	foto.offset = Vector2(0, 108)
	foto.render_priority = 1
	foto.texture = bos_foto()
	kunye.add_child(foto)
	etiket = _yazi(34, 0, 2)
	alt_etiket = _yazi(23, -36, 2)
	alt_etiket.modulate = Color(1.0, 0.86, 0.45)

	duman = _parcacik(Color(0.85, 0.85, 0.87, 0.30), 36, 1.3, Vector3(0, 0.25, boy * 0.45), 0.6, 1.9)
	nitro_alev = _parcacik(Color(0.4, 0.75, 1.0, 0.9), 40, 0.25, Vector3(0, 0.55, boy * 0.52), 0.18, 0.5)
	(nitro_alev.draw_pass_1.surface_get_material(0) as StandardMaterial3D).emission_enabled = true
	(nitro_alev.draw_pass_1.surface_get_material(0) as StandardMaterial3D).emission = Color(0.3, 0.6, 1.0)
	(nitro_alev.draw_pass_1.surface_get_material(0) as StandardMaterial3D).emission_energy_multiplier = 4.0
	_etiket_yaz()
	ses_ton = float(bilgi.get("ses_ton", 1.0))
	_ses_kur()

# ---------------- MOTOR SESİ ----------------
# Gerçek motosiklet kaydından iki döngü (rölanti ~63 Hz, yüksek devir ~115 Hz);
# vites simülasyonu ile devir hesaplanır, iki katman devire göre karışır ve pitch kaydırılır.
const SES_ROLANTI := preload("res://assets/ses/motor_rolanti.wav")
const SES_YUKSEK := preload("res://assets/ses/motor_yuksek.wav")
const VITESLER := [0.30, 0.46, 0.61, 0.75, 0.88, 1.0]   # azami hızın oranı olarak vites tepe hızları
var ses_ton := 1.0          # motor karakteri: <1 kalın (süper sport), >1 ince (scooter)
var _ses_r: AudioStreamPlayer3D
var _ses_y: AudioStreamPlayer3D
var _devir := 0.15
var _gaz := 0.0
var _vites := 1

static func _dongu_yap(st: AudioStreamWAV) -> void:
	if st.loop_mode != AudioStreamWAV.LOOP_FORWARD:
		st.loop_mode = AudioStreamWAV.LOOP_FORWARD
		st.loop_begin = 0
		st.loop_end = int(st.get_length() * st.mix_rate)

func _ses_oyuncu(st: AudioStreamWAV) -> AudioStreamPlayer3D:
	var p := AudioStreamPlayer3D.new()
	p.stream = st
	p.unit_size = 9.0
	p.max_db = 2.0
	p.max_distance = 140.0
	p.attenuation_filter_cutoff_hz = 7000.0
	p.attenuation_filter_db = -12.0
	p.volume_db = -80.0
	p.position = Vector3(0, 0.5, 0)
	add_child(p)
	p.play(randf() * st.get_length())
	return p

func _ses_kur() -> void:
	_dongu_yap(SES_ROLANTI)
	_dongu_yap(SES_YUKSEK)
	_ses_r = _ses_oyuncu(SES_ROLANTI)
	_ses_y = _ses_oyuncu(SES_YUKSEK)

func _ses_guncelle(dt: float, zaman: float) -> void:
	var hedef := 0.13
	var gaz := 0.3
	if not aktif:
		# grid: rölanti + ara sıra gaz verme; son 2.5 sn gaz kökleme
		if zaman > -2.5 and zaman < 0.0:
			hedef = 0.78 + 0.08 * sin(zaman * 23.0 + _gurultu)
			gaz = 1.0
		elif fmod(Time.get_ticks_msec() * 0.001 + _gurultu * 3.0, 6.0) < 0.45:
			hedef = 0.55
			gaz = 0.9
	else:
		var tepe: float = azami_hiz * 1.04
		_vites = VITESLER.size()
		for i in VITESLER.size():
			if hiz < tepe * float(VITESLER[i]) * 0.97:
				_vites = i + 1
				break
		var ust: float = tepe * float(VITESLER[_vites - 1])
		var alt: float = 0.0 if _vites == 1 else tepe * float(VITESLER[_vites - 2])
		hedef = lerpf(0.42, 1.0, clampf((hiz - alt * 0.75) / max(ust - alt * 0.75, 0.1), 0.0, 1.0))
		if _vites == 1:
			hedef = lerpf(0.25, 1.0, clampf(hiz / ust, 0.0, 1.0))
		gaz = 1.0 if hiz < azami_hiz * _form * 0.995 else 0.55
		if bitti:
			gaz = 0.25
	if _nitro > 0.0:
		hedef = min(1.08, hedef + 0.06)
	# devir yükselişi hızlı, düşüşü (vites atınca) anlık
	_devir = move_toward(_devir, hedef, dt * (2.6 if hedef > _devir else 6.0))
	_gaz = lerpf(_gaz, gaz, clampf(dt * 6.0, 0.0, 1.0))
	var karisim := clampf((_devir - 0.22) / 0.28, 0.0, 1.0)
	var ses := 0.55 + 0.45 * _gaz
	_ses_r.pitch_scale = ses_ton * (0.85 + _devir * 1.9)
	_ses_y.pitch_scale = ses_ton * (0.55 + _devir * 0.95)
	_ses_r.volume_db = linear_to_db(max((1.0 - karisim) * ses, 0.0001)) - 4.0
	_ses_y.volume_db = linear_to_db(max(karisim * ses, 0.0001)) - 4.0

func _parcacik(c: Color, adet: int, omur: float, yer: Vector3, bas: float, son: float) -> GPUParticles3D:
	var g := GPUParticles3D.new()
	g.amount = adet
	g.lifetime = omur
	g.emitting = false
	g.local_coords = false
	g.position = yer
	var pm := ParticleProcessMaterial.new()
	pm.direction = Vector3(0, 1, 1)
	pm.spread = 35.0
	pm.initial_velocity_min = 0.6
	pm.initial_velocity_max = 2.0
	pm.gravity = Vector3(0, 0.6, 0)
	pm.damping_min = 0.5
	pm.damping_max = 1.5
	pm.scale_min = bas
	pm.scale_max = bas * 1.4
	var eg := Curve.new()
	eg.add_point(Vector2(0, 0.35))
	eg.add_point(Vector2(1, son / bas * 0.35))
	pm.scale_curve = CurveTexture.new()
	(pm.scale_curve as CurveTexture).curve = eg
	var gr := Gradient.new()
	gr.set_color(0, c)
	gr.set_color(1, Color(c.r, c.g, c.b, 0.0))
	pm.color_ramp = GradientTexture1D.new()
	(pm.color_ramp as GradientTexture1D).gradient = gr
	g.process_material = pm
	var q := QuadMesh.new()
	q.size = Vector2(1, 1)
	var mat := StandardMaterial3D.new()
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	mat.vertex_color_use_as_albedo = true
	mat.albedo_texture = _yumusak_doku()
	q.material = mat
	g.draw_pass_1 = q
	add_child(g)
	return g

static var _doku: Texture2D
static func _yumusak_doku() -> Texture2D:
	if _doku:
		return _doku
	var gt := GradientTexture2D.new()
	gt.fill = GradientTexture2D.FILL_RADIAL
	gt.fill_from = Vector2(0.5, 0.5)
	gt.fill_to = Vector2(0.5, 0.0)
	var gr := Gradient.new()
	gr.set_color(0, Color(1, 1, 1, 1))
	gr.set_color(1, Color(1, 1, 1, 0))
	gt.gradient = gr
	gt.width = 64
	gt.height = 64
	_doku = gt
	return _doku

func _yazi(boyut: int, ofset_y: float, oncelik: int) -> Label3D:
	var l := Label3D.new()
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.no_depth_test = true
	l.fixed_size = true
	l.pixel_size = 0.0008
	l.font_size = boyut
	l.outline_size = 12
	l.outline_modulate = Color(0, 0, 0, 0.9)
	l.offset = Vector2(0, ofset_y)
	l.render_priority = oncelik
	l.outline_render_priority = oncelik - 1
	kunye.add_child(l)
	return l

## fotoğraf gelene kadar gösterilen gri yuvarlak
static var _bos_foto: Texture2D
static func bos_foto() -> Texture2D:
	if _bos_foto == null:
		var img := Image.create(128, 128, false, Image.FORMAT_RGBA8)
		img.fill(Color(0.32, 0.34, 0.4))
		_bos_foto = yuvarla(img)
	return _bos_foto

## kare kırp, 128 px yuvarlak + beyaz çerçeve
static func yuvarla(img: Image) -> ImageTexture:
	const N := 128
	img.convert(Image.FORMAT_RGBA8)
	var w := img.get_width()
	var h := img.get_height()
	var k := mini(w, h)
	img = img.get_region(Rect2i((w - k) / 2, (h - k) / 2, k, k))
	img.resize(N, N, Image.INTERPOLATE_BILINEAR)
	var c := (N - 1) / 2.0
	for y in N:
		for x in N:
			var d := Vector2(x - c, y - c).length()
			if d > c:
				img.set_pixel(x, y, Color(0, 0, 0, 0))
			elif d > c - 1.0:
				img.set_pixel(x, y, Color(1, 1, 1, c - d))
			elif d > c - 7.0:
				img.set_pixel(x, y, Color.WHITE)
	return ImageTexture.create_from_image(img)

func foto_ata(t: Texture2D) -> void:
	foto.texture = t if t else bos_foto()

func _etiket_yaz() -> void:
	etiket.text = isim
	etiket.modulate = renk
	alt_etiket.text = "%s  ⚡%d" % [motor_adi, guc]
	kunye.visible = kullanici != ""   # botların üstünde künye olmasın, ekran kalabalıklaşmasın

## sürücü karakterini değiştir (karakterler motor çerçevesinde poz verilmiş statik modeller)
func surucu_ata(sahne: PackedScene) -> void:
	if surucu:
		surucu.queue_free()
		surucu = null
	if sahne == null:
		return
	surucu = sahne.instantiate()
	surucu.position = sele_ofset
	govde.add_child(surucu)

func ata(k: String, ad: String, c: Color) -> void:
	kullanici = k
	isim = ad
	renk = c
	_etiket_yaz()

func yaris_hazirla(baslangic_s: float, yan: float) -> void:
	s = baslangic_s
	yanal = yan
	hedef_yanal = yan
	hiz = 0.0
	bitti = false
	aktif = false
	_nitro = 0.0
	_on_kaldir = 0.0
	_on_kaldir_sure = 0.0
	_form = randf_range(0.985, 1.015)
	_gosteri_bekle = randf_range(4.0, 12.0)
	_gurultu = randf() * 100.0
	guc_ayarla(guc)
	_konumla(0.0)

## Güç -> performans. Azalan getiri: 1 güç ~36 m/s, 25 ~39, 100 ~44, 300+ ~46 m/s
var guc := 1
func guc_ayarla(g: int) -> void:
	guc = max(1, g)
	var k := 1.0 - exp(-float(guc) / 70.0)
	azami_hiz = 36.0 + 11.0 * k
	ivme = 6.0 + 2.6 * k
	yanal_tutus = 10.2 + 2.0 * k
	if kunye:
		_etiket_yaz()

func nitro_ver(sure: float) -> void:
	_nitro = max(_nitro, sure)

func on_kaldir(sure: float) -> void:
	_on_kaldir_sure = max(_on_kaldir_sure, sure)

## Sahnedeki diğer motorlar: sollama için yakındakilere bakılır
func adim(dt: float, digerleri: Array, zaman: float) -> void:
	_ses_guncelle(dt, zaman)
	if not aktif:
		# start çizgisinde gaz kökleme: arka teker dumanı
		duman.emitting = zaman > -2.5 and zaman < 0.0
		_konumla(dt)
		return
	if bitti:
		hiz = move_toward(hiz, 9.0, 6.0 * dt)
	else:
		# ileriye bak: viraj için güvenli hız
		var hedef := azami_hiz * _form * (1.0 + 0.22 * float(_nitro > 0.0))
		var ileri := 6.0
		while ileri < 90.0:
			var k: float = abs(pist.egrilik(s + ileri))
			if k > 0.0005:
				var v_viraj := sqrt(yanal_tutus * 1.45 / k)   # drift ile biraz fazlası
				var v_izin := sqrt(v_viraj * v_viraj + 2.0 * 11.0 * ileri)
				hedef = min(hedef, v_izin)
			ileri += 6.0
		hedef *= 1.0 + 0.025 * sin(zaman * 0.7 + _gurultu)
		if hiz < hedef:
			hiz = min(hedef, hiz + ivme * (1.0 + 0.6 * float(_nitro > 0.0)) * dt * clampf(1.4 - hiz / 60.0, 0.4, 1.4))
		else:
			hiz = max(hedef, hiz - 11.0 * dt)
	_nitro = max(0.0, _nitro - dt)
	nitro_alev.emitting = _nitro > 0.0

	# yanal: virajın iç tarafını kullan, öndeki yavaş motoru yandan geç
	var k_ileri := pist.egrilik(s + 18.0)
	var kn := pist.kenar(s)
	var ideal := clampf(k_ileri * 260.0, -1.0, 1.0) * (kn.x if k_ileri > 0.0 else kn.y) * 0.55
	for m in digerleri:
		if m == self or not m.aktif:
			continue
		var fark: float = m.s - s
		if fark > 0.0 and fark < 9.0 and abs(m.yanal - hedef_yanal) < 1.6 and m.hiz < hiz + 1.0:
			# geçiş tarafını seç: daha geniş olan
			var sol_bos: float = (kn.x - 0.8) - m.yanal
			var sag_bos: float = m.yanal + (kn.y - 0.8)
			ideal = m.yanal + (1.9 if sol_bos > sag_bos else -1.9)
	hedef_yanal = lerpf(hedef_yanal, ideal, clampf(dt * 1.2, 0.0, 1.0))
	hedef_yanal = clampf(hedef_yanal, -kn.y + 0.9, kn.x - 0.9)
	yanal = move_toward(yanal, hedef_yanal, 2.2 * dt)

	s += hiz * dt
	for t in tekerler:
		(t[0] as Node3D).rotate_object_local(Vector3.RIGHT, -hiz * dt / t[1])
	_konumla(dt)

	# gösteri: düzlükte ara sıra ön kaldırma
	_gosteri_bekle -= dt
	if _gosteri_bekle <= 0.0 and not bitti:
		_gosteri_bekle = randf_range(7.0, 16.0)
		if abs(pist.egrilik(s + 25.0)) < 0.004 and abs(pist.egrilik(s + 55.0)) < 0.006 and hiz > 12.0:
			on_kaldir(randf_range(1.2, 2.4))

func _konumla(dt: float) -> void:
	var k := pist.egrilik(s)
	var t := pist.yon(s)
	var poz := pist.nokta(s, yanal)
	# yanal ivme ve yatma açısı
	var a_yan := hiz * hiz * k
	var hedef_yatma := clampf(atan(a_yan / G), -0.95, 0.95)
	# drift: tutuş sınırını aşınca kuyruk dışarı kayar, burun virajın içine döner
	var asim: float = max(0.0, abs(a_yan) - yanal_tutus)
	var hedef_kayma := signf(k) * clampf(asim * 0.07, 0.0, 0.55)
	if dt > 0.0:
		_yatma = lerpf(_yatma, hedef_yatma * (1.0 - 0.25 * float(asim > 0.0)), clampf(dt * 5.0, 0, 1))
		_kayma = lerpf(_kayma, hedef_kayma, clampf(dt * 3.0, 0, 1))
		var hedef_on := 0.0
		if _on_kaldir_sure > 0.0:
			_on_kaldir_sure -= dt
			hedef_on = deg_to_rad(24.0 + 6.0 * sin(Time.get_ticks_msec() * 0.004 + _gurultu))
		_on_kaldir = lerpf(_on_kaldir, hedef_on, clampf(dt * (3.0 if hedef_on > 0.0 else 4.5), 0, 1))
	var surtunme: bool = abs(_kayma) > 0.08 and hiz > 8.0
	if aktif:
		duman.emitting = surtunme or (_on_kaldir > 0.2 and hiz < 25.0)
	if surtunme and dt > 0.0:
		iz_birak.emit(global_position + global_transform.basis.z * uzunluk * 0.45, t, clampf(abs(_kayma) * 2.0, 0.2, 1.0))

	var ileri := t
	ileri.y = clampf(ileri.y, -0.3, 0.3)
	var b := Basis.looking_at(ileri, Vector3.UP)
	b = b.rotated(Vector3.UP, _kayma)
	global_transform = Transform3D(b, poz)
	yalpa.rotation = Vector3(0, 0, _yatma)
	arka.rotation = Vector3(_on_kaldir, 0, 0)
	kunye.position.y = 2.15 + _on_kaldir * 1.2

func drift_ediyor() -> bool:
	return abs(_kayma) > 0.08
