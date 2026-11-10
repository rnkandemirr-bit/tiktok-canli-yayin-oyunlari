// Düğün Konvoyu - TikTok canlı yayın köprüsü
// Kullanım:  node server.js KULLANICI_ADIN      (ör: node server.js ahmet_yayinda)
// Sonra OBS / TikTok LIVE Studio'da tarayıcı kaynağı:  http://localhost:8787
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = 8787;
const username = (process.argv[2] || '').replace(/^@/, '');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.glb': 'model/gltf-binary',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.json': 'application/json' };
const ROUTES = { '/three/': path.join(__dirname, 'node_modules', 'three'), '/models/': path.join(__dirname, 'models'),
  '/sounds/': path.join(__dirname, 'sounds'), '/muzik/': path.join(__dirname, 'muzik') };
function sendFile(res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
}
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') return sendFile(res, path.join(__dirname, 'konvoy3d.html'));
  if (url === '/yeni') return sendFile(res, path.join(__dirname, 'konvoy3d.yeni.html'));
  if (url === '/anons') return sendFile(res, path.join(__dirname, 'anons.html'));
  if (url === '/2d') return sendFile(res, path.join(__dirname, 'konvoy.html'));
  if (url === '/muzik-liste') { let list = []; try { list = fs.readdirSync(path.join(__dirname, 'muzik')).filter(f => /.(mp3|ogg|wav|m4a)$/i.test(f)); } catch {} res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(list)); }
  if (url === '/sifirla') { send({ type: 'reset' }); console.log('🔄 Konvoy sıfırlandı'); res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Konvoy sıfırlandı'); }
  for (const [prefix, dir] of Object.entries(ROUTES)) {
    if (url.startsWith(prefix)) {
      const file = path.join(dir, url.slice(prefix.length));
      if (!file.startsWith(dir)) break;
      return sendFile(res, file);
    }
  }
  res.writeHead(404); res.end();
});
const wss = new WebSocketServer({ server });
let lastInfo = 'test modu';
const BOOT = Date.now();
wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'hello', boot: BOOT })); ws.send(JSON.stringify({ type: 'info', text: lastInfo }));
  // oyun <-> anons penceresi (kız sesi) arasında mesaj aktar
  ws.on('message', raw => { let m; try { m = JSON.parse(raw); } catch { return; }
    if (['anons', 'anons-bitti', 'ses-hazir'].includes(m.type)) { const s = JSON.stringify(m); wss.clients.forEach(c => c !== ws && c.readyState === 1 && c.send(s)); } });
});
function send(obj) { const s = JSON.stringify(obj); wss.clients.forEach(c => c.readyState === 1 && c.send(s)); }
function info(text) { lastInfo = text; console.log(text); send({ type: 'info', text }); }

// beklenmedik bir hata köprüyü kapatmasın
process.on('uncaughtException', e => console.log('Hata (devam ediliyor):', e && e.message || e));
process.on('unhandledRejection', e => console.log('Hata (devam ediliyor):', e && e.message || e));
server.on('error', e => {
  if (e.code === 'EADDRINUSE') { console.log(`\n⚠️  Köprü zaten açık (port ${PORT} kullanımda). Bu pencereyi kapatabilirsin.`); setTimeout(() => process.exit(2), 3000); }
  else console.log('Sunucu hatası:', e.message);
});
server.listen(PORT, () => {
  console.log(`\n🚗 Konvoy açık:  http://localhost:${PORT}`);
  console.log(`   Test butonları için: http://localhost:${PORT}/?test`);
  if (username) startTikTok(); else console.log('   (Kullanıcı adı verilmedi, sadece test modu)\n');
});

function avatarOf(u = {}) {
  return u.profilePicture?.url?.[0] || u.profilePicture?.urls?.[0] || u.profilePicture?.urlList?.[0]
      || u.avatarThumb?.urlList?.[0] || u.avatarThumb?.url?.[0] || u.profilePictureUrl || '';
}

function startTikTok() {
  const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');
  const conn = new TikTokLiveConnection(username, {});
  let debugged = false;
  const streaks = new Map();

  // tek bir yeniden deneme zamanlayıcısı: aynı anda iki bağlantı denemesi olmasın
  let connecting = false, retryTimer = null;
  const retry = (ms) => { if (retryTimer) return; retryTimer = setTimeout(() => { retryTimer = null; tryConnect(); }, ms); };
  const tryConnect = () => {
    if (connecting) return; connecting = true;
    info(`@${username} yayınına bağlanılıyor…`);
    conn.connect()
      .then(s => { connecting = false; info(`@${username} bağlı (oda ${s.roomId})`); })
      .catch(e => {
        connecting = false;
        const msg = String(e && e.message || e);
        info(/online|offline|live/i.test(msg) ? 'Yayın kapalı, açılmasını bekliyorum… (10 sn’de bir kontrol)' : `Bağlanamadı: ${msg}. 10 sn sonra tekrar…`);
        retry(10000);
      });
  };
  conn.on(ControlEvent.DISCONNECTED, () => { info('Bağlantı koptu, tekrar deneniyor…'); retry(5000); });
  conn.on('error', () => {}); // bağlantı hataları yukarıda sade mesajla gösteriliyor
  conn.on(WebcastEvent.STREAM_END, () => info('Yayın bitti.'));

  conn.on(WebcastEvent.GIFT, data => {
    const u = data.user || {};
    const id = u.uniqueId || u.userId || u.nickname; if (!id) return;
    const gd = data.giftDetails || data.gift || {}, ext = data.extendedGiftInfo || {};
    if (!debugged) { debugged = true; try { fs.writeFileSync(path.join(__dirname, 'debug_gift.json'), JSON.stringify(data, (k, v) => typeof v === 'bigint' ? String(v) : v, 2)); } catch {} }
    const giftName = gd.giftName || gd.name || ext.name || data.giftName || '';
    const diamonds = Number(gd.diamondCount || ext.diamond_count || ext.diamondCount || data.diamondCount || 1) || 1;
    const giftType = Number(gd.giftType || gd.type || ext.type || data.giftType || 0);
    const repeat = Number(data.repeatCount || 1);

    let count = repeat;
    { // seri (kombo) hediye: sadece yeni eklenenleri say, seri bitiş mesajını tekrar sayma
      const key = id + ':' + data.giftId, last = streaks.get(key) || 0;
      if (data.repeatEnd && repeat <= last) count = 0;
      else count = repeat > last ? repeat - last : repeat;
      if (data.repeatEnd) streaks.delete(key); else streaks.set(key, repeat);
    }
    if (count <= 0) return;

    const isRose = data.giftId === 5655 || /rose|gül/i.test(giftName);
    const isDonut = data.giftId === 5879 || /dou?ghnut|donut|halka tatlı|çörek/i.test(giftName);
    console.log(`🎁 ${u.nickname || id}: ${giftName || 'hediye #' + data.giftId} x${count} (${diamonds * count} jeton)${isRose ? '  ✂️ MAKAS' : ''}${isDonut ? '  🍩 GELİN ARABASI' : ''}`);
    send({ type: 'gift', user: id, nick: u.nickname || id, pic: avatarOf(u), coins: diamonds * count, count, isRose, isDonut, giftName });
  });

  // TikTok her beğeni mesajını göndermiyor (~%40'ı kayboluyor). Odanın toplam beğeni sayısı
  // ise doğru geliyor: iki mesaj arasındaki toplam artışını kısmen bu kişiye sayarak kaybı telafi et.
  let lastTotal = 0;
  conn.on(WebcastEvent.LIKE, data => {
    const u = data.user || {}, id = u.uniqueId || u.userId || u.nickname;
    if (!id) return;
    let count = Number(data.likeCount || data.count || 1) || 1;
    const total = Number(data.total || data.totalLikeCount || 0);
    if (total > 0) {
      if (lastTotal > 0 && total > lastTotal) count = Math.max(count, Math.min(total - lastTotal, count * 2));
      if (total > lastTotal) lastTotal = total;
    }
    send({ type: 'like', count, user: id, nick: u.nickname || id, pic: avatarOf(u) });
  });
  // yorumlar: arabaların üstünde baloncuk
  conn.on(WebcastEvent.CHAT, data => {
    const u = data.user || {}, id = u.uniqueId || u.userId || u.nickname; if (!id || !data.comment) return;
    send({ type: 'chat', user: id, nick: u.nickname || id, pic: avatarOf(u), text: String(data.comment).slice(0, 120) });
  });
  // yayına katılan izleyiciler: hoş geldin anonsu
  conn.on(WebcastEvent.MEMBER, data => {
    const u = data.user || {}, id = u.uniqueId || u.userId || u.nickname; if (!id) return;
    send({ type: 'member', user: id, nick: u.nickname || id });
  });
  tryConnect();
}
