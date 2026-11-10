class_name YayinAsistan
extends Node

# MUHTAR: yayinin sunucusu. Kuyunun ustunde durur, ekranda konusma balonuyla (ve Windows'ta
# Turkce ses varsa sesli) konusur.
#   - Yayina girenlere hos geldin (toplu: "Hos geldiniz A, B ve 3 kisi daha!")
#   - Hediyelere, takip ve paylasimlara tesekkur
#   - Tur baslangici, final, patlamalar, kazanan
#   - Arada duruma gore hatirlatma (katilim / oyun)
#   - "sira" yazana siradaki yerini soyler
# Mesajlar kuyrukta bekler, araya bosluk birakilir; kuyruk sisince onemsizler atilir.

signal konustu(tur: String)   # Muhtar karakteri tepki versin: "selam", "dans", "konus"

const MIN_ARALIK := 3.5
const KONUSMA_HIZI := 1.45   # Windows sesi: 1 normal, daha hizli = daha dogal
const HOSGELDIN_TOPLAMA := 6.0
const HATIRLATMA_MIN := 35.0
const HATIRLATMA_MAKS := 55.0
const MAKS_KUYRUK := 5
const HEDIYE_TESEKKUR_ARALIGI := 12.0

enum Onem { DUSUK, NORMAL, YUKSEK }

const HOSGELDIN := [
	"Hoş geldin %s! Yoruma 'katıl' yaz, sandalyeni kap!",
	"Mahalleye hoş geldin %s! Oyuna girmek için 'katıl' yaz.",
	"Selam %s! Tam zamanında geldin, sıraya gir!",
]
const HOSGELDIN_TOPLU := [
	"Hoş geldiniz %s! 'katıl' yazan oyuna girer!",
	"Mahalle kalabalıklaşıyor! Hoş geldiniz %s!",
]
const HATIRLATMA_SIRA := [
	"Yoruma 'katıl' yaz, sıraya gir! Her turda 15 kişi oynuyor.",
	"Hediye atan sıranın en önüne geçer, sonraki tura garanti girer!",
	"Sırada kaçıncı olduğunu merak ediyorsan yoruma 'sıra' yaz.",
	"Bugünün şampiyonu kim olacak? Katıl, sandalyeni kap!",
	"Beğenmeyi ve paylaşmayı unutmayın, mahalle kalabalık olsun!",
]
const HATIRLATMA_OYUN := [
	"Müzik durunca hemen 'otur' yaz! Geç kalan patlar!",
	"Gül atan anında sandalyeye ışınlanır!",
	"Parmak kalp kalkan verir, o el patlamazsın!",
	"Donut atan, oturan birini kaldırıp koltuğu kapar!",
	"Oyunda değil misin? 'katıl' yaz, sonraki tura sıraya gir!",
	"Takip et, yeni turları kaçırma!",
]
const TESEKKUR := [
	"%s, %s için sağ ol!",
	"Vay be %s! %s geldi, teşekkürler!",
	"Eline sağlık %s, %s için teşekkürler!",
]
const PATLAMA := [
	"Ooo, %d kişi havaya uçtu!",
	"BOOM! %d kişi gitti, kalanlar dikkat!",
	"%d kişi oturamadı, mahalle karıştı!",
]

var ses_acik := true
var _ses_id := ""
var _kuyruk: Array[Dictionary] = []   # [{"metin", "onem"}]
var _bekleme := 0.0
var _yeni_gelenler: Array[String] = []
var _hosgeldin_t := 0.0
var _selamlananlar: Dictionary = {}
var _hatirlatma_t := 20.0
var _son_hatirlatma := ""
var _son_tesekkur: Dictionary = {}   # kullanici -> zaman
var _zaman := 0.0


func _ready() -> void:
	ses_acik = not Ag.arg.has("muhtar-sessiz")
	if DisplayServer.has_method("tts_get_voices_for_language"):
		var sesler := DisplayServer.tts_get_voices_for_language("tr")
		if not sesler.is_empty():
			_ses_id = sesler[0]
	if _ses_id == "":
		Ag.kaydet("[MUHTAR] Turkce ses bulunamadi: sadece yazili konusacak.")


func ses_degistir() -> void:
	ses_acik = not ses_acik
	if not ses_acik:
		DisplayServer.tts_stop()
	soyle("Sesim %s." % ("açıldı" if ses_acik else "kapandı"), Onem.YUKSEK)


# ---------------------------------------------------------------- kuyruk

func soyle(metin: String, onem: Onem = Onem.NORMAL) -> void:
	_kuyruk.append({"metin": metin, "onem": onem})
	while _kuyruk.size() > MAKS_KUYRUK:   # en onemsiz, en eski mesaji at
		var at := 0
		for i in _kuyruk.size():
			if int(_kuyruk[i]["onem"]) < int(_kuyruk[at]["onem"]):
				at = i
		_kuyruk.remove_at(at)


func _process(delta: float) -> void:
	_zaman += delta
	_bekleme -= delta
	_hosgeldin_t -= delta
	_hatirlatma_t -= delta
	if not _yeni_gelenler.is_empty() and _hosgeldin_t <= 0.0:
		_hosgeldin_soyle()
	if _hatirlatma_t <= 0.0:
		_hatirlatma_t = randf_range(HATIRLATMA_MIN, HATIRLATMA_MAKS)
		if _kuyruk.is_empty():
			_hatirlat()
	if _bekleme <= 0.0 and not _kuyruk.is_empty():
		var m: Dictionary = _kuyruk.pop_front()
		_konus(String(m["metin"]))


func _konus(metin: String) -> void:
	var sure := clampf(metin.length() * 0.065, 3.0, 6.5)
	_bekleme = maxf(MIN_ARALIK, sure + 0.8)
	if Yayin.hud:
		Yayin.hud.asistan_balon(metin, sure)
	if ses_acik and _ses_id != "":
		DisplayServer.tts_stop()
		DisplayServer.tts_speak(metin.replace("'", ""), _ses_id, 85, 1.05, KONUSMA_HIZI)
	konustu.emit("konus")


# ---------------------------------------------------------------- olaylar (Yayin cagirir)

func yayin_basladi() -> void:
	soyle("Selam mahalle! Ben Muhtar. Sandalye Kapmaca başlıyor, yoruma 'katıl' yaz, sıraya gir!", Onem.YUKSEK)


func hos_geldin(kullanici: String, _isim: String) -> void:
	if _selamlananlar.has(kullanici):
		return
	_selamlananlar[kullanici] = true
	if _yeni_gelenler.is_empty():
		_hosgeldin_t = HOSGELDIN_TOPLAMA
	_yeni_gelenler.append(kullanici)


func _hosgeldin_soyle() -> void:
	var l := _yeni_gelenler
	var metin: String
	if l.size() == 1:
		metin = HOSGELDIN.pick_random() % l[0]
	elif l.size() <= 3:
		metin = HOSGELDIN_TOPLU.pick_random() % (", ".join(PackedStringArray(l.slice(0, l.size() - 1))) + " ve " + l[-1])
	else:
		metin = HOSGELDIN_TOPLU.pick_random() % ("%s, %s ve %d kişi daha" % [l[0], l[1], l.size() - 2])
	_yeni_gelenler = []
	soyle(metin, Onem.DUSUK)
	konustu.emit("selam")


func katildi(ad: String, yer: int, _isim: String) -> void:
	if yer == 1 and Yayin.faz != Yayin.Faz.OYUN:
		soyle("İlk katılan %s! Hadi, arenada 15 yer var." % ad)
	elif yer == Yayin.TUR_KAPASITE:
		soyle("Arena doldu! Bundan sonra gelenler sırada bekler. Hediye atan öne geçer!", Onem.YUKSEK)


func hediye(ad: String, hediye_adi: String, _adet: int, jeton: int, yer: int) -> void:
	if _zaman - float(_son_tesekkur.get(ad, -100.0)) < HEDIYE_TESEKKUR_ARALIGI and jeton < Yayin.KOLTUK_KAP_JETON:
		return   # ayni kisinin seri gullerine her seferinde tesekkur etme
	_son_tesekkur[ad] = _zaman
	var metin: String = TESEKKUR.pick_random() % [ad, hediye_adi]
	if yer > 0:
		metin += " Sıranın önüne geçtin, %d. sıradasın!" % yer
	elif jeton >= Yayin.KOLTUK_KAP_JETON:
		metin += " Koltuk kapma geliyor!"
	elif jeton >= Yayin.KALKAN_JETON:
		metin += " Kalkanın hazır!"
	soyle(metin, Onem.YUKSEK)
	konustu.emit("selam")


func takip(ad: String) -> void:
	soyle("Takip için sağ ol %s!" % ad, Onem.DUSUK)


func paylasim(ad: String) -> void:
	soyle("Paylaştığın için teşekkürler %s, mahalle büyüyor!" % ad, Onem.DUSUK)


func sira_sorusu(kullanici: String) -> void:
	var ad := kullanici.left(Lobi.MAKS_ISIM)
	if Yayin.oynuyor_mu(kullanici):
		soyle("%s, sen şu an oyundasın! Müzik durunca 'otur' yaz." % ad)
		return
	var yer := Yayin.sira_no(kullanici)
	if yer == 0:
		soyle("%s, henüz sırada değilsin. Yoruma 'katıl' yaz!" % ad)
	elif yer <= Yayin.TUR_KAPASITE:
		soyle("%s, %d. sıradasın, sonraki tura giriyorsun!" % [ad, yer])
	else:
		soyle("%s, %d. sıradasın. Hediye atarsan öne geçersin!" % [ad, yer])


func katilim_basladi() -> void:
	soyle("Yeni tur için sıra açıldı! Yoruma 'katıl' yaz, 15 kişi giriyor!", Onem.YUKSEK)


func tur_basladi(girenler: Array) -> void:
	var adlar: Array[String] = []
	for k in girenler.slice(0, 3):
		adlar.append(String(k["isim"]))
	var ek := " ve diğerleri" if girenler.size() > 3 else ""
	soyle("Tur %d başlıyor! Bol şans %s%s!" % [Yayin.tur_no, ", ".join(PackedStringArray(adlar)), ek], Onem.YUKSEK)


func patlama(sayi: int) -> void:
	if sayi > 0 and randf() < 0.6:
		soyle(PATLAMA.pick_random() % sayi, Onem.DUSUK)


func final(a: String, b: String) -> void:
	soyle("FİNAL! %s ile %s kapışıyor. Tek sandalye, tek şampiyon!" % [a, b], Onem.YUKSEK)


func kazanan(isim: String, sayi: int) -> void:
	var ek := "" if sayi <= 1 else " Bugün %d. zaferi!" % sayi
	soyle("Tebrikler %s! Bu turun şampiyonu sensin!%s" % [isim, ek], Onem.YUKSEK)
	konustu.emit("dans")


func _hatirlat() -> void:
	var havuz: Array = HATIRLATMA_OYUN if Yayin.faz == Yayin.Faz.OYUN else HATIRLATMA_SIRA
	var l := havuz.duplicate()
	l.erase(_son_hatirlatma)
	_son_hatirlatma = l.pick_random()
	soyle(_son_hatirlatma, Onem.DUSUK)
