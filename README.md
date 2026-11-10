# 🎮 TikTok Canlı Yayın Oyunları

İzleyicilerin **beğeni, yorum ve hediyeleriyle** oynanan 4 TikTok LIVE oyunu.
"1 hafta boyunca TikTok'ta yayın açtım" YouTube videosunda gösterilen oyunların kodları.

| # | Oyun | Ne yapıyor | Teknoloji |
|---|------|-----------|-----------|
| 1 | 🏍️ **Motor Drift Yarışı** | 100 beğeni = yarışa katıl, her gül = +5 güç, Donut = Kawasaki | Godot 4.7 |
| 2 | 👑 **Kral Merdiveni** (Taht Kavgası) | Gül = 1 basamak çık, Donut = tahta otur | Godot 4.7 (scriptler) |
| 3 | 💍 **Düğün Konvoyu** | 100 beğeni = arabanla katıl, gül = makas atıp öne geç, Donut = gelin arabası | Node.js + Three.js |
| 4 | 🐺 **Muck TikTok Modu** | Hediyeler oyunda canavar çıkarır (gül = kurt, büyük hediye = Bob ejderhası) | BepInEx mod (C#) + Node.js |

Hepsi TikTok'a aynı yöntemle bağlanır: küçük bir **Node.js köprüsü**
([tiktok-live-connector](https://github.com/zerodytrash/TikTok-Live-Connector)) yayındaki olayları okur ve oyuna
WebSocket/TCP ile gönderir. Resmi bir TikTok API'si değildir; TikTok bir şey değiştirirse
`npm update tiktok-live-connector` gerekebilir.

---

## ⚙️ Gerekenler
- **Windows 10/11**
- **Node.js 18+** → https://nodejs.org
- **Godot 4.7 (.NET / mono)** → https://godotengine.org (Motor ve Kral Merdiveni için)
- **TikTok LIVE Studio** (oyun penceresini yayına almak için)

Her klasörde `KULLANICI_ADIN` yazan yerlere **kendi TikTok kullanıcı adını** (@ olmadan) yaz.
Köprü klasörlerinde `ayarlar.ornek.json` dosyasını `ayarlar.json` olarak kopyalayıp düzenle.

---

## 1️⃣ Motor Drift Yarışı (`1_MotorDriftYarisi/`)
1. Önce `3_DugunKonvoyu` klasöründe bir kez `npm install` çalıştır (motor oyunu bu köprüyü kullanır, port 8787).
2. **3D modelleri kendin eklemelisin** (lisans nedeniyle depoda yok, aşağıya bak):
   - Pist → `assets/pist/pist.glb` (yoksa oyun basit bir yol üretir; `rota.json` hazır)
   - Motorlar → `assets/motorlar/*.glb`, liste `assets/motorlar/motorlar.json` içinde
   - Sürücüler → `assets/suruculer/s1.glb ... s45.glb`
   - Dönüştürme araçları `araclar/` klasöründe (Blender ile: `motor_cevir.py`, `surucu_poz.py`, `pist_cevir.py`)
3. `BASLAT.bat` → köprüyü açar, oyunu başlatır.

**Kurallar:** ❤️ 100 beğeni = katıl · ⏱️ 1 dk lobi · 🌹 her gül +5 güç · 🎁 özel motorlar hediyeyle
(🍩 Donut = Kawasaki, 💐 Parfüm = Spirit, 💖 Parmak Kalp = Neo Hyper, 🎵 TikTok = Cafe Racer) ·
yarışta hediye = nitro + şahlanma. Hediye/güç ayarları `motorlar.json` içinde.

**Test tuşları:** 1 = gül, 2 = donut, 3 = 100 beğeni, 4 = yarışı hemen başlat.
**Botlu otomatik deneme:** `godot --path . -- --sahte` (sahte beğeni/gül/hediye atar; `--sure=150` = 150 sn sonra kapan)

## 2️⃣ Kral Merdiveni / Taht Kavgası (`2_KralMerdiveni_TahtKavgasi/`)
Bu mod, yapımcının Steam oyunu **Mahalle Kaosu**'nun içinde çalışır; burada yalnızca
yayın modu **scriptleri** ve TikTok köprüsü paylaşılıyor (karakterler, danslar, taht modelleri oyuna ait).
Kendi Godot projene uyarlamak için `Scripts/Yayin/taht_kavgasi.gd` iyi bir başlangıç.
Kurallar: ❤️ 200 beğeni = sahneye gir · 🌹 gül = 1 basamak (doluysa birini düşürür) · 5+ jeton = 3 basamak ·
🍩 Donut = tahta otur · yoruma "kral"/"kraliçe" = taht seç.

## 3️⃣ Düğün Konvoyu (`3_DugunKonvoyu/`)
1. `npm install`
2. `BASLAT.bat` içinde `KADI=KULLANICI_ADIN` satırına kullanıcı adını yaz, çalıştır.
3. Tarayıcıda `http://localhost:8787` (ya da `PENCERE.bat`).
   - Denemek için: `http://localhost:8787/?demo` (sahte izleyiciler)
   - Sessiz deneme: `?sessiz`
4. **Araba modeli:** `models/arabalar.glb` dosyası depoda yok (lisans); kendi araç paketini (glb) koy.
   Müzik için `muzik/` klasörüne kendi şarkılarını at.

**Kurallar:** ❤️ 100 beğeni = konvoya katıl · 🌹 gül = makas (şerit değiştirip öndekini geçer) ·
🥇 birinci = sağdıç · 🍩 Donut = gelin arabası (yeni donut gelirse el değiştirir) · 💬 yorum = araba üstünde balon ·
🌦️ hava her 2,5 dk'da değişir (gündüz / gün batımı / gece / yağmur / kar).

## 4️⃣ Muck TikTok Modu (`4_Muck_TikTok/`)
1. Muck'ı Steam'den kur (ücretsiz, yapımcı: Dani) ve **BepInEx 5** yükle.
2. `Mod/MuckTikTok.dll` → `Muck/BepInEx/plugins/` (ya da `Mod/derle.sh` ile kaynaktan derle).
3. `TikTokKopru` içinde `npm install`, `ayarlar.json`'a kullanıcı adını yaz.
4. Ayrıntılar ve hediye → yaratık listesi: `OKU.txt`. Sadece tek oyunculu oyunda kullan.

---

## 📜 Künye / Lisanslar
- Motor sesleri: **dklon** — "Engines - Startup, Idle & Rev", [OpenGameArt](https://opengameart.org/content/engines-startup-idle-rev), **CC-BY-SA 3.0** (`1_MotorDriftYarisi/assets/ses/` bu lisansla dağıtılır)
- Emoji ikonları: **Twemoji** — Twitter, Inc. ve katkıda bulunanlar, **CC-BY 4.0**
- three.js (MIT), tiktok-live-connector (MIT), BepInEx (LGPL)
- **Depoda olmayanlar** (başkalarının malı, kendin edinmelisin): motosiklet modelleri, drift pisti,
  karakter modelleri, araba modelleri, Muck oyunu, Mahalle Kaosu oyun dosyaları.

Bu oyunları kendi yayınında kullanabilirsin; videoda kaynak göstermen yeter. İyi yayınlar! 🌹
