extends Node3D

# TAHT KAVGASI — TikTok canli yayin oyunu (dikey 9:16). Acilis: --yayin --taht (TAHT_BASLAT.bat)
#
#   ❤  BEGENI_ESIK (200) begeni yapan izleyicinin karakteri en alt basamaga iner (doluysa sirada bekler)
#   🌹 Gul (1 jeton)       : bir ust basamaga cikar. Basamak doluysa birine vurur, o bir alta duser.
#      5-29 jetonluk hediye: HEDIYE_ADIM basamak birden. Oyunda degilse hediye atan hemen girer.
#   🍩 Donut (30+ jeton)   : zirvedeki tahta oturur (bos olana, ya da tercih ettigine). Tahttaki duser.
#   💬 "kral" / "kraliçe"  : taht tercihi.  Yorumlar karakterin ustunde balonda gorunur.
# 9 basamak + zirve (2 taht = 10 kat). Kapasite asagidan yukari azalir (KAPASITE).
# Kral/kralice oturur, izler; kafalarinda tac. Herkes dans paketinden farkli dans eder.
#
# Test tuslari: F2 10 kisi begeniyle katilir, F3 yorum, F4 gul, F5 gul serisi x5, F6 donut,
#   F7 40 kisi katilir, F8 oyunda olmayan biri gul atar, F9 FPS.
# Bayraklar: --taht-sahte (otomatik sahte izleyici), --taht-dolu=N (N kisiyle basla),
#   --taht-begeni=200, --taht-afk=600 (sn; sira varken en alttaki hareketsizler cikar, 0 = kapali)

const KAPASITE := [45, 30, 22, 16, 12, 8, 6, 4, 2]
const BASAMAK := 9
const YUK := 1.5          # basamak yuksekligi
const DER := 2.1          # basamak derinligi
const ZIRVE_DER := 6.4
const ZIRVE_GEN := 12.5
const OLCEK := 0.95       # karakter olcegi
const KRAL_OLCEK := 2.1   # tahttakiler iri gorunsun
const TAHT_OLCEK_BOY := 4.8
const DONUT_JETON := 30
const HEDIYE_ADIM_JETON := 5
const HEDIYE_ADIM := 3
const ADIM_ARALIGI := 0.45
const BALON_SURESI := 6.0
const SIRA_SINIRI := 600
const TAHT_DOSYA := "res://Assetler/DruidTaht/taht_%d.glb"
const TAHT_ADET := 8
const TAC := {"kral": "res://Assetler/Taclar/kral_taci.fbx", "kralice": "res://Assetler/Taclar/kralice_taci.glb"}
const REKOR_DOSYA := "user://taht_rekor.json"

enum D { YOK, SIRA, BASAMAK, TAHT }

var begeni_esik := 200
var afk_suresi := 600.0

var _kisiler: Dictionary = {}           # kullanici -> kisi (Dictionary)
var _yuvalar: Array = []                # basamak (0..13) -> Array[Vector3] (dunya konumu, ayak)
var _sahip: Array = []                  # basamak -> Array[String] (yuva sahibi, "" bos)
var _sira: Array[String] = []           # sirada bekleyen kullanicilar
var _taht := {"kral": "", "kralice": ""}
var _taht_dugum := {}                   # "kral"/"kralice" -> Node3D (taht modeli burada)
var _taht_oturak := {}                  # -> Vector3 dunya, oturma yuzeyi
var _taclar := {}                       # -> Node3D (takili tac)
var _basamak_yazi: Array[Label3D] = []
var _rekor := {"isim": "", "sure": 0.0}

var _kamera: Camera3D
var _karakter_kok: Node3D
var _rozet_kat: CanvasLayer
var _rozet_kok: Control
var _hud: CanvasLayer
var _akis_kutu: VBoxContainer
var _kart := {}                         # "kral"/"kralice" -> {"av", "ad", "sure", "harf"}
var _sira_yazi: Label
var _sira_adlar: Label
var _begeni_kutu: VBoxContainer
var _durum_yazi: Label
var _fps_yazi: Label
var _hazirlik_yazi: Label
var _rekor_yazi: Label
var _ust_kutu: Control

var _halka_shader: Shader
var _renk_doku: Dictionary = {}
var _avatar_doku: Dictionary = {}       # kullanici -> Texture2D
var _avatar_sira: Array[String] = []
var _avatar_istenen: Dictionary = {}
var _http_bos: Array[HTTPRequest] = []

var _hazir_idler: Array[int] = []
var _isinma_sira: Array[int] = []
var _isinma_t := 0.0

var _sahte := false
var _sahte_no := 0
var _sahte_t := 0.0
var _hud_t := 0.0
var _afk_t := 0.0


func _simdi() -> float:
	return Time.get_ticks_msec() / 1000.0


func _ready() -> void:
	begeni_esik = maxi(1, int(Ag.arg.get("taht-begeni", "200")))
	afk_suresi = float(Ag.arg.get("taht-afk", "600"))
	_sahte = Ag.arg.has("taht-sahte") or Ag.arg.has("yayin-sahte")
	_halka_shader = Shader.new()
	_halka_shader.code = HALKA_SHADER
	_rekor_oku()
	_dunya_kur()
	_basamaklar_kur()
	_zirve_kur()
	_hud_kur()
	for i in 4:
		var h := HTTPRequest.new()
		h.timeout = 8.0
		add_child(h)
		h.request_completed.connect(_avatar_geldi.bind(h))
		_http_bos.append(h)
	TikTok.yorum_geldi.connect(_yorum)
	TikTok.hediye_geldi.connect(_hediye)
	TikTok.hediye_seri_geldi.connect(_hediye_seri)
	TikTok.begeni_geldi.connect(_begeni)
	TikTok.izleyici_olayi.connect(_izleyici_olayi)
	TikTok.durum_degisti.connect(func(_b: bool, _m: String) -> void: _durum_guncelle())
	_durum_guncelle()
	_isinma_baslat()
	if Ses.has_method("_oyun_muzigi_cal"):
		Ses.call("_oyun_muzigi_cal")
	Ag.kaydet("[TAHT] Taht Kavgasi basladi (begeni esigi %d)" % begeni_esik)
	if Ag.arg.has("taht-donut"):   # test: iki kisi tercih yazip donut atar
		get_tree().create_timer(4.0).timeout.connect(func() -> void:
			for t in [["kral_test", "kral olacağım"], ["kralice_test", "kraliçe benim"]]:
				TikTok.test_mesaji({"tur": "yorum", "kullanici": t[0], "isim": t[0], "metin": t[1]})
				TikTok.test_mesaji({"tur": "hediye", "kullanici": t[0], "isim": t[0], "hediye": "Donut", "adet": 1, "jeton": 30}))
	if Ag.arg.has("taht-doldur"):   # test: tum basamaklari doldur (performans)
		get_tree().create_timer(float(Ag.arg["taht-doldur"])).timeout.connect(func() -> void:
			for i in range(1, BASAMAK + 1):
				for y in KAPASITE[i - 1]:
					var ad := _sahte_ad()
					var p := _kisi(ad, ad)
					_yuvaya_koy(p, i, y)
					_karakter_yap(p, _yuva_konum(i, y)))
	if Ag.arg.has("taht-dolu"):
		var n := int(Ag.arg["taht-dolu"])
		for i in n:
			var ad := _sahte_ad()
			TikTok.test_mesaji({"tur": "begeni", "kullanici": ad, "isim": ad, "adet": begeni_esik})


# ================================================================ dunya

func _dunya_kur() -> void:
	var env := Environment.new()
	var sky := Sky.new()
	var sm := ProceduralSkyMaterial.new()
	sm.sky_top_color = Color(0.05, 0.03, 0.16)
	sm.sky_horizon_color = Color(0.45, 0.16, 0.42)
	sm.ground_bottom_color = Color(0.03, 0.02, 0.06)
	sm.ground_horizon_color = Color(0.3, 0.12, 0.3)
	sm.sun_angle_max = 30.0
	sky.sky_material = sm
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.9
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.glow_enabled = true
	env.glow_intensity = 0.7
	env.glow_bloom = 0.08
	env.fog_enabled = true
	env.fog_light_color = Color(0.32, 0.16, 0.38)
	env.fog_density = 0.006
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)

	var gunes := DirectionalLight3D.new()
	gunes.rotation_degrees = Vector3(-48, 28, 0)
	gunes.light_color = Color(1.0, 0.86, 0.72)
	gunes.light_energy = 1.25
	gunes.shadow_enabled = true
	gunes.directional_shadow_max_distance = 70.0
	add_child(gunes)
	var dolgu := DirectionalLight3D.new()
	dolgu.rotation_degrees = Vector3(-25, -150, 0)
	dolgu.light_color = Color(0.55, 0.6, 1.0)
	dolgu.light_energy = 0.45
	add_child(dolgu)

	_kamera = Camera3D.new()
	_kamera.keep_aspect = Camera3D.KEEP_WIDTH
	_kamera.fov = 48.0
	_kamera.far = 300.0
	add_child(_kamera)
	_kamera_ayarla()

	var zemin := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(160, 160)
	zemin.mesh = pm
	zemin.position = Vector3(0, 0, 10)
	zemin.material_override = _malzeme(Color(0.12, 0.09, 0.16), 0.9)
	add_child(zemin)

	_karakter_kok = Node3D.new()
	_karakter_kok.name = "Karakterler"
	add_child(_karakter_kok)


func _kamera_ayarla() -> void:
	var hedef := Vector3(0, YUK * float(Ag.arg.get("taht-hedef", "5.2")), -DER * float(BASAMAK) * 0.5 - 1.5)
	var aci := deg_to_rad(float(Ag.arg.get("taht-aci", "20")))
	var uzak := float(Ag.arg.get("taht-uzak", "29"))
	if Ag.arg.get("taht-yakin", "") == "alt":   # test: en alt basamak yakin
		hedef = Vector3(0, YUK + 1.0, -0.8)
		aci = deg_to_rad(6.0)
		uzak = 7.0
	elif Ag.arg.has("taht-yakin"):   # test: zirveye yakin bakis (taht/tac ayari)
		hedef = Vector3(0, YUK * (BASAMAK + 1) + 2.0, -float(BASAMAK) * DER - 2.5)
		aci = deg_to_rad(8.0)
		uzak = float(Ag.arg["taht-yakin"]) if String(Ag.arg["taht-yakin"]) != "1" else 10.0
	_kamera.position = hedef + Vector3(0, sin(aci), cos(aci)) * uzak
	_kamera.look_at(hedef, Vector3.UP)


func _malzeme(renk: Color, puruz := 0.7, isik := 0.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = renk
	m.roughness = puruz
	if isik > 0.0:
		m.emission_enabled = true
		m.emission = renk
		m.emission_energy_multiplier = isik
	return m


func _genislik(i: int) -> float:   # i: 1..14
	return lerpf(16.5, 8.0, pow(float(i - 1) / float(BASAMAK - 1), 0.85))


func _on_z(i: int) -> float:   # i. basamagin on kenari
	return -float(i - 1) * DER


func _basamaklar_kur() -> void:
	var arka := -float(BASAMAK) * DER - ZIRVE_DER
	for i in range(1, BASAMAK + 1):
		var g := _genislik(i)
		var ust := YUK * i
		var on := _on_z(i)
		var kutu := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(g, ust, on - arka)
		kutu.mesh = bm
		kutu.position = Vector3(0, ust / 2.0, (on + arka) / 2.0)
		var t := float(i - 1) / float(BASAMAK - 1)
		kutu.material_override = _malzeme(Color(0.27, 0.25, 0.36).lerp(Color(0.55, 0.38, 0.5), t), 0.85)
		add_child(kutu)
		# altin kenar seridi
		var serit := MeshInstance3D.new()
		var sb := BoxMesh.new()
		sb.size = Vector3(g + 0.02, 0.09, 0.09)
		serit.mesh = sb
		serit.position = Vector3(0, ust - 0.03, on + 0.01)
		serit.material_override = _malzeme(Color(1.0, 0.72, 0.25).lerp(Color(1.0, 0.85, 0.35), t), 0.3, 1.6)
		serit.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(serit)
		# basamak numarasi + doluluk (on yuzde, solda)
		var y := Label3D.new()
		y.font_size = 48
		y.pixel_size = 0.0075
		y.outline_size = 14
		y.modulate = Color(1, 0.92, 0.7)
		y.outline_modulate = Color(0.1, 0.03, 0.1)
		y.position = Vector3(-g / 2.0 + 0.2, ust - YUK * 0.52, on + 0.03)
		y.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		y.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(y)
		_basamak_yazi.append(y)
		_yuva_kur(i, g, ust, on)
	for i in BASAMAK:
		_basamak_yazi_guncelle(i + 1)


func _yuva_kur(i: int, g: float, ust: float, on: float) -> void:
	var kap: int = KAPASITE[i - 1]
	var sira_sayisi := 3 if kap >= 21 else (2 if kap >= 8 else 1)
	var sirada := ceili(float(kap) / sira_sayisi)
	var bosluk := minf(1.0, (g - 2.2) / maxf(1.0, sirada))
	var derinlikler: Array = [[DER * 0.45], [DER * 0.28, DER * 0.7], [DER * 0.2, DER * 0.5, DER * 0.8]][sira_sayisi - 1]
	var liste: Array = []
	var kalan := kap
	for r in sira_sayisi:
		var z: float = on - float(derinlikler[r])
		var n := mini(sirada, kalan)
		kalan -= n
		for c in n:
			var x := (c - (n - 1) / 2.0) * bosluk + (bosluk * 0.5 if r % 2 == 1 else 0.0)
			liste.append([r, absf(x), Vector3(x + 0.45, ust, z)])
	# on sira ve ortadan disa dogru dolsun
	liste.sort_custom(func(a: Array, b: Array) -> bool: return a[0] < b[0] or (a[0] == b[0] and a[1] < b[1]))
	var yuvalar: Array = []
	var sahip: Array = []
	for e: Array in liste:
		yuvalar.append(e[2])
		sahip.append("")
	_yuvalar.append(yuvalar)
	_sahip.append(sahip)


func _basamak_yazi_guncelle(i: int) -> void:
	var dolu := 0
	for s: String in _sahip[i - 1]:
		if s != "":
			dolu += 1
	_basamak_yazi[i - 1].text = "%d. kat  %d/%d" % [i, dolu, KAPASITE[i - 1]]


func _zirve_kur() -> void:
	var ust := YUK * (BASAMAK + 1)
	var on := -float(BASAMAK) * DER
	var arka := on - ZIRVE_DER
	var kutu := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(ZIRVE_GEN, ust, ZIRVE_DER)
	kutu.mesh = bm
	kutu.position = Vector3(0, ust / 2.0, (on + arka) / 2.0)
	kutu.material_override = _malzeme(Color(0.62, 0.42, 0.52), 0.8)
	add_child(kutu)
	var serit := MeshInstance3D.new()
	var sb := BoxMesh.new()
	sb.size = Vector3(ZIRVE_GEN + 0.02, 0.12, 0.12)
	serit.mesh = sb
	serit.position = Vector3(0, ust - 0.04, on + 0.01)
	serit.material_override = _malzeme(Color(1, 0.85, 0.35), 0.3, 2.2)
	add_child(serit)
	# kirmizi hali
	var hali := MeshInstance3D.new()
	var hb := BoxMesh.new()
	hb.size = Vector3(ZIRVE_GEN - 1.2, 0.04, ZIRVE_DER - 0.6)
	hali.mesh = hb
	hali.position = Vector3(0, ust + 0.02, (on + arka) / 2.0)
	hali.material_override = _malzeme(Color(0.62, 0.05, 0.1), 0.9)
	add_child(hali)
	# zirve yazisi
	var yazi := Label3D.new()
	yazi.text = "%d · ZİRVE" % (BASAMAK + 1)
	yazi.font_size = 72
	yazi.pixel_size = 0.009
	yazi.outline_size = 16
	yazi.modulate = Color(1, 0.86, 0.4)
	yazi.outline_modulate = Color(0.15, 0.02, 0.08)
	yazi.position = Vector3(0, ust - YUK * 0.5, on + 0.03)
	add_child(yazi)
	# arka sutunlar + mesale isiklari
	for x in [-ZIRVE_GEN / 2.0 + 0.5, ZIRVE_GEN / 2.0 - 0.5]:
		var s := MeshInstance3D.new()
		var cm := CylinderMesh.new()
		cm.top_radius = 0.28
		cm.bottom_radius = 0.34
		cm.height = 7.0
		s.mesh = cm
		s.position = Vector3(x, ust + 3.5, arka + 0.5)
		s.material_override = _malzeme(Color(0.85, 0.75, 0.6), 0.6)
		add_child(s)
		var ates := MeshInstance3D.new()
		var sp := SphereMesh.new()
		sp.radius = 0.32
		sp.height = 0.64
		ates.mesh = sp
		ates.position = Vector3(x, ust + 7.25, arka + 0.5)
		ates.material_override = _malzeme(Color(1, 0.55, 0.15), 0.5, 5.0)
		add_child(ates)
		var isik := OmniLight3D.new()
		isik.light_color = Color(1, 0.65, 0.3)
		isik.light_energy = 2.5
		isik.omni_range = 9.0
		isik.position = ates.position + Vector3(0, 0, 1.0)
		add_child(isik)
	# tahtlar
	for hangi in ["kral", "kralice"]:
		var d := Node3D.new()
		d.name = "Taht_" + hangi
		d.position = Vector3(-3.0 if hangi == "kral" else 3.0, ust, arka + 3.2)
		add_child(d)
		_taht_dugum[hangi] = d
		_taht_degistir(hangi)
		var spot := SpotLight3D.new()
		spot.light_color = Color(1, 0.85, 0.55) if hangi == "kral" else Color(0.75, 0.8, 1.0)
		spot.light_energy = 6.0
		spot.spot_range = 18.0
		spot.spot_angle = 28.0
		spot.position = d.position + Vector3(0, 8.5, 5.5)
		add_child(spot)
		spot.look_at(d.position + Vector3(0, 1.0, 0), Vector3.UP)
		# taht etiketi (bosken)
		var e := Label3D.new()
		e.name = "BosYazi"
		e.text = "KRAL TAHTI\n🍩 Donut at, otur!" if hangi == "kral" else "KRALİÇE TAHTI\n🍩 Donut at, otur!"
		e.font_size = 56
		e.pixel_size = 0.011
		e.outline_size = 12
		e.modulate = Color(1, 0.9, 0.55) if hangi == "kral" else Color(0.75, 0.85, 1.0)
		e.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		e.no_depth_test = true
		e.position = Vector3(0, TAHT_OLCEK_BOY + 0.6, 0.3)
		d.add_child(e)


func _taht_degistir(hangi: String) -> void:
	var d: Node3D = _taht_dugum[hangi]
	for c in d.get_children():
		if c.name.begins_with("Model"):
			c.queue_free()
	var no := randi_range(1, TAHT_ADET)
	var sahne := load(TAHT_DOSYA % no) as PackedScene
	var m: Node3D = sahne.instantiate() if sahne else Node3D.new()
	var kutu := _kutu(m)
	var olc := TAHT_OLCEK_BOY / maxf(0.1, kutu.size.y)
	var sar := Node3D.new()
	sar.name = "Model%d" % no
	sar.add_child(m)
	m.position = -Vector3(kutu.get_center().x, kutu.position.y, kutu.get_center().z)
	sar.scale = Vector3.ONE * olc
	sar.rotation.y = float(Ag.arg.get("taht-yon", "0")) * PI / 180.0
	d.add_child(sar)
	# oturak: tahtin on yarisi, boyun ~%31'i
	_taht_oturak[hangi] = d.position + Vector3(0, TAHT_OLCEK_BOY * float(Ag.arg.get("taht-oturak", "0.3")), 0.25)


func _kutu(kok: Node) -> AABB:
	var sonuc := AABB()
	var ilk := true
	for n in kok.find_children("*", "MeshInstance3D", true, false):
		var mi := n as MeshInstance3D
		if mi.mesh == null:
			continue
		var xf := Transform3D.IDENTITY
		var d: Node = mi
		while d != null and d != kok:
			if d is Node3D:
				xf = (d as Node3D).transform * xf
			d = d.get_parent()
		var a := xf * mi.mesh.get_aabb()
		sonuc = a if ilk else sonuc.merge(a)
		ilk = false
	return sonuc


# ================================================================ karakter hazirligi (isinma)
# 45 modeli arka planda yukler; her biri icin animasyon kutuphanesi ve danslari bir kez hesaplanir
# (canli yayinda ilk gelen izleyicide takilma olmasin).

func _isinma_baslat() -> void:
	var idler: Array[int] = []
	for i in range(1, KarakterKatalogu.SAYI + 1):
		idler.append(i)
	idler.shuffle()
	# hafif glb'ler (1-20) once hazir olsun
	idler.sort_custom(func(a: int, b: int) -> bool: return (a <= 20) and not (b <= 20))
	# Arka plan (threaded) yukleme kullanilmiyor: ayni modeli ana is parcacigi da yukleyince
	# (ilk izleyici geldiginde) oyun ara sira tamamen kilitleniyordu. Kare basina bir model, sirayla.
	_isinma_sira = idler


func _isinma_adim() -> void:
	if _isinma_sira.is_empty():
		return
	_isinma_tek(_isinma_sira.pop_front())


func _isinma_tek(id: int) -> void:
	var m := KarakterKatalogu.model_olustur(id)
	add_child(m)
	m.visible = false
	var tamam := m.find_child("Animasyon", true, false) != null
	for d in _dans_havuzu(id):
		AnimasyonKatalogu.dans_ekle(m, id, d)
	AnimasyonKatalogu.oturma_ekle(m, id)
	m.queue_free()
	if tamam and not _hazir_idler.has(id):
		_hazir_idler.append(id)


func _dans_havuzu(id: int) -> Array[String]:
	var n := AnimasyonKatalogu.DANSLAR.size()
	return ["dans_%d" % ((id * 5) % n + 1), "dans_%d" % ((id * 5 + 4) % n + 1), "dans_%d" % ((id * 5 + 9) % n + 1)]


func _karakter_sec(k: String) -> int:
	if _hazir_idler.is_empty():
		var id := randi_range(1, 20)
		_isinma_sira.erase(id)
		_isinma_tek(id)
		if _hazir_idler.is_empty():
			return id
	var istenen := absi(hash(k)) % KarakterKatalogu.SAYI + 1
	if _hazir_idler.has(istenen):
		return istenen
	return _hazir_idler[absi(hash(k + "#")) % _hazir_idler.size()]


# ================================================================ kisi / karakter

func _kisi(k: String, isim: String) -> Dictionary:
	if not _kisiler.has(k):
		_kisiler[k] = {"k": k, "isim": isim if isim != "" else k, "durum": D.YOK, "basamak": 0, "yuva": -1,
			"taht": "", "tercih": "", "begeni": 0, "kok": null, "bekleyen": 0, "hareket": 0.0,
			"son_aktif": _simdi(), "balon": null, "balon_t": 0.0, "kalp_t": 0.0, "taht_t": 0.0, "dans_t": 0.0}
	var p: Dictionary = _kisiler[k]
	if isim != "":
		p["isim"] = isim
	return p


func _kisa_ad(p: Dictionary) -> String:
	var s := String(p["isim"]).strip_edges()
	if s == "":
		s = String(p["k"])
	return s.left(14) + ("…" if s.length() > 14 else "")


func _karakter_yap(p: Dictionary, konum: Vector3) -> void:
	if p["kok"] != null:
		return
	var kid := _karakter_sec(String(p["k"]))
	p["kid"] = kid
	var kok := Node3D.new()
	kok.name = "K_" + String(p["k"]).validate_node_name()
	kok.position = konum
	kok.rotation.y = PI   # kameraya (+Z) bak
	kok.scale = Vector3.ONE * OLCEK
	_karakter_kok.add_child(kok)
	var model := KarakterKatalogu.model_olustur(kid)
	kok.add_child(model)
	KarakterKatalogu.golge_ayarla(model, GeometryInstance3D.SHADOW_CASTING_SETTING_OFF)
	p["kok"] = kok
	p["model"] = model
	p["ap"] = model.find_child("Animasyon", true, false)
	p["isk"] = AnimasyonKatalogu._iskelet_bul(model)
	var havuz := _dans_havuzu(kid)
	p["dans"] = havuz[randi() % havuz.size()]
	p["dans_t"] = randf_range(18.0, 35.0)
	for d in havuz:
		AnimasyonKatalogu.dans_ekle(model, kid, d)
	# bas yuksekligi (kok uzayinda) -> rozet bunun ustunde
	var bas := 1.75
	var isk := p["isk"] as Skeleton3D
	if isk:
		var b := isk.find_bone("HeadTop_End")
		if b < 0:
			b = isk.find_bone("Head")
		if b >= 0:
			bas = kok.to_local(isk.global_transform * isk.get_bone_global_rest(b).origin).y + (0.0 if isk.get_bone_name(b) == "HeadTop_End" else 0.25)
	p["bas_y"] = bas * OLCEK
	_dans_et(p, 0.0)
	var ap := p["ap"] as AnimationPlayer
	if ap and ap.current_animation != "":
		ap.seek(randf() * ap.current_animation_length, true)
	_rozet_yap(p)


func _karakter_sil(p: Dictionary) -> void:
	var kok := p["kok"] as Node3D
	if kok:
		kok.queue_free()
	p["kok"] = null
	for a in ["rozet", "balon"]:
		var c := p.get(a) as Control
		if c:
			c.queue_free()
		p[a] = null


func _oynat(p: Dictionary, ad: String, gecis := 0.15) -> void:
	var ap := p.get("ap") as AnimationPlayer
	if ap and ap.has_animation(ad):
		ap.play(ad, gecis)


func _dans_et(p: Dictionary, gecis := 0.3) -> void:
	if int(p["durum"]) == D.TAHT:
		_oynat(p, "otur_3" if p["taht"] == "kral" else "otur_1", gecis)
	else:
		_oynat(p, String(p["dans"]), gecis)


# Bir sure sonra (karakter hala ayni hareketteyse) dansa don
func _sonra_dans(p: Dictionary, sn: float) -> void:
	var kok := p["kok"] as Node3D
	if kok == null:
		return
	var no := int(p.get("hareket_no", 0)) + 1
	p["hareket_no"] = no
	get_tree().create_timer(sn).timeout.connect(func() -> void:
		if p["kok"] == kok and int(p.get("hareket_no", 0)) == no:
			_dans_et(p))


# Yay cizerek hedefe zipla
func _ucur(p: Dictionary, hedef: Vector3, sure := 0.42, yukseklik := 1.1) -> void:
	var kok := p["kok"] as Node3D
	if kok == null:
		return
	var tw_eski := p.get("tw") as Tween
	if tw_eski and tw_eski.is_valid():
		tw_eski.kill()
	var bas := kok.position
	var tw := create_tween()
	tw.tween_method(func(t: float) -> void:
		if is_instance_valid(kok):
			kok.position = bas.lerp(hedef, t) + Vector3.UP * sin(PI * t) * yukseklik, 0.0, 1.0, sure)
	p["tw"] = tw


# ================================================================ basamak mantigi

func _bos_yuva(i: int) -> int:
	var s: Array = _sahip[i - 1]
	for y in s.size():
		if s[y] == "":
			return y
	return -1


func _rastgele_sahip(i: int) -> String:
	var l: Array[String] = []
	for s: String in _sahip[i - 1]:
		if s != "":
			l.append(s)
	return l.pick_random() if not l.is_empty() else ""


func _yuvadan_cik(p: Dictionary) -> void:
	var i := int(p["basamak"])
	var y := int(p["yuva"])
	if i >= 1 and y >= 0 and _sahip[i - 1][y] == p["k"]:
		_sahip[i - 1][y] = ""
		_basamak_yazi_guncelle(i)
	p["basamak"] = 0
	p["yuva"] = -1


func _yuvaya_koy(p: Dictionary, i: int, y: int) -> void:
	_sahip[i - 1][y] = p["k"]
	p["basamak"] = i
	p["yuva"] = y
	p["durum"] = D.BASAMAK
	_basamak_yazi_guncelle(i)


func _yuva_konum(i: int, y: int) -> Vector3:
	return _yuvalar[i - 1][y]


# Kisiyi i. basamaga yerlestir; doluysa rastgele biri bir alta duser (zincirleme). i<=0: siranin basina.
func _yerlestir(p: Dictionary, i: int, dusuren := "") -> void:
	if i <= 0:
		_siraya_don(p)
		return
	var y := _bos_yuva(i)
	if y < 0:
		var kurban: Dictionary = _kisiler[_rastgele_sahip(i)]
		y = int(kurban["yuva"])
		_yuvadan_cik(kurban)
		_yuvaya_koy(p, i, y)
		_dusur(kurban, i - 1, String(p["k"]))
	else:
		_yuvaya_koy(p, i, y)
	if p["kok"] == null:
		_karakter_yap(p, _yuva_konum(i, y) + Vector3(0, 7.0, 0))
	_ucur(p, _yuva_konum(i, y), 0.5, 0.6)
	_oynat(p, "zipla", 0.1)
	_sonra_dans(p, 0.7)
	if dusuren != "":
		pass


# Kurban bir basamak duser (dusen yerine baskasini da itebilir)
func _dusur(kurban: Dictionary, i: int, vuran: String) -> void:
	if i <= 0:
		_akis("%s sahneden düştü, sırada 1." % _kisa_ad(kurban), RENK_GRI)
		_siraya_don(kurban)
		return
	var y := _bos_yuva(i)
	if y < 0:
		var alt: Dictionary = _kisiler[_rastgele_sahip(i)]
		y = int(alt["yuva"])
		_yuvadan_cik(alt)
		_yuvaya_koy(kurban, i, y)
		_dusur(alt, i - 1, String(kurban["k"]))
	else:
		_yuvaya_koy(kurban, i, y)
	_oynat(kurban, "takil", 0.08)
	_ucur(kurban, _yuva_konum(i, y), 0.55, 0.5)
	_sonra_dans(kurban, 1.4)


func _siraya_don(p: Dictionary) -> void:
	_yuvadan_cik(p)
	_karakter_sil(p)
	p["durum"] = D.SIRA
	p["bekleyen"] = 0
	_sira.erase(String(p["k"]))
	_sira.insert(0, String(p["k"]))


# Sirada bekleyenleri en alttaki bos yerlere al
func _siradan_al() -> void:
	while not _sira.is_empty():
		var y := _bos_yuva(1)
		if y < 0:
			return
		var p: Dictionary = _kisiler[_sira[0]]
		_sira.remove_at(0)
		if int(p["durum"]) != D.SIRA:
			continue
		_yuvaya_koy(p, 1, y)
		_karakter_yap(p, _yuva_konum(1, y) + Vector3(0, 7.0, 0))
		_ucur(p, _yuva_konum(1, y), 0.6, 0.3)
		_oynat(p, "dus", 0.0)
		_sonra_dans(p, 0.65)
		_akis("%s sahneye girdi!" % _kisa_ad(p), RENK_YESIL)


func _katil(p: Dictionary, oncelikli: bool) -> void:
	match int(p["durum"]):
		D.BASAMAK, D.TAHT:
			return
		D.SIRA:
			if oncelikli:   # hediye: siradan hemen sahneye
				_sira.erase(String(p["k"]))
				p["durum"] = D.YOK
			else:
				return
	if oncelikli:
		_yerlestir(p, 1)
		_akis("%s hediyeyle sahneye daldı!" % _kisa_ad(p), RENK_PEMBE)
		return
	if _bos_yuva(1) >= 0 and _sira.is_empty():
		p["durum"] = D.SIRA
		_sira.append(String(p["k"]))
		_siradan_al()
	elif _sira.size() < SIRA_SINIRI:
		p["durum"] = D.SIRA
		_sira.append(String(p["k"]))
		_akis("%s sıraya girdi (%d.)" % [_kisa_ad(p), _sira.size()], RENK_GRI)


# Tek basamak yukari (gul). Hedef doluysa birine vurur, o bir alta duser.
func _bir_adim(p: Dictionary) -> void:
	var s := int(p["basamak"])
	if int(p["durum"]) == D.TAHT or s <= 0:
		p["bekleyen"] = 0
		return
	if s >= BASAMAK:
		p["bekleyen"] = 0
		_balon_goster(p, "Tahta çıkmak için 🍩 Donut lazım!", true)
		return
	var hedef := s + 1
	var y := _bos_yuva(hedef)
	if y < 0:
		var kurban: Dictionary = _kisiler[_rastgele_sahip(hedef)]
		var ky := int(kurban["yuva"])
		var py := int(p["yuva"])
		_yuvadan_cik(kurban)
		_yuvadan_cik(p)
		_yuvaya_koy(p, hedef, ky)
		_yuvaya_koy(kurban, s, py)
		_oynat(p, "pas", 0.08)
		_ucur(p, _yuva_konum(hedef, ky), 0.4, 0.9)
		_sonra_dans(p, 1.0)
		_oynat(kurban, "takil", 0.08)
		_ucur(kurban, _yuva_konum(s, py), 0.6, 0.6)
		_sonra_dans(kurban, 1.4)
		Ses.cal("darbe", -6.0, 0.1)
		_akis("%s ➜ %s'i %d. basamaktan düşürdü!" % [_kisa_ad(p), _kisa_ad(kurban), hedef], RENK_TURUNCU)
	else:
		_yuvadan_cik(p)
		_yuvaya_koy(p, hedef, y)
		_oynat(p, "zipla", 0.08)
		_ucur(p, _yuva_konum(hedef, y), 0.42, 1.0)
		_sonra_dans(p, 0.75)
	p["bekleyen"] = int(p["bekleyen"]) - 1
	p["hareket"] = ADIM_ARALIGI
	if s == 1:
		_siradan_al()


func _cik(p: Dictionary, adim: int) -> void:
	if int(p["durum"]) == D.TAHT:
		_balon_goster(p, "👑 Zaten tahttayım!", true)
		return
	if int(p["durum"]) != D.BASAMAK:
		_katil(p, true)
		adim -= 1   # sahneye girmek ilk adim
	p["bekleyen"] = clampi(int(p["bekleyen"]) + adim, 0, BASAMAK)


func _taht_al(p: Dictionary) -> void:
	var hangi := String(p["tercih"])
	if int(p["durum"]) == D.TAHT:
		if hangi == "" or hangi == p["taht"]:
			_balon_goster(p, "👑 Tahtım sağlam!", true)
			return
	if hangi == "":
		if _taht["kral"] == "" and _taht["kralice"] == "":
			hangi = ["kral", "kralice"].pick_random()
		elif _taht["kral"] == "":
			hangi = "kral"
		elif _taht["kralice"] == "":
			hangi = "kralice"
		else:   # ikisi de dolu: en uzun suredir oturan devrilir
			hangi = "kral" if float(_kisiler[_taht["kral"]]["taht_t"]) <= float(_kisiler[_taht["kralice"]]["taht_t"]) else "kralice"
	# onceki yeri bosalt
	match int(p["durum"]):
		D.BASAMAK:
			_yuvadan_cik(p)
			_siradan_al()
		D.SIRA:
			_sira.erase(String(p["k"]))
		D.TAHT:
			_tahttan_kalk(p, false)
	p["bekleyen"] = 0
	var eski := String(_taht[hangi])
	if eski != "" and eski != p["k"]:
		var e: Dictionary = _kisiler[eski]
		var sure := _simdi() - float(e["taht_t"])
		_tahttan_kalk(e, true)
		_dusur(e, BASAMAK, String(p["k"]))
		_akis("👑 %s tahtı kaptı! %s devrildi (%s hüküm)" % [_kisa_ad(p), _kisa_ad(e), _sure_yazi(sure)], RENK_ALTIN)
		Ses.cal("darbe_agir", -3.0)
	else:
		_akis("👑 %s %s TAHTINA oturdu!" % [_kisa_ad(p), "KRAL" if hangi == "kral" else "KRALİÇE"], RENK_ALTIN)
	_taht[hangi] = p["k"]
	p["durum"] = D.TAHT
	p["taht"] = hangi
	p["taht_t"] = _simdi()
	_taht_degistir(hangi)
	(_taht_dugum[hangi] as Node3D).get_node("BosYazi").visible = false
	var oturak: Vector3 = _taht_oturak[hangi]
	if p["kok"] == null:
		_karakter_yap(p, oturak + Vector3(0, 9.0, 2.0))
	AnimasyonKatalogu.oturma_ekle(p["model"], int(p["kid"]))
	var kok := p["kok"] as Node3D
	var model := p["model"] as Node3D
	var tw := create_tween()
	_ucur(p, oturak, 0.9, 3.0)
	_oynat(p, "zipla", 0.1)
	p["hareket_no"] = int(p.get("hareket_no", 0)) + 1
	tw.tween_interval(0.85)
	tw.tween_callback(func() -> void:
		if p["kok"] != kok or int(p["durum"]) != D.TAHT:
			return
		model.position.y = _oturma_inisi(p)
		kok.scale = Vector3.ONE * OLCEK * KRAL_OLCEK
		_dans_et(p, 0.2)
		_tac_tak(p)
		_havai_fisek(oturak + Vector3(0, 2.5, 0.5), hangi == "kral")
		Ses.cal("tezahurat", -4.0))
	_rozet_stil(p)
	_hud_guncelle()


func _oturma_inisi(p: Dictionary) -> float:
	var isk := p["isk"] as Skeleton3D
	var kok := p["kok"] as Node3D
	if isk == null or isk.find_bone("Hips") < 0:
		return -0.9
	var model := p["model"] as Node3D
	var eski := model.position
	model.position = Vector3.ZERO
	var kalca := kok.to_local(isk.global_transform * isk.get_bone_global_rest(isk.find_bone("Hips")).origin).y
	model.position = eski
	return -(kalca - 0.12)


func _tahttan_kalk(p: Dictionary, tac_dussun: bool) -> void:
	var hangi := String(p["taht"])
	if hangi == "":
		return
	var sure := _simdi() - float(p["taht_t"])
	if sure > float(_rekor["sure"]):
		_rekor = {"isim": _kisa_ad(p), "sure": sure}
		_rekor_yaz()
	if _taht[hangi] == p["k"]:
		_taht[hangi] = ""
		(_taht_dugum[hangi] as Node3D).get_node("BosYazi").visible = true
	var tac := _taclar.get(hangi) as Node3D
	_taclar.erase(hangi)
	if tac:
		if tac_dussun:
			var tw := create_tween().set_parallel()
			tw.tween_property(tac, "position", tac.position + Vector3(randf_range(-1.5, 1.5), -2.5, 2.5), 1.0).set_ease(Tween.EASE_IN)
			tw.tween_property(tac, "rotation", Vector3(randf_range(2, 5), randf_range(-3, 3), randf_range(2, 5)), 1.0)
			tw.tween_property(tac, "scale", Vector3.ZERO, 0.4).set_delay(0.9)
			tw.chain().tween_callback(tac.queue_free)
		else:
			tac.queue_free()
	p["taht"] = ""
	p["durum"] = D.YOK
	var model := p.get("model") as Node3D
	if model:
		model.position = Vector3.ZERO
	var kok := p.get("kok") as Node3D
	if kok:
		kok.scale = Vector3.ONE * OLCEK
	_rozet_stil(p)


# ================================================================ taclar

var _tac_sahne: Dictionary = {}


func _tac_tak(p: Dictionary) -> void:
	var hangi := String(p["taht"])
	var eski := _taclar.get(hangi) as Node3D
	if eski:
		eski.queue_free()
	if not _tac_sahne.has(hangi):
		_tac_sahne[hangi] = load(TAC[hangi])
	var sahne := _tac_sahne[hangi] as PackedScene
	if sahne == null:
		return
	var m := sahne.instantiate() as Node3D
	var kutu := _kutu(m)
	var ic := Node3D.new()
	ic.add_child(m)
	m.position = -Vector3(kutu.get_center().x, kutu.position.y, kutu.get_center().z)
	var gen := maxf(kutu.size.x, kutu.size.z)
	ic.scale = Vector3.ONE * (float(Ag.arg.get("taht-tac", "0.25")) * OLCEK * KRAL_OLCEK / maxf(gen, 0.001))
	var tac := Node3D.new()
	tac.name = "Tac_" + hangi
	tac.add_child(ic)
	_karakter_kok.add_child(tac)
	_taclar[hangi] = tac
	p["tac_kemik"] = -1
	var isk := p["isk"] as Skeleton3D
	if isk:
		var b := isk.find_bone("HeadTop_End")
		p["tac_ust"] = b >= 0
		if b < 0:
			b = isk.find_bone("Head")
		p["tac_kemik"] = b
	_tac_izle(p)
	# yukaridan duserek otursun
	ic.position = Vector3(0, 1.4, 0)
	create_tween().tween_property(ic, "position", Vector3.ZERO, 0.45).set_trans(Tween.TRANS_BOUNCE).set_ease(Tween.EASE_OUT)


func _tac_izle(p: Dictionary) -> void:
	var tac := _taclar.get(String(p["taht"])) as Node3D
	var isk := p.get("isk") as Skeleton3D
	if tac == null or isk == null or int(p.get("tac_kemik", -1)) < 0:
		return
	var b := int(p["tac_kemik"])
	var xf := isk.global_transform * isk.get_bone_global_pose(b)
	var ofs := -0.075 if bool(p.get("tac_ust", false)) else 0.13
	tac.global_position = xf.origin + Vector3.UP * ofs * OLCEK * KRAL_OLCEK
	var ileri := xf.basis.z.normalized()
	tac.rotation = Vector3(0, PI, 0)
	if absf(ileri.y) < 0.9:
		pass


# ================================================================ efektler

func _havai_fisek(konum: Vector3, altin: bool) -> void:
	for i in 3:
		var p := CPUParticles3D.new()
		p.one_shot = true
		p.amount = 70
		p.lifetime = 1.6
		p.explosiveness = 0.95
		p.direction = Vector3.UP
		p.spread = 180.0
		p.initial_velocity_min = 3.5
		p.initial_velocity_max = 7.0
		p.gravity = Vector3(0, -5.0, 0)
		p.scale_amount_min = 0.6
		p.scale_amount_max = 1.2
		var sm := SphereMesh.new()
		sm.radius = 0.06
		sm.height = 0.12
		var mat := StandardMaterial3D.new()
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		mat.vertex_color_use_as_albedo = true
		mat.emission_enabled = true
		mat.emission_energy_multiplier = 3.0
		sm.material = mat
		p.mesh = sm
		var g := Gradient.new()
		var r1 := Color(1, 0.85, 0.3) if altin else Color(0.6, 0.8, 1)
		var r2: Color = [Color(1, 0.3, 0.6), Color(0.5, 1, 0.6), Color(1, 1, 1)][i]
		g.set_color(0, r1)
		g.set_color(1, Color(r2.r, r2.g, r2.b, 0.0))
		p.color_ramp = g
		p.position = konum + Vector3(randf_range(-1.5, 1.5), randf_range(0, 1.5), 0)
		add_child(p)
		get_tree().create_timer(i * 0.35).timeout.connect(func() -> void: p.emitting = true)
		get_tree().create_timer(3.0 + i * 0.35).timeout.connect(p.queue_free)


# ================================================================ rozet (isim + profil fotografi) ve balon

const HALKA_SHADER := """
shader_type canvas_item;
uniform vec4 halka : source_color = vec4(1.0);
uniform float kalinlik = 0.08;
void fragment() {
	float r = length(UV - vec2(0.5));
	vec4 c = texture(TEXTURE, UV);
	float ic = 1.0 - smoothstep(0.5 - kalinlik - 0.02, 0.5 - kalinlik, r);
	float dis = 1.0 - smoothstep(0.48, 0.5, r);
	COLOR = vec4(mix(halka.rgb, c.rgb, ic), dis);
}
"""


func _renk_dokusu(r: Color) -> Texture2D:
	var a := r.to_html(false)
	if not _renk_doku.has(a):
		var img := Image.create(48, 48, false, Image.FORMAT_RGBA8)
		for y in 48:
			for x in 48:
				img.set_pixel(x, y, r.lerp(r.darkened(0.45), float(y) / 48.0))
		_renk_doku[a] = ImageTexture.create_from_image(img)
	return _renk_doku[a]


func _rozet_yap(p: Dictionary) -> void:
	var c := Control.new()
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_rozet_kok.add_child(c)
	var av := TextureRect.new()
	av.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	av.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	av.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var mat := ShaderMaterial.new()
	mat.shader = _halka_shader
	av.material = mat
	var kid := int(p.get("kid", 1))
	av.texture = _avatar_doku.get(p["k"], _renk_dokusu(KarakterKatalogu.renk(kid)))
	c.add_child(av)
	var harf := Label.new()
	harf.text = _kisa_ad(p).left(1).to_upper()
	harf.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	harf.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	harf.add_theme_color_override("font_color", Color.WHITE)
	harf.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.6))
	harf.add_theme_constant_override("outline_size", 4)
	harf.visible = not _avatar_doku.has(p["k"])
	c.add_child(harf)
	var ad := Label.new()
	ad.text = _kisa_ad(p)
	ad.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	ad.add_theme_color_override("font_outline_color", Color(0.05, 0.02, 0.08))
	ad.mouse_filter = Control.MOUSE_FILTER_IGNORE
	c.add_child(ad)
	p["rozet"] = c
	p["rozet_av"] = av
	p["rozet_harf"] = harf
	p["rozet_ad"] = ad
	_rozet_stil(p)
	_avatar_iste(String(p["k"]))


func _rozet_stil(p: Dictionary) -> void:
	var c := p.get("rozet") as Control
	if c == null:
		return
	var av := p["rozet_av"] as TextureRect
	var harf := p["rozet_harf"] as Label
	var ad := p["rozet_ad"] as Label
	var i := int(p["basamak"])
	var taht := int(p["durum"]) == D.TAHT
	var boy := 74.0 if taht else (30.0 + clampf((i - 1) * 1.6, 0.0, 16.0))
	var yazi := 26 if taht else (15 + int(clampf((i - 1) * 0.6, 0, 6)))
	av.size = Vector2(boy, boy)
	av.position = Vector2(-boy / 2.0, -boy - yazi - 4)
	harf.size = av.size
	harf.position = av.position
	harf.add_theme_font_size_override("font_size", int(boy * 0.5))
	ad.add_theme_font_size_override("font_size", yazi)
	ad.add_theme_constant_override("outline_size", 6 if not taht else 9)
	ad.size = Vector2(320, yazi + 6)
	ad.position = Vector2(-160, -yazi - 4)
	var halka := Color(1, 1, 1, 0.95)
	if taht:
		halka = Color(1, 0.8, 0.2) if p["taht"] == "kral" else Color(0.55, 0.75, 1.0)
	elif i >= BASAMAK - 2:
		halka = Color(1, 0.65, 0.3)
	(av.material as ShaderMaterial).set_shader_parameter("halka", halka)
	ad.add_theme_color_override("font_color", halka if taht else Color(1, 1, 1))
	c.z_index = 10 if taht else i


func _balon_goster(p: Dictionary, metin: String, sistem := false) -> void:
	if p.get("rozet") == null:
		return
	var b := p.get("balon") as PanelContainer
	if b == null:
		b = PanelContainer.new()
		b.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var st := StyleBoxFlat.new()
		st.bg_color = Color(1, 1, 1, 0.96)
		st.set_corner_radius_all(16)
		st.content_margin_left = 12
		st.content_margin_right = 12
		st.content_margin_top = 6
		st.content_margin_bottom = 8
		st.shadow_color = Color(0, 0, 0, 0.35)
		st.shadow_size = 4
		b.add_theme_stylebox_override("panel", st)
		var l := Label.new()
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.custom_minimum_size = Vector2(0, 0)
		l.add_theme_color_override("font_color", Color(0.1, 0.06, 0.12))
		l.add_theme_font_size_override("font_size", 20)
		b.add_child(l)
		_rozet_kok.add_child(b)
		p["balon"] = b
	var lab := b.get_child(0) as Label
	var m := metin.strip_edges().left(80)
	lab.text = m
	var kisa := m.length() <= 24
	lab.autowrap_mode = TextServer.AUTOWRAP_OFF if kisa else TextServer.AUTOWRAP_WORD_SMART
	lab.custom_minimum_size = Vector2(0 if kisa else 250, 0)
	b.size = b.get_combined_minimum_size()
	(b.get_theme_stylebox("panel") as StyleBoxFlat).bg_color = Color(1, 0.95, 0.75, 0.97) if sistem else Color(1, 1, 1, 0.96)
	b.z_index = 50
	b.visible = true
	b.modulate.a = 1.0
	p["balon_t"] = BALON_SURESI


func _kalp(p: Dictionary) -> void:
	var c := p.get("rozet") as Control
	if c == null or _simdi() - float(p["kalp_t"]) < 1.2:
		return
	p["kalp_t"] = _simdi()
	var l := Label.new()
	l.text = "❤"
	l.add_theme_font_size_override("font_size", 26)
	l.add_theme_color_override("font_color", Color(1, 0.25, 0.45))
	l.position = c.position + Vector2(randf_range(-30, 10), -70)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_rozet_kok.add_child(l)
	var tw := create_tween().set_parallel()
	tw.tween_property(l, "position:y", l.position.y - 70, 1.1)
	tw.tween_property(l, "modulate:a", 0.0, 1.1).set_delay(0.3)
	tw.chain().tween_callback(l.queue_free)


# ---------------------------------------------------------------- profil fotograflari (kopru /avatar)

func _avatar_iste(k: String) -> void:
	if _avatar_doku.has(k) or _avatar_istenen.has(k) or TikTok.avatar_adresi(k) == "":
		return
	_avatar_istenen[k] = true
	_avatar_sira.append(k)
	_avatar_sonraki()


func _avatar_sonraki() -> void:
	while not _http_bos.is_empty() and not _avatar_sira.is_empty():
		var k: String = _avatar_sira.pop_front()
		var h: HTTPRequest = _http_bos.pop_back()
		h.set_meta("k", k)
		if h.request(TikTok.avatar_adresi(k)) != OK:
			_http_bos.append(h)


func _avatar_geldi(sonuc: int, kod: int, _basliklar: PackedStringArray, govde: PackedByteArray, h: HTTPRequest) -> void:
	var k := String(h.get_meta("k", ""))
	_http_bos.append(h)
	if sonuc == HTTPRequest.RESULT_SUCCESS and kod == 200 and govde.size() > 16:
		var img := Image.new()
		var hata := ERR_FILE_UNRECOGNIZED
		if govde[0] == 0xFF and govde[1] == 0xD8:
			hata = img.load_jpg_from_buffer(govde)
		elif govde[0] == 0x89 and govde[1] == 0x50:
			hata = img.load_png_from_buffer(govde)
		elif govde[0] == 0x52 and govde[8] == 0x57:   # RIFF....WEBP
			hata = img.load_webp_from_buffer(govde)
		if hata == OK and not img.is_empty():
			img.resize(96, 96, Image.INTERPOLATE_BILINEAR)
			var t := ImageTexture.create_from_image(img)
			_avatar_doku[k] = t
			var p: Dictionary = _kisiler.get(k, {})
			if p.get("rozet_av") != null:
				(p["rozet_av"] as TextureRect).texture = t
				(p["rozet_harf"] as Label).visible = false
			_hud_guncelle()
	_avatar_istenen.erase(k)
	_avatar_sonraki()


# ================================================================ TikTok olaylari

static func _sade(metin: String) -> String:
	return metin.replace("İ", "i").replace("I", "ı").to_lower().replace("ı", "i").replace("ç", "c").strip_edges()


func _begeni(k: String, isim: String, adet: int) -> void:
	if k == "":
		return
	var p := _kisi(k, isim)
	p["son_aktif"] = _simdi()
	p["begeni"] = int(p["begeni"]) + adet
	match int(p["durum"]):
		D.YOK:
			if int(p["begeni"]) >= begeni_esik:
				Ag.kaydet("[TAHT] %s %d begeniyle katildi" % [k, int(p["begeni"])])
				_katil(p, false)
			_begeni_listesi_guncelle()
		D.BASAMAK, D.TAHT:
			_kalp(p)


func _yorum(k: String, isim: String, metin: String) -> void:
	if k == "":
		return
	var p := _kisi(k, isim)
	p["son_aktif"] = _simdi()
	var m := _sade(metin)
	if m.contains("kralice") or m.contains("queen"):
		p["tercih"] = "kralice"
	elif m.contains("kral") or m.contains("king"):
		p["tercih"] = "kral"
	if p.get("rozet") != null:
		_balon_goster(p, metin)
	elif int(p["durum"]) == D.YOK and (m.begins_with("katil") or m == "+"):
		_akis("%s: ❤ %d/%d beğeni yap, sahneye gir!" % [_kisa_ad(p), int(p["begeni"]), begeni_esik], RENK_GRI)


func _hediye(k: String, isim: String, hediye: String, adet: int, jeton: int) -> void:
	if k == "":
		return
	var p := _kisi(k, isim)
	p["son_aktif"] = _simdi()
	var h := _sade(hediye)
	Ag.kaydet("[TAHT] hediye %s: %s x%d (%d jeton)" % [k, hediye, adet, jeton])
	if jeton >= DONUT_JETON or h.contains("donut"):
		_taht_al(p)
		return
	var adim := adet * (HEDIYE_ADIM if jeton >= HEDIYE_ADIM_JETON else 1)
	_akis("🌹 %s %s attı: +%d basamak" % [_kisa_ad(p), hediye, adim], RENK_PEMBE)
	_cik(p, adim)


# Seri bitti: ilk hediye zaten islendi, kalan (adet-1) kadar daha
func _hediye_seri(k: String, isim: String, hediye: String, adet: int, jeton: int) -> void:
	if k == "" or adet <= 1:
		return
	var h := _sade(hediye)
	if jeton >= DONUT_JETON or h.contains("donut"):
		return
	var p := _kisi(k, isim)
	var adim := (adet - 1) * (HEDIYE_ADIM if jeton >= HEDIYE_ADIM_JETON else 1)
	_akis("🌹 %s %s serisi x%d: +%d basamak daha" % [_kisa_ad(p), hediye, adet, adim], RENK_PEMBE)
	_cik(p, adim)


func _izleyici_olayi(tur: String, k: String, isim: String) -> void:
	if tur == "takip":
		_akis("⭐ %s takip etti!" % isim.left(14), RENK_MAVI)
	elif tur == "paylasim":
		_akis("📣 %s paylaştı!" % isim.left(14), RENK_MAVI)
	if k != "" and _kisiler.has(k):
		_kisiler[k]["son_aktif"] = _simdi()


# ================================================================ dongu

func _process(delta: float) -> void:
	_isinma_t -= delta
	if _isinma_t <= 0.0 and not _isinma_sira.is_empty():
		_isinma_t = 0.05
		_isinma_adim()
	var simdi := _simdi()
	for k: String in _kisiler:
		var p: Dictionary = _kisiler[k]
		var kok := p["kok"] as Node3D
		if kok == null:
			continue
		if float(p["hareket"]) > 0.0:
			p["hareket"] = float(p["hareket"]) - delta
		elif int(p["bekleyen"]) > 0:
			_bir_adim(p)
		# arada dans degistir
		p["dans_t"] = float(p["dans_t"]) - delta
		if float(p["dans_t"]) <= 0.0:
			p["dans_t"] = randf_range(18.0, 35.0)
			var ap := p["ap"] as AnimationPlayer
			if int(p["durum"]) == D.BASAMAK and ap and ap.current_animation == String(p["dans"]):
				var havuz := _dans_havuzu(int(p["kid"]))
				p["dans"] = havuz[randi() % havuz.size()]
				_dans_et(p, 0.6)
		if int(p["durum"]) == D.TAHT:
			_tac_izle(p)
		_rozet_konumla(p, kok)
		if float(p["balon_t"]) > 0.0:
			p["balon_t"] = float(p["balon_t"]) - delta
			var b := p["balon"] as Control
			if b:
				if float(p["balon_t"]) < 0.6:
					b.modulate.a = maxf(0.0, float(p["balon_t"]) / 0.6)
				if float(p["balon_t"]) <= 0.0:
					b.visible = false
	_hud_t -= delta
	if _hud_t <= 0.0:
		_hud_t = 0.5
		_hud_guncelle()
		_begeni_listesi_guncelle()
		_siradan_al()
	_afk_t -= delta
	if _afk_t <= 0.0:
		_afk_t = 15.0
		_afk_temizle(simdi)
	if _sahte:
		_sahte_otomatik(delta)
	if _fps_yazi.visible:
		_fps_yazi.text = "FPS %d · kişi %d · hazır model %d/45" % [Engine.get_frames_per_second(), _sahnedeki_sayi(), _hazir_idler.size()]
	_hazirlik_yazi.visible = not _isinma_sira.is_empty()
	if _hazirlik_yazi.visible:
		_hazirlik_yazi.text = "Karakterler hazırlanıyor %d/45" % _hazir_idler.size()


func _rozet_konumla(p: Dictionary, kok: Node3D) -> void:
	var c := p.get("rozet") as Control
	if c == null:
		return
	var dunya := kok.global_position + Vector3.UP * (float(p["bas_y"]) * kok.scale.y / OLCEK + 0.08)
	if int(p["durum"]) == D.TAHT:
		dunya.y += (p["model"] as Node3D).position.y * kok.scale.y + 0.25
	if _kamera.is_position_behind(dunya):
		c.visible = false
		return
	c.visible = true
	c.position = _kamera.unproject_position(dunya)
	var b := p.get("balon") as Control
	if b and b.visible:
		b.size = b.get_combined_minimum_size()
		var av := p["rozet_av"] as TextureRect
		b.position = c.position + Vector2(-b.size.x / 2.0, av.position.y - b.size.y - 8.0)
		if _ust_kutu and b.position.y < _ust_kutu.get_rect().end.y + 6.0:   # ust panelin altina girmesin
			b.position.y = maxf(_ust_kutu.get_rect().end.y + 6.0, c.position.y + 6.0)
			b.position.x += b.size.x / 2.0 + 50.0 if p["taht"] == "kral" else -b.size.x / 2.0 - 50.0


func _sahnedeki_sayi() -> int:
	var n := 0
	for s: Array in _sahip:
		for k: String in s:
			if k != "":
				n += 1
	return n + (1 if _taht["kral"] != "" else 0) + (1 if _taht["kralice"] != "" else 0)


# Sira varken en alt basamakta uzun suredir hicbir sey yapmayan (begeni/yorum/hediye) yer acar
func _afk_temizle(simdi: float) -> void:
	if afk_suresi <= 0.0 or _sira.is_empty():
		return
	for k: String in _sahip[0].duplicate():
		if k == "" or _sira.is_empty():
			continue
		var p: Dictionary = _kisiler[k]
		if simdi - float(p["son_aktif"]) > afk_suresi:
			_yuvadan_cik(p)
			_karakter_sil(p)
			p["durum"] = D.YOK
			p["begeni"] = 0
			_akis("%s uzun süre hareketsiz kaldı, yer açıldı" % _kisa_ad(p), RENK_GRI)
	_siradan_al()


# ================================================================ HUD

const RENK_ALTIN := Color(1, 0.84, 0.3)
const RENK_PEMBE := Color(1, 0.5, 0.75)
const RENK_YESIL := Color(0.5, 1, 0.6)
const RENK_TURUNCU := Color(1, 0.62, 0.3)
const RENK_MAVI := Color(0.55, 0.8, 1)
const RENK_GRI := Color(0.85, 0.85, 0.9)


func _etiket(metin: String, boy: int, renk := Color.WHITE, kalin := 8) -> Label:
	var l := Label.new()
	l.text = metin
	l.add_theme_font_size_override("font_size", boy)
	l.add_theme_color_override("font_color", renk)
	l.add_theme_color_override("font_outline_color", Color(0.06, 0.02, 0.1))
	l.add_theme_constant_override("outline_size", kalin)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


func _panel_stil(renk := Color(0.08, 0.03, 0.14, 0.72), kenar := Color(1, 0.8, 0.35, 0.8)) -> StyleBoxFlat:
	var st := StyleBoxFlat.new()
	st.bg_color = renk
	st.set_corner_radius_all(22)
	st.border_color = kenar
	st.set_border_width_all(3)
	st.content_margin_left = 18
	st.content_margin_right = 18
	st.content_margin_top = 10
	st.content_margin_bottom = 10
	return st


func _hud_kur() -> void:
	_rozet_kat = CanvasLayer.new()
	_rozet_kat.layer = 1
	add_child(_rozet_kat)
	_rozet_kok = Control.new()
	_rozet_kok.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_rozet_kok.set_anchors_preset(Control.PRESET_FULL_RECT)
	_rozet_kat.add_child(_rozet_kok)

	_hud = CanvasLayer.new()
	_hud.layer = 2
	add_child(_hud)
	var kok := Control.new()
	kok.set_anchors_preset(Control.PRESET_FULL_RECT)
	kok.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hud.add_child(kok)

	# ust: baslik + kral/kralice kartlari
	var ust := VBoxContainer.new()
	ust.set_anchors_preset(Control.PRESET_TOP_WIDE)
	ust.offset_top = 28
	ust.offset_left = 30
	ust.offset_right = -30
	ust.add_theme_constant_override("separation", 10)
	ust.mouse_filter = Control.MOUSE_FILTER_IGNORE
	kok.add_child(ust)
	_ust_kutu = ust
	var baslik := _etiket("👑 TAHT KAVGASI 👑", 76, RENK_ALTIN, 16)
	baslik.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	ust.add_child(baslik)
	var kartlar := HBoxContainer.new()
	kartlar.add_theme_constant_override("separation", 20)
	kartlar.alignment = BoxContainer.ALIGNMENT_CENTER
	ust.add_child(kartlar)
	for hangi in ["kral", "kralice"]:
		kartlar.add_child(_kart_yap(hangi))
	var kural := PanelContainer.new()
	kural.add_theme_stylebox_override("panel", _panel_stil(Color(0.1, 0.02, 0.12, 0.66), Color(1, 0.5, 0.75, 0.7)))
	var kl := _etiket("❤ %d beğeni = sahneye gir    🌹 Gül = 1 basamak çık\n🍩 Donut = TAHTA OTUR    💬 \"kral\" / \"kraliçe\" yaz = taht seç" % begeni_esik, 30, Color.WHITE, 6)
	kl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	kural.add_child(kl)
	ust.add_child(kural)

	# sol: olay akisi (piramit daraldikca yanlar bos)
	_akis_kutu = VBoxContainer.new()
	_akis_kutu.position = Vector2(26, 640)
	_akis_kutu.size = Vector2(420, 600)
	_akis_kutu.add_theme_constant_override("separation", 6)
	_akis_kutu.mouse_filter = Control.MOUSE_FILTER_IGNORE
	kok.add_child(_akis_kutu)

	# sag ust: rekor
	_rekor_yazi = _etiket("", 24, RENK_ALTIN, 6)
	_rekor_yazi.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_rekor_yazi.offset_left = -460
	_rekor_yazi.offset_right = -30
	_rekor_yazi.offset_top = 640
	_rekor_yazi.offset_bottom = 720
	_rekor_yazi.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	kok.add_child(_rekor_yazi)

	# alt: sira + begeni ilerlemesi + baglanti
	var alt := PanelContainer.new()
	alt.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	alt.offset_left = 30
	alt.offset_right = -30
	alt.offset_bottom = -26
	alt.offset_top = -26
	alt.grow_vertical = Control.GROW_DIRECTION_BEGIN
	alt.add_theme_stylebox_override("panel", _panel_stil())
	alt.mouse_filter = Control.MOUSE_FILTER_IGNORE
	kok.add_child(alt)
	var altk := HBoxContainer.new()
	altk.add_theme_constant_override("separation", 24)
	alt.add_child(altk)
	var sol := VBoxContainer.new()
	sol.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	altk.add_child(sol)
	_sira_yazi = _etiket("Sırada: 0", 34, RENK_ALTIN)
	sol.add_child(_sira_yazi)
	_sira_adlar = _etiket("", 22, RENK_GRI, 5)
	_sira_adlar.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_sira_adlar.custom_minimum_size = Vector2(500, 0)
	sol.add_child(_sira_adlar)
	_begeni_kutu = VBoxContainer.new()
	_begeni_kutu.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_begeni_kutu.add_theme_constant_override("separation", 4)
	altk.add_child(_begeni_kutu)
	_durum_yazi = _etiket("", 18, RENK_GRI, 4)
	sol.add_child(_durum_yazi)
	_fps_yazi = _etiket("", 20, Color(0.7, 1, 0.7), 4)
	_fps_yazi.position = Vector2(30, 600)
	_fps_yazi.visible = Ag.arg.has("taht-fps")
	kok.add_child(_fps_yazi)
	_hazirlik_yazi = _etiket("", 22, RENK_GRI, 4)
	_hazirlik_yazi.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_hazirlik_yazi.offset_left = -460
	_hazirlik_yazi.offset_right = -30
	_hazirlik_yazi.offset_top = 600
	_hazirlik_yazi.offset_bottom = 632
	_hazirlik_yazi.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	kok.add_child(_hazirlik_yazi)
	_hud_guncelle()


func _kart_yap(hangi: String) -> Control:
	var kral := hangi == "kral"
	var renk := RENK_ALTIN if kral else Color(0.6, 0.8, 1)
	var p := PanelContainer.new()
	p.custom_minimum_size = Vector2(590, 150)
	p.add_theme_stylebox_override("panel", _panel_stil(Color(0.08, 0.03, 0.14, 0.75), renk))
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 16)
	p.add_child(h)
	var avk := Control.new()
	avk.custom_minimum_size = Vector2(120, 120)
	h.add_child(avk)
	var av := TextureRect.new()
	av.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	av.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	av.size = Vector2(120, 120)
	var mat := ShaderMaterial.new()
	mat.shader = _halka_shader
	mat.set_shader_parameter("halka", renk)
	mat.set_shader_parameter("kalinlik", 0.06)
	av.material = mat
	av.texture = _renk_dokusu(Color(0.25, 0.2, 0.3))
	avk.add_child(av)
	var harf := _etiket("?", 56, Color.WHITE, 6)
	harf.size = Vector2(120, 120)
	harf.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	harf.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	avk.add_child(harf)
	var v := VBoxContainer.new()
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	h.add_child(v)
	v.add_child(_etiket("👑 KRAL" if kral else "💎 KRALİÇE", 30, renk, 6))
	var ad := _etiket("Boş taht", 38, Color.WHITE, 8)
	ad.clip_text = true
	ad.custom_minimum_size = Vector2(380, 0)
	v.add_child(ad)
	var sure := _etiket("🍩 Donut at, otur!", 24, RENK_GRI, 5)
	v.add_child(sure)
	_kart[hangi] = {"av": av, "ad": ad, "sure": sure, "harf": harf}
	return p


func _sure_yazi(sn: float) -> String:
	var s := int(sn)
	return "%d:%02d" % [s / 60, s % 60] if s < 3600 else "%d:%02d:%02d" % [s / 3600, (s / 60) % 60, s % 60]


func _hud_guncelle() -> void:
	if _kart.is_empty():
		return
	for hangi: String in _kart:
		var c: Dictionary = _kart[hangi]
		var k := String(_taht[hangi])
		if k == "":
			(c["ad"] as Label).text = "Boş taht"
			(c["sure"] as Label).text = "🍩 Donut at, otur!"
			(c["av"] as TextureRect).texture = _renk_dokusu(Color(0.25, 0.2, 0.3))
			(c["harf"] as Label).text = "?"
			(c["harf"] as Label).visible = true
		else:
			var p: Dictionary = _kisiler[k]
			(c["ad"] as Label).text = _kisa_ad(p)
			(c["sure"] as Label).text = "⏱ %s hüküm sürüyor" % _sure_yazi(_simdi() - float(p["taht_t"]))
			var t: Texture2D = _avatar_doku.get(k)
			(c["av"] as TextureRect).texture = t if t else _renk_dokusu(KarakterKatalogu.renk(int(p.get("kid", 1))))
			(c["harf"] as Label).text = _kisa_ad(p).left(1).to_upper()
			(c["harf"] as Label).visible = t == null
	_sira_yazi.text = "⏳ Sırada bekleyen: %d" % _sira.size() if not _sira.is_empty() else "✅ En altta yer var: %d boş" % _bos_sayisi(1)
	var adlar: Array[String] = []
	for i in mini(6, _sira.size()):
		adlar.append("%d. %s" % [i + 1, _kisa_ad(_kisiler[_sira[i]])])
	_sira_adlar.text = "  ".join(adlar) if not adlar.is_empty() else "Beğeni at, sahneye çık! 🌹 Gül atan sırayı atlar."
	if _rekor["isim"] != "":
		_rekor_yazi.text = "🏆 En uzun hüküm\n%s · %s" % [_rekor["isim"], _sure_yazi(float(_rekor["sure"]))]


func _bos_sayisi(i: int) -> int:
	var n := 0
	for s: String in _sahip[i - 1]:
		if s == "":
			n += 1
	return n


var _begeni_son := 0.0


func _begeni_listesi_guncelle() -> void:
	if _simdi() - _begeni_son < 0.3:
		return
	_begeni_son = _simdi()
	var adaylar: Array = []
	for k: String in _kisiler:
		var p: Dictionary = _kisiler[k]
		if int(p["durum"]) == D.YOK and int(p["begeni"]) > 0:
			adaylar.append(p)
	adaylar.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return int(a["begeni"]) > int(b["begeni"]))
	for c in _begeni_kutu.get_children():
		c.queue_free()
	if adaylar.is_empty():
		return
	_begeni_kutu.add_child(_etiket("❤ Sahneye en yakın", 24, RENK_PEMBE, 5))
	for i in mini(3, adaylar.size()):
		var p: Dictionary = adaylar[i]
		var satir := HBoxContainer.new()
		satir.add_theme_constant_override("separation", 10)
		var ad := _etiket(_kisa_ad(p), 22, Color.WHITE, 5)
		ad.custom_minimum_size = Vector2(190, 0)
		ad.clip_text = true
		satir.add_child(ad)
		var bar := ProgressBar.new()
		bar.max_value = begeni_esik
		bar.value = int(p["begeni"])
		bar.show_percentage = false
		bar.custom_minimum_size = Vector2(220, 22)
		bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		var dolgu := StyleBoxFlat.new()
		dolgu.bg_color = Color(1, 0.35, 0.6)
		dolgu.set_corner_radius_all(10)
		var zemin := StyleBoxFlat.new()
		zemin.bg_color = Color(1, 1, 1, 0.15)
		zemin.set_corner_radius_all(10)
		bar.add_theme_stylebox_override("fill", dolgu)
		bar.add_theme_stylebox_override("background", zemin)
		satir.add_child(bar)
		satir.add_child(_etiket("%d/%d" % [int(p["begeni"]), begeni_esik], 20, RENK_GRI, 4))
		_begeni_kutu.add_child(satir)


func _akis(metin: String, renk: Color) -> void:
	if _akis_kutu == null:
		return
	var p := PanelContainer.new()
	var st := StyleBoxFlat.new()
	st.bg_color = Color(0.07, 0.02, 0.12, 0.7)
	st.set_corner_radius_all(14)
	st.border_color = renk
	st.border_width_left = 5
	st.content_margin_left = 12
	st.content_margin_right = 10
	st.content_margin_top = 5
	st.content_margin_bottom = 6
	p.add_theme_stylebox_override("panel", st)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var l := _etiket(metin, 22, renk, 4)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.custom_minimum_size = Vector2(380, 0)
	p.add_child(l)
	_akis_kutu.add_child(p)
	_akis_kutu.move_child(p, 0)
	while _akis_kutu.get_child_count() > 7:
		var son := _akis_kutu.get_child(_akis_kutu.get_child_count() - 1)
		_akis_kutu.remove_child(son)
		son.queue_free()
	var tw := create_tween()
	tw.tween_interval(14.0)
	tw.tween_property(p, "modulate:a", 0.0, 1.0)
	tw.tween_callback(p.queue_free)


func _durum_guncelle() -> void:
	if _durum_yazi == null:
		return
	var renk := "🟢" if TikTok.tiktok_bagli else ("🟡" if TikTok.kopru_bagli else "🔴")
	_durum_yazi.text = "%s %s" % [renk, TikTok.durum_metni]


# ================================================================ rekor

func _rekor_oku() -> void:
	if not FileAccess.file_exists(REKOR_DOSYA):
		return
	var v: Variant = JSON.parse_string(FileAccess.get_file_as_string(REKOR_DOSYA))
	if v is Dictionary:
		_rekor = {"isim": String(v.get("isim", "")), "sure": float(v.get("sure", 0.0))}


func _rekor_yaz() -> void:
	var f := FileAccess.open(REKOR_DOSYA, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(_rekor))


# ================================================================ test: sahte izleyiciler

const SAHTE_ADLAR := ["ayse.23", "kral_mehmet", "zeynep_44", "bursali16", "emre_k", "deniz.x", "can07", "elif_s",
	"burak_tr", "selin.k", "umut34", "melis_06", "kemal.b", "hulya35", "murat_g", "ece.yy", "onur61", "gizem.m",
	"tolga_42", "sevgi.t", "baris55", "irem.c", "serkan_1", "dilara.z", "efe_27", "nazli.o", "cem.66", "pinar_d"]
const SAHTE_YORUMLAR := ["kral benim!", "selam millet", "kraliçe olacağım", "aşağı in!", "hadi gül atın", "😂😂😂",
	"tahtı kimse alamaz", "beni itmeyin ya", "donut geliyor", "yukarı yukarı!", "bu dans efsane", "kral", "kraliçe"]


func _sahte_ad() -> String:
	_sahte_no += 1
	var ad: String = SAHTE_ADLAR[_sahte_no % SAHTE_ADLAR.size()]
	return ad if _sahte_no <= SAHTE_ADLAR.size() else "%s%d" % [ad.left(10), _sahte_no]


func _sahnedekiler() -> Array:
	var l: Array = []
	for k: String in _kisiler:
		if int(_kisiler[k]["durum"]) in [D.BASAMAK, D.TAHT]:
			l.append(k)
	return l


func _sahte_hediye(k: String, ad: String, jeton: int, adet := 1) -> void:
	TikTok.test_mesaji({"tur": "hediye", "kullanici": k, "isim": k, "hediye": ad, "adet": 1, "jeton": jeton})
	if adet > 1:
		get_tree().create_timer(1.5).timeout.connect(func() -> void:
			TikTok.test_mesaji({"tur": "hediyeSeri", "kullanici": k, "isim": k, "hediye": ad, "adet": adet, "jeton": jeton}))


func _sahte_katil(n: int) -> void:
	for i in n:
		var ad := _sahte_ad()
		# gercek akis gibi: begeniler parca parca gelir
		for j in 4:
			TikTok.test_mesaji({"tur": "begeni", "kullanici": ad, "isim": ad, "adet": ceili(begeni_esik / 4.0)})


func _unhandled_input(event: InputEvent) -> void:
	var t := event as InputEventKey
	if t == null or not t.pressed or t.echo:
		return
	var l := _sahnedekiler()
	match t.keycode:
		KEY_F2:
			_sahte_katil(10)
		KEY_F3:
			for i in 5:
				if not l.is_empty():
					var k: String = l.pick_random()
					TikTok.test_mesaji({"tur": "yorum", "kullanici": k, "isim": k, "metin": SAHTE_YORUMLAR.pick_random()})
		KEY_F4:
			if not l.is_empty():
				_sahte_hediye(l.pick_random(), "Gül", 1)
		KEY_F5:
			if not l.is_empty():
				_sahte_hediye(l.pick_random(), "Gül", 1, 5)
		KEY_F6:
			if not l.is_empty():
				_sahte_hediye(l.pick_random(), "Donut", 30)
		KEY_F7:
			_sahte_katil(40)
		KEY_F8:
			_sahte_hediye(_sahte_ad(), "Gül", 1)
		KEY_F9:
			_fps_yazi.visible = not _fps_yazi.visible
		_:
			return
	get_viewport().set_input_as_handled()


func _sahte_otomatik(delta: float) -> void:
	_sahte_t -= delta
	if _sahte_t > 0.0:
		return
	_sahte_t = 0.3
	var l := _sahnedekiler()
	var r := randf()
	if r < 0.12 or l.size() < 8:
		_sahte_katil(1)
	elif r < 0.30:
		TikTok.test_mesaji({"tur": "yorum", "kullanici": l.pick_random(), "isim": "", "metin": SAHTE_YORUMLAR.pick_random()})
	elif r < 0.50:
		_sahte_hediye(l.pick_random(), "Gül", 1)
	elif r < 0.53:
		_sahte_hediye(l.pick_random(), "Gül", 1, randi_range(2, 8))
	elif r < 0.545:
		_sahte_hediye(l.pick_random(), "Donut", 30)
	elif r < 0.6:
		TikTok.test_mesaji({"tur": "begeni", "kullanici": l.pick_random(), "isim": "", "adet": 15})
