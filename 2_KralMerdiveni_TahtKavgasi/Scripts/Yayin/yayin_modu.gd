extends Node

# Autoload: Yayin. TikTok canli yayin modu (--yayin ile acilir, yoksa hicbir sey yapmaz).
# Sandalye Kapmaca'yi izleyicilerle sonsuz turlar halinde oynatir:
#   SIRA:  izleyiciler yoruma "katil" yazar ve siraya girer. Her tura ilk 15 kisi girer,
#          digerleri sirada bekler. Hediye atan sirada one gecer (oncelikli).
#   OYUN:  her izleyici adiyla bir bot olur. Muzik durunca "otur" yazan (yavas) ya da
#          hediye atan (aninda) oturur; oturamayan patlar. Son kalan turu kazanir.
#   Sonra galip ekrani, kisa katilim geri sayimi, yeni tur...
#   Muhtar (YayinAsistan) gelenlere hos geldin der, hediyelere tesekkur eder, hatirlatir.
#
# Hediyeler jeton degerine gore (ulkeye gore ad degisse de deger ayni):
#   1-4 jeton (Gul)          -> aninda otur
#   5-29 jeton (Parmak kalp) -> kalkan: bu el patlamazsin
#   30+ jeton (Donut...)     -> koltuk kap: oturan birini kaldirip yerine gec
# Her hediye ayrica atani siranin onune alir.
#
# Test (TikTok'a baglanmadan) klavye: F2 10 sahte izleyici katilir, F3 "otur" yagmuru,
# F4 gul, F5 parmak kalp, F6 donut, F7 hemen baslat, F8 Muhtar sesi ac/kapa.
# --yayin-sahte: her sey otomatik.

signal guncellendi

const SAHNE := "res://Scenes/Minigames/SandalyeKapmaca/SandalyeKapmaca.tscn"
const TAHT_SAHNE := "res://Scenes/Yayin/TahtKavgasi.tscn"
const TUR_KAPASITE := 15
const SIRA_SINIRI := 300
const MIN_KATILIMCI := 2
const ILK_KATILIM_SURESI := 45.0
const KATILIM_SURESI := 30.0
const DOLUNCA_KALAN := 6.0
const GALIP_SURESI := 8.0
const KALKAN_JETON := 5
const KOLTUK_KAP_JETON := 30

enum Faz { KAPALI, GALIP, KATILIM, OYUN }

var aktif := false
var sahte := false
var faz: Faz = Faz.KAPALI
var sayac := 0.0
var tur_no := 0
var siradakiler: Array[Dictionary] = []   # [{"kullanici", "isim", "oncelik"}] (oncelikliler basta)
var sampiyonlar: Dictionary = {}          # kullanici -> {"isim", "sayi"}
var son_galip := ""
var id_kullanici: Dictionary = {}         # bu turun lobi id -> kullanici
var kullanici_id: Dictionary = {}         # kullanici -> lobi id
var hud: YayinHud
var asistan: YayinAsistan

var _sahte_no := 0
var _sahte_t := 0.0


func _ready() -> void:
	aktif = Ag.arg.has("yayin")
	if not aktif:
		set_process(false)
		set_process_unhandled_input(false)
		return
	process_mode = Node.PROCESS_MODE_ALWAYS
	if Ag.arg.has("taht"):
		# Taht Kavgasi: kendi sahnesi her seyi (TikTok olaylari, HUD, sahte izleyici) yonetir.
		# Burada sadece pencere, kopru baglantisi ve test bayraklari (--yayin-foto / --yayin-cikis).
		set_process_unhandled_input(false)
		Ag.arg["steamsiz"] = "1"   # ana ekran Steam odasi kurup lobiye gecmesin (sahneyi ezerdi)
		TikTok.baslat(int(Ag.arg.get("kopru-port", str(TikTok.VARSAYILAN_PORT))))
		_pencere_kur.call_deferred()
		get_tree().change_scene_to_file.call_deferred(TAHT_SAHNE)
		return
	sahte = Ag.arg.has("yayin-sahte")
	Ag.arg["tanitim-sure"] = "0"   # oyun tanitim karti yayinda gereksiz
	TikTok.yorum_geldi.connect(_yorum)
	TikTok.hediye_geldi.connect(_hediye)
	TikTok.izleyici_olayi.connect(_izleyici_olayi)
	TikTok.baslat(int(Ag.arg.get("kopru-port", str(TikTok.VARSAYILAN_PORT))))
	hud = YayinHud.new()
	add_child(hud)
	asistan = YayinAsistan.new()
	add_child(asistan)
	_pencere_kur.call_deferred()
	_ilk_tur.call_deferred()


# Dikey (9:16) pencere: TikTok LIVE Studio bu pencereyi yakalar
func _pencere_kur() -> void:
	if DisplayServer.get_name() == "headless":
		return
	DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
	var alan := DisplayServer.screen_get_usable_rect()
	var h := mini(alan.size.y - 60, 1920)
	if Ag.arg.has("yayin-boyut"):
		h = mini(int(String(Ag.arg["yayin-boyut"]).get_slice("x", 1)), alan.size.y - 40)   # ekrandan buyuk pencere donuyordu
	var w := int(h * 9.0 / 16.0)
	DisplayServer.window_set_size(Vector2i(w, h))
	DisplayServer.window_set_position(alan.position + Vector2i((alan.size.x - w) / 2, 30))
	DisplayServer.window_set_title("Taht Kavgası - TikTok Yayın" if Ag.arg.has("taht") else "Mahalle Kaosu - TikTok Yayın")


func _ilk_tur() -> void:
	Lobi.sifirla()
	id_kullanici.clear()
	kullanici_id.clear()
	faz = Faz.KATILIM
	sayac = ILK_KATILIM_SURESI
	get_tree().change_scene_to_file(SAHNE)
	asistan.yayin_basladi()
	guncellendi.emit()


# ---------------------------------------------------------------- tur akisi

var _foto_t := 0.0
var _foto_no := 0
var _gecen := 0.0


func _process(delta: float) -> void:
	if sahte:
		_sahte_otomatik(delta)
	# Test: --yayin-foto=yol_oneki 3 sn'de bir ekran goruntusu, --yayin-cikis=SN sonra kapan
	_gecen += delta
	if Ag.arg.has("yayin-foto"):
		_foto_t += delta
		if _foto_t >= 3.0:
			_foto_t = 0.0
			_foto_no += 1
			get_viewport().get_texture().get_image().save_png("%s_%03d.png" % [Ag.arg["yayin-foto"], _foto_no])
	if Ag.arg.has("yayin-cikis") and _gecen >= float(Ag.arg["yayin-cikis"]):
		get_tree().quit()
	match faz:
		Faz.GALIP:
			sayac -= delta
			if sayac <= 0.0:
				faz = Faz.KATILIM
				sayac = KATILIM_SURESI
				asistan.katilim_basladi()
				guncellendi.emit()
		Faz.KATILIM:
			sayac -= delta
			if siradakiler.size() >= TUR_KAPASITE:
				sayac = minf(sayac, DOLUNCA_KALAN)
			if sayac <= 0.0:
				if siradakiler.size() >= MIN_KATILIMCI:
					_tur_baslat()
				else:
					sayac = 15.0   # yeterli kisi yok: biraz daha bekle
					asistan.soyle("Hadi ama! En az %d kişi lazım. Yoruma 'katıl' yazın, oyuna girin!" % MIN_KATILIMCI)


func _tur_baslat() -> void:
	tur_no += 1
	Lobi.sifirla()
	id_kullanici.clear()
	kullanici_id.clear()
	var girenler := siradakiler.slice(0, TUR_KAPASITE)
	siradakiler = siradakiler.slice(TUR_KAPASITE)
	var i := 0
	for k in girenler:
		i += 1
		var id := -i
		Lobi.oyuncular[id] = Lobi._yeni_kayit(String(k["isim"]), randi_range(1, KarakterKatalogu.SAYI), true, [], [])
		id_kullanici[id] = k["kullanici"]
		kullanici_id[k["kullanici"]] = id
	Ag.kaydet("[YAYIN] Tur %d basliyor: %d izleyici, %d sirada" % [tur_no, girenler.size(), siradakiler.size()])
	faz = Faz.OYUN
	asistan.tur_basladi(girenler)
	guncellendi.emit()
	get_tree().change_scene_to_file(SAHNE)


# Sandalye Kapmaca cagirir: tur bitti (kazanan_id 0 = kazanan yok)
func tur_bitti(kazanan_id: int) -> void:
	if faz != Faz.OYUN and faz != Faz.KATILIM:
		return
	if faz == Faz.OYUN:
		Ag.kaydet("[YAYIN] Tur %d bitti, kazanan: %s" % [tur_no, isim_al(kazanan_id) if kazanan_id != 0 else "yok"])
	if kazanan_id != 0 and id_kullanici.has(kazanan_id):
		var k := String(id_kullanici[kazanan_id])
		var isim := isim_al(kazanan_id)
		var s: Dictionary = sampiyonlar.get(k, {"isim": isim, "sayi": 0})
		s["sayi"] = int(s["sayi"]) + 1
		sampiyonlar[k] = s
		son_galip = isim
		faz = Faz.GALIP
		sayac = GALIP_SURESI
		Ses.cal("basari", -2.0)
		asistan.kazanan(isim, int(s["sayi"]))
	elif faz == Faz.OYUN:
		son_galip = ""
		faz = Faz.KATILIM
		sayac = KATILIM_SURESI
		asistan.katilim_basladi()
	guncellendi.emit()


func isim_al(id: int) -> String:
	return String(Lobi.oyuncular.get(id, {}).get("isim", "?"))


func oynuyor_mu(kullanici: String) -> bool:
	return faz == Faz.OYUN and kullanici_id.has(kullanici)


func sampiyon_listesi(n: int = 3) -> Array:
	var l := sampiyonlar.values()
	l.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return int(a["sayi"]) > int(b["sayi"]))
	return l.slice(0, n)


func _sahne() -> Node:
	var mg := get_tree().get_first_node_in_group("minigame")
	return mg if mg and mg.has_method("yayin_otur") else null


# ---------------------------------------------------------------- sira

func sira_no(kullanici: String) -> int:
	for i in siradakiler.size():
		if siradakiler[i]["kullanici"] == kullanici:
			return i + 1
	return 0


func _oncelikli_sayisi() -> int:
	var n := 0
	for k in siradakiler:
		if k["oncelik"]:
			n += 1
	return n


# Siraya gir. oncelikli: hediye atti, oncelikli olmayanlarin onune gecer.
# Doner: siradaki yeri (0 = giremedi)
func katil(kullanici: String, isim: String, oncelikli: bool = false) -> int:
	if kullanici == "":
		return 0
	var ad := kullanici.left(Lobi.MAKS_ISIM)
	var mevcut := sira_no(kullanici)
	if mevcut > 0:
		var k: Dictionary = siradakiler[mevcut - 1]
		if oncelikli and not k["oncelik"]:
			siradakiler.remove_at(mevcut - 1)
			k["oncelik"] = true
			siradakiler.insert(_oncelikli_sayisi(), k)
			guncellendi.emit()
			return sira_no(kullanici)
		return mevcut
	if siradakiler.size() >= SIRA_SINIRI:
		return 0
	var yeni := {"kullanici": kullanici, "isim": ad, "oncelik": oncelikli}
	if oncelikli:
		siradakiler.insert(_oncelikli_sayisi(), yeni)
	else:
		siradakiler.append(yeni)
	var yer := sira_no(kullanici)
	if not oncelikli:
		var ek := "" if yer <= TUR_KAPASITE else "  ·  sırada bekliyor"
		hud.akis_ekle("%s sıraya girdi (%d.)%s" % [ad, yer, ek], YayinHud.RENK_YESIL)
		asistan.katildi(ad, yer, isim)
	guncellendi.emit()
	return yer


# ---------------------------------------------------------------- yorum / hediye

static func _sade(metin: String) -> String:
	return metin.replace("İ", "i").replace("I", "ı").to_lower().replace("ı", "i").strip_edges()


func _yorum(kullanici: String, isim: String, metin: String) -> void:
	var m := _sade(metin)
	if m.begins_with("katil") or m == "+" or m.begins_with("ben de") or m.begins_with("bende"):
		katil(kullanici, isim)
	elif m.begins_with("otur"):
		var mg := _sahne()
		if mg and oynuyor_mu(kullanici):
			mg.yayin_otur(int(kullanici_id[kullanici]), false)
	elif m.begins_with("sira") or m.begins_with("kacinci"):
		asistan.sira_sorusu(kullanici)


func _hediye(kullanici: String, isim: String, hediye: String, adet: int, jeton: int) -> void:
	var ad := kullanici.left(Lobi.MAKS_ISIM)
	var mg := _sahne()
	if mg == null or not oynuyor_mu(kullanici):
		# oyunda degil: siranin onune gecer
		var yer := katil(kullanici, isim, true)
		hud.akis_ekle("%s %s attı: sırada %d." % [ad, hediye, yer], YayinHud.RENK_PEMBE)
		asistan.hediye(ad, hediye, adet, jeton, yer)
		return
	katil(kullanici, isim, true)   # sonraki tura da oncelikli
	asistan.hediye(ad, hediye, adet, jeton, 0)
	var id := int(kullanici_id[kullanici])
	if jeton >= KOLTUK_KAP_JETON:
		var kurban: int = mg.yayin_koltuk_kap(id)
		if kurban != 0:
			hud.akis_ekle("%s koltuğu kaptı! %s kalktı" % [ad, isim_al(kurban)], YayinHud.RENK_ALTIN)
		else:
			hud.akis_ekle("%s %s attı: koltuk kap hazır!" % [ad, hediye], YayinHud.RENK_ALTIN)
	elif jeton >= KALKAN_JETON:
		if mg.yayin_kalkan(id):
			hud.akis_ekle("%s kalkan aldı" % ad, YayinHud.RENK_MAVI)
	else:
		if mg.yayin_otur(id, true):
			hud.akis_ekle("%s %s attı, oturdu" % [ad, hediye], YayinHud.RENK_PEMBE)


func _izleyici_olayi(tur: String, kullanici: String, isim: String) -> void:
	match tur:
		"giris":
			asistan.hos_geldin(kullanici.left(Lobi.MAKS_ISIM), isim)
		"takip":
			asistan.takip(kullanici.left(Lobi.MAKS_ISIM))
		"paylasim":
			asistan.paylasim(kullanici.left(Lobi.MAKS_ISIM))


# ---------------------------------------------------------------- test: sahte izleyiciler

const SAHTE_ADLAR := ["ayse.23", "kral_mehmet", "zeynep_44", "bursali16", "emre_k", "deniz.x", "can07", "elif_s",
	"burak_tr", "selin.k", "umut34", "melis_06", "kemal.b", "hulya35", "murat_g", "ece.yy", "onur61", "gizem.m",
	"tolga_42", "sevgi.t", "baris55", "irem.c", "serkan_1", "dilara.z", "efe_27", "nazli.o", "cem.66", "pinar_d"]


func _sahte_ad() -> String:
	_sahte_no += 1
	var ad: String = SAHTE_ADLAR[_sahte_no % SAHTE_ADLAR.size()]
	return ad if _sahte_no <= SAHTE_ADLAR.size() else "%s%d" % [ad.left(10), _sahte_no]


func _sahte_katil(n: int) -> void:
	for i in n:
		var ad := _sahte_ad()
		_izleyici_olayi("giris", ad, ad)
		_yorum(ad, ad, "katıl")


func _sahte_canlilar() -> Array:
	return kullanici_id.keys()


func _sahte_hediye(jeton: int, ad: String) -> void:
	var l := _sahte_canlilar()
	if l.is_empty() or (faz != Faz.OYUN and randf() < 0.5):
		var yeni := _sahte_ad()
		_hediye(yeni, yeni, ad, 1, jeton)
		return
	var k: String = l.pick_random()
	_hediye(k, k, ad, 1, jeton)


func _unhandled_input(event: InputEvent) -> void:
	var k := event as InputEventKey
	if k == null or not k.pressed or k.echo:
		return
	match k.keycode:
		KEY_F2:
			_sahte_katil(10)
		KEY_F3:
			for u in _sahte_canlilar():
				if randf() < 0.6:
					_yorum(u, u, "otur")
		KEY_F4:
			_sahte_hediye(1, "Gül")
		KEY_F5:
			_sahte_hediye(5, "Parmak kalp")
		KEY_F6:
			_sahte_hediye(30, "Donut")
		KEY_F7:
			if faz == Faz.KATILIM or faz == Faz.GALIP:
				faz = Faz.KATILIM
				sayac = 0.0
		KEY_F8:
			asistan.ses_degistir()
		_:
			return
	get_viewport().set_input_as_handled()


# --yayin-sahte: katilim, otur yorumlari ve hediyeler kendiliginden gelir (deneme / tanitim)
func _sahte_otomatik(delta: float) -> void:
	_sahte_t -= delta
	if _sahte_t > 0.0:
		return
	_sahte_t = 0.25
	if faz == Faz.KATILIM and randf() < 0.35:
		_sahte_katil(1)
	elif faz == Faz.OYUN and randf() < 0.02:
		_sahte_katil(1)
	var mg := _sahne()
	if faz == Faz.OYUN and mg and mg.yayin_kapma_mi():
		for u in _sahte_canlilar():
			if randf() < 0.07:
				_yorum(u, u, "otur")
		var r := randf()
		if r < 0.03:
			_sahte_hediye(1, "Gül")
		elif r < 0.04:
			_sahte_hediye(5, "Parmak kalp")
		elif r < 0.047:
			_sahte_hediye(30, "Donut")
