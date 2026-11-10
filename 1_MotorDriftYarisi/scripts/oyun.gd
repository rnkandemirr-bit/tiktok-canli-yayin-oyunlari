extends Node3D
## MOTOR DRIFT YARIŞI — TikTok canlı yayın oyunu
## Akış: LOBİ (1 dk: beğeni/hediye ile katılım, gül ile güç) → GERİ SAYIM → YARIŞ (TUR_SAYISI tur) → BİTİŞ → LOBİ
## Her motorun taban gücü ve alınma hediyesi motorlar.json'da.

const LOBI_SURE := 60.0
const TUR_SAYISI := 2
const BEGENI_KATIL := 100
const GUL_GUC := 5
const RENKLER := [Color("ffd54f"), Color("ff8a65"), Color("4fc3f7"), Color("aed581"), Color("f06292"), Color("ba68c8"),
	Color("4db6ac"), Color("fff176"), Color("90caf9"), Color("ffab91"), Color("ce93d8"), Color("80cbc4"), Color("e6ee9c"), Color("b0bec5")]

enum Durum { LOBI, GERI_SAYIM, YARIS, BITIS }
var durum := Durum.LOBI
var sayac := LOBI_SURE
var zaman := 0.0            # yarış saati (geri sayımda negatif)

var pist := Pist.new()
var motorlar: Array[Motor] = []
var motor_bilgi: Array = []   # motorlar.json
var oyuncular := {}           # kullanici -> {isim, begeni, motor, guc_ek, sonraki_*}
var bitis_sirasi: Array[Motor] = []

var kopru: Node
var kamera: Camera3D
var izler: MultiMeshInstance3D
var _iz_i := 0

# arayüz
var ui: CanvasLayer
var baslik: Label
var alt_baslik: Label
var liste: RichTextLabel
var dev_yazi: Label
var akis: VBoxContainer
var kurallar: Label

func _ready() -> void:
	randomize()
	if not pist.yukle("res://assets/pist/rota.json"):
		return
	_ortam_kur()
	_pist_kur()
	_izler_kur()
	_motorlari_kur()
	_kamera_kur()
	_arayuz_kur()
	kopru = preload("res://scripts/kopru.gd").new()
	add_child(kopru)
	kopru.hediye.connect(_hediye)
	kopru.begeni.connect(_begeni)
	kopru.yorum.connect(_yorum)
	kopru.durum.connect(func(t): alt_baslik.tooltip_text = t)
	kopru.foto.connect(_foto_istendi)
	_lobiye_don()
	_test_modu()

## Komut satırı testi: -- --ekran=klasor --lobi=sn --kare=sn1,sn2,...  (görüntü kaydedip kapanır)
func _test_modu() -> void:
	var ekran := ""
	var kareler: Array = []
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--ekran="): ekran = a.substr(8)
		elif a.begins_with("--lobi="): sayac = float(a.substr(7))
		elif a.begins_with("--kare="):
			for t in a.substr(7).split(","): kareler.append(float(t))
		elif a.begins_with("--foto="):
			# test: klasördeki resimleri test kullanıcılarına profil fotoğrafı yap
			var kl := a.substr(7)
			var dosyalar := DirAccess.get_files_at(kl)
			var kim := ["ali", "ayse", "mehmet", "zeynep"]
			for j in SAHTE_ISIMLER.size():
				kim.append("sahte%d" % j)
			for j in kim.size():
				if dosyalar.is_empty():
					break
				var img := Image.load_from_file(kl.path_join(dosyalar[j % dosyalar.size()]))
				if img:
					fotolar[kim[j]] = Motor.yuvarla(img)
					_foto_istek[kim[j]] = true
		elif a == "--sahte":
			_sahte = true
		elif a.begins_with("--sure="):
			var sn := float(a.substr(7))
			get_tree().create_timer(sn).timeout.connect(func() -> void:
				print("## sure doldu")
				get_tree().quit())
		elif a == "--hediye":
			_hediye("ali", "Ali", 30, "Donut")
			_begeni("ayse", "Ayşe", 100)
			for _i in 6: _hediye("ayse", "Ayşe", 1, "Rose")
			_begeni("mehmet", "Mehmet", 120)
			_hediye("zeynep", "Zeynep", 1, "Gül")
	if ekran == "":
		return
	var bas := Time.get_ticks_msec()
	for t in kareler:
		await get_tree().create_timer(t - (Time.get_ticks_msec() - bas) / 1000.0).timeout
		await RenderingServer.frame_post_draw
		var img := get_viewport().get_texture().get_image()
		img.save_jpg(ekran.path_join("kare_%03d.jpg" % int(t)), 0.85)
		print("## kare ", t, " fps ", Engine.get_frames_per_second(), " durum ", durum)
	get_tree().quit()

# ------------------------------------------------------------------ sahne
func _ortam_kur() -> void:
	var we := WorldEnvironment.new()
	var env := Environment.new()
	var sky := Sky.new()
	var sm := ProceduralSkyMaterial.new()
	sm.sky_top_color = Color(0.32, 0.5, 0.78)
	sm.sky_horizon_color = Color(0.72, 0.8, 0.9)
	sm.ground_horizon_color = Color(0.6, 0.65, 0.62)
	sm.ground_bottom_color = Color(0.25, 0.28, 0.24)
	sm.sun_angle_max = 20.0
	sky.sky_material = sm
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.9
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_AGX
	env.tonemap_exposure = 1.05
	env.ssao_enabled = true
	env.ssao_radius = 1.2
	env.glow_enabled = true
	env.glow_intensity = 0.35
	env.glow_bloom = 0.05
	env.fog_enabled = true
	env.fog_light_color = Color(0.7, 0.78, 0.88)
	env.fog_density = 0.0016
	env.fog_aerial_perspective = 0.6
	env.adjustment_enabled = true
	env.adjustment_saturation = 1.08
	env.adjustment_contrast = 1.05
	we.environment = env
	add_child(we)

	var gunes := DirectionalLight3D.new()
	gunes.rotation_degrees = Vector3(-38, -35, 0)
	gunes.light_energy = 1.6
	gunes.light_color = Color(1.0, 0.96, 0.9)
	gunes.shadow_enabled = true
	gunes.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	gunes.directional_shadow_max_distance = 140.0
	gunes.shadow_blur = 1.2
	add_child(gunes)

func _pist_kur() -> void:
	var yol := "res://assets/pist/pist.glb"
	if ResourceLoader.exists(yol):
		var p: Node3D = load(yol).instantiate()
		add_child(p)
		for m in p.find_children("*", "GeometryInstance3D", true, false):
			var gi := m as GeometryInstance3D
			# büyük zemin ve ağaç kümeleri gölge atmasın (performans)
			if gi.name.begins_with("Terrain") or gi.name.begins_with("Tree") or gi.name.begins_with("Volume"):
				gi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			if gi.name.begins_with("Volume") or gi.name.begins_with("Collidior"):
				gi.visible = false
		return
	# pist modeli yoksa: rotadan basit asfalt şerit + çim zemin (test için)
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var n := pist.p.size()
	for i in n + 1:
		var a := i % n
		var s := pist.d[a] if i < n else pist.uzunluk
		var l := pist.sol_vektor(s)
		var o := pist.p[a] + Vector3.UP * 0.03
		var k := pist.kenar(s)
		var v := s / 8.0
		st.set_uv(Vector2(0, v)); st.add_vertex(o + l * (k.x + 0.6))
		st.set_uv(Vector2(1, v)); st.add_vertex(o - l * (k.y + 0.6))
	var idx := 0
	var serit := st.commit_to_arrays()
	st = SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var vs: PackedVector3Array = serit[Mesh.ARRAY_VERTEX]
	var uvs: PackedVector2Array = serit[Mesh.ARRAY_TEX_UV]
	for i in n:
		var a := i * 2
		for j in [a, a + 2, a + 1, a + 1, a + 2, a + 3]:
			st.set_uv(uvs[j]); st.set_normal(Vector3.UP); st.add_vertex(vs[j])
		idx += 1
	var yol_mi := MeshInstance3D.new()
	yol_mi.mesh = st.commit()
	var am := StandardMaterial3D.new()
	am.albedo_color = Color(0.16, 0.16, 0.17)
	am.roughness = 0.85
	yol_mi.material_override = am
	add_child(yol_mi)
	var zemin := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(2400, 2400)
	zemin.mesh = pm
	var gm := StandardMaterial3D.new()
	gm.albedo_color = Color(0.22, 0.34, 0.16)
	gm.roughness = 1.0
	zemin.material_override = gm
	var en_alt := 1e9
	for q in pist.p:
		en_alt = min(en_alt, q.y)
	zemin.position = Vector3(0, en_alt - 0.4, 0)
	add_child(zemin)

func _izler_kur() -> void:
	izler = MultiMeshInstance3D.new()
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	var q := PlaneMesh.new()
	q.size = Vector2(0.18, 0.7)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.02, 0.02, 0.02, 0.55)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	q.material = mat
	mm.mesh = q
	mm.instance_count = 5000
	mm.visible_instance_count = 0
	izler.multimesh = mm
	izler.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(izler)

func _iz(konum: Vector3, yon: Vector3, _guc: float) -> void:
	var mm := izler.multimesh
	var y := Vector3(yon.x, 0, yon.z).normalized()
	if y.length() < 0.1:
		return
	var b := Basis.looking_at(y, Vector3.UP)
	konum.y = konum.y + 0.04 - 0.0
	mm.set_instance_transform(_iz_i, Transform3D(b, konum - Vector3(0, 0.22, 0)))
	_iz_i = (_iz_i + 1) % mm.instance_count
	mm.visible_instance_count = max(mm.visible_instance_count, _iz_i)

func _motorlari_kur() -> void:
	var f := FileAccess.open("res://assets/motorlar/motorlar.json", FileAccess.READ)
	motor_bilgi = JSON.parse_string(f.get_as_text())
	for i in motor_bilgi.size():
		var b: Dictionary = motor_bilgi[i]
		var m := Motor.new()
		m.name = "Motor%02d" % i
		add_child(m)
		m.kur(pist, load("res://assets/motorlar/" + str(b["dosya"])), float(b.get("boy", 2.1)), b)
		m.motor_adi = str(b["ad"])
		m.iz_birak.connect(_iz)
		motorlar.append(m)
	# sürücü karakterleri (Sonmodel'deki 45 NPC, motor üstü pozda)
	for i in range(1, 100):
		var y := "res://assets/suruculer/s%d.glb" % i
		if ResourceLoader.exists(y):
			surucu_yollari.append(y)

var surucu_yollari: Array[String] = []
var _surucu_onbellek := {}
func _surucu_sahne(i: int) -> PackedScene:
	if surucu_yollari.is_empty():
		return null
	var y := surucu_yollari[i % surucu_yollari.size()]
	if not _surucu_onbellek.has(y):
		_surucu_onbellek[y] = load(y)
	return _surucu_onbellek[y]

## her izleyiciye kimliğinden türeyen sabit bir karakter; aynı yarışta iki motorda aynı karakter olmaz
func _suruculeri_dagit() -> void:
	var kullanilan := {}
	for i in motorlar.size():
		var m := motorlar[i]
		var n := surucu_yollari.size()
		if n == 0:
			return
		var j: int = (absi(m.kullanici.hash()) if m.kullanici != "" else i * 7 + 3) % n
		while kullanilan.has(j) and kullanilan.size() < n:
			j = (j + 1) % n
		kullanilan[j] = true
		if m.get_meta("surucu", -1) != j:
			m.set_meta("surucu", j)
			m.surucu_ata(_surucu_sahne(j))

# ------------------------------------------------------------------ katılım
## KURALLAR
##  ❤️ BEGENI_KATIL beğeni  -> sıradan (hediyesiz) boş bir motorla yarışa katıl
##  🎁 motorun hediyesi      -> o motoru al (motorlar.json "hediye"; ör. Kawasaki = Donut)
##  🌹 her gül               -> motoruna +GUL_GUC güç (diğer hediyeler: jeton başına aynı güç)
##  Yarış sırasında gelen hediye: canlı güç + nitro + şahlanma; katılmamışsa sonraki yarışa yazılır.
func _oyuncu(k: String, isim: String) -> Dictionary:
	if not oyuncular.has(k):
		oyuncular[k] = { "isim": isim, "zaman": Time.get_ticks_msec(), "begeni": 0, "motor": -1, "guc_ek": 0,
			"sonraki_motor": -1, "sonraki_guc": 0, "sonraki_katil": false }
	oyuncular[k]["isim"] = isim
	return oyuncular[k]

func _gul_mu(ad: String) -> bool:
	var a := ad.to_lower()
	return a.contains("rose") or a.contains("gül") or a.contains("gul")

## hediye adı hangi motorun hediyesi? (-1 = hiçbiri)
func _hediyeli_motor(ad: String) -> int:
	var a := ad.to_lower()
	for i in motor_bilgi.size():
		for h in motor_bilgi[i].get("hediye", []):
			if a.contains(str(h).to_lower()):
				return i
	return -1

func _bos_siradan_motor() -> int:
	# en güçlü sıradan motordan başla
	var en := -1
	for i in motorlar.size():
		if motorlar[i].kullanici == "" and motor_bilgi[i].get("hediye", []).is_empty():
			if en < 0 or int(motor_bilgi[i].get("guc", 1)) > int(motor_bilgi[en].get("guc", 1)):
				en = i
	return en

# ---------------- PROFİL FOTOĞRAFLARI ----------------
var fotolar := {}       # kullanici -> Texture2D (yuvarlak)
var _foto_istek := {}   # kullanici -> true (indiriliyor / denendi)

func _foto_istendi(k: String, adres: String) -> void:
	if _foto_istek.has(k):
		return
	_foto_istek[k] = true
	var h := HTTPRequest.new()
	h.timeout = 15.0
	add_child(h)
	h.request_completed.connect(func(sonuc: int, kod: int, _b: PackedStringArray, veri: PackedByteArray) -> void:
		h.queue_free()
		if sonuc != HTTPRequest.RESULT_SUCCESS or kod != 200:
			return
		var img := _resim_coz(veri)
		if img == null:
			return
		var t := Motor.yuvarla(img)
		fotolar[k] = t
		for m in motorlar:
			if m.kullanici == k:
				m.foto_ata(t)
		_ui_t = 0.0)
	if h.request(adres) != OK:
		h.queue_free()

static func _resim_coz(b: PackedByteArray) -> Image:
	if b.size() < 16:
		return null
	var img := Image.new()
	var err := FAILED
	if b[0] == 0xFF and b[1] == 0xD8:
		err = img.load_jpg_from_buffer(b)
	elif b[0] == 0x89 and b[1] == 0x50:
		err = img.load_png_from_buffer(b)
	elif b[8] == 0x57 and b[9] == 0x45 and b[10] == 0x42 and b[11] == 0x50:
		err = img.load_webp_from_buffer(b)
	else:
		for f in [img.load_webp_from_buffer, img.load_jpg_from_buffer, img.load_png_from_buffer]:
			err = f.call(b)
			if err == OK:
				break
	return img if err == OK else null

func _motora_bindir(k: String, i: int) -> void:
	var o: Dictionary = oyuncular[k]
	var eski: int = o["motor"]
	if eski == i:
		return
	if eski >= 0:
		motorlar[eski].ata("", "BOT", Color(0.75, 0.75, 0.78))
	o["motor"] = i
	motorlar[i].ata(k, str(o["isim"]), RENKLER[i % RENKLER.size()])
	motorlar[i].foto_ata(fotolar.get(k))
	_suruculeri_dagit()
	_guc_yaz(k)

func _guc_yaz(k: String) -> void:
	var o: Dictionary = oyuncular[k]
	if o["motor"] >= 0:
		var i: int = o["motor"]
		motorlar[i].guc_ayarla(int(motor_bilgi[i].get("guc", 1)) + int(o["guc_ek"]))

func _hediye(k: String, isim: String, jeton: int, ad: String) -> void:
	var o := _oyuncu(k, isim)
	var gul := _gul_mu(ad)
	var hm := _hediyeli_motor(ad)
	var guc: int = GUL_GUC * max(1, jeton)
	var adi := ad if ad != "" else "hediye"
	if durum != Durum.LOBI:
		var m := _motoru(k)
		if m:
			# yarışta: canlı güç + nitro + şahlanma
			o["guc_ek"] += guc
			_guc_yaz(k)
			m.nitro_ver(clampf(1.5 + jeton * 0.25, 1.5, 8.0))
			m.on_kaldir(clampf(1.0 + jeton * 0.1, 1.0, 3.0))
			_odak = m
			_odak_sure = 5.0
			_akis_ekle("🔥 %s %s attı → +%d GÜÇ + NİTRO!" % [isim, adi, guc], Color("ffd54f"))
		else:
			if hm >= 0:
				o["sonraki_motor"] = hm
			o["sonraki_guc"] += 0 if hm >= 0 else guc
			o["sonraki_katil"] = true
			_akis_ekle("⏳ %s sonraki yarışa yazıldı (%s)" % [isim, adi], Color("b0bec5"))
		return
	# LOBİ
	if hm >= 0:
		var sahip := motorlar[hm].kullanici
		if sahip == "" or sahip == k:
			_motora_bindir(k, hm)
			_akis_ekle("🏍️ %s %s attı → %s onun!" % [isim, adi, motorlar[hm].motor_adi], Color("ffd54f"))
		else:
			_akis_ekle("❌ %s dolu (%s'in) — %s gücüne sayıldı" % [motorlar[hm].motor_adi, motorlar[hm].isim, isim], Color("ef9a9a"))
			hm = -1
	if hm < 0:
		if o["motor"] < 0:
			var bos := _bos_siradan_motor()
			if bos < 0:
				_akis_ekle("🚫 %s: boş motor kalmadı" % isim, Color("ef9a9a"))
				return
			_motora_bindir(k, bos)
		o["guc_ek"] += guc
		_guc_yaz(k)
		_akis_ekle("%s %s %s attı → +%d GÜÇ (⚡%d)" % ["🌹" if gul else "🎁", isim, adi, guc, motorlar[o["motor"]].guc], Color("f48fb1") if gul else Color("ffd54f"))

func _begeni(k: String, isim: String, adet: int) -> void:
	var o := _oyuncu(k, isim)
	var once: int = o["begeni"]
	o["begeni"] += adet
	if o["motor"] >= 0 or once >= BEGENI_KATIL or o["begeni"] < BEGENI_KATIL:
		return
	if durum != Durum.LOBI:
		o["sonraki_katil"] = true
		_akis_ekle("⏳ %s beğeniyle sonraki yarışa yazıldı" % isim, Color("b0bec5"))
		return
	var bos := _bos_siradan_motor()
	if bos < 0:
		_akis_ekle("🚫 %s: boş motor kalmadı" % isim, Color("ef9a9a"))
		return
	_motora_bindir(k, bos)
	_akis_ekle("❤️ %s %d beğeniyle katıldı → %s" % [isim, BEGENI_KATIL, motorlar[bos].motor_adi], Color("f48fb1"))

func _yorum(_k: String, _isim: String, _metin: String) -> void:
	pass

func _motoru(k: String) -> Motor:
	for m in motorlar:
		if m.kullanici == k and k != "":
			return m
	return null

## boş motorlara bot biner (taban güçle)
func _dagit() -> void:
	for i in motorlar.size():
		var m := motorlar[i]
		if m.kullanici == "":
			m.ata("", "BOT", Color(0.75, 0.75, 0.78))
			m.guc_ayarla(int(motor_bilgi[i].get("guc", 1)))
	_suruculeri_dagit()

## yeni lobi: herkes motorundan iner; yarış sırasında yazılanlar katılır
func _lobi_sifirla() -> void:
	for m in motorlar:
		m.ata("", "BOT", Color(0.75, 0.75, 0.78))
	for k in oyuncular:
		var o: Dictionary = oyuncular[k]
		o["motor"] = -1
		o["guc_ek"] = int(o["sonraki_guc"])
		o["begeni"] = 0
		var hm: int = o["sonraki_motor"]
		var katil: bool = o["sonraki_katil"]
		o["sonraki_motor"] = -1
		o["sonraki_guc"] = 0
		o["sonraki_katil"] = false
		if hm >= 0 and motorlar[hm].kullanici == "":
			_motora_bindir(k, hm)
		elif katil:
			var bos := _bos_siradan_motor()
			if bos >= 0:
				_motora_bindir(k, bos)

# ------------------------------------------------------------------ akış
func _lobiye_don() -> void:
	durum = Durum.LOBI
	sayac = LOBI_SURE
	_lobi_sifirla()
	_dagit()
	_izgaraya_diz()
	dev_yazi.text = ""
	kurallar.visible = true

func _izgaraya_diz() -> void:
	# 2'li sıra; en güçlü motor en önde
	var dizi := motorlar.duplicate()
	dizi.sort_custom(func(x, y): return x.guc > y.guc)
	for i in dizi.size():
		var sira := i / 2
		var yan := 2.2 if i % 2 == 0 else -2.2
		dizi[i].yaris_hazirla(-6.0 - sira * 7.0, yan)

func _yaris_baslat() -> void:
	_dagit()
	_izgaraya_diz()
	durum = Durum.GERI_SAYIM
	zaman = -4.0
	bitis_sirasi.clear()
	kurallar.visible = false

## --sahte: video/deneme için otomatik sahte izleyiciler (beğeni, gül, özel hediye)
const SAHTE_ISIMLER := ["Ali", "Ayşe", "Mehmet", "Zeynep", "Burak", "Elif", "Emre", "Merve", "Kerem", "Selin", "Can", "Deniz", "Okan", "Ece"]
var _sahte := false
var _sahte_t := 2.0
func _sahte_adim(dt: float) -> void:
	_sahte_t -= dt
	if _sahte_t > 0.0:
		return
	_sahte_t = randf_range(0.5, 1.4)
	var i := randi() % SAHTE_ISIMLER.size()
	var k := "sahte%d" % i
	var ad: String = SAHTE_ISIMLER[i]
	var r := randf()
	if durum == Durum.LOBI:
		if r < 0.3:
			_begeni(k, ad, 100)
		elif r < 0.8:
			_hediye(k, ad, 1, "Rose")
		else:
			var ozel: Array = [["Donut", 30], ["Perfume", 20], ["Finger Heart", 5], ["TikTok", 1]].pick_random()
			_hediye(k, ad, int(ozel[1]), str(ozel[0]))
	elif durum == Durum.YARIS and oyuncular.has(k) and int(oyuncular[k]["motor"]) >= 0:
		if r < 0.55:
			_hediye(k, ad, 1, "Rose")
		elif r < 0.62:
			_hediye(k, ad, 30, "Donut")

func _process(dt: float) -> void:
	if _sahte:
		_sahte_adim(dt)
	match durum:
		Durum.LOBI:
			sayac -= dt
			_lobi_kamera(dt)
			if sayac <= 0.0:
				_yaris_baslat()
		Durum.GERI_SAYIM:
			zaman += dt
			var kalan := ceili(-zaman)
			dev_yazi.text = str(kalan) if kalan > 0 else "BAŞLA!"
			if zaman >= 0.0:
				durum = Durum.YARIS
				for m in motorlar:
					m.aktif = true
		Durum.YARIS:
			zaman += dt
			if zaman > 1.0:
				dev_yazi.text = ""
			_bitis_kontrol()
		Durum.BITIS:
			sayac -= dt
			if sayac <= 0.0:
				_lobiye_don()
	for m in motorlar:
		m.adim(dt, motorlar, zaman)
	if durum != Durum.LOBI:
		_yaris_kamera(dt)
	_arayuz_guncelle()

func _bitis_kontrol() -> void:
	var hedef := pist.uzunluk * TUR_SAYISI
	for m in motorlar:
		if not m.bitti and m.s >= hedef:
			m.bitti = true
			m.bitis_zamani = zaman
			bitis_sirasi.append(m)
			if bitis_sirasi.size() == 1:
				dev_yazi.text = "🏆 %s\nKAZANDI!" % m.isim
				_odak = m
				_odak_sure = 8.0
				sayac = 14.0
	if bitis_sirasi.size() > 0 and durum == Durum.YARIS:
		sayac -= get_process_delta_time()
		if bitis_sirasi.size() == motorlar.size() or sayac <= 0.0:
			durum = Durum.BITIS
			sayac = 8.0

func _siralama() -> Array:
	var a := motorlar.duplicate()
	a.sort_custom(func(x, y):
		var bx := bitis_sirasi.find(x)
		var by := bitis_sirasi.find(y)
		if bx >= 0 or by >= 0:
			if bx < 0: return false
			if by < 0: return true
			return bx < by
		return x.s > y.s)
	return a

# ------------------------------------------------------------------ kamera
var _odak: Motor
var _odak_sure := 0.0
var _kam_mod := 0
var _kam_sure := 0.0
var _tv_nokta := Vector3.ZERO

func _kamera_kur() -> void:
	kamera = Camera3D.new()
	kamera.fov = 62.0
	kamera.far = 2500.0
	add_child(kamera)
	kamera.current = true

func _lobi_kamera(dt: float) -> void:
	var t := Time.get_ticks_msec() * 0.00012
	var merkez := pist.nokta(-20.0, 0.0)
	var r := 22.0
	var hedef := merkez + Vector3(cos(t) * r, 7.0 + sin(t * 2.0) * 2.0, sin(t) * r)
	kamera.global_position = kamera.global_position.lerp(hedef, clampf(dt * 1.5, 0, 1))
	kamera.look_at(merkez + Vector3(0, 0.8, 0))

func _yaris_kamera(dt: float) -> void:
	var sira := _siralama()
	var lider: Motor = sira[0]
	_odak_sure -= dt
	var hedef_m: Motor = _odak if (_odak and _odak_sure > 0.0) else lider
	_kam_sure -= dt
	if _kam_sure <= 0.0:
		_kam_mod = (_kam_mod + 1 + randi() % 2) % 4
		_kam_sure = randf_range(5.0, 8.0)
		_tv_nokta = pist.nokta(hedef_m.s + 60.0, pist.kenar(hedef_m.s + 60.0).x + 4.0) + Vector3(0, 2.5, 0)
	var mp := hedef_m.global_position
	var ileri := pist.yon(hedef_m.s)
	var poz: Vector3
	var bak := mp + Vector3(0, 0.9, 0)
	match _kam_mod:
		0: # arkadan takip
			poz = mp - ileri * 6.5 + Vector3(0, 2.1, 0)
		1: # yandan, yanında giden
			poz = mp + pist.sol_vektor(hedef_m.s) * 7.0 + ileri * 2.0 + Vector3(0, 1.2, 0)
		2: # pist kenarı TV kamerası (sabit nokta, motoru izler)
			poz = _tv_nokta
			if _tv_nokta.distance_to(mp) > 90.0:
				_kam_sure = 0.0
		3: # helikopter: grubun üstü
			var ort := Vector3.ZERO
			for m in sira.slice(0, 5):
				ort += m.global_position
			ort /= min(5, sira.size())
			poz = ort - ileri * 25.0 + Vector3(0, 30.0, 0)
			bak = ort
	var hiz_k := 10.0 if _kam_mod == 2 else 4.0
	kamera.global_position = kamera.global_position.lerp(poz, clampf(dt * hiz_k, 0, 1))
	kamera.look_at(bak)

# ------------------------------------------------------------------ arayüz
func _arayuz_kur() -> void:
	ui = CanvasLayer.new()
	add_child(ui)
	var golge := func(l: Control):
		l.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
		l.add_theme_constant_override("outline_size", 12)

	var ust := ColorRect.new()
	ust.color = Color(0, 0, 0, 0.55)
	ust.position = Vector2(0, 0)
	ust.size = Vector2(1080, 150)
	ui.add_child(ust)
	baslik = Label.new()
	baslik.text = "🏍️ MOTOR DRIFT YARIŞI"
	baslik.position = Vector2(30, 14)
	baslik.add_theme_font_size_override("font_size", 64)
	golge.call(baslik)
	ui.add_child(baslik)
	alt_baslik = Label.new()
	alt_baslik.position = Vector2(34, 92)
	alt_baslik.add_theme_font_size_override("font_size", 38)
	alt_baslik.add_theme_color_override("font_color", Color("ffd54f"))
	golge.call(alt_baslik)
	ui.add_child(alt_baslik)

	var panel := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.03, 0.04, 0.08, 0.72)
	sb.set_corner_radius_all(18)
	sb.content_margin_left = 18
	sb.content_margin_right = 18
	sb.content_margin_top = 12
	sb.content_margin_bottom = 12
	panel.add_theme_stylebox_override("panel", sb)
	panel.position = Vector2(560, 170)
	panel.custom_minimum_size = Vector2(500, 0)
	ui.add_child(panel)
	liste = RichTextLabel.new()
	liste.bbcode_enabled = true
	liste.fit_content = true
	liste.scroll_active = false
	liste.custom_minimum_size = Vector2(580, 0)
	liste.add_theme_font_size_override("normal_font_size", 26)
	liste.add_theme_font_size_override("bold_font_size", 30)
	panel.add_child(liste)

	dev_yazi = Label.new()
	dev_yazi.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	dev_yazi.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	dev_yazi.position = Vector2(0, 700)
	dev_yazi.size = Vector2(1080, 400)
	dev_yazi.add_theme_font_size_override("font_size", 120)
	dev_yazi.add_theme_color_override("font_color", Color("fff59d"))
	dev_yazi.add_theme_color_override("font_outline_color", Color(0, 0, 0, 1))
	dev_yazi.add_theme_constant_override("outline_size", 28)
	ui.add_child(dev_yazi)

	kurallar = Label.new()
	kurallar.text = "❤️ %d beğeni → yarışa katıl\n🎁 Özel motorlar hediyeyle alınır (listede)\n🌹 Her gül = +%d GÜÇ → motor hızlanır\n🔥 Yarışta hediye = GÜÇ + NİTRO + ŞAHLANMA" % [BEGENI_KATIL, GUL_GUC]
	kurallar.position = Vector2(30, 1330)
	kurallar.add_theme_font_size_override("font_size", 40)
	golge.call(kurallar)
	ui.add_child(kurallar)

	akis = VBoxContainer.new()
	akis.position = Vector2(30, 1720)
	akis.size = Vector2(1020, 180)
	ui.add_child(akis)

func _akis_ekle(t: String, c: Color) -> void:
	var l := Label.new()
	l.text = t
	l.add_theme_font_size_override("font_size", 36)
	l.add_theme_color_override("font_color", c)
	l.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	l.add_theme_constant_override("outline_size", 10)
	akis.add_child(l)
	if akis.get_child_count() > 4:
		akis.get_child(0).queue_free()
	var zm := Timer.new()
	zm.wait_time = 7.0
	zm.one_shot = true
	zm.autostart = true
	zm.timeout.connect(l.queue_free)
	l.add_child(zm)

var _ui_t := 0.0
func _arayuz_guncelle() -> void:
	_ui_t -= get_process_delta_time()
	if _ui_t > 0.0:
		return
	_ui_t = 0.25
	var b := ""
	var satirlar: Array = []   # [foto ya da null, bbcode]
	match durum:
		Durum.LOBI:
			_dagit()
			alt_baslik.text = "Yarış %d sn sonra başlıyor" % ceili(sayac)
			b = "[b]🏍️ MOTORLAR[/b]  [color=#9ab](⚡ = güç)[/color]\n"
			for i in motorlar.size():
				var m := motorlar[i]
				var nasil: String = motor_bilgi[i].get("etiket", "")
				if m.kullanici != "":
					satirlar.append([m.foto.texture, " [color=#%s][b]%s[/b][/color] [color=#9ab]%s[/color] [color=#ffd54f]⚡%d[/color]\n" % [m.renk.to_html(false), m.isim, m.motor_adi, m.guc]])
				elif nasil == "":
					satirlar.append([null, "[color=#778]boş[/color] [color=#9ab]%s[/color] [color=#667]⚡%d[/color]\n" % [m.motor_adi, m.guc]])
				else:
					satirlar.append([null, "[color=#778]boş[/color] [color=#9ab]%s[/color] [color=#ffcc80]← %s[/color] [color=#667]⚡%d[/color]\n" % [m.motor_adi, nasil, m.guc]])
		_:
			var tur := 1
			var sira := _siralama()
			if sira.size() > 0:
				tur = clampi(int(sira[0].s / pist.uzunluk) + 1, 1, TUR_SAYISI)
			alt_baslik.text = "TUR %d / %d" % [tur, TUR_SAYISI] if durum != Durum.BITIS else "Yeni yarış hazırlanıyor…"
			b = "[b]🏁 SIRALAMA[/b]\n"
			for i in sira.size():
				var m: Motor = sira[i]
				var isaret := "🏆 " if i == 0 else ""
				var ad := m.isim if m.kullanici != "" else "🤖"
				var yazi := "[color=#%s]%d. %s%s[/color] [color=#9ab]%s[/color] [color=#ffd54f]⚡%d[/color]\n" % [m.renk.to_html(false), i + 1, isaret, ad, m.motor_adi, m.guc]
				if m.kullanici != "":
					satirlar.append([m.foto.texture, " " + yazi])
				else:
					satirlar.append([null, yazi])
	liste.clear()
	liste.append_text(b)
	for st in satirlar:
		if st[0] != null:
			liste.add_image(st[0], 40, 40)
		liste.append_text(st[1])

func _unhandled_key_input(e: InputEvent) -> void:
	# test tuşları: 1 = gül, 2 = donut, 3 = 100 beğeni, 4 = yarışı hemen başlat
	if not (e is InputEventKey and e.pressed):
		return
	match (e as InputEventKey).keycode:
		KEY_1: _hediye("test%d" % (randi() % 8), "Test%d" % (randi() % 8), 1, "Rose")
		KEY_2: _hediye("zengin", "ZenginAbi", 30, "Donut")
		KEY_3: _begeni("begenen%d" % (randi() % 10), "Beğenen%d" % (randi() % 10), 100)
		KEY_4: if durum == Durum.LOBI: sayac = 0.1
