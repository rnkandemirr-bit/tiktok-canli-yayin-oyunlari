extends Node
## TikTok köprüsüne (DugunKonvoyu/server.js, ws://localhost:8787) bağlanır.
## Gelen olaylar: gift, like, chat, member, info, reset

signal hediye(kullanici: String, isim: String, jeton: int, hediye_adi: String)
signal begeni(kullanici: String, isim: String, adet: int)
signal yorum(kullanici: String, isim: String, metin: String)
signal giris(kullanici: String, isim: String)
signal durum(metin: String)
signal foto(kullanici: String, adres: String)   # profil fotoğrafı adresi

const ADRES := "ws://localhost:8787"
var ws := WebSocketPeer.new()
var bagli := false
var _bekle := 0.0

func _ready() -> void:
	_baglan()

func _baglan() -> void:
	ws = WebSocketPeer.new()
	ws.inbound_buffer_size = 1 << 20
	var err := ws.connect_to_url(ADRES)
	if err != OK:
		_bekle = 3.0

func _process(dt: float) -> void:
	if _bekle > 0.0:
		_bekle -= dt
		if _bekle <= 0.0:
			_baglan()
		return
	ws.poll()
	var st := ws.get_ready_state()
	if st == WebSocketPeer.STATE_OPEN:
		if not bagli:
			bagli = true
			durum.emit("Köprüye bağlandı")
		while ws.get_available_packet_count() > 0:
			_isle(ws.get_packet().get_string_from_utf8())
	elif st == WebSocketPeer.STATE_CLOSED:
		if bagli:
			durum.emit("Köprü koptu, tekrar deneniyor…")
		bagli = false
		_bekle = 3.0

func _isle(metin: String) -> void:
	var m = JSON.parse_string(metin)
	if typeof(m) != TYPE_DICTIONARY:
		return
	var k := str(m.get("user", ""))
	var isim := str(m.get("nick", k))
	var pic := str(m.get("pic", ""))
	if k != "" and pic.begins_with("http"):
		foto.emit(k, pic)
	match str(m.get("type", "")):
		"gift":
			hediye.emit(k, isim, int(m.get("coins", 1)), str(m.get("giftName", "")))
		"like":
			begeni.emit(k, isim, int(m.get("count", 1)))
		"chat":
			yorum.emit(k, isim, str(m.get("text", "")))
		"member":
			giris.emit(k, isim)
		"info":
			durum.emit(str(m.get("text", "")))
