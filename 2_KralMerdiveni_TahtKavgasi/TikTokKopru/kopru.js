// TikTok canli yayin -> Mahalle Kaosu kopru.
// TikTok yayinindaki yorum ve hediyeleri dinler, yerel WebSocket ile oyuna iletir.
// Kullanim: node kopru.js [tiktok_kullanici_adi]   (ya da ayarlar.json'a yaz)

import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { WebSocketServer } from 'ws';
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const klasor = path.dirname(fileURLToPath(import.meta.url));

// Ekrana yazilanlari kopru.log dosyasina da yaz (her acilista sifirlanir)
const logYolu = path.join(klasor, 'kopru.log');
try { fs.writeFileSync(logYolu, ''); } catch { /* yazilamazsa sadece ekran */ }
const ekranaYaz = console.log.bind(console);
console.log = (...p) => {
    ekranaYaz(...p);
    const saat = new Date().toLocaleTimeString('tr-TR');
    try { fs.appendFileSync(logYolu, `${saat} ${p.map(String).join(' ')}\n`); } catch { /* yoksay */ }
};
const ayarYolu = path.join(klasor, 'ayarlar.json');
let ayarlar = { kullanici: '', port: 21213, signApiKey: '' };
try {
    ayarlar = { ...ayarlar, ...JSON.parse(fs.readFileSync(ayarYolu, 'utf8')) };
} catch { /* ayar dosyasi yoksa varsayilanlar */ }
if (process.argv[2]) ayarlar.kullanici = process.argv[2];
ayarlar.kullanici = String(ayarlar.kullanici || '').replace(/^@/, '').trim();

if (!ayarlar.kullanici) {
    console.log('TikTok kullanici adi yok. ayarlar.json icine "kullanici" yaz ya da: node kopru.js kullanici_adin');
    process.exit(1);
}

// ---------------------------------------------------------------- yayin paneli (HTTP) + oyuna giden WebSocket
// http://127.0.0.1:<port>/panel  -> dikey yayin icin hediye paneli (LIVE Studio'da yakalanir)
const panelKlasoru = path.join(klasor, 'panel');
const gorselKlasoru = path.join(klasor, '..', 'Yaratik_Gorselleri');
const sade = (s) => String(s).toLowerCase().replace(/\.png$/, '').replace(/[^a-z0-9]/g, '');

function gorselBul(anahtar) {
    let dosyalar = [];
    try { dosyalar = fs.readdirSync(gorselKlasoru).filter((f) => f.toLowerCase().endsWith('.png')); } catch { return null; }
    const a = sade(anahtar);
    const tam = dosyalar.find((f) => sade(f) === a) || dosyalar.find((f) => sade(f).includes(a));
    return tam ? path.join(gorselKlasoru, tam) : null;
}

function dosyaGonder(yanit, yol, tip) {
    fs.readFile(yol, (hata, veri) => {
        if (hata) { yanit.writeHead(404); yanit.end(); return; }
        yanit.writeHead(200, { 'Content-Type': tip, 'Cache-Control': 'no-cache' });
        yanit.end(veri);
    });
}

// ---------------------------------------------------------------- dugun halayi sahnesi
// http://127.0.0.1:<port>/halay          -> 3D halay sahnesi (LIVE Studio "Baglanti" kaynagi)
// http://127.0.0.1:<port>/halay/kontrol  -> sarki secimi + test paneli (tarayicida ac)
const halayKlasoru = path.join(klasor, 'halay');
const muzikKlasoru = path.join(halayKlasoru, 'muzik');
const muzikUzantilari = /\.(mp3|m4a|ogg|wav|aac|flac|webm)$/i;
const tipler = { '.js': 'text/javascript', '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.aac': 'audio/aac', '.flac': 'audio/flac', '.webm': 'audio/webm' };
const tipBul = (yol) => tipler[path.extname(yol).toLowerCase()] || 'application/octet-stream';

// Klasor disina cikmayi engelle
function guvenliYol(kok, ad) {
    const yol = path.resolve(kok, ad);
    return yol.startsWith(path.resolve(kok) + path.sep) ? yol : null;
}

// Ses dosyasi: tarayici ileri sarma / sure icin Range ister
function akisGonder(istek, yanit, yol) {
    fs.stat(yol, (hata, bilgi) => {
        if (hata || !bilgi.isFile()) { yanit.writeHead(404); yanit.end(); return; }
        const boyut = bilgi.size;
        const aralik = /bytes=(\d*)-(\d*)/.exec(istek.headers.range || '');
        const ortak = { 'Content-Type': tipBul(yol), 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' };
        if (aralik) {
            const bas = aralik[1] ? Number(aralik[1]) : 0;
            const son = aralik[2] ? Math.min(Number(aralik[2]), boyut - 1) : boyut - 1;
            yanit.writeHead(206, { ...ortak, 'Content-Range': `bytes ${bas}-${son}/${boyut}`, 'Content-Length': son - bas + 1 });
            fs.createReadStream(yol, { start: bas, end: son }).pipe(yanit);
        } else {
            yanit.writeHead(200, { ...ortak, 'Content-Length': boyut });
            fs.createReadStream(yol).pipe(yanit);
        }
    });
}

// TikTok profil fotografi: sahne WebGL'de kullanabilsin diye kendi adresimizden ver (CORS)
const avatarOnbellek = new Map();
async function avatarGonder(yanit, adres) {
    try {
        const u = new URL(adres);
        if (!/^https:$/.test(u.protocol) || !/(tiktokcdn|ibyteimg|byteimg|muscdn)/.test(u.hostname)) throw new Error('izinsiz adres');
        let veri = avatarOnbellek.get(adres);
        if (!veri) {
            const c = await fetch(adres);
            if (!c.ok) throw new Error('indirilemedi');
            veri = { tip: c.headers.get('content-type') || 'image/jpeg', govde: Buffer.from(await c.arrayBuffer()) };
            if (avatarOnbellek.size > 300) avatarOnbellek.clear();
            avatarOnbellek.set(adres, veri);
        }
        yanit.writeHead(200, { 'Content-Type': veri.tip, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'max-age=3600' });
        yanit.end(veri.govde);
    } catch {
        yanit.writeHead(404); yanit.end();
    }
}

function halayIstegi(istek, yanit, u, sorgu) {
    if (u === '/halay' || u === '/halay/') return dosyaGonder(yanit, path.join(halayKlasoru, 'sahne.html'), 'text/html; charset=utf-8'), true;
    if (u === '/halay/kontrol') return dosyaGonder(yanit, path.join(halayKlasoru, 'kontrol.html'), 'text/html; charset=utf-8'), true;
    if (u === '/halay/muzik-listesi') {
        let liste = [];
        try { liste = fs.readdirSync(muzikKlasoru).filter((f) => muzikUzantilari.test(f)).sort((a, b) => a.localeCompare(b, 'tr')); } catch { /* klasor yok */ }
        yanit.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
        yanit.end(JSON.stringify(liste));
        return true;
    }
    let m = u.match(/^\/halay\/muzik\/(.+)$/);
    if (m) {
        const yol = guvenliYol(muzikKlasoru, m[1]);
        if (yol) akisGonder(istek, yanit, yol); else { yanit.writeHead(404); yanit.end(); }
        return true;
    }
    m = u.match(/^\/halay\/(.+)$/);
    if (m) {
        const yol = guvenliYol(halayKlasoru, m[1]);
        if (yol && !yol.startsWith(path.resolve(muzikKlasoru))) dosyaGonder(yanit, yol, tipBul(yol));
        else { yanit.writeHead(404); yanit.end(); }
        return true;
    }
    if (u === '/avatar') { avatarGonder(yanit, sorgu.get('u') || ''); return true; }
    return false;
}

const httpSunucu = http.createServer((istek, yanit) => {
    const tam = new URL(istek.url || '/', 'http://yerel');
    const u = decodeURIComponent(tam.pathname);
    if (halayIstegi(istek, yanit, u, tam.searchParams)) return;
    if (u === '/' || u === '/panel') return dosyaGonder(yanit, path.join(panelKlasoru, 'panel.html'), 'text/html; charset=utf-8');
    let m = u.match(/^\/ikon\/([0-9a-f-]+)\.png$/);
    if (m) return dosyaGonder(yanit, path.join(panelKlasoru, 'ikonlar', m[1] + '.png'), 'image/png');
    m = u.match(/^\/gorsel\/(.+)$/);
    if (m) {
        const yol = gorselBul(m[1]);
        if (yol) return dosyaGonder(yanit, yol, 'image/png');
    }
    yanit.writeHead(404); yanit.end();
});
httpSunucu.listen(ayarlar.port, '127.0.0.1');
const sunucu = new WebSocketServer({ server: httpSunucu });
let sonDurum = { tur: 'durum', bagli: false, metin: 'TikTok\'a baglaniliyor...' };
let sonKartlar = null;   // Muck modunun gonderdigi kart listesi (panel icin)

// Muck gibi WebSocket'siz modlar icin duz TCP: her mesaj bir satir JSON (port + 1)
const tcpIstemciler = new Set();
const tcpSunucu = net.createServer((soket) => {
    tcpIstemciler.add(soket);
    console.log('[oyun] TCP oyun baglandi (Muck modu).');
    soket.write(JSON.stringify(sonDurum) + '\n');
    // Moddan gelen geri bildirim: kart listesi ve tetiklenen kartlar -> panele
    let tampon = '';
    soket.on('data', (parca) => {
        tampon += parca.toString('utf8');
        let i;
        while ((i = tampon.indexOf('\n')) >= 0) {
            const satir = tampon.slice(0, i).trim();
            tampon = tampon.slice(i + 1);
            if (!satir) continue;
            let mesaj;
            try { mesaj = JSON.parse(satir); } catch { continue; }
            if (mesaj.tur === 'kartlar') sonKartlar = mesaj;
            panelYayinla(mesaj);
        }
    });
    soket.on('close', () => tcpIstemciler.delete(soket));
    soket.on('error', () => tcpIstemciler.delete(soket));
});

function panelYayinla(mesaj) {
    const json = JSON.stringify(mesaj);
    for (const istemci of sunucu.clients) {
        if (istemci.readyState === 1) istemci.send(json);
    }
}
tcpSunucu.listen(ayarlar.port + 1, '127.0.0.1');

function yayinla(mesaj) {
    const json = JSON.stringify(mesaj);
    for (const istemci of sunucu.clients) {
        if (istemci.readyState === 1) istemci.send(json);
    }
    for (const soket of tcpIstemciler) soket.write(json + '\n');
}

function durum(bagli, metin) {
    sonDurum = { tur: 'durum', bagli, metin };
    console.log(`[durum] ${metin}`);
    yayinla(sonDurum);
}

let sonMuzik = null;   // halay: calan sarki (sonradan acilan sahne de bilsin)
sunucu.on('connection', (istemci) => {
    console.log('[oyun] Bir oyun / yayin paneli baglandi.');
    istemci.send(JSON.stringify(sonDurum));
    if (sonKartlar) istemci.send(JSON.stringify(sonKartlar));
    if (sonMuzik) istemci.send(JSON.stringify(sonMuzik));
    // Halay kontrol paneli -> sahne: komutlar ve test hediyeleri diger WebSocket istemcilerine aktarilir
    istemci.on('message', (ham) => {
        let mesaj;
        try { mesaj = JSON.parse(String(ham)); } catch { return; }
        if (!mesaj || typeof mesaj.tur !== 'string') return;
        const halayKomutu = mesaj.tur.startsWith('halay');
        if (!halayKomutu && !mesaj.test) return;
        if (mesaj.tur === 'halayMuzik') sonMuzik = mesaj;
        const json = JSON.stringify(mesaj);
        for (const diger of sunucu.clients) {
            if (diger !== istemci && diger.readyState === 1) diger.send(json);
        }
    });
});
console.log(`[oyun] Oyun icin ws://127.0.0.1:${ayarlar.port} ve tcp://127.0.0.1:${ayarlar.port + 1} dinleniyor.`);
console.log(`[panel] Dikey yayin paneli: http://127.0.0.1:${ayarlar.port}/panel`);

// ---------------------------------------------------------------- TikTok baglantisi
const secenekler = { enableExtendedGiftInfo: false, processInitialData: false };
if (ayarlar.signApiKey) secenekler.signApiKey = ayarlar.signApiKey;
const baglanti = new TikTokLiveConnection(ayarlar.kullanici, secenekler);

function kullanici(veri) {
    const u = veri.user || {};
    // Kutuphane surumune gore kullanici adi displayId ya da uniqueId alaninda gelir
    const ad = String(u.uniqueId || u.displayId || u.id || '');
    return { kullanici: ad, isim: String(u.nickname || ad || 'izleyici'), avatar: avatarBul(u) };
}

// Profil fotografi adresi kutuphane surumune gore farkli alanlarda gelir
function avatarBul(u) {
    const adaylar = [u.profilePictureUrl, u.profilePicture, u.avatarThumb, u.avatarMedium, u.avatarLarger];
    for (const a of adaylar) {
        if (!a) continue;
        if (typeof a === 'string' && a.startsWith('http')) return a;
        const liste = a.url || a.urlList || a.urls || a.url_list;
        if (Array.isArray(liste)) {
            const ilk = liste.find((x) => typeof x === 'string' && x.startsWith('http') && !x.includes('.heic'));
            if (ilk) return ilk;
        }
    }
    return '';
}

baglanti.on(WebcastEvent.CHAT, (veri) => {
    const k = kullanici(veri);
    if (!k.kullanici) return;
    // Yeni surumde yorum metni "content" alaninda geliyor
    const metin = String(veri.comment || veri.content || '');
    console.log(`[yorum] ${k.kullanici}: ${metin}`);
    yayinla({ tur: 'yorum', ...k, metin });
});

const sonHediyeler = new Map();
baglanti.on(WebcastEvent.GIFT, (veri) => {
    const k = kullanici(veri);
    if (!k.kullanici) return;
    const tipi = veri.giftDetails?.giftType;
    const jeton = Number(veri.giftDetails?.diamondCount ?? veri.extendedGiftInfo?.diamond_count ?? 1) || 1;
    const hediye = String(veri.giftDetails?.giftName ?? veri.extendedGiftInfo?.name ?? `hediye ${veri.giftId}`);
    // Seri hediyelerde (gul vb.) seri baslar baslamaz bir kez ilet; seri sonunda toplam adedi ayrica bildir
    // (halay sahnesi jeton toplamini dogru saysin; Muck modu bu turu yok sayar)
    if (tipi === 1 && veri.repeatEnd) {
        const toplam = Number(veri.repeatCount || 1);
        if (toplam > 1) {
            console.log(`[hediye] ${k.kullanici}: ${hediye} serisi bitti x${toplam}`);
            yayinla({ tur: 'hediyeSeri', ...k, hediye, adet: toplam, jeton });
        }
        return;
    }
    const adet = Number(veri.repeatCount || 1);
    // Ayni hediye bazen iki olay olarak gelir (seri basi + sonu, tur bilgisi bos). 4 sn icinde ayni
    // kisi + hediye + adet tekrar gelirse bir kez say.
    const anahtar = `${k.kullanici}|${veri.giftId}|${adet}`;
    const simdi = Date.now();
    if (simdi - (sonHediyeler.get(anahtar) || 0) < 4000) return;
    sonHediyeler.set(anahtar, simdi);
    if (sonHediyeler.size > 500) sonHediyeler.clear();
    console.log(`[hediye] ${k.kullanici}: ${hediye} x${adet} (${jeton} jeton)`);
    yayinla({ tur: 'hediye', ...k, hediye, adet, jeton });
});

// Begeni (Muck modu begeniyi yorum gibi sayar)
baglanti.on(WebcastEvent.LIKE, (veri) => {
    const k = kullanici(veri);
    if (k.kullanici) yayinla({ tur: 'begeni', ...k, adet: Number(veri.likeCount || 1) });
});

// Yayina giren izleyici (asistan hos geldin der)
baglanti.on(WebcastEvent.MEMBER, (veri) => {
    const k = kullanici(veri);
    if (k.kullanici) yayinla({ tur: 'giris', ...k });
});

baglanti.on(WebcastEvent.FOLLOW, (veri) => {
    const k = kullanici(veri);
    if (k.kullanici) yayinla({ tur: 'takip', ...k });
});

baglanti.on(WebcastEvent.SHARE, (veri) => {
    const k = kullanici(veri);
    if (k.kullanici) yayinla({ tur: 'paylasim', ...k });
});

// Teshis: TikTok'tan gelen mesaj turlerini 20 sn'de bir ozetle
let sayac = {};
let sonVeri = Date.now();
baglanti.on(ControlEvent.DECODED_DATA, (tur) => { sayac[tur] = (sayac[tur] || 0) + 1; sonVeri = Date.now(); });

// Bekci: yayin bitip yenisi acilinca baglanti eski odada asili kalabiliyor (hic veri gelmez).
// Bagliyken 90 sn hic veri gelmezse baglantiyi kapatip yeniden baglan (yeni odayi bulur).
setInterval(async () => {
    if (!baglanti.isConnected || Date.now() - sonVeri < 90000) return;
    console.log('[bekci] 90 sn TikTok\'tan veri gelmedi, yeniden baglaniliyor...');
    sonVeri = Date.now();
    try { await baglanti.disconnect(); } catch { /* zaten kopuk */ }
    setTimeout(baglan, 2000);
}, 15000);
baglanti.on(ControlEvent.ERROR, (h) => console.log('[hata]', h?.info || '', h?.exception?.message || h?.message || ''));
setInterval(() => {
    const ozet = Object.entries(sayac).map(([t, n]) => `${t}:${n}`).join(' ');
    if (ozet) console.log(`[gelen] ${ozet}`);
    sayac = {};
}, 20000);

baglanti.on(WebcastEvent.STREAM_END, () => {
    durum(false, 'Yayin bitti. Yeni yayin bekleniyor...');
    setTimeout(baglan, 15000);
});

baglanti.on(ControlEvent.DISCONNECTED, () => {
    durum(false, 'TikTok baglantisi koptu, 15 sn sonra tekrar denenecek.');
    setTimeout(baglan, 15000);
});

let baglaniyor = false;
async function baglan() {
    if (baglaniyor || baglanti.isConnected) return;
    baglaniyor = true;
    try {
        const s = await baglanti.connect();
        sonVeri = Date.now();
        durum(true, `@${ayarlar.kullanici} yayinina baglandi (oda ${s.roomId}).`);
    } catch (hata) {
        const ad = hata?.constructor?.name || '';
        const neden = ad.includes('Offline') ? 'yayin acik degil' : (hata?.message || String(hata));
        durum(false, `@${ayarlar.kullanici}: ${neden}. 15 sn sonra tekrar denenecek.`);
        setTimeout(baglan, 15000);
    } finally {
        baglaniyor = false;
    }
}

baglan();
