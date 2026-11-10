class_name YayinHud
extends CanvasLayer

# TikTok yayin ekrani (dikey 9:16). Sanal genislik 1280 (canvas_items esnetme), yukseklik
# pencereye gore uzar. Ust: baslik + hediye aciklamalari. Orta: buyuk duyuru + geri sayim.
# Sag: olay akisi. Alt: gunun sampiyonlari, sonraki tur, "katil" / "otur" talimatlari.

const BUNGEE := preload("res://Arayuz/Fontlar/Bungee.ttf")
const OSWALD := preload("res://Arayuz/Fontlar/Oswald.ttf")

# [arka plan, yazi]
const RENK_PEMBE := [Color("4b1528"), Color("ed93b1")]
const RENK_MAVI := [Color("042c53"), Color("85b7eb")]
const RENK_ALTIN := [Color("412402"), Color("fac775")]
const RENK_YESIL := [Color("173404"), Color("97c459")]
const RENK_KIRMIZI := [Color("501313"), Color("f09595")]
const RENK_UYARI := [Color("412402"), Color("ffffff")]
const KOYU := Color("141228e6")
const MOR := Color("534ab7")
const ALTIN := Color("fac775")
const LILA := Color("cecbf6")
const MAKS_AKIS := 4
const AKIS_OMRU := 7.0

var _bilgi: Label
var _baglanti: Label
var _afis: VBoxContainer
var _afis_kutu: PanelContainer
var _afis_baslik: Label
var _afis_buyuk: Label
var _afis_alt: Label
var _akis: VBoxContainer
var _sampiyon_satirlar: Array[Label] = []
var _sira_yazi: Label
var _sira_bar: ProgressBar
var _sira_alt: Label

var _kapma := false
var _final := false
var _kapma_kalan := 0.0
var _el_metni := ""


func _ready() -> void:
	layer = 60
	var kok := Control.new()
	kok.set_anchors_preset(Control.PRESET_FULL_RECT)
	kok.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(kok)
	_ust_panel(kok)
	_afis_kur(kok)
	_akis_kur(kok)
	_balon_kur(kok)
	_alt_kur(kok)
	TikTok.durum_degisti.connect(func(_b: bool, _m: String) -> void: _baglanti_guncelle())
	_baglanti_guncelle()


# ---------------------------------------------------------------- yardimcilar

static func _kutu(bg: Color, kenar: Color = Color.TRANSPARENT, yaricap: int = 24, kalinlik: int = 0, ic: int = 22) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.set_corner_radius_all(yaricap)
	s.set_border_width_all(kalinlik)
	s.border_color = kenar
	s.content_margin_left = ic
	s.content_margin_right = ic
	s.content_margin_top = ic * 0.6
	s.content_margin_bottom = ic * 0.6
	return s


static func _yazi(font: Font, boyut: int, renk: Color, kenar: int = 0) -> Label:
	var l := Label.new()
	var ls := LabelSettings.new()
	ls.font = font
	ls.font_size = boyut
	ls.font_color = renk
	if kenar > 0:
		ls.outline_size = kenar
		ls.outline_color = Color(0, 0, 0, 0.85)
	l.label_settings = ls
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


static func _panel(stil: StyleBox) -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", stil)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return p


# ---------------------------------------------------------------- kurulum

func _ust_panel(kok: Control) -> void:
	var p := _panel(_kutu(KOYU, MOR, 30, 4, 30))
	p.set_anchors_preset(Control.PRESET_TOP_WIDE)
	p.offset_left = 30
	p.offset_right = -30
	p.offset_top = 40
	kok.add_child(p)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	p.add_child(v)
	var ust := HBoxContainer.new()
	v.add_child(ust)
	var baslik := _yazi(BUNGEE, 70, ALTIN)
	baslik.text = "SANDALYE KAPMACA"
	baslik.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ust.add_child(baslik)
	_baglanti = _yazi(OSWALD, 30, Color.WHITE)
	_baglanti.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	ust.add_child(_baglanti)
	_bilgi = _yazi(OSWALD, 46, LILA)
	_bilgi.text = "KATILIM AÇIK"
	v.add_child(_bilgi)
	var izgara := GridContainer.new()
	izgara.columns = 2
	izgara.add_theme_constant_override("h_separation", 16)
	izgara.add_theme_constant_override("v_separation", 14)
	v.add_child(izgara)
	_cip(izgara, RENK_PEMBE, "GÜL", "Anında otur · sırada öne geç")
	_cip(izgara, RENK_MAVI, "PARMAK KALP", "Kalkan: 1 el patlamazsın")
	_cip(izgara, RENK_ALTIN, "DONUT", "Koltuk kap: birini kaldır")
	_cip(izgara, RENK_YESIL, "'otur' YAZ", "Ücretsiz ama yavaş")


func _cip(ust: Control, renk: Array, baslik: String, aciklama: String) -> void:
	var s := _kutu(renk[0], renk[1], 18, 0, 22)
	s.border_width_left = 10
	var p := _panel(s)
	p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ust.add_child(p)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", -4)
	p.add_child(v)
	var b := _yazi(OSWALD, 42, renk[1])
	b.text = baslik
	v.add_child(b)
	var a := _yazi(OSWALD, 32, Color.WHITE)
	a.text = aciklama
	v.add_child(a)


func _afis_kur(kok: Control) -> void:
	_afis = VBoxContainer.new()
	_afis.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_afis.anchor_top = 0.29
	_afis.anchor_bottom = 0.29
	_afis.offset_left = -600
	_afis.offset_right = 600
	_afis.alignment = BoxContainer.ALIGNMENT_BEGIN
	_afis.add_theme_constant_override("separation", 0)
	_afis.mouse_filter = Control.MOUSE_FILTER_IGNORE
	kok.add_child(_afis)
	_afis_kutu = _panel(_kutu(Color("e24b4a"), Color.TRANSPARENT, 30, 0, 40))
	_afis_kutu.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_afis.add_child(_afis_kutu)
	_afis_baslik = _yazi(BUNGEE, 80, Color.WHITE, 10)
	_afis_baslik.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_afis_kutu.add_child(_afis_baslik)
	_afis_buyuk = _yazi(BUNGEE, 190, ALTIN, 26)
	_afis_buyuk.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_afis.add_child(_afis_buyuk)
	_afis_alt = _yazi(OSWALD, 54, Color.WHITE, 14)
	_afis_alt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_afis.add_child(_afis_alt)


var _balon: VBoxContainer
var _balon_yazi: Label
var _balon_tw: Tween


# Muhtar'in konusma balonu (sol orta; sag tarafta olay akisi)
func _balon_kur(kok: Control) -> void:
	_balon = VBoxContainer.new()
	_balon.set_anchors_preset(Control.PRESET_TOP_LEFT)
	_balon.anchor_top = 0.55
	_balon.anchor_bottom = 0.55
	_balon.offset_left = 30
	_balon.offset_right = 610
	_balon.add_theme_constant_override("separation", -6)
	_balon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_balon.modulate.a = 0.0
	kok.add_child(_balon)
	var etiket := _panel(_kutu(ALTIN, Color.TRANSPARENT, 16, 0, 18))
	etiket.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	etiket.z_index = 1
	_balon.add_child(etiket)
	var ad := _yazi(BUNGEE, 36, Color("412402"))
	ad.text = "MUHTAR"
	etiket.add_child(ad)
	var p := _panel(_kutu(Color(1, 1, 1, 0.95), MOR, 24, 4, 26))
	_balon.add_child(p)
	_balon_yazi = _yazi(OSWALD, 40, Color("26215c"))
	_balon_yazi.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	p.add_child(_balon_yazi)


func asistan_balon(metin: String, sure: float) -> void:
	_balon_yazi.text = metin
	if _balon_tw:
		_balon_tw.kill()
	_balon_tw = _balon.create_tween()
	_balon_tw.tween_property(_balon, "modulate:a", 1.0, 0.2)
	_balon_tw.tween_interval(sure)
	_balon_tw.tween_property(_balon, "modulate:a", 0.0, 0.5)


func _akis_kur(kok: Control) -> void:
	_akis = VBoxContainer.new()
	_akis.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_akis.anchor_top = 0.56
	_akis.anchor_bottom = 0.56
	_akis.offset_left = -640
	_akis.offset_right = -30
	_akis.add_theme_constant_override("separation", 12)
	_akis.mouse_filter = Control.MOUSE_FILTER_IGNORE
	kok.add_child(_akis)


func _alt_kur(kok: Control) -> void:
	# Talimat kutulari (en alt)
	var kutular := HBoxContainer.new()
	kutular.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	kutular.offset_left = 30
	kutular.offset_right = -30
	kutular.offset_top = -290
	kutular.offset_bottom = -40
	kutular.add_theme_constant_override("separation", 24)
	kok.add_child(kutular)
	_talimat(kutular, ALTIN, Color("412402"), Color("633806"), "'KATIL' YAZ", "Sıraya gir · hediye atan öne geçer")
	_talimat(kutular, Color("5dcaa5"), Color("04342c"), Color("085041"), "'OTUR' YAZ", "Müzik durunca · ya da GÜL at")

	# Gunun sampiyonlari / sonraki tur
	var paneller := HBoxContainer.new()
	paneller.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	paneller.offset_left = 30
	paneller.offset_right = -30
	paneller.offset_top = -600
	paneller.offset_bottom = -314
	paneller.add_theme_constant_override("separation", 24)
	kok.add_child(paneller)

	var sp := _panel(_kutu(KOYU, MOR, 26, 4, 30))
	sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	paneller.add_child(sp)
	var sv := VBoxContainer.new()
	sp.add_child(sv)
	var sb := _yazi(OSWALD, 44, ALTIN)
	sb.text = "GÜNÜN ŞAMPİYONLARI"
	sv.add_child(sb)
	for i in 3:
		var l := _yazi(OSWALD, 40, Color.WHITE)
		sv.add_child(l)
		_sampiyon_satirlar.append(l)

	var tp := _panel(_kutu(KOYU, Color("1d9e75"), 26, 4, 30))
	tp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	paneller.add_child(tp)
	var tv := VBoxContainer.new()
	tv.add_theme_constant_override("separation", 10)
	tp.add_child(tv)
	var tb := _yazi(OSWALD, 44, Color("5dcaa5"))
	tb.text = "SONRAKİ TUR"
	tv.add_child(tb)
	_sira_yazi = _yazi(OSWALD, 40, Color.WHITE)
	tv.add_child(_sira_yazi)
	_sira_bar = ProgressBar.new()
	_sira_bar.show_percentage = false
	_sira_bar.custom_minimum_size = Vector2(0, 28)
	_sira_bar.max_value = Yayin.TUR_KAPASITE
	_sira_bar.add_theme_stylebox_override("background", _kutu(Color(1, 1, 1, 0.15), Color.TRANSPARENT, 14, 0, 0))
	_sira_bar.add_theme_stylebox_override("fill", _kutu(Color("5dcaa5"), Color.TRANSPARENT, 14, 0, 0))
	tv.add_child(_sira_bar)
	_sira_alt = _yazi(OSWALD, 34, LILA)
	tv.add_child(_sira_alt)


func _talimat(ust: Control, bg: Color, yazi: Color, alt_yazi: Color, baslik: String, aciklama: String) -> void:
	var p := _panel(_kutu(bg, Color.TRANSPARENT, 32, 0, 20))
	p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ust.add_child(p)
	var v := VBoxContainer.new()
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	p.add_child(v)
	var b := _yazi(BUNGEE, 66, yazi)
	b.text = baslik
	b.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(b)
	var a := _yazi(OSWALD, 40, alt_yazi)
	a.text = aciklama
	a.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(a)


# ---------------------------------------------------------------- disaridan cagrilar

func el_bilgisi(el: int, kisi: int, sandalye: int) -> void:
	_el_metni = "TUR %d  ·  EL %d  ·  %d KİŞİ  ·  %d SANDALYE" % [Yayin.tur_no, el, kisi, sandalye]


func muzik_durdu(sure: float, final: bool) -> void:
	_kapma = true
	_final = final
	_kapma_kalan = sure


func geri_sayim(kalan: float) -> void:
	_kapma_kalan = kalan


func muzik_basladi() -> void:
	_kapma = false


func akis_ekle(metin: String, renk: Array) -> void:
	var p := _panel(_kutu(Color(renk[0], 0.92), Color.TRANSPARENT, 18, 0, 22))
	var l := _yazi(OSWALD, 38, renk[1])
	l.text = metin
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	p.add_child(l)
	_akis.add_child(p)
	while _akis.get_child_count() > MAKS_AKIS:
		var eski := _akis.get_child(0)
		_akis.remove_child(eski)
		eski.queue_free()
	var tw := p.create_tween()
	tw.tween_interval(AKIS_OMRU)
	tw.tween_property(p, "modulate:a", 0.0, 0.6)
	tw.tween_callback(p.queue_free)


# ---------------------------------------------------------------- her kare

func _process(_delta: float) -> void:
	var kalan := ceili(maxf(0.0, Yayin.sayac))
	var sira := Yayin.siradakiler.size()
	var girecek := mini(sira, Yayin.TUR_KAPASITE)
	_afis.visible = true
	match Yayin.faz:
		Yayin.Faz.KATILIM:
			_bilgi.text = "KATILIM AÇIK  ·  %d / %d KİŞİ" % [girecek, Yayin.TUR_KAPASITE]
			_afis_ayarla("YENİ TUR BAŞLIYOR", Color("1d9e75"), str(kalan), 190, "Yorumlara 'katıl' yaz!  ·  %d/%d" % [girecek, Yayin.TUR_KAPASITE])
		Yayin.Faz.GALIP:
			_afis_ayarla("KAZANAN", Color("ba7517"), Yayin.son_galip, 110, "Tur %d şampiyonu!" % Yayin.tur_no)
		Yayin.Faz.OYUN:
			_bilgi.text = _el_metni if _el_metni != "" else "TUR %d  ·  HAZIR OL" % Yayin.tur_no
			if _kapma:
				_afis_ayarla("FİNAL!" if _final else "MÜZİK DURDU!", Color("e24b4a"), str(ceili(maxf(0.0, _kapma_kalan))), 190,
					"'otur' yaz ya da GÜL at!")
			else:
				_afis.visible = false
		_:
			_afis.visible = false
	var liste := Yayin.sampiyon_listesi(3)
	for i in 3:
		if i < liste.size():
			_sampiyon_satirlar[i].text = "%d.  %s  ·  %d tur" % [i + 1, liste[i]["isim"], int(liste[i]["sayi"])]
		else:
			_sampiyon_satirlar[i].text = "%d.  —" % (i + 1)
	_sira_yazi.text = "Sırada: %d kişi  ·  ilk %d girer" % [sira, Yayin.TUR_KAPASITE]
	_sira_bar.value = girecek
	_sira_alt.text = "Hediye atan öne geçer" if Yayin.faz == Yayin.Faz.OYUN else "Başlamasına %d sn" % kalan


func _afis_ayarla(baslik: String, renk: Color, buyuk: String, boyut: int, alt: String) -> void:
	_afis_baslik.text = baslik
	(_afis_kutu.get_theme_stylebox("panel") as StyleBoxFlat).bg_color = renk
	_afis_buyuk.text = buyuk
	_afis_buyuk.label_settings.font_size = boyut
	_afis_alt.text = alt


func _baglanti_guncelle() -> void:
	if TikTok.tiktok_bagli:
		_baglanti.text = "● TikTok"
		_baglanti.label_settings.font_color = Color("5fe39a")
	else:
		_baglanti.text = "● TikTok bağlı değil"
		_baglanti.label_settings.font_color = Color("f09595")
