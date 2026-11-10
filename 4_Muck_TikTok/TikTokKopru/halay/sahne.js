/* Kurt Halayi - TikTok canli yayin sahnesi.
   Gece, orman kampi, ortada kamp atesi. Hediye atan kurt olup halaya katilir.
   Pahali hediyeyle Halay Basi / Alfa Kurt / Leydi Alfa olunur. Alfalar arada aya uluyur.
   Halay dongusu (32 vurus): halay adimi -> horon titremesi -> cokme -> HOPPA ziplamasi.
   three.js r128 (LIVE Studio'nun eski tarayici motoru icin ?. ve ?? kullanilmadi). */
(function () {
  'use strict';

  // ============================================================ ayarlar
  var Q = new URLSearchParams(location.search);
  var DUSUK = Q.get('kalite') === 'dusuk';
  var GUNDUZ = Q.get('gece') !== '1';   // varsayilan gunduz; ?gece=1 ile dolunay gecesi
  var MERKEZ = new THREE.Vector3(0, 0, 0);    // kamp atesi
  var HAT_MIN_R = 4.2, HAT_MAKS_R = 8.4;
  var KALCA_Y = 0.95;
  var KAYIT = 'kurtHalayi.v1';
  var NPC_SAYI = 9;
  var MAKS_DANSCI = 70;
  var ayar = { damatFiyat: 1000, gelinFiyat: 1000, halaybasiFiyat: 300, ortamAcik: true, ortamSes: 0.5, efektSes: 0.8,
    gulAd: 'Rose, Gül', donutAd: 'Doughnut, Donut', cayAd: 'Tea, Çay', paraAd: 'Money Gun, Para Tabancası', begeniKatil: 500 };
  var ROL_AD = { damat: 'Alfa Kurt', gelin: 'Leydi Alfa', halaybasi: 'Halay Başı' };
  var ROL_EMOJI = { damat: '🐺', gelin: '🌙', halaybasi: '🔥' };
  var AY_YON = new THREE.Vector3(-0.3, 0.3, -1).normalize();
  var AY_YAW = Math.atan2(AY_YON.x, AY_YON.z);   // aya donuk yatay yon
  function fiyat(rol) { return rol === 'damat' ? ayar.damatFiyat : (rol === 'gelin' ? ayar.gelinFiyat : ayar.halaybasiFiyat); }

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function sec(d) { return d[Math.floor(Math.random() * d.length)]; }
  function sinirla(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function yumusak(x) { x = sinirla(x, 0, 1); return x * x * (3 - 2 * x); }
  var zamanKaydir = 0;   // test icin zamani ileri sarma (halay.ileri)
  function simdi() { return performance.now() / 1000 + zamanKaydir; }
  function mod(a, n) { return ((a % n) + n) % n; }

  // ============================================================ cizici
  var tuval = document.getElementById('sahne');
  var renderer = new THREE.WebGLRenderer({ canvas: tuval, antialias: !DUSUK, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DUSUK ? 1 : 1.5));
  var scene = new THREE.Scene();
  var SIS_RENK = 0x0b1221;
  scene.background = new THREE.Color(0x03050c);
  scene.fog = new THREE.FogExp2(SIS_RENK, 0.03);
  var kamera = new THREE.PerspectiveCamera(56, 1, 0.1, 300);
  var composer = null, bloom = null;
  if (!DUSUK && THREE.EffectComposer && THREE.UnrealBloomPass) {
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, kamera));
    bloom = new THREE.UnrealBloomPass(new THREE.Vector2(512, 512), 0.85, 0.55, 0.8);
    if (Q.get('gece') !== '1') bloom.threshold = 0.92;   // gunduz parlak gok parlamasin
    composer.addPass(bloom);
    composer.addPass(new THREE.ShaderPass(THREE.CopyShader));   // bazi motorlarda bloom son gecis olunca ekran kararıyor
  }

  var ui = document.getElementById('ui');
  function boyutla() {
    // sayfa gizliyken (LIVE Studio kaynagi kapali vb.) boyut 0 gelebilir: 0/0 kamerayi bozmasin
    var w = Math.max(2, window.innerWidth || 0), h = Math.max(2, window.innerHeight || 0);
    renderer.setSize(w, h, false);
    kamera.aspect = w / h;
    kamera.updateProjectionMatrix();
    if (composer) composer.setSize(w, h);
    var s = Math.min(w / 1080, h / 1920);
    ui.style.transform = 'scale(' + s + ')';
    if (yildizMat) yildizMat.uniforms.uPR.value = renderer.getPixelRatio() * Math.max(0.6, h / 1100);
  }
  window.addEventListener('resize', boyutla);

  // ============================================================ ortak geometri / malzeme
  var geoOnb = {};
  function geo(anahtar, yap) { return geoOnb[anahtar] || (geoOnb[anahtar] = yap()); }
  function silindir(r1, r2, h, s, acik, t0, tL) {
    return geo(['s', r1, r2, h, s, acik, t0, tL].join('_'), function () {
      return new THREE.CylinderGeometry(r1, r2, h, s || 12, 1, !!acik, t0 || 0, tL || Math.PI * 2);
    });
  }
  function koni(r, h, s) { return geo(['c', r, h, s].join('_'), function () { return new THREE.ConeGeometry(r, h, s || 8); }); }
  function kure(r, s) {
    return geo('k' + r + '_' + s, function () { return new THREE.SphereGeometry(r, s || 16, Math.max(8, Math.round((s || 16) * 0.75))); });
  }
  function kutu(x, y, z) { return geo(['b', x, y, z].join('_'), function () { return new THREE.BoxGeometry(x, y, z); }); }
  function simit(r, t, a, b, arc) {
    return geo(['t', r, t, a, b, arc].join('_'), function () { return new THREE.TorusGeometry(r, t, a, b, arc || Math.PI * 2); });
  }
  var matOnb = {};
  function mat(renk, ek) {
    var anahtar = renk + '|' + (ek ? JSON.stringify(ek) : '');
    if (!matOnb[anahtar]) {
      var o = { color: new THREE.Color(renk), roughness: 0.65, metalness: 0.05 };
      if (ek) for (var k in ek) o[k] = ek[k];
      matOnb[anahtar] = new THREE.MeshStandardMaterial(o);
    }
    return matOnb[anahtar];
  }
  var parlakOnb = {};
  function parlakMat(renk) {
    var c = new THREE.Color(renk), a = c.getHexString();
    return parlakOnb[a] || (parlakOnb[a] = new THREE.MeshBasicMaterial({ color: c }));
  }

  function tuvalYap(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function yumusakNokta(ic, dis) {
    var c = tuvalYap(128, 128), x = c.getContext('2d');
    var g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, ic); g.addColorStop(0.35, ic); g.addColorStop(1, dis);
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }
  function yuvarlakKutu(x, a, b, w, h, r) {
    x.beginPath(); x.moveTo(a + r, b); x.lineTo(a + w - r, b); x.quadraticCurveTo(a + w, b, a + w, b + r);
    x.lineTo(a + w, b + h - r); x.quadraticCurveTo(a + w, b + h, a + w - r, b + h); x.lineTo(a + r, b + h);
    x.quadraticCurveTo(a, b + h, a, b + h - r); x.lineTo(a, b + r); x.quadraticCurveTo(a, b, a + r, b); x.closePath();
  }
  var noktaDoku = yumusakNokta('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
  var golgeDoku = yumusakNokta('rgba(0,0,0,0.8)', 'rgba(0,0,0,0)');
  var haleDoku = (function () {
    var c = tuvalYap(128, 128), x = c.getContext('2d');
    var g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.15, 'rgba(255,255,255,0.55)'); g.addColorStop(0.45, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  function hale(renk, boy, opak) {
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haleDoku, color: renk, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: opak, fog: false }));
    s.scale.set(boy, boy, 1);
    return s;
  }

  // kurk dokusu: renkle carpilan ince tuy cizgileri
  var kurkDoku = (function () {
    var c = tuvalYap(256, 256), x = c.getContext('2d');
    x.fillStyle = '#d8d8d8'; x.fillRect(0, 0, 256, 256);
    // ust uste binen tuy tutamlari: koyu dipler, acik uclar
    for (var i = 0; i < 2600; i++) {
      var v = Math.round(rnd(150, 255)), px = rnd(-8, 264), py = rnd(-8, 264), uz = rnd(6, 16), eg = rnd(-2.5, 2.5);
      x.strokeStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + rnd(0.3, 0.65).toFixed(2) + ')'; x.lineWidth = rnd(0.7, 2.0);
      x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + eg, py + uz * 0.5, px + eg * 1.6, py + uz); x.stroke();
    }
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2);
    return t;
  })();
  var kurkOnb = {};
  function kurkMat(renk) {
    // ates + ay + dolgu isigi altinda acik kurkler patlamasin diye renk biraz kisilir
    if (kurkOnb[renk]) return kurkOnb[renk];
    var m = new THREE.MeshStandardMaterial({ color: new THREE.Color(renk).multiplyScalar(0.72), map: kurkDoku, bumpMap: kurkDoku, bumpScale: 0.2, roughness: 0.95, metalness: 0 });
    // kenarlarda yumusak tuy parlamasi: silueti kutu gibi degil tuylu gosterir
    m.onBeforeCompile = function (sh) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>',
        '{ float kFr = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));\n' +
        '  gl_FragColor.rgb += diffuseColor.rgb * (0.6 * pow(kFr, 2.2)) + vec3(0.05, 0.06, 0.09) * pow(kFr, 4.0); }\n' +
        '#include <dithering_fragment>');
    };
    m.customProgramCacheKey = function () { return 'kurkKenar'; };
    return (kurkOnb[renk] = m);
  }
  function acikRenk(renk, k) { return '#' + new THREE.Color(renk).lerp(new THREE.Color(0xffffff), k).getHexString(); }
  function koyuRenk(renk, k) { return '#' + new THREE.Color(renk).multiplyScalar(1 - k).getHexString(); }

  // Isik huzmesi / isik sutunu: uca dogru sonen, kenarlari yumusak toplamali koni
  function huzmeMat(renk, guc, boy) {
    return new THREE.ShaderMaterial({
      uniforms: { uRenk: { value: new THREE.Color(renk) }, uGuc: { value: guc }, uBoy: { value: boy } },
      vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV;' +
        'void main(){ vY = position.z; vec4 mv = modelViewMatrix * vec4(position, 1.0);' +
        'vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uRenk; uniform float uGuc; uniform float uBoy; varying float vY; varying vec3 vN; varying vec3 vV;' +
        'void main(){ float t = clamp(vY / uBoy, 0.0, 1.0); float a = pow(1.0 - t, 1.6) * uGuc;' +
        'float kenar = pow(abs(dot(normalize(vN), normalize(vV))), 1.4); gl_FragColor = vec4(uRenk * a * kenar, 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    });
  }
  function huzmeGeo(r1, r2, boy) {
    return geo(['h', r1, r2, boy].join('_'), function () {
      var g = new THREE.CylinderGeometry(r1, r2, boy, 28, 1, true);
      g.translate(0, -boy / 2, 0);
      g.rotateX(-Math.PI / 2);   // tepe noktasi orijinde, +z yonune uzanir
      return g;
    });
  }

  var guncellenecek = [];   // her karede cagrilan dekor animasyonlari: f(t, b, enerji, dt)

  // ============================================================ gok, ay, yildizlar
  var gokMat = new THREE.ShaderMaterial({
    uniforms: { uAy: { value: AY_YON }, uParla: { value: 1 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform vec3 uAy; uniform float uParla; varying vec3 vD;',
      'void main(){',
      '  vec3 d = normalize(vD); float h = clamp(d.y, 0.0, 1.0);',
      '  vec3 ust = vec3(0.004, 0.008, 0.026); vec3 ufuk = vec3(0.043, 0.07, 0.13);',
      '  vec3 c = mix(ufuk, ust, pow(h, 0.5));',
      '  float a = max(dot(d, uAy), 0.0);',
      '  c += vec3(0.30, 0.40, 0.65) * pow(a, 30.0) * 0.6 * uParla + vec3(0.10, 0.14, 0.28) * pow(a, 5.0) * 0.45 * uParla;',
      '  if (d.y < 0.0) c = ufuk;',
      '  gl_FragColor = vec4(c, 1.0);',
      '}'].join('\n'),
    side: THREE.BackSide, depthWrite: false, fog: false
  });
  var gok = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), gokMat);
  gok.renderOrder = -10;
  scene.add(gok);

  var yildizMat = null;
  (function () {
    var n = DUSUK ? 700 : 1600, poz = new Float32Array(n * 3), boy = new Float32Array(n), faz = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var u = rnd(0.06, 1), a = rnd(0, Math.PI * 2), s = Math.sqrt(1 - u * u);
      poz[i * 3] = Math.cos(a) * s * 180; poz[i * 3 + 1] = u * 180; poz[i * 3 + 2] = Math.sin(a) * s * 180;
      boy[i] = Math.random() < 0.06 ? rnd(3.2, 4.6) : rnd(1.2, 2.6); faz[i] = Math.random();
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(poz, 3));
    g.setAttribute('aBoy', new THREE.BufferAttribute(boy, 1));
    g.setAttribute('aFaz', new THREE.BufferAttribute(faz, 1));
    yildizMat = new THREE.ShaderMaterial({
      uniforms: { uZaman: { value: 0 }, uPR: { value: 1 } },
      vertexShader: 'attribute float aBoy; attribute float aFaz; uniform float uZaman; uniform float uPR; varying float vA;' +
        'void main(){ vA = 0.55 + 0.45 * sin(uZaman * (1.2 + aFaz * 2.5) + aFaz * 40.0); vec4 mv = modelViewMatrix * vec4(position, 1.0);' +
        'gl_PointSize = aBoy * uPR; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d);' +
        'gl_FragColor = vec4(vec3(0.82, 0.88, 1.0) * a * a * vA, 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
    });
    var yildiz = new THREE.Points(g, yildizMat);
    yildiz.renderOrder = -9; yildiz.frustumCulled = false;
    scene.add(yildiz);
    guncellenecek.push(function (t) { yildizMat.uniforms.uZaman.value = t; });
  })();

  var ayParlak = 0;   // uluma aninda ay parlar
  var aySprite, ayHale;
  (function () {
    var c = tuvalYap(256, 256), x = c.getContext('2d');
    var g = x.createRadialGradient(128, 128, 60, 128, 128, 128);
    g.addColorStop(0, 'rgba(200,215,255,0.45)'); g.addColorStop(1, 'rgba(200,215,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    var d = x.createRadialGradient(110, 110, 10, 128, 128, 66);
    d.addColorStop(0, '#fffdf2'); d.addColorStop(0.75, '#ebe9dc'); d.addColorStop(1, '#c9cbc4');
    x.fillStyle = d; x.beginPath(); x.arc(128, 128, 64, 0, Math.PI * 2); x.fill();
    x.save(); x.beginPath(); x.arc(128, 128, 64, 0, Math.PI * 2); x.clip();
    [[100, 104, 16], [150, 120, 11], [128, 160, 13], [160, 90, 7], [96, 150, 8], [140, 140, 6], [118, 82, 6]].forEach(function (k) {
      x.fillStyle = 'rgba(150,150,140,0.28)'; x.beginPath(); x.arc(k[0], k[1], k[2], 0, Math.PI * 2); x.fill();
    });
    x.restore();
    aySprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: false }));
    aySprite.position.copy(AY_YON).multiplyScalar(170);
    aySprite.scale.set(34, 34, 1);
    aySprite.renderOrder = -8;
    scene.add(aySprite);
    ayHale = hale(0x7d95d0, 110, 0.32);
    ayHale.position.copy(aySprite.position);
    ayHale.renderOrder = -8;
    scene.add(ayHale);
    guncellenecek.push(function (t, b, e, dt) {
      ayParlak = Math.max(0, ayParlak - dt * 0.25);
      ayHale.material.opacity = 0.3 + 0.35 * ayParlak;
      var k = 34 * (1 + 0.12 * ayParlak);
      aySprite.scale.set(k, k, 1);
      gokMat.uniforms.uParla.value = 1 + 1.4 * ayParlak;
    });
  })();

  // ============================================================ isiklar
  var gokIsik = new THREE.HemisphereLight(0x2a3b6a, 0x0c0906, 0.5);
  scene.add(gokIsik);
  var ortamIsik = new THREE.AmbientLight(0x101830, 0.3);
  scene.add(ortamIsik);
  var ayIsigi = new THREE.DirectionalLight(0x9db4ff, 0.65);
  ayIsigi.position.copy(AY_YON).multiplyScalar(50);
  scene.add(ayIsigi);
  // kameraya donuk sirtlar kapkara kalmasin: kamera tarafindan soguk dolgu isigi
  var dolguIsik = new THREE.DirectionalLight(0x8c9ed0, 1.05);
  dolguIsik.position.set(2, 9, 16);
  scene.add(dolguIsik);
  var atesIsik = new THREE.PointLight(0xff7a2a, 1.7, 30, 1.2);
  atesIsik.position.set(0, 1.3, 0);
  scene.add(atesIsik);
  var atesIsik2 = new THREE.PointLight(0xffc46a, 1.4, 11, 1.8);
  atesIsik2.position.set(0, 0.6, 0);
  scene.add(atesIsik2);
  // gunduz: mavi gok, gunes, aydinlik isik
  if (GUNDUZ) {
    scene.background.set(0x9fc9ec);
    scene.fog.color.set(0xc4dbee); scene.fog.density = 0.011;
    gokMat.fragmentShader = [
      'uniform vec3 uAy; uniform float uParla; varying vec3 vD;',
      'void main(){',
      '  vec3 d = normalize(vD); float h = clamp(d.y, 0.0, 1.0);',
      '  vec3 ust = vec3(0.22, 0.48, 0.86); vec3 ufuk = vec3(0.74, 0.86, 0.95);',
      '  vec3 c = mix(ufuk, ust, pow(h, 0.55));',
      '  float a = max(dot(d, uAy), 0.0);',
      '  c += vec3(1.0, 0.92, 0.7) * pow(a, 400.0) * 1.5 + vec3(1.0, 0.85, 0.6) * pow(a, 12.0) * 0.35;',
      '  if (d.y < 0.0) c = ufuk;',
      '  gl_FragColor = vec4(c, 1.0);',
      '}'].join('\n');
    gokMat.needsUpdate = true;
    yildizMat.visible = false;
    aySprite.visible = false;
    ayHale.material.color.set(0xfff0c0);
    gokIsik.color.set(0xcfe6ff); gokIsik.groundColor.set(0x5c4a2c); gokIsik.intensity = 0.95;
    ortamIsik.color.set(0xfff4e0); ortamIsik.intensity = 0.32;
    ayIsigi.color.set(0xfff0d2); ayIsigi.intensity = 1.55;
    ayIsigi.position.set(AY_YON.x * 30, 42, AY_YON.z * 30);   // gunes tepede
    dolguIsik.color.set(0xe8f0ff); dolguIsik.intensity = 0.55;
  }
  var ATES_K = GUNDUZ ? 0.45 : 1;   // gunduz atesin isigi daha az belli olur
  // alfalar uzerine ay huzmesi
  var alfaIsigi = new THREE.SpotLight(0xc8d8ff, 0, 30, 0.3, 0.6, 1);
  alfaIsigi.position.set(0, 13, 0);
  scene.add(alfaIsigi);
  scene.add(alfaIsigi.target);

  // ============================================================ zemin
  var cimDoku = (function () {
    var c = tuvalYap(256, 256), x = c.getContext('2d');
    x.fillStyle = '#18230f'; x.fillRect(0, 0, 256, 256);
    var renkler = ['#22321a', '#121b0c', '#2b3d20', '#1d2a13', '#334628'];
    for (var i = 0; i < 2600; i++) {
      x.strokeStyle = sec(renkler); x.lineWidth = rnd(0.8, 2);
      var px = rnd(0, 256), py = rnd(0, 256);
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + rnd(-3, 3), py - rnd(3, 8)); x.stroke();
    }
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 40);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  })();
  var zemin = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshStandardMaterial({ map: cimDoku, roughness: 1 }));
  zemin.rotation.x = -Math.PI / 2;
  scene.add(zemin);

  // kamp aciklik: toprak, kenarlari yumusak
  (function () {
    var c = tuvalYap(512, 512), x = c.getContext('2d');
    var g = x.createRadialGradient(256, 256, 0, 256, 256, 256);
    g.addColorStop(0, 'rgba(70,50,34,1)'); g.addColorStop(0.72, 'rgba(62,46,30,1)'); g.addColorStop(1, 'rgba(62,46,30,0)');
    x.fillStyle = g; x.fillRect(0, 0, 512, 512);
    for (var i = 0; i < 2600; i++) {
      var a = rnd(0, 6.283), r = Math.sqrt(Math.random()) * 230, px = 256 + Math.cos(a) * r, py = 256 + Math.sin(a) * r;
      var v = rnd(-1, 1);
      x.fillStyle = v > 0 ? 'rgba(110,86,60,' + (0.25 * v) + ')' : 'rgba(20,14,8,' + (-0.3 * v) + ')';
      x.beginPath(); x.arc(px, py, rnd(0.8, 3.2), 0, Math.PI * 2); x.fill();
    }
    // atesin cevresi isliiii
    var k = x.createRadialGradient(256, 256, 0, 256, 256, 60);
    k.addColorStop(0, 'rgba(14,9,6,0.95)'); k.addColorStop(1, 'rgba(14,9,6,0)');
    x.fillStyle = k; x.fillRect(0, 0, 512, 512);
    var t = new THREE.CanvasTexture(c);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    var m = new THREE.Mesh(new THREE.CircleGeometry(12.5, 64), new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 1 }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.012;
    scene.add(m);
  })();

  // ============================================================ orman
  function yasakMi(x, z, onAcik) {
    if (z > 1 && Math.abs(x) < z * 0.75 + onAcik && Math.sqrt(x * x + z * z) < 42) return true;   // kameranin onu acik
    if (Math.sqrt((x + 6.5) * (x + 6.5) + (z + 17) * (z + 17)) < 5) return true;               // alfa kayasi
    if (Math.sqrt((x - 8) * (x - 8) + (z + 18) * (z + 18)) < 3.5) return true;
    return false;
  }
  (function () {
    var N = DUSUK ? 150 : 250;
    var gG = new THREE.CylinderGeometry(0.15, 0.24, 2.4, 6); gG.translate(0, 1.2, 0);
    var k1 = new THREE.ConeGeometry(1.75, 2.9, 7); k1.translate(0, 2.7, 0);
    var k2 = new THREE.ConeGeometry(1.35, 2.5, 7); k2.translate(0, 4.0, 0);
    var k3 = new THREE.ConeGeometry(0.9, 2.2, 7); k3.translate(0, 5.3, 0);
    var yaprakM = new THREE.MeshStandardMaterial({ roughness: 0.92, flatShading: true });
    var gIM = new THREE.InstancedMesh(gG, mat('#2e1f14', { roughness: 1 }), N);
    var parcalar = [gIM, new THREE.InstancedMesh(k1, yaprakM, N), new THREE.InstancedMesh(k2, yaprakM, N), new THREE.InstancedMesh(k3, yaprakM, N)];
    var m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    var renk = ['#14301c', '#1a3a22', '#102617', '#1f4228', '#173520'];
    var adet = 0, deneme = 0;
    while (adet < N && deneme < 8000) {
      deneme++;
      var a = rnd(0, Math.PI * 2), r = 15 + Math.pow(Math.random(), 0.9) * 40;
      var x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (yasakMi(x, z, 6)) continue;
      var olc = rnd(0.85, 1.7), boyK = rnd(0.85, 1.3);
      v.set(x, 0, z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd(0, 6.28)); s.set(olc, olc * boyK, olc);
      m.compose(v, q, s);
      for (var p = 0; p < 4; p++) parcalar[p].setMatrixAt(adet, m);
      c.set(sec(renk)).multiplyScalar(rnd(0.8, 1.15));
      for (var p2 = 1; p2 < 4; p2++) parcalar[p2].setColorAt(adet, c);
      adet++;
    }
    parcalar.forEach(function (im) { im.count = adet; scene.add(im); });

    // calilar
    var cN = 70, cali = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.7, 0), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), cN);
    for (var i = 0, j = 0; i < 600 && j < cN; i++) {
      var ca = rnd(0, 6.28), cr = rnd(12, 17), cx = Math.cos(ca) * cr, cz = Math.sin(ca) * cr;
      if (yasakMi(cx, cz, 3)) continue;
      var co = rnd(0.6, 1.4);
      v.set(cx, co * 0.35, cz); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd(0, 6)); s.set(co * rnd(1, 1.5), co * 0.8, co);
      m.compose(v, q, s); cali.setMatrixAt(j, m); cali.setColorAt(j, c.set(sec(['#1c3a1e', '#24451f', '#16301a'])));
      j++;
    }
    cali.count = j; scene.add(cali);

    // cimen tutamlari
    var tN = DUSUK ? 300 : 700, tutam = new THREE.InstancedMesh(new THREE.ConeGeometry(0.06, 0.4, 3), mat('#2f4a22', { roughness: 1 }), tN);
    for (var u = 0; u < tN; u++) {
      var ta = rnd(0, 6.28), tr = rnd(10.5, 28);
      v.set(Math.cos(ta) * tr, 0.15, Math.sin(ta) * tr);
      q.setFromEuler(new THREE.Euler(rnd(-0.3, 0.3), rnd(0, 6), rnd(-0.3, 0.3)));
      var to = rnd(0.6, 1.4); s.set(to, to, to);
      m.compose(v, q, s); tutam.setMatrixAt(u, m);
    }
    scene.add(tutam);

    // taslar
    var sN = 36, tas = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.4, 0), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), sN);
    for (var w = 0; w < sN; w++) {
      var sa = rnd(0, 6.28), sr = rnd(10.5, 24);
      v.set(Math.cos(sa) * sr, 0.08, Math.sin(sa) * sr);
      q.setFromEuler(new THREE.Euler(rnd(0, 6), rnd(0, 6), rnd(0, 6)));
      var so = rnd(0.5, 1.5); s.set(so, so * 0.6, so);
      m.compose(v, q, s); tas.setMatrixAt(w, m); tas.setColorAt(w, c.set(sec(['#4d5056', '#5c5f63', '#3f4247'])));
    }
    scene.add(tas);
  })();

  // alfa kayalari
  function kayaYap(r, x, z, olc) {
    var g = new THREE.IcosahedronGeometry(r, 1), p = g.attributes.position, harita = {};
    for (var i = 0; i < p.count; i++) {
      var k = p.getX(i).toFixed(2) + ',' + p.getY(i).toFixed(2) + ',' + p.getZ(i).toFixed(2);
      if (harita[k] === undefined) harita[k] = rnd(0.82, 1.15);
      p.setXYZ(i, p.getX(i) * harita[k], p.getY(i) * harita[k], p.getZ(i) * harita[k]);
    }
    g.computeVertexNormals();
    var m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x55585f, roughness: 0.95, flatShading: true }));
    m.position.set(x, r * olc[1] * 0.35, z); m.scale.set(olc[0], olc[1], olc[2]); m.rotation.y = rnd(0, 6);
    scene.add(m);
    return m;
  }
  kayaYap(3.2, -6.5, -17, [1.4, 0.95, 1.1]);
  kayaYap(2.0, 8, -18, [1.3, 0.8, 1]);
  kayaYap(1.0, -3.4, -15.6, [1.2, 0.7, 1]);

  // cadirlar
  [[-140, 14.5, '#b5602c'], [-40, 14.5, '#3d5b3a'], [172, 14.8, '#8a3324']].forEach(function (c) {
    var a = c[0] * Math.PI / 180, x = Math.cos(a) * c[1], z = Math.sin(a) * c[1];
    var cadir = new THREE.Group();
    var govde = new THREE.Mesh(koni(1.9, 2.5, 4), mat(c[2], { roughness: 0.9, flatShading: true }));
    govde.rotation.y = Math.PI / 4; govde.position.y = 1.25; cadir.add(govde);
    var kapiG = new THREE.BufferGeometry();
    var zz = 1.9 * Math.cos(Math.PI / 4) + 0.02, ust = 1.35, uz = zz * (1 - ust / 2.5);
    kapiG.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0.01, zz, 0.5, 0.01, zz, 0, ust, uz + 0.02]), 3));
    var kapi = new THREE.Mesh(kapiG, new THREE.MeshBasicMaterial({ color: 0xffa040, side: THREE.DoubleSide }));
    cadir.add(kapi);
    var ic = hale(0xff9a3a, 3.2, 0.45); ic.position.set(0, 0.6, zz + 0.3); cadir.add(ic);
    cadir.position.set(x, 0, z);
    cadir.rotation.y = Math.atan2(-x, -z);
    scene.add(cadir);
  });

  // ============================================================ kamp isiklari: direkler, fenerler, zincir ampuller
  var fenerler = [];
  (function () {
    var acilar = [158, -170, -130, -105, -75, -50, -10, 22], R = 10.8;
    var noktalar = [];
    acilar.forEach(function (aD, i) {
      var a = aD * Math.PI / 180, x = Math.cos(a) * R, z = Math.sin(a) * R;
      var direk = new THREE.Mesh(silindir(0.06, 0.08, 2.9, 6), mat('#3b2a1c', { roughness: 1 }));
      direk.position.set(x, 1.45, z); scene.add(direk);
      var fener = new THREE.Group();
      var cerceve = new THREE.Mesh(kutu(0.2, 0.28, 0.2), mat('#1e1a16', { metalness: 0.5, roughness: 0.5, wireframe: true }));
      fener.add(cerceve);
      var alev = new THREE.Mesh(kure(0.08, 10), parlakMat(0xffc46b)); alev.scale.y = 1.4; fener.add(alev);
      var h = hale(0xffa040, 1.8, 0.55); fener.add(h);
      fener.position.set(x, 2.75, z);
      scene.add(fener);
      var isik = null;
      if (aD === -130 || aD === -50 || aD === 158) { isik = new THREE.PointLight(0xffa040, 1.1, 10, 1.8); isik.position.set(x, 2.6, z); scene.add(isik); }
      fenerler.push({ alev: alev, hale: h, isik: isik, faz: rnd(0, 6) });
      noktalar.push(new THREE.Vector3(x, 2.85, z));
    });
    // direkler arasinda sarkan ampuller
    var ampYer = [];
    for (var i = 0; i < noktalar.length - 1; i++) {
      var A = noktalar[i], B = noktalar[i + 1], uz = A.distanceTo(B), n = Math.max(6, Math.round(uz / 0.42));
      for (var k = 1; k < n; k++) {
        var u = k / n;
        ampYer.push(new THREE.Vector3(A.x + (B.x - A.x) * u, A.y - Math.sin(u * Math.PI) * 0.75, A.z + (B.z - A.z) * u));
      }
    }
    var N = ampYer.length, amp = new THREE.InstancedMesh(kure(0.055, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
    var m = new THREE.Matrix4(), c = new THREE.Color(), faz = [], taban = [];
    var RENK = [0xffd27a, 0xff9a4a, 0xfff0c0, 0xffb36b, 0xff7a5a];
    for (var j = 0; j < N; j++) {
      m.makeTranslation(ampYer[j].x, ampYer[j].y, ampYer[j].z); amp.setMatrixAt(j, m);
      taban.push(new THREE.Color(RENK[j % RENK.length])); amp.setColorAt(j, taban[j]); faz.push(rnd(0, 6.28));
    }
    scene.add(amp);
    guncellenecek.push(function (t, b, e) {
      for (var j = 0; j < N; j++) {
        var p = 0.55 + 0.45 * Math.max(0, Math.sin(t * 1.8 + faz[j]));
        if (e > 0.6 && ((j + Math.floor(b * 2)) % 6 === 0)) p = 1.3;
        amp.setColorAt(j, c.copy(taban[j]).multiplyScalar(p));
      }
      amp.instanceColor.needsUpdate = true;
      for (var f = 0; f < fenerler.length; f++) {
        var F = fenerler[f], k = 0.85 + 0.1 * Math.sin(t * 9 + F.faz) + 0.05 * Math.sin(t * 23 + F.faz * 2);
        F.alev.scale.set(k, 1.4 * k, k);
        F.hale.material.opacity = 0.45 * k;
        if (F.isik) F.isik.intensity = 1.1 * k;
      }
    });
  })();

  // kutuk banklar (seyirci kurtlar oturur)
  var bankYerleri = [];
  [-158, -62, -22].forEach(function (aD) {
    var a = aD * Math.PI / 180, R = 9.4, x = Math.cos(a) * R, z = Math.sin(a) * R;
    var bank = new THREE.Group();
    var kutuk = new THREE.Mesh(silindir(0.28, 0.3, 2.6, 12), mat('#4a3020', { roughness: 1 }));
    kutuk.rotation.z = Math.PI / 2; kutuk.position.y = 0.28; bank.add(kutuk);
    [-1, 1].forEach(function (s) {
      var uc = new THREE.Mesh(silindir(0.27, 0.27, 0.02, 12), mat('#a0784e', { roughness: 1 }));
      uc.rotation.z = Math.PI / 2; uc.position.set(1.3 * s, 0.28, 0); bank.add(uc);
    });
    bank.position.set(x, 0, z);
    bank.rotation.y = Math.atan2(-x, -z);
    scene.add(bank);
    bankYerleri.push({ grup: bank });
  });

  // ahsap tabela (alfa isimleri)
  var tabelaTuval = tuvalYap(1024, 256);
  var tabelaDoku = new THREE.CanvasTexture(tabelaTuval);
  (function () {
    var tabela = new THREE.Group();
    [-1, 1].forEach(function (s) {
      var d = new THREE.Mesh(silindir(0.1, 0.12, 4.0, 7), mat('#3a2818', { roughness: 1 }));
      d.position.set(3.9 * s, 2.0, 0); tabela.add(d);
      var f = hale(0xffa040, 1.6, 0.5); f.position.set(3.9 * s, 4.05, 0.1); tabela.add(f);
      var fa = new THREE.Mesh(kure(0.09, 10), parlakMat(0xffc46b)); fa.position.set(3.9 * s, 4.05, 0.1); tabela.add(fa);
    });
    var pano = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 1.9), new THREE.MeshBasicMaterial({ map: tabelaDoku, transparent: true, fog: false }));
    pano.position.set(0, 2.95, 0.12); tabela.add(pano);
    tabela.position.set(0, 0, -12.6);
    scene.add(tabela);
  })();
  function tabelaCiz(ust, alt) {
    var x = tabelaTuval.getContext('2d'), W = tabelaTuval.width, H = tabelaTuval.height;
    x.clearRect(0, 0, W, H);
    yuvarlakKutu(x, 6, 6, W - 12, H - 12, 26);
    var g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#4a2f1b'); g.addColorStop(1, '#2d1b0f');
    x.fillStyle = g; x.fill();
    x.save(); x.clip();
    for (var i = 1; i < 4; i++) { x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, i * H / 4 - 2, W, 4); }
    x.strokeStyle = 'rgba(255,220,170,0.06)'; x.lineWidth = 2;
    for (var k = 0; k < 40; k++) { x.beginPath(); var yy = rnd(0, H); x.moveTo(0, yy); x.bezierCurveTo(W / 3, yy + rnd(-12, 12), W * 2 / 3, yy + rnd(-12, 12), W, yy + rnd(-8, 8)); x.stroke(); }
    x.restore();
    x.lineWidth = 8; x.strokeStyle = '#1a0f07'; yuvarlakKutu(x, 6, 6, W - 12, H - 12, 26); x.stroke();
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = 'rgba(255,150,50,0.95)'; x.shadowBlur = 26;
    var fs = 104; x.font = '900 ' + fs + 'px Georgia, serif';
    while (x.measureText(ust).width > W - 80 && fs > 44) { fs -= 4; x.font = '900 ' + fs + 'px Georgia, serif'; }
    var yg = x.createLinearGradient(0, 30, 0, 160); yg.addColorStop(0, '#fff3d0'); yg.addColorStop(1, '#ffb347');
    x.fillStyle = yg; x.fillText(ust, W / 2, 100);
    x.shadowColor = 'rgba(140,180,255,0.9)'; x.shadowBlur = 18;
    x.font = '800 46px Georgia, serif'; x.fillStyle = '#d6e4ff'; x.fillText(alt, W / 2, 200);
    tabelaDoku.needsUpdate = true;
  }

  // ay huzmeleri: agaclarin arasindan aciklige vuran soluk isik
  (function () {
    [[2.5, -4], [-5, 2], [6, 3]].forEach(function (h, i) {
      var hm = huzmeMat(0x8fb0ff, 0.05, 46);
      var m = new THREE.Mesh(huzmeGeo(0.4, 3.2, 46), hm);
      var hedef = new THREE.Vector3(h[0], 0, h[1]);
      m.position.copy(hedef).addScaledVector(AY_YON, 44);
      m.lookAt(hedef);
      scene.add(m);
      guncellenecek.push(function (t) { hm.uniforms.uGuc.value = 0.04 + 0.015 * Math.sin(t * 0.3 + i * 2) + 0.05 * ayParlak; });
    });
  })();

  // ============================================================ kamp atesi
  var atesGuc = 1, atesPatla = 0;
  (function () {
    // ates cemberi taslari
    var tn = 13, tasIM = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.2, 0), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true, color: 0x5a5856 }), tn);
    var m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
    for (var i = 0; i < tn; i++) {
      var a = i / tn * Math.PI * 2;
      v.set(Math.cos(a) * 1.05, 0.1, Math.sin(a) * 1.05); q.setFromEuler(new THREE.Euler(rnd(0, 6), rnd(0, 6), 0));
      var k = rnd(0.9, 1.3); s.set(k, k * 0.75, k); m.compose(v, q, s); tasIM.setMatrixAt(i, m);
    }
    scene.add(tasIM);
    // cadir seklinde odunlar
    var odunM = mat('#2c1a10', { roughness: 1, emissive: '#3a1000', emissiveIntensity: 0.6 });
    var yukari = new THREE.Vector3(0, 1, 0);
    for (var j = 0; j < 7; j++) {
      var b = j / 7 * Math.PI * 2 + 0.3;
      var A = new THREE.Vector3(Math.cos(b) * 0.68, 0.02, Math.sin(b) * 0.68), B = new THREE.Vector3(Math.cos(b) * 0.06, 1.15, Math.sin(b) * 0.06);
      var odun = new THREE.Mesh(silindir(0.05, 0.085, A.distanceTo(B), 7), odunM);
      odun.position.copy(A).add(B).multiplyScalar(0.5);
      odun.quaternion.setFromUnitVectors(yukari, B.clone().sub(A).normalize());
      scene.add(odun);
    }
  })();
  // kor yatagi
  var korMat = new THREE.ShaderMaterial({
    uniforms: { uZaman: { value: 0 }, uGuc: { value: 1 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uZaman; uniform float uGuc; varying vec2 vP;' +
      'void main(){ float r = length(vP); float n = 0.55 + 0.25 * sin(vP.x * 17.0 + uZaman * 2.3) * sin(vP.y * 13.0 - uZaman * 1.7) + 0.2 * sin((vP.x + vP.y) * 29.0 + uZaman * 4.0);' +
      'float k = smoothstep(0.95, 0.15, r) * n * uGuc; gl_FragColor = vec4(vec3(1.0, 0.32, 0.05) * k * 1.6, 1.0); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  var korYatak = new THREE.Mesh(new THREE.CircleGeometry(0.95, 32), korMat);
  korYatak.rotation.x = -Math.PI / 2; korYatak.position.y = 0.05;
  scene.add(korYatak);

  // alevler: toplamali, yukselip sonen sprite'lar
  var alevDoku = (function () {
    var c = tuvalYap(128, 128), x = c.getContext('2d');
    var g = x.createRadialGradient(64, 76, 0, 64, 70, 62);
    g.addColorStop(0, 'rgba(255,255,230,1)'); g.addColorStop(0.25, 'rgba(255,220,120,0.9)'); g.addColorStop(0.6, 'rgba(255,120,30,0.35)'); g.addColorStop(1, 'rgba(255,60,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  var alevler = [];
  (function () {
    var n = DUSUK ? 36 : 70;
    for (var i = 0; i < n; i++) {
      var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: alevDoku, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      scene.add(s);
      alevler.push({ s: s, l: Math.random(), hiz: rnd(0.9, 1.6), a: rnd(0, 6.28), r: Math.sqrt(Math.random()) * 0.55, boy: rnd(0.8, 1.3), faz: rnd(0, 6) });
    }
  })();
  var atesHale = hale(0xff7a2a, 7, 0.32); atesHale.position.set(0, 1.0, 0); scene.add(atesHale);
  var atesHale2 = hale(0xffd27a, 2.6, 0.55); atesHale2.position.set(0, 0.55, 0); scene.add(atesHale2);
  // duman
  var dumanlar = [];
  (function () {
    var doku = yumusakNokta('rgba(70,66,74,0.55)', 'rgba(70,66,74,0)');
    for (var i = 0; i < 14; i++) {
      var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: doku, transparent: true, depthWrite: false, opacity: 0 }));
      scene.add(s);
      dumanlar.push({ s: s, l: i / 14, hiz: rnd(0.08, 0.13), x: 0, z: 0, faz: rnd(0, 6) });
    }
  })();
  var aRenk = new THREE.Color(), aRenkA = new THREE.Color(1, 0.9, 0.6), aRenkB = new THREE.Color(1, 0.42, 0.08), aRenkC = new THREE.Color(0.45, 0.08, 0.02);
  function atesGuncelle(t, dt, b, e) {
    atesPatla = Math.max(0, atesPatla - dt * 1.1);
    var nab = Math.pow(1 - mod(b, 1), 4) * 0.15 * e;
    var g = atesGuc * (1 + atesPatla * 0.9 + nab);
    for (var i = 0; i < alevler.length; i++) {
      var A = alevler[i];
      A.l += dt * A.hiz * (1 + atesPatla * 0.8);
      if (A.l >= 1) { A.l -= 1; A.a = rnd(0, 6.28); A.r = Math.sqrt(Math.random()) * 0.55; A.boy = rnd(0.8, 1.3); }
      var l = A.l, yuk = (1.6 + 0.6 * e) * g;
      var sal = Math.sin(t * 5 + A.faz + l * 4) * 0.12 * l;
      A.s.position.set(Math.cos(A.a) * A.r * (1 - l * 0.75) + sal, 0.2 + l * yuk, Math.sin(A.a) * A.r * (1 - l * 0.75) + sal * 0.6);
      var k = (1.05 - l * 0.7) * A.boy * (0.85 + 0.25 * g);
      A.s.scale.set(k * 0.85, k * 1.25, 1);
      if (l < 0.35) aRenk.copy(aRenkA).lerp(aRenkB, l / 0.35); else aRenk.copy(aRenkB).lerp(aRenkC, (l - 0.35) / 0.65);
      A.s.material.color.copy(aRenk);
      A.s.material.opacity = Math.sin(Math.PI * Math.min(1, l * 1.15)) * 0.85;
    }
    var tit = 0.82 + 0.1 * Math.sin(t * 11.3) + 0.06 * Math.sin(t * 17.9 + 1.3) + 0.04 * Math.sin(t * 31.7);
    atesIsik.intensity = 1.7 * tit * g * ATES_K;
    atesIsik.position.set(Math.sin(t * 7) * 0.08, 1.3 + 0.1 * Math.sin(t * 5), Math.cos(t * 6) * 0.08);
    atesIsik2.intensity = 1.0 * tit * g * ATES_K;
    atesHale.material.opacity = 0.26 * tit * g;
    var hk = 7 * (0.9 + 0.2 * g); atesHale.scale.set(hk, hk, 1);
    atesHale2.material.opacity = 0.5 * tit;
    korMat.uniforms.uZaman.value = t; korMat.uniforms.uGuc.value = 0.8 + 0.3 * tit * g;
    for (var d = 0; d < dumanlar.length; d++) {
      var D = dumanlar[d];
      D.l += dt * D.hiz;
      if (D.l >= 1) D.l -= 1;
      D.s.position.set(Math.sin(t * 0.3 + D.faz) * 0.3 + D.l * 1.6, 2.3 + D.l * 6, Math.cos(t * 0.25 + D.faz) * 0.3 - D.l * 0.8);
      var dk = 1.2 + D.l * 4; D.s.scale.set(dk, dk, 1);
      D.s.material.opacity = Math.sin(Math.PI * D.l) * 0.22;
    }
    // korlar
    var kadet = Math.random() < (22 + 40 * g) * dt ? 1 + (Math.random() < 0.3 ? 1 : 0) : 0;
    for (var k2 = 0; k2 < kadet; k2++) kivilcimAt(rnd(-0.4, 0.4), 0.7, rnd(-0.4, 0.4), rnd(-0.35, 0.35), rnd(1.3, 2.8), rnd(-0.35, 0.35), rnd(1.4, 3.2), sec([0xffb347, 0xff7a2a, 0xffd27a]), -0.25);
  }

  // ates bocekleri
  var bocekler = { n: DUSUK ? 70 : 170 };
  (function () {
    var n = bocekler.n, poz = new Float32Array(n * 3), renk = new Float32Array(n * 3);
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(poz, 3));
    g.setAttribute('color', new THREE.BufferAttribute(renk, 3));
    var p = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.13, map: noktaDoku, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    p.frustumCulled = false;
    scene.add(p);
    var veri = [];
    for (var i = 0; i < n; i++) {
      var a = rnd(0, 6.28), r = rnd(8.5, 26);
      veri.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y: rnd(0.4, 3.8), f: rnd(0.6, 1.6), faz: rnd(0, 20), hx: rnd(0.2, 0.6) });
    }
    guncellenecek.push(function (t) {
      for (var i = 0; i < n; i++) {
        var v = veri[i];
        poz[i * 3] = v.x + Math.sin(t * 0.4 * v.f + v.faz) * v.hx * 2;
        poz[i * 3 + 1] = v.y + Math.sin(t * 0.7 * v.f + v.faz * 2) * 0.4;
        poz[i * 3 + 2] = v.z + Math.cos(t * 0.35 * v.f + v.faz) * v.hx * 2;
        var y = Math.pow(Math.max(0, Math.sin(t * v.f * 1.3 + v.faz)), 6);
        renk[i * 3] = 0.75 * y; renk[i * 3 + 1] = 1.0 * y; renk[i * 3 + 2] = 0.3 * y;
      }
      g.attributes.position.needsUpdate = true;
      g.attributes.color.needsUpdate = true;
    });
  })();

  // ============================================================ kurtlar
  var KURK = ['#8a8c93', '#5d6068', '#7a5c40', '#9b6a3c', '#b8a07c', '#3b3c42', '#a9acb4', '#6e5038', '#c4b49a'];
  var BANDANA = ['#e53935', '#1e88e5', '#fdd835', '#8e24aa', '#43a047', '#fb8c00', '#00acc1', '#d81b60'];
  var ETEK = ['#c2185b', '#8e24aa', '#00897b', '#f9a825', '#e64a19', '#1e88e5', '#ad1457', '#43a047', '#6a1b9a', '#d32f2f'];
  var GOZ = ['#ffc233', '#ffd84a', '#ffae2a', '#e8ff5a'];

  function gorunumUret(npc, disi) {
    var k = (disi === undefined) ? Math.random() < 0.5 : disi;
    return { k: k, kurk: sec(KURK), etek: sec(ETEK), bandana: (!npc || Math.random() < 0.5) ? sec(BANDANA) : null, goz: sec(GOZ) };
  }

  var YUKARI = new THREE.Vector3(0, 1, 0);

  // ---- Blender'da uretilen kurt parcalari (kurtModel.js, blender/kurt_model.py)
  // Kose rengi r = acik kurk, g = koyu kurk; her kurdun kendi uc rengi golgelendiricide karistirilir.
  var KENAR_GLSL = '{ float kFr = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));\n' +
    '  gl_FragColor.rgb += diffuseColor.rgb * (0.4 * pow(kFr, 2.2)) + vec3(0.05, 0.06, 0.09) * pow(kFr, 4.0); }\n';
  var modelOnb = {};
  // Kabuk (shell) kurk: govde her katmanda normal boyunca biraz sisirilip tekrar cizilir,
  // ust katmanlarda tuy dokusunun bos yerleri atilir -> siluet tuylu gorunur. Dusuk kalitede kapali.
  var KABUK = DUSUK ? 0 : 5, TUY_BOY = 0.03;
  var tuyDoku = (function () {
    var c = tuvalYap(128, 128), x = c.getContext('2d'), im = x.createImageData(128, 128);
    for (var i = 0; i < 128 * 128; i++) { var v = Math.floor(Math.pow(Math.random(), 0.8) * 255); im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
    x.putImageData(im, 0, 0);
    var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  })();
  function modelGeo(ad) {
    if (modelOnb[ad]) return modelOnb[ad];
    var d = window.KURT_MODEL[ad], n = d.p.length / 3;
    var taban = new THREE.BufferGeometry();
    taban.setAttribute('position', new THREE.Float32BufferAttribute(d.p, 3));
    taban.setIndex(d.i); taban.computeVertexNormals();
    var nor = taban.attributes.normal.array;
    var K = ad === 'cene' ? 0 : KABUK, top = n * (K + 1);
    var pos = new Float32Array(top * 3), nrm = new Float32Array(top * 3), renk = new Float32Array(top * 3), uv = new Float32Array(top * 2), kat = new Float32Array(top);
    var idx = [];
    for (var k = 0; k <= K; k++) {
      var o = k * n;
      pos.set(d.p, o * 3); nrm.set(nor, o * 3);
      for (var i = 0; i < n; i++) {
        renk[(o + i) * 3] = d.c[i * 2]; renk[(o + i) * 3 + 1] = d.c[i * 2 + 1];
        kat[o + i] = K ? k / K : 0;
      }
      for (var j = 0; j < d.i.length; j++) idx.push(d.i[j] + o);
    }
    taban.dispose();
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(renk, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('kat', new THREE.BufferAttribute(kat, 1));
    g.setIndex(idx);
    g.computeBoundingSphere(); g.boundingSphere.radius += TUY_BOY;
    return (modelOnb[ad] = g);
  }
  var kurtMatOnb = {};
  function kurtMat(k, a, z) {
    var anahtar = k + a + z;
    if (kurtMatOnb[anahtar]) return kurtMatOnb[anahtar];
    var u = {
      uKurk: { value: new THREE.Color(k).multiplyScalar(0.74) },
      uAcik: { value: new THREE.Color(a).multiplyScalar(0.74) },
      uKoyu: { value: new THREE.Color(z).multiplyScalar(0.74) },
      tuyDoku: { value: tuyDoku }
    };
    var m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: kurkDoku, roughness: 0.95, metalness: 0, vertexColors: true });
    m.onBeforeCompile = function (sh) {
      for (var n in u) sh.uniforms[n] = u[n];
      // kurk dokusu uc yonden yansitilir (dikis ve cizgi yok); kabuklar normal boyunca sisirilir
      sh.vertexShader = 'attribute float kat;\nvarying float vKat;\nvarying vec3 vNesPos;\nvarying vec3 vNesNor;\n' + sh.vertexShader
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNesPos = position; vNesNor = normal; vKat = kat;\n' +
          'transformed += objectNormal * kat * ' + TUY_BOY.toFixed(3) + ' - vec3(0.0, 1.0, 0.0) * kat * kat * ' + (TUY_BOY * 0.4).toFixed(4) + ';');
      sh.fragmentShader = 'uniform vec3 uKurk;\nuniform vec3 uAcik;\nuniform vec3 uKoyu;\nuniform sampler2D tuyDoku;\nvarying float vKat;\nvarying vec3 vNesPos;\nvarying vec3 vNesNor;\n' + sh.fragmentShader
        .replace('#include <map_fragment>',
          '{ vec3 aw = abs(normalize(vNesNor));\n' +
          '  if (vKat > 0.0) {\n' +
          '    vec2 nk = (aw.x > aw.y && aw.x > aw.z) ? vNesPos.zy : ((aw.y > aw.z) ? vNesPos.xz : vNesPos.xy);\n' +
          '    float h = texture2D(tuyDoku, nk * 2.6).r;\n' +
          '    if (h < vKat * 0.82 + 0.14) discard;\n' +
          '  }\n' +
          '  vec3 bw = pow(aw, vec3(4.0)); bw /= (bw.x + bw.y + bw.z);\n' +
          '  vec4 tx = texture2D(map, vNesPos.zy * 5.0) * bw.x + texture2D(map, vNesPos.xz * 5.0) * bw.y + texture2D(map, vNesPos.xy * 5.0) * bw.z;\n' +
          '  diffuseColor *= mapTexelToLinear(tx); }')
        .replace('#include <color_fragment>', 'diffuseColor.rgb *= mix(mix(uKurk, uAcik, vColor.r), uKoyu, vColor.g) * mix(0.6, 1.02, vKat);')
        .replace('#include <dithering_fragment>', KENAR_GLSL + '#include <dithering_fragment>');
    };
    m.customProgramCacheKey = function () { return 'kurtModelKabuk'; };
    return (kurtMatOnb[anahtar] = m);
  }

  function kurtYap(g, rol) {
    var alfa = rol === 'damat', leydi = rol === 'gelin', basi = rol === 'halaybasi';
    var disi = leydi ? true : (alfa ? false : !!g.k);
    var kurkRenk = alfa ? '#2b2d33' : (leydi ? '#b6b8c4' : (g.kurk || '#8a8c93'));
    var gogusRenk = alfa ? '#9aa1ae' : (leydi ? '#cbccd6' : acikRenk(kurkRenk, 0.45));
    var koyu = leydi ? '#a7a9b8' : koyuRenk(kurkRenk, alfa ? 0.5 : 0.55);
    var kM = kurtMat(kurkRenk, gogusRenk, koyu);
    function parca(ad, ebeveyn) { var m = new THREE.Mesh(modelGeo(ad), kM); ebeveyn.add(m); return m; }
    var burunM = mat('#0e0c0c', { roughness: 0.25, metalness: 0.2 });
    var gozM = parlakMat(alfa ? 0xffcf3a : (leydi ? 0x8ff0ff : (g.goz || '#ffc233')));
    var altinM = mat('#e0b43c', { metalness: 1, roughness: 0.25, emissive: '#6a4a08', emissiveIntensity: 0.8 });

    var kok = new THREE.Group();
    var kalca = new THREE.Group(); kalca.position.y = KALCA_Y; kok.add(kalca);
    parca('pelvis', kalca);
    var etek = null;
    if (disi) {
      var etekRenk = leydi ? '#c9cad6' : (g.etek || '#c2185b');
      var etekM = mat(etekRenk, leydi ? { roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide } : { roughness: 0.45, metalness: 0.2, side: THREE.DoubleSide });
      etek = new THREE.Group(); etek.position.y = 0.1; kalca.add(etek);
      var eb = leydi ? 0.98 : 0.6;
      var em = new THREE.Mesh(silindir(0.23, leydi ? 0.85 : 0.5, eb, 26, true), etekM); em.position.y = -eb / 2; etek.add(em);
      if (leydi) {
        var tul = new THREE.Mesh(silindir(0.3, 0.97, 0.72, 26, true), new THREE.MeshStandardMaterial({ color: 0xd8dcf0, transparent: true, opacity: 0.25, side: THREE.DoubleSide, roughness: 0.4, depthWrite: false }));
        tul.position.y = -0.62; etek.add(tul);
      }
    }
    var kuyruk = new THREE.Group(); kuyruk.position.set(0, 0.04, -0.15); kalca.add(kuyruk);
    parca('kuyruk', kuyruk);

    var govde = new THREE.Group(); govde.position.y = 0.08; kalca.add(govde);
    parca('govde', govde);
    if (g.bandana && !alfa && !leydi && !basi) {
      var bM = mat(g.bandana, { roughness: 0.7, side: THREE.DoubleSide });
      var bu = new THREE.Mesh(koni(0.16, 0.26, 3), bM); bu.rotation.x = Math.PI; bu.position.set(0, 0.6, 0.235); bu.scale.z = 0.35; govde.add(bu);
      var bh = new THREE.Mesh(simit(0.205, 0.035, 6, 20), bM); bh.rotation.x = Math.PI / 2 - 0.25; bh.position.set(0, 0.72, 0.02); govde.add(bh);
    }

    // bas
    var bas = new THREE.Group(); bas.position.y = 0.82; govde.add(bas);
    parca('kafa', bas);
    [-1, 1].forEach(function (s) {   // badem goz + dikey goz bebegi
      var goz = new THREE.Mesh(kure(0.03, 12), gozM); goz.position.set(0.072 * s, 0.19, 0.19); goz.scale.set(1.3, 0.75, 0.6); goz.rotation.z = 0.3 * s; bas.add(goz);
      var bebek = new THREE.Mesh(kure(0.012, 8), burunM); bebek.position.set(0.072 * s, 0.19, 0.205); bebek.scale.set(0.6, 1.3, 0.5); bas.add(bebek);
    });
    var kulakL = new THREE.Group(), kulakR = new THREE.Group();
    [[kulakL, 1], [kulakR, -1]].forEach(function (k) {
      var grp = k[0], s = k[1];
      grp.position.set(0.11 * s, 0.32, -0.03); grp.rotation.z = -0.28 * s; bas.add(grp);
      parca('kulak', grp);
    });
    var burunG = new THREE.Group(); burunG.position.set(0, 0.11, 0.13); burunG.rotation.x = 0.12; bas.add(burunG);
    var burun = new THREE.Mesh(kure(0.036, 12), burunM); burun.position.set(0, 0.028, 0.37); burun.scale.set(1.2, 0.85, 0.9); burunG.add(burun);
    var cene = new THREE.Group(); cene.position.set(0, -0.055, 0.04); burunG.add(cene);
    parca('cene', cene);
    var agiz = new THREE.Mesh(kure(1, 12), mat('#3a0d12', { roughness: 1 })); agiz.scale.set(0.045, 0.012, 0.17); agiz.position.set(0, 0.018, 0.13); cene.add(agiz);
    var dil = new THREE.Mesh(kure(1, 10), mat('#e2667a', { roughness: 0.6 })); dil.scale.set(0.034, 0.01, 0.11); dil.position.set(0, 0.026, 0.15); cene.add(dil);
    [-1, 1].forEach(function (s) {   // kopek disleri
      var dis = new THREE.Mesh(koni(0.01, 0.035, 6), parlakMat(0xf4efe0)); dis.position.set(0.028 * s, -0.04, 0.31); dis.rotation.x = Math.PI; burunG.add(dis);
    });

    // kollar ve bacaklar
    function kolYap(s) {
      var omuzG = new THREE.Group(); omuzG.position.set(0.28 * s, 0.58, 0); govde.add(omuzG);
      parca('kolUst', omuzG);
      var dirsek = new THREE.Group(); dirsek.position.y = -0.32; omuzG.add(dirsek);
      parca('kolAlt', dirsek);
      return { omuz: omuzG, dirsek: dirsek };
    }
    function bacakYap(s) {
      var kal = new THREE.Group(); kal.position.set(0.1 * s, -0.02, 0); kalca.add(kal);
      parca('uyluk', kal);
      var diz = new THREE.Group(); diz.position.y = -0.46; kal.add(diz);
      parca('baldir', diz);
      return { kal: kal, diz: diz };
    }
    var kolL = kolYap(1), kolR = kolYap(-1);
    var bacakL = bacakYap(1), bacakR = bacakYap(-1);

    // ---- rol aksesuarlari
    if (alfa) {
      var kolye = new THREE.Mesh(simit(0.2, 0.016, 6, 28), altinM); kolye.rotation.x = Math.PI / 2 - 0.45; kolye.position.set(0, 0.6, 0.06); govde.add(kolye);
      var madalya = new THREE.Mesh(silindir(0.08, 0.08, 0.02, 20), altinM); madalya.rotation.x = Math.PI / 2; madalya.position.set(0, 0.44, 0.27); govde.add(madalya);
      var tas = new THREE.Mesh(kure(0.03, 8), parlakMat(0xff2a3a)); tas.position.set(0, 0.44, 0.285); govde.add(tas);
      var pelerin = new THREE.Mesh(silindir(0.3, 0.55, 1.05, 22, true, Math.PI / 2, Math.PI), mat('#8e0f1e', { roughness: 0.55, side: THREE.DoubleSide, emissive: '#200000' }));
      pelerin.position.set(0, 0.12, -0.04); govde.add(pelerin);
      var tac = new THREE.Group(); tac.position.set(0, 0.36, -0.02); bas.add(tac);
      var tacH = new THREE.Mesh(silindir(0.14, 0.15, 0.08, 14, true), mat('#e0b43c', { metalness: 1, roughness: 0.25, emissive: '#6a4a08', emissiveIntensity: 0.8, side: THREE.DoubleSide })); tac.add(tacH);
      for (var tt = 0; tt < 6; tt++) {
        var ta = tt / 6 * Math.PI * 2;
        var sivri = new THREE.Mesh(koni(0.028, 0.1, 4), altinM); sivri.position.set(Math.sin(ta) * 0.14, 0.08, Math.cos(ta) * 0.14); tac.add(sivri);
      }
      var tacTas = new THREE.Mesh(kure(0.026, 8), parlakMat(0xff2a3a)); tacTas.position.set(0, 0.01, 0.15); tac.add(tacTas);
    }
    if (leydi) {
      var cicekR = [0xff8fb8, 0xffffff, 0xd81b60, 0xffe0ec, 0xff5a7a];
      for (var c = 0; c < 11; c++) {
        var ca = c / 11 * Math.PI * 2;
        var cic = new THREE.Mesh(kure(0.04, 8), mat('#' + new THREE.Color(cicekR[c % cicekR.length]).getHexString(), { roughness: 0.6, emissive: '#301020' }));
        cic.position.set(Math.sin(ca) * 0.165, 0.31 + Math.cos(ca) * 0.025, Math.cos(ca) * 0.17 - 0.01); bas.add(cic);
      }
      var duvak = new THREE.Mesh(silindir(0.16, 0.62, 1.4, 24, true, Math.PI / 2, Math.PI),
        new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false, roughness: 0.4 }));
      duvak.position.set(0, -0.36, -0.1); bas.add(duvak);
      var kusak = new THREE.Mesh(simit(0.25, 0.04, 8, 28), mat('#d50000', { roughness: 0.35, emissive: '#400000' }));
      kusak.rotation.x = Math.PI / 2; kusak.position.y = 0.12; govde.add(kusak);
      var inci = new THREE.Mesh(simit(0.2, 0.018, 6, 24), mat('#ffffff', { roughness: 0.2, metalness: 0.3, emissive: '#555566' }));
      inci.rotation.x = Math.PI / 2 - 0.45; inci.position.set(0, 0.62, 0.05); govde.add(inci);
    }
    if (basi) {
      var yelekM = mat('#b71c1c', { roughness: 0.6, side: THREE.DoubleSide, emissive: '#2a0000' });
      var yelek = new THREE.Mesh(silindir(0.315, 0.255, 0.5, 18, true, 0.5, Math.PI * 2 - 1.0), yelekM);
      yelek.position.y = 0.38; yelek.scale.z = 0.82; govde.add(yelek);
      [-1, 1].forEach(function (s) {
        var serit = new THREE.Mesh(kutu(0.025, 0.5, 0.02), altinM); serit.position.set(0.12 * s, 0.38, 0.24); govde.add(serit);
      });
      var kalpak = new THREE.Mesh(silindir(0.13, 0.15, 0.17, 14), mat('#1a1614', { roughness: 1 })); kalpak.position.set(0, 0.36, -0.03); bas.add(kalpak);
      var kalpakUst = new THREE.Mesh(silindir(0.13, 0.13, 0.01, 14), mat('#b71c1c')); kalpakUst.position.set(0, 0.45, -0.03); bas.add(kalpakUst);
    }

    // mendil tutma noktasi (kumasin kendisi sahnede ayri: mendilGuncelle)
    var mendil = new THREE.Group();
    mendil.position.set(0, -0.36, 0.02); kolR.dirsek.add(mendil);

    kok.scale.setScalar(alfa ? 1.2 : (leydi ? 1.12 : (basi ? 1.08 : 1)));
    return { kok: kok, kalca: kalca, govde: govde, bas: bas, kolL: kolL, kolR: kolR, bacakL: bacakL, bacakR: bacakR, etek: etek, mendil: mendil, kuyruk: kuyruk, cene: cene, kulakL: kulakL, kulakR: kulakR };
  }

  // ============================================================ dansci (izleyici / suru)
  var kisiler = {};
  var npcler = [];
  var hat = [];
  var NPC_ADLARI = ['Bozkurt Dayı', 'Sis Teyze', 'Kara Pençe', 'Yıldız Hala', 'Gri Yele', 'Ay Işığı', 'Duman Emmi', 'Fırtına', 'Kar Kuzusu', 'Çakal Rıza'];

  function etiketHazirla(d) {
    d.etiketTuval = tuvalYap(640, 200);
    d.etiketDoku = new THREE.CanvasTexture(d.etiketTuval);
    d.etiketDoku.minFilter = THREE.LinearFilter;
    d.etiket = new THREE.Sprite(new THREE.SpriteMaterial({ map: d.etiketDoku, transparent: true, depthWrite: false, fog: false }));
    var k = d.npc ? 1.15 : 1.6;
    d.etiket.scale.set(k, k * 200 / 640, 1);
    d.etiket.renderOrder = 5;
    d.kok.add(d.etiket);
    if (d.avatar) avatarYukle(d);
    etiketCiz(d);
  }
  function avatarYukle(d) {
    d.avatarResim = new Image();
    d.avatarResim.onload = function () { etiketCiz(d); };
    d.avatarResim.src = '/avatar?u=' + encodeURIComponent(d.avatar);
  }

  function etiketCiz(d) {
    var c = d.etiketTuval, x = c.getContext('2d'), W = c.width, H = c.height;
    x.clearRect(0, 0, W, H);
    var pad = 12;
    yuvarlakKutu(x, pad, pad, W - 2 * pad, H - 2 * pad, (H - 2 * pad) / 2);
    x.fillStyle = d.rol ? 'rgba(20,14,30,0.86)' : (d.npc ? 'rgba(0,0,0,0.35)' : 'rgba(8,10,20,0.72)');
    x.fill();
    if (d.rol) {
      var g = x.createLinearGradient(0, 0, W, 0);
      if (d.rol === 'gelin') { g.addColorStop(0, '#7fa8ff'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#7fa8ff'); }
      else if (d.rol === 'halaybasi') { g.addColorStop(0, '#d32f2f'); g.addColorStop(0.5, '#ffd54a'); g.addColorStop(1, '#d32f2f'); }
      else { g.addColorStop(0, '#b8860b'); g.addColorStop(0.5, '#fff0b0'); g.addColorStop(1, '#b8860b'); }
      x.lineWidth = 9; x.strokeStyle = g; x.stroke();
    } else if (!d.npc) { x.lineWidth = 4; x.strokeStyle = 'rgba(170,200,255,0.65)'; x.stroke(); }
    var ar = H / 2 - pad - 10, ax = pad + 10 + ar, ay = H / 2;
    x.save(); x.beginPath(); x.arc(ax, ay, ar, 0, Math.PI * 2); x.closePath(); x.clip();
    if (d.avatarResim && d.avatarResim.complete && d.avatarResim.naturalWidth) x.drawImage(d.avatarResim, ax - ar, ay - ar, ar * 2, ar * 2);
    else {
      x.fillStyle = d.rol === 'gelin' ? '#5c6bc0' : (d.rol === 'damat' ? '#263238' : (d.rol === 'halaybasi' ? '#b71c1c' : (d.npc ? '#4e4a44' : '#4527a0')));
      x.fillRect(ax - ar, ay - ar, ar * 2, ar * 2);
      x.fillStyle = '#fff'; x.font = 'bold 72px Segoe UI, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText((d.isim || '?').charAt(0).toLocaleUpperCase('tr'), ax, ay + 4);
    }
    x.restore();
    var tx = ax + ar + 22, maxW = W - tx - 34;
    var ust = d.oyuncu ? ('🍩 ' + Math.floor(d.puan || 0) + ' puan') : (d.rol ? (ROL_EMOJI[d.rol] + ' ' + ROL_AD[d.rol].toLocaleUpperCase('tr')) : (d.npc ? 'sürü' : (d.jeton > 0 ? '🪙 ' + d.jeton : '')));
    x.textAlign = 'left'; x.textBaseline = 'middle';
    var ad = d.isim || '?', fs = 62;
    x.font = '800 ' + fs + 'px Segoe UI, Arial';
    while (x.measureText(ad).width > maxW && fs > 34) { fs -= 2; x.font = '800 ' + fs + 'px Segoe UI, Arial'; }
    while (x.measureText(ad).width > maxW && ad.length > 3) ad = ad.slice(0, -2) + '…';
    x.fillStyle = d.rol ? '#fff4d6' : (d.npc ? '#cfc8c0' : '#ffffff');
    x.shadowColor = 'rgba(0,0,0,0.8)'; x.shadowBlur = 6;
    x.fillText(ad, tx, ust ? H / 2 + 22 : H / 2);
    if (ust) { x.font = '800 36px Segoe UI, Arial'; x.fillStyle = d.rol === 'gelin' ? '#bcd4ff' : (d.rol ? '#ffd54a' : '#ffc78a'); x.fillText(ust, tx, H / 2 - 36); }
    d.etiketDoku.needsUpdate = true;
  }

  function balonGoster(d, metin, sure) {
    if (!d.balon) {
      d.balonTuval = tuvalYap(640, 190);
      d.balonDoku = new THREE.CanvasTexture(d.balonTuval);
      d.balonDoku.minFilter = THREE.LinearFilter;
      d.balon = new THREE.Sprite(new THREE.SpriteMaterial({ map: d.balonDoku, transparent: true, depthWrite: false, fog: false }));
      d.balon.scale.set(1.9, 1.9 * 190 / 640, 1);
      d.balon.renderOrder = 6;
      d.kok.add(d.balon);
    }
    var x = d.balonTuval.getContext('2d'), W = 640, H = 190;
    x.clearRect(0, 0, W, H);
    yuvarlakKutu(x, 10, 10, W - 20, H - 50, 40); x.fillStyle = '#ffffff'; x.fill();
    x.beginPath(); x.moveTo(W / 2 - 22, H - 42); x.lineTo(W / 2, H - 8); x.lineTo(W / 2 + 22, H - 42); x.fill();
    x.fillStyle = '#141a2c'; x.textAlign = 'center'; x.textBaseline = 'middle';
    var fs = 52; x.font = '800 ' + fs + 'px Segoe UI, Arial';
    var m = String(metin).slice(0, 60);
    while (x.measureText(m).width > W - 70 && fs > 30) { fs -= 2; x.font = '800 ' + fs + 'px Segoe UI, Arial'; }
    while (x.measureText(m).width > W - 70 && m.length > 4) m = m.slice(0, -2) + '…';
    x.fillText(m, W / 2, (H - 40) / 2 + 6);
    d.balonDoku.needsUpdate = true;
    d.balonBitis = simdi() + (sure || 4.5);
    d.balon.visible = true;
  }

  function govdeKur(d) {
    if (d.p) d.kok.remove(d.p.kok);
    d.p = kurtYap(d.gorunum, d.rol);
    d.kok.add(d.p.kok);
  }

  function dansciYap(bilgi) {
    var gor = bilgi.gorunum && bilgi.gorunum.kurk ? bilgi.gorunum : gorunumUret(bilgi.npc);
    var d = {
      id: bilgi.id, isim: bilgi.isim, avatar: bilgi.avatar || '', jeton: bilgi.jeton || 0, rol: bilgi.rol || null,
      npc: !!bilgi.npc, gorunum: gor, katilma: bilgi.katilma || Date.now(),
      gecikme: rnd(-0.05, 0.05), faz: rnd(0, 6), ofs: null, r: 5, giris: simdi(), selamBitis: 0, balonBitis: 0, son: false, lider: false
    };
    d.kok = new THREE.Group();
    scene.add(d.kok);
    govdeKur(d);
    // golge atesin tersine uzar
    var golge = new THREE.Mesh(geo('golge', function () { return new THREE.PlaneGeometry(1.1, 1.1); }),
      new THREE.MeshBasicMaterial({ map: golgeDoku, transparent: true, depthWrite: false, opacity: 0.6 }));
    golge.rotation.x = -Math.PI / 2; golge.position.set(0, 0.03, -0.45); golge.scale.set(0.9, 1.9, 1);
    d.kok.add(golge);
    etiketHazirla(d);
    return d;
  }

  function dansciSil(d) {
    scene.remove(d.kok);
    if (d.etiketDoku) d.etiketDoku.dispose();
    if (d.balonDoku) d.balonDoku.dispose();
  }

  function npcAyarla() {
    var gercek = Object.keys(kisiler).length;
    var istenen = Math.max(0, NPC_SAYI - gercek);
    while (npcler.length > istenen) {
      var d = npcler.pop();
      patlama(d.kok.position.clone().setY(1.2), 40, 0x9fd8ff);
      dansciSil(d);
    }
    while (npcler.length < istenen) {
      var ad = NPC_ADLARI[npcler.length % NPC_ADLARI.length];
      var disi = /Teyze|Hala|Işığı|Kuzusu/.test(ad);
      npcler.push(dansciYap({ id: 'npc' + npcler.length, isim: ad, npc: true, gorunum: gorunumUret(true, disi) }));
    }
  }

  function siraKur() {
    var liste = Object.keys(kisiler).map(function (k) { return kisiler[k]; });
    liste.sort(function (a, b) { return a.katilma - b.katilma; });
    var hb = liste.filter(function (d) { return d.rol === 'halaybasi'; });
    var dam = liste.filter(function (d) { return d.rol === 'damat'; });
    var gel = liste.filter(function (d) { return d.rol === 'gelin'; });
    var dig = liste.filter(function (d) { return !d.rol; });
    dig.forEach(function (d, i) { d.kok.visible = i < MAKS_DANSCI; });
    hat = hb.concat(dam, gel, dig.slice(0, MAKS_DANSCI), npcler);
    for (var i = 0; i < hat.length; i++) {
      hat[i].sira = i;
      hat[i].lider = i === 0; hat[i].son = i === hat.length - 1 && hat.length > 1;
    }
  }

  // ============================================================ dans: pozlar (DABKE)
  // Dongu 32 vurus, el ele omuz omuza:
  //  0-16 temel adim (2 x 8): yana adim, capraz, adim, sek, sol tekme, SOL VURUS, sag diz, SAG VURUS
  // 16-20 el ele derin cokme (halay basi: sirtustu yere paralel kayma)
  // 20-24 sag bacak havaya + sert taban vurusu (her vurus)
  // 24-28 yerinde sekme + omuz titretme (halay basi: mendil cevirip bacak supurme)
  // 28-30 diz cekip yuksek ziplama (inis = HOPPA)
  // 30-32 bacak kaldirma ve final vurusu (halay basi: geriye egilip 360 donus)
  function P0() {
    return { tR: 0, kR: 0, tL: 0, kL: 0, aR: 0, aL: 0, y: 0, kz: 0, gx: 0, gy: 0, gz: 0, bx: 0, bz: 0,
      olx: 0, olz: 0.38, odl: -0.3, orx: 0, orz: -0.38, odr: -0.3, zip: 0, kuy: -0.5, cene: 0, spin: 0 };
  }
  var ALANLAR = Object.keys(P0());
  function karistir(a, b, w) {
    var o = {};
    for (var i = 0; i < ALANLAR.length; i++) { var k = ALANLAR[i]; o[k] = a[k] + (b[k] - a[k]) * w; }
    return o;
  }

  var EL = 0.5;   // komsunun eline uzanan kol acisi (danset her kurt icin hattaki araliga gore ayarlar)
  function eleTut(p, cek) {
    p.olz = EL - (cek || 0); p.orz = -EL + (cek || 0);
    p.olx = p.orx = -0.18; p.odl = p.odr = -0.22;
  }
  // Tek bacak taban vurusu: yavas kaldir -> hizlanarak indir -> temas aninda dur.
  // Dondurur: [kalca acisi, diz, sarsinti(temasta 1, sonra soner)]
  function vurus(f, yuksek) {
    var kalk = 0.42, in_ = 0.58;
    if (f < kalk) { var u = yumusak(f / kalk); return [-yuksek * u, 1.2 * u, 0]; }
    if (f < in_) { var v = (f - kalk) / (in_ - kalk); v = v * v * v; return [-yuksek * (1 - v), 1.2 * (1 - v), 0]; }
    return [0, 0, Math.exp(-(f - in_) * 14)];
  }
  // darbe: govde coker, dizler yutar, kisa titreme
  function sarsintiUygula(p, s, t) {
    if (s <= 0.001) return;
    p.y -= 0.09 * s; p.gx += 0.1 * s; p.bx += 0.12 * s;
    p.gy += 0.05 * s * Math.sin(t * 70); p.gz += 0.03 * s * Math.sin(t * 55 + 1);
    p.kL += 0.35 * s; p.kR += 0.35 * s; p.tL -= 0.18 * s; p.tR -= 0.18 * s;
  }

  function pozDabke(bb, t, e) {
    var p = P0(), u = mod(bb, 8), bi = Math.floor(u), f = u - bi, s = Math.sin(Math.PI * f), amp = 0.8 + 0.5 * e, sars = 0, v;
    if (bi === 0 || bi === 2) { p.aR = 0.3 * s * amp; p.tR = -0.25 * s; p.kR = 0.5 * s; p.y = -0.06 * s; }
    else if (bi === 1) { p.tL = 0.35 * s * amp; p.kL = 0.7 * s; p.aL = -0.12 * s; p.y = -0.08 * s; }
    else if (bi === 3) { p.tL = -0.7 * s * amp; p.kL = 1.1 * s; p.kR = 0.25 * s; p.zip = 0.09 * s * amp; }
    else if (bi === 4) { p.tL = -1.05 * s * amp; p.kL = 0.15; p.kR = 0.2 * s; p.gx = -0.12 * s; p.bx = -0.08 * s; p.y = -0.04 * s; }
    else if (bi === 5) { v = vurus(f, 0.75 * amp); p.tL = v[0]; p.kL = v[1]; sars = v[2]; }
    else if (bi === 6) { p.tR = -0.65 * s * amp; p.kR = 1.1 * s; p.y = -0.03 * s; }
    else { v = vurus(f, 0.9 * amp); p.tR = v[0]; p.kR = v[1]; sars = v[2] * 1.3; }
    p.gy = 0.06 * Math.sin(Math.PI * bb * 0.5);
    p.kz = 0.05 * Math.sin(Math.PI * bb * 0.5);
    sarsintiUygula(p, sars, t);
    eleTut(p, 0.08 * s + 0.15 * sars);
    p.kuy = -0.4 + 0.2 * s; p.cene = 0.08 + 0.12 * sars;
    return p;
  }
  function pozCokme(bb, t, e) {
    var p = P0(), dip = Math.sin(Math.PI * mod(bb, 1));
    p.tR = p.tL = -1.35; p.kR = p.kL = 2.25; p.aR = p.aL = 0.18; p.y = -0.52 + 0.06 * dip;
    p.gx = 0.38; p.bx = -0.3;
    eleTut(p, 0); p.olx = p.orx = -0.55;
    p.gy = 0.1 * Math.sin(t * Math.PI * 16) * e;
    p.kuy = 0.15; p.cene = 0.15;
    return p;
  }
  function pozYerKayma(bb, t, e) {   // halay basi: sirtustu neredeyse yere paralel, sol bacak ileri uzanir
    var p = P0(), dip = Math.sin(Math.PI * mod(bb, 1));
    p.tL = -1.5; p.kL = 0.05; p.tR = -0.15; p.kR = 2.1; p.y = -0.5 + 0.04 * dip;
    p.gx = -0.95; p.bx = 0.55;
    eleTut(p, 0); p.olz = EL + 0.2; p.olx = 0.3; p.odl = -0.1;
    p.kuy = 0.3; p.cene = 0.3;
    return p;
  }
  function pozTekme(bb, t, e) {
    var p = P0(), f = mod(bb, 1), amp = 0.85 + 0.4 * e, sars = 0;
    if (f < 0.4) {
      var u = yumusak(f / 0.4);
      p.tR = -1.55 * u * amp; p.kR = 0.15; p.kL = 0.3 * u; p.gx = -0.28 * u; p.zip = 0.12 * Math.sin(Math.PI * f / 0.4);
    } else if (f < 0.55) {
      var v = (f - 0.4) / 0.15; v = v * v * v;
      p.tR = -1.55 * amp * (1 - v); p.kR = 0.15 + 0.6 * Math.sin(Math.PI * v); p.gx = -0.28 * (1 - v);
    } else sars = Math.exp(-(f - 0.55) * 14) * 1.4;
    sarsintiUygula(p, sars, t);
    eleTut(p, 0.2 * sars);
    p.kuy = 0.1; p.cene = 0.2 + 0.2 * sars;
    return p;
  }
  function pozSek(bb, t, e) {
    var p = P0(), f = mod(bb, 1), bi = Math.floor(mod(bb, 2)), s = Math.sin(Math.PI * f), tr = Math.sin(t * Math.PI * 2 * 8), sars = 0;
    p.kR = p.kL = 0.35 + 0.35 * s; p.tR = p.tL = -0.18 - 0.2 * s; p.y = -0.08 - 0.08 * s;
    if (bi === 1) { var v = vurus(f, 0.55); p.tL = v[0] - 0.1; p.kL = v[1] + 0.3; sars = v[2] * 0.8; }
    p.gy = 0.14 * tr * (0.5 + e); p.gx = 0.1;
    sarsintiUygula(p, sars, t);
    eleTut(p, 0.05 * s);
    p.kuy = 0.2 + 0.15 * tr; p.cene = 0.15;
    return p;
  }
  function pozSupurme(c, t, e) {   // halay basi: sol ayak eksen, sag bacak yerde yarim daire supurur
    var p = P0(), ps = mod(c - 24, 2) / 2 * Math.PI;
    p.tL = -1.15; p.kL = 2.0; p.y = -0.45; p.gx = 0.25; p.bx = -0.2;
    p.tR = -1.25 * Math.cos(ps); p.aR = 1.15 * Math.sin(ps); p.kR = 0.08;
    p.gz = -0.15 * Math.sin(ps); p.spin = 0.5 * Math.sin(Math.PI * (c - 24) / 2);
    eleTut(p, 0); p.olz = EL + 0.15;
    p.kuy = 0.4; p.cene = 0.3;
    return p;
  }
  function pozZipla(u, t, e) {   // u: 0-2 (28-30. vurus)
    var p = P0(), amp = 0.75 + 0.4 * e;
    if (u < 0.5) {   // cokup ivme al
      var w = yumusak(u / 0.5);
      p.tR = p.tL = -0.9 * w; p.kR = p.kL = 1.6 * w; p.y = -0.32 * w; p.gx = 0.3 * w;
      eleTut(p, 0); p.olx = p.orx = 0.4 * w;
    } else if (u < 1.4) {   // havada dizler gogse
      var s = (u - 0.5) / 0.9, tk = Math.sin(Math.PI * s);
      p.zip = 1.0 * tk * amp;
      p.y = -0.32 * Math.max(0, 1 - s * 5) - 0.32 * Math.max(0, (s - 0.8) * 5);
      p.tR = p.tL = -0.9 - 0.8 * tk; p.kR = p.kL = 1.6 + 0.7 * tk; p.gx = 0.3 - 0.4 * tk; p.bx = -0.35 * tk;
      eleTut(p, 0); p.olz = EL + 1.6 * tk; p.orz = -p.olz; p.olx = p.orx = -0.3;
      p.kuy = 0.7; p.cene = 0.45;
    } else {   // inis: darbe yutulur
      var q = (u - 1.4) / 0.6, bk = Math.exp(-q * 5);
      p.tR = p.tL = -0.9 * bk; p.kR = p.kL = 1.6 * bk; p.y = -0.32 * bk; p.gx = 0.3 * bk;
      p.gy = 0.05 * bk * Math.sin(t * 60);
      eleTut(p, 0.15 * bk); p.kuy = 0.3; p.cene = 0.3 * bk;
    }
    return p;
  }
  function pozFinal(u, t, e) {   // u: 0-2 (30-32. vurus)
    var p = P0(), sars = 0;
    if (u < 0.85) { var w = yumusak(u / 0.85); p.tR = -1.7 * w; p.kR = 0.05; p.kL = 0.15 * w; p.gx = -0.3 * w; p.bx = -0.15 * w; p.zip = 0.05 * w; }
    else if (u < 1.0) { var v = (u - 0.85) / 0.15; v = v * v * v; p.tR = -1.7 * (1 - v); p.kR = 0.05 + 0.5 * Math.sin(Math.PI * v); p.gx = -0.3 * (1 - v); }
    else { sars = Math.exp(-(u - 1.0) * 6) * 1.6; p.gx = -0.15; p.bx = -0.25; }
    sarsintiUygula(p, sars, t);
    eleTut(p, 0.2 * sars);
    if (u >= 1.0) { var k = yumusak((u - 1.0) / 0.4); p.olz = EL + 1.3 * k; p.orz = -p.olz; }   // eller havaya
    p.kuy = u >= 1 ? 0.5 : 0.1; p.cene = 0.25 + 0.3 * sars;
    return p;
  }
  function pozUluma() {
    var p = P0();
    p.gx = -0.28; p.bx = -1.0; p.cene = 0.6; p.olx = p.orx = 0.12; p.olz = 0.28; p.orz = -0.28; p.odl = p.odr = -0.2; p.kuy = -0.15;
    return p;
  }
  function pozSelam(t) {
    var p = P0(), sal = Math.sin(t * 11);
    p.olz = 2.6 + 0.25 * sal; p.orz = -2.6 + 0.25 * sal; p.odl = p.odr = -0.3;
    p.zip = 0.12 * Math.abs(Math.sin(t * 8)); p.cene = 0.3; p.kuy = 0.4;
    return p;
  }
  // [faz, baslangic, onceki faz, gecis suresi]
  function fazBul(c) {
    if (c < 16) return ['dabke', 0, 'final', 0.5];
    if (c < 20) return ['cokme', 16, 'dabke', 0.6];
    if (c < 24) return ['tekme', 20, 'cokme', 0.5];
    if (c < 28) return ['sek', 24, 'tekme', 0.4];
    if (c < 30) return ['zipla', 28, 'sek', 0.25];
    return ['final', 30, 'zipla', 0.15];
  }
  function fazPoz(ad, c, bb, t, e, lider) {
    if (ad === 'dabke') return pozDabke(bb, t, e);
    if (ad === 'cokme') return lider ? pozYerKayma(bb, t, e) : pozCokme(bb, t, e);
    if (ad === 'tekme') return pozTekme(bb, t, e);
    if (ad === 'sek') return lider ? pozSupurme(c, t, e) : pozSek(bb, t, e);
    if (ad === 'zipla') return pozZipla(mod(c - 28, 32), t, e);
    return pozFinal(mod(c - 30, 32), t, e);
  }

  function pozUygula(p, P, t, e, faz) {
    p.bacakR.kal.rotation.set(P.tR, 0, -P.aR); p.bacakR.diz.rotation.x = P.kR;
    p.bacakL.kal.rotation.set(P.tL, 0, P.aL); p.bacakL.diz.rotation.x = P.kL;
    p.kalca.position.y = KALCA_Y + P.y; p.kalca.rotation.z = P.kz;
    p.govde.rotation.set(P.gx, P.gy, P.gz);
    p.bas.rotation.set(P.bx, 0, P.bz);
    p.kolL.omuz.rotation.set(P.olx, 0, P.olz); p.kolL.dirsek.rotation.x = P.odl;
    p.kolR.omuz.rotation.set(P.orx, 0, P.orz); p.kolR.dirsek.rotation.x = P.odr;
    p.kok.position.y = P.zip; p.kok.rotation.y = P.spin;
    p.cene.rotation.x = P.cene;
    p.kuyruk.rotation.set(P.kuy, Math.sin(t * (5 + 7 * e) + faz) * 0.45, 0);
    var kul = Math.max(0, Math.sin(t * 0.7 + faz * 3)) > 0.97 ? 0.35 : 0;   // ara sira kulak oynatir
    p.kulakL.rotation.x = kul; p.kulakR.rotation.x = kul * 0.6;
    if (p.etek) { var k = 1 + 0.14 * Math.min(1, Math.abs(P.y) * 2 + P.zip); p.etek.scale.set(k, 1, k); p.etek.rotation.z = -P.kz * 0.8; }
  }

  var ulumaW = 0, ulumaLider = null, ulumaIkinci = null;

  // etiket, balon ve giris buyumesi (halay ve oyun kurtlari ortak)
  function kurtUstu(d, t) {
    var yas = t - d.giris;
    var olcek = yas < 0.7 ? (1 + Math.sin(yas / 0.7 * Math.PI) * 0.25) * yumusak(yas / 0.7) : 1;
    d.kok.scale.setScalar(Math.max(0.001, olcek));
    if (d.balon) d.balon.visible = etiketAcik && t < d.balonBitis;
    d.etiket.visible = etiketAcik;
    var tavan = d.rol === 'damat' ? 3.3 : (d.rol ? 3.05 : 2.75);
    d.etiket.position.y = tavan + ((d.sira || 0) % 2) * 0.36;
    if (d.balon) d.balon.position.y = d.etiket.position.y + 0.6;
  }

  function danset(d, b, t, e) {
    var bb = b - d.gecikme - (d.sira || 0) * 0.05;   // sira boyunca dalga
    var c = mod(bb, 32), fz = fazBul(c);
    EL = d.elAci || 0.5;
    var P = fazPoz(fz[0], c, bb, t, e, d.lider);
    var gecen = c - fz[1];
    if (gecen < fz[3]) P = karistir(fazPoz(fz[2], c, bb, t, e, d.lider), P, yumusak(gecen / fz[3]));

    if (d.lider) {   // halay basi: mendilli el bas ustunde daire cizer (kumasi savurur)
      var hz = 6.5 + 3 * e;
      P.orx = -0.25 + 0.42 * Math.cos(t * hz); P.orz = -2.3 + 0.38 * Math.sin(t * hz); P.odr = -0.35;
      if (fz[0] === 'final' && gecen < 1) { P.spin = Math.PI * 2 * yumusak(gecen); P.gx -= 0.35; }
    } else if (d.son) {   // hattin sonundaki bos elini sallar
      P.olz = 2.3 + 0.3 * Math.sin(t * 5); P.olx = -0.2; P.odl = -0.4;
    }
    if (t < d.selamBitis) P = karistir(P, pozSelam(t), Math.min(1, (d.selamBitis - t) / 0.4));
    if (ulumaW > 0.001) {
      var bas = d === ulumaLider || d === ulumaIkinci;
      var U = pozUluma();
      if (bas) {   // alfalar aya donup (yari profil) ulur
        var fark = AY_YAW + 1.45 - d.kok.rotation.y;
        U.spin = Math.atan2(Math.sin(fark), Math.cos(fark));
        U.orz = -0.28; U.orx = 0.12;
      }
      P = karistir(P, U, ulumaW * (bas ? 1 : 0.55));
    }
    pozUygula(d.p, P, t, e, d.faz);
    kurtUstu(d, t);
  }

  // hat ilerlemesi: dabke adiminda yana yurur, vurus/cokme/ziplamada yerinde
  function ilerleme(b) {
    var dongu = Math.floor(b / 32), c = b - dongu * 32, ic;
    function birim(u) {   // 8 vurusluk adimin ilk 3 vurusunda yana kayar
      if (u < 3) { var bi = Math.floor(u); return (bi + yumusak(u - bi)) * 0.2; }
      return 0.6;
    }
    if (c < 8) ic = birim(c);
    else if (c < 16) ic = 0.6 + birim(c - 8);
    else if (c < 24) ic = 1.2;
    else if (c < 28) ic = 1.2 + (c - 24) * 0.0375;
    else ic = 1.35;
    return dongu * 1.35 + ic;
  }

  var hatR = HAT_MIN_R, basAci = Math.PI * 0.5, oncekiIl = null;
  function hatGuncelle(b, dt) {
    var n = hat.length;
    if (!n) return;
    var ara = 1.0;   // omuz omuza
    var R = sinirla(n * ara / (2 * Math.PI * 0.82), HAT_MIN_R, HAT_MAKS_R);
    ara = Math.max(ara, Math.min(1.2, 2 * Math.PI * R * 0.66 / n));
    if (n * ara > 2 * Math.PI * R * 0.92) ara = 2 * Math.PI * R * 0.92 / n;
    hatR += (R - hatR) * Math.min(1, dt * 1.2);
    var il = ilerleme(b);
    if (oncekiIl === null) oncekiIl = il;
    var dIl = il - oncekiIl; oncekiIl = il;
    if (dIl < 0 || dIl > 0.6) dIl = 0;
    basAci -= dIl * (1 - ulumaW) / hatR;
    for (var i = 0; i < n; i++) {
      var d = hat[i], hedef = i * ara / hatR;
      if (d.ofs === null) { d.ofs = hedef; d.r = hatR; }
      d.ofs += (hedef - d.ofs) * Math.min(1, dt * 2.2);
      d.r += (hatR - d.r) * Math.min(1, dt * 2);
      var a = basAci + d.ofs;
      var x = MERKEZ.x + d.r * Math.cos(a), z = MERKEZ.z + d.r * Math.sin(a);
      d.kok.position.set(x, 0, z);
      d.kok.rotation.y = Math.atan2(MERKEZ.x - x, MERKEZ.z - z);
      // komsunun eline uzanacak kol acisi (omuz 0.28, kol ~0.66 boyunda)
      var s = d.p.kok.scale.x;
      d.elAci = Math.asin(sinirla((ara * 0.5 - 0.28 * s) / (0.66 * s), 0.08, 0.95));
    }
  }

  // ---- muzisyen kurtlar ve kutukte oturan seyirci kurtlar
  var muzisyenler = [], seyirciler = [];
  (function () {
    function yerlestir(aD, R, gor) {
      var a = aD * Math.PI / 180, x = Math.cos(a) * R, z = Math.sin(a) * R;
      var p = kurtYap(gor, null);
      p.kok.position.set(x, 0, z);
      p.kok.rotation.y = Math.atan2(-x, -z);
      scene.add(p.kok);
      return p;
    }
    var davulcu = yerlestir(-124, 9.5, { k: false, kurk: '#7a5c40', bandana: '#e53935', goz: '#ffc233' });
    var davul = new THREE.Group();
    var dg = new THREE.Mesh(silindir(0.42, 0.42, 0.4, 24), mat('#8d3b1c', { roughness: 0.5 }));
    dg.rotation.z = Math.PI / 2; davul.add(dg);
    [-1, 1].forEach(function (s) {
      var deri = new THREE.Mesh(silindir(0.425, 0.425, 0.02, 24), mat('#f3e5c8', { roughness: 0.8 })); deri.rotation.z = Math.PI / 2; deri.position.x = 0.2 * s; davul.add(deri);
      var cember = new THREE.Mesh(simit(0.43, 0.025, 6, 30), mat('#c9962e', { metalness: 0.8, roughness: 0.3 })); cember.rotation.y = Math.PI / 2; cember.position.x = 0.21 * s; davul.add(cember);
    });
    davul.position.set(0, 1.25, 0.34); davul.rotation.y = Math.PI / 2;
    davulcu.kok.add(davul);
    var tokmak = new THREE.Mesh(silindir(0.02, 0.02, 0.45, 6), mat('#6d4c41')); tokmak.position.set(0, -0.5, 0.12); tokmak.rotation.x = 1.2; davulcu.kolR.dirsek.add(tokmak);
    muzisyenler.push({ p: davulcu, tur: 'davul', faz: 1 });

    var kemenceci = yerlestir(-110, 9.7, { k: false, kurk: '#5d6068', bandana: '#1e88e5', goz: '#ffd84a' });
    var kemence = new THREE.Group();
    var kg = new THREE.Mesh(kutu(0.12, 0.34, 0.07), mat('#7a3e1c', { roughness: 0.45 })); kemence.add(kg);
    var sap = new THREE.Mesh(kutu(0.05, 0.22, 0.04), mat('#4e2a12')); sap.position.y = 0.27; kemence.add(sap);
    kemence.position.set(0.06, 0.42, 0.3); kemence.rotation.z = 0.15;
    kemenceci.govde.add(kemence);
    var yay = new THREE.Mesh(silindir(0.008, 0.008, 0.55, 5), mat('#d8c8a0')); yay.rotation.z = Math.PI / 2; yay.position.set(0.1, -0.32, 0.05); kemenceci.kolR.dirsek.add(yay);
    muzisyenler.push({ p: kemenceci, tur: 'kemence', faz: 2 });

    bankYerleri.forEach(function (bk, bi) {
      var n = bi === 1 ? 2 : 3;
      for (var i = 0; i < n; i++) {
        var p = kurtYap(gorunumUret(true), null);
        var lx = (i - (n - 1) / 2) * 0.85;
        var v = new THREE.Vector3(lx, 0, 0).applyQuaternion(bk.grup.quaternion).add(bk.grup.position);
        p.kok.position.copy(v);
        p.kok.rotation.y = bk.grup.rotation.y;
        scene.add(p.kok);
        seyirciler.push({ p: p, faz: rnd(0, 1), faz2: rnd(0, 6) });
      }
    });
  })();

  function muzisyenOyna(b, t, e) {
    muzisyenler.forEach(function (m) {
      var P = P0(), f = mod(b, 1);
      P.y = -0.05 * Math.sin(Math.PI * f); P.gz = 0.06 * Math.sin(Math.PI * b * 0.5);
      if (m.tur === 'davul') {
        P.orx = -0.7 - 1.0 * yumusak(f); P.orz = -0.25; P.odr = -0.9;
        P.olx = -0.6 - 0.5 * yumusak(mod(b + 0.5, 1)); P.olz = 0.35; P.odl = -1.1;
      } else {
        P.olx = -1.2; P.olz = 0.3; P.odl = -1.6;
        P.orx = -0.9; P.orz = -0.55 + 0.35 * Math.sin(Math.PI * b * 2); P.odr = -1.2;
        P.bx = 0.2; P.bz = 0.15;
      }
      P.cene = 0.1 + 0.2 * ulumaW; P.bx -= 0.8 * ulumaW;
      pozUygula(m.p, P, t, e, m.faz);
    });
    seyirciler.forEach(function (s) {
      var P = P0(), f = mod(b + s.faz, 1), alkis = Math.abs(Math.cos(Math.PI * f));
      P.y = -0.33; P.tR = P.tL = -1.5; P.kR = P.kL = 1.5;
      P.olx = P.orx = -1.1; P.olz = 0.12 + 0.28 * alkis; P.orz = -0.12 - 0.28 * alkis; P.odl = P.odr = -0.7;
      P.bz = 0.12 * Math.sin(b * 0.3 + s.faz2); P.kuy = -1.2;
      P.bx = -0.9 * ulumaW; P.cene = 0.05 + 0.5 * ulumaW;
      pozUygula(s.p, P, t, e, s.faz2);
      s.p.bas.rotation.y = 0.25 * Math.sin(t * 0.4 + s.faz2);
    });
  }

  // ============================================================ kare mendil (kumas fizigi)
  // Halay basinin elindeki mendil: kosesinden tutulan kare kumas, verlet ile salinir, el dondukce savrulur.
  var MENDIL_N = 9, MENDIL_BOY = 0.7;
  var mendilDoku = (function () {
    var c = tuvalYap(256, 256), x = c.getContext('2d');
    x.fillStyle = '#c3141b'; x.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 256; i += 3) { x.fillStyle = 'rgba(0,0,0,0.07)'; x.fillRect(i, 0, 1, 256); x.fillRect(0, i, 256, 1); }   // dokuma
    x.strokeStyle = '#f2c14e'; x.lineWidth = 12; x.strokeRect(16, 16, 224, 224);     // altin serit
    x.strokeStyle = '#fff1c2'; x.lineWidth = 3; x.strokeRect(30, 30, 196, 196);
    x.fillStyle = '#f2c14e';
    x.save(); x.translate(128, 128);
    for (var r = 0; r < 8; r++) { x.rotate(Math.PI / 4); x.beginPath(); x.ellipse(0, -34, 10, 24, 0, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = '#fff1c2'; x.beginPath(); x.arc(0, 0, 11, 0, Math.PI * 2); x.fill();
    x.restore();
    [[46, 46], [210, 46], [46, 210], [210, 210]].forEach(function (k) {   // kose cicekleri
      x.fillStyle = '#f2c14e';
      for (var j = 0; j < 5; j++) { var a = j / 5 * Math.PI * 2; x.beginPath(); x.arc(k[0] + Math.cos(a) * 7, k[1] + Math.sin(a) * 7, 5, 0, Math.PI * 2); x.fill(); }
      x.fillStyle = '#ffffff'; x.beginPath(); x.arc(k[0], k[1], 3.5, 0, Math.PI * 2); x.fill();
    });
    x.fillStyle = '#fff1c2';   // kenar oyasi
    for (var p = 6; p < 256; p += 11) {
      x.beginPath(); x.arc(p, 4, 3.2, 0, 7); x.arc(p, 252, 3.2, 0, 7); x.fill();
      x.beginPath(); x.arc(4, p, 3.2, 0, 7); x.arc(252, p, 3.2, 0, 7); x.fill();
    }
    var t = new THREE.CanvasTexture(c); t.anisotropy = 4;
    return t;
  })();
  var kumas = (function () {
    var N = MENDIL_N, g = new THREE.PlaneGeometry(MENDIL_BOY, MENDIL_BOY, N - 1, N - 1);
    var mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: mendilDoku, side: THREE.DoubleSide, roughness: 0.7, metalness: 0, emissive: '#3a0000' }));
    mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh);
    var ara = MENDIL_BOY / (N - 1), kisit = [];
    function ekle(a, b, l, k) { kisit.push(a, b, l, k); }
    for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
      var k = j * N + i;
      if (i < N - 1) ekle(k, k + 1, ara, 1);
      if (j < N - 1) ekle(k, k + N, ara, 1);
      if (i < N - 1 && j < N - 1) { ekle(k, k + N + 1, ara * Math.SQRT2, 0.8); ekle(k + 1, k + N, ara * Math.SQRT2, 0.8); }
      if (i < N - 2) ekle(k, k + 2, ara * 2, 0.3);        // hafif bukulme direnci
      if (j < N - 2) ekle(k, k + 2 * N, ara * 2, 0.3);
    }
    return { mesh: mesh, pos: new Float32Array(N * N * 3), eski: new Float32Array(N * N * 3), kisit: kisit, ara: ara, sahip: null };
  })();
  var _el = new THREE.Vector3(), _ex = new THREE.Vector3(), _ey = new THREE.Vector3(), _q = new THREE.Quaternion();
  function mendilGuncelle(dt, t) {
    var M = kumas, d = hat[0];
    var gor = !!(d && d.lider && d.kok.visible && d.kok.scale.x > 0.5);
    M.mesh.visible = gor;
    if (!gor) { M.sahip = null; return; }
    var an = d.p.mendil;
    d.kok.updateMatrixWorld(true);
    _el.setFromMatrixPosition(an.matrixWorld);
    an.getWorldQuaternion(_q);
    _ex.set(1, 0, 0).applyQuaternion(_q); _ey.set(0, 1, 0).applyQuaternion(_q);
    var N = MENDIL_N, n = N * N, p = M.pos, o = M.eski, ara = M.ara, i3, k;
    if (M.sahip !== d) {   // yeni sahip: elden asagi sarkmis halde basla
      for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
        k = (j * N + i) * 3;
        p[k] = _el.x + (i - j) * ara * 0.5; p[k + 1] = _el.y - (i + j) * ara * 0.7; p[k + 2] = _el.z;
        o[k] = p[k]; o[k + 1] = p[k + 1]; o[k + 2] = p[k + 2];
      }
      M.sahip = d;
    }
    // tutulan kose: 0 elde, 1 ve N parmak arasinda (elin yonune gore)
    var tut = [[0, 0, 0], [1, 0.5, -0.5], [N, -0.5, -0.5]];
    var adim = 3, h = Math.min(dt, 0.05) / adim, h2 = h * h, sur = 0.985;
    var rx = (0.7 + 0.5 * Math.sin(t * 1.3)) * h2, rz = 0.6 * Math.sin(t * 0.7) * h2;
    for (var s = 0; s < adim; s++) {
      for (k = 0; k < n; k++) {
        i3 = k * 3;
        var x = p[i3], y = p[i3 + 1], z = p[i3 + 2];
        var cirp = Math.sin(t * 17 + k * 0.9) * 2.5 * h2;   // kumas cirpintisi
        p[i3] += (x - o[i3]) * sur + rx + cirp;
        p[i3 + 1] += (y - o[i3 + 1]) * sur - 9.8 * h2;
        p[i3 + 2] += (z - o[i3 + 2]) * sur + rz - cirp;
        o[i3] = x; o[i3 + 1] = y; o[i3 + 2] = z;
      }
      for (var it = 0; it < 5; it++) {
        var K = M.kisit;
        for (var c = 0; c < K.length; c += 4) {
          var a = K[c] * 3, b = K[c + 1] * 3, L = K[c + 2], sert = K[c + 3];
          var dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
          var uz = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          if (sert < 1 && uz < L) continue;          // bukulme kisiti sadece gerilince calisir
          var f = (uz - L) / uz * 0.5 * sert;
          dx *= f; dy *= f; dz *= f;
          p[a] += dx; p[a + 1] += dy; p[a + 2] += dz; p[b] -= dx; p[b + 1] -= dy; p[b + 2] -= dz;
        }
        for (var q = 0; q < tut.length; q++) {
          i3 = tut[q][0] * 3;
          p[i3] = _el.x + (_ex.x * tut[q][1] + _ey.x * tut[q][2]) * ara;
          p[i3 + 1] = _el.y + (_ex.y * tut[q][1] + _ey.y * tut[q][2]) * ara;
          p[i3 + 2] = _el.z + (_ex.z * tut[q][1] + _ey.z * tut[q][2]) * ara;
        }
      }
      for (k = 0; k < n; k++) if (p[k * 3 + 1] < 0.03) p[k * 3 + 1] = 0.03;   // yere girmesin
    }
    var ga = M.mesh.geometry.attributes.position;
    ga.array.set(p); ga.needsUpdate = true;
    M.mesh.geometry.computeVertexNormals();
  }

  // ============================================================ efektler
  // yapraklar (konfeti)
  var KONFETI = 520;
  var konfeti = new THREE.InstancedMesh(geo('konf', function () { return new THREE.PlaneGeometry(0.13, 0.09); }),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), KONFETI);
  konfeti.frustumCulled = false;
  var kParca = [];
  var KONF_RENK = [0xd84315, 0xffb300, 0xf57c00, 0xc0ca33, 0xffd54a, 0xe64a19, 0xfff3c0];
  (function () {
    var m = new THREE.Matrix4().makeScale(0, 0, 0), c = new THREE.Color();
    for (var i = 0; i < KONFETI; i++) {
      konfeti.setMatrixAt(i, m); konfeti.setColorAt(i, c.setHex(sec(KONF_RENK)));
      kParca.push({ canli: false, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), omur: 0 });
    }
    scene.add(konfeti);
  })();
  var kSira = 0;
  function konfetiAt(merkez, n, yayilma, yukari) {
    for (var i = 0; i < n; i++) {
      var k = kParca[kSira]; kSira = (kSira + 1) % KONFETI;
      k.canli = true; k.omur = rnd(4, 7);
      k.p.set(merkez.x + rnd(-yayilma, yayilma), merkez.y + rnd(0, 1), merkez.z + rnd(-yayilma, yayilma));
      k.v.set(rnd(-1.5, 1.5), rnd(0.5, 1) * (yukari || 0), rnd(-1.5, 1.5));
      k.r.set(rnd(0, 6), rnd(0, 6), rnd(0, 6)); k.w.set(rnd(-8, 8), rnd(-8, 8), rnd(-8, 8));
    }
  }
  var km = new THREE.Matrix4(), kq = new THREE.Quaternion(), ks = new THREE.Vector3(1, 1, 1), ksifir = new THREE.Vector3(0, 0, 0);
  function konfetiGuncelle(dt, t) {
    for (var i = 0; i < KONFETI; i++) {
      var k = kParca[i];
      if (!k.canli) continue;
      k.omur -= dt;
      k.v.y -= 3.2 * dt; k.v.multiplyScalar(1 - 1.6 * dt);
      k.p.addScaledVector(k.v, dt);
      k.p.x += Math.sin(t * 2 + i) * 0.4 * dt;
      if (k.p.y < 0.03) { k.p.y = 0.03; k.v.set(0, 0, 0); k.w.set(0, 0, 0); }
      k.r.x += k.w.x * dt; k.r.y += k.w.y * dt; k.r.z += k.w.z * dt;
      kq.setFromEuler(k.r);
      if (k.omur <= 0) { k.canli = false; km.compose(k.p, kq, ksifir); }
      else km.compose(k.p, kq, ks);
      konfeti.setMatrixAt(i, km);
    }
    konfeti.instanceMatrix.needsUpdate = true;
  }

  // kivilcim / kor parcaciklari (g: yercekimi, eksi deger yukari suzer)
  var KIV = 1600;
  var kivGeo = new THREE.BufferGeometry();
  var kivPos = new Float32Array(KIV * 3), kivRenk = new Float32Array(KIV * 3);
  var kivVel = new Float32Array(KIV * 3), kivOmur = new Float32Array(KIV), kivG = new Float32Array(KIV);
  for (var ki = 0; ki < KIV; ki++) kivPos[ki * 3 + 1] = -100;
  kivGeo.setAttribute('position', new THREE.BufferAttribute(kivPos, 3));
  kivGeo.setAttribute('color', new THREE.BufferAttribute(kivRenk, 3));
  var kivilcim = new THREE.Points(kivGeo, new THREE.PointsMaterial({ size: 0.12, map: noktaDoku, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  kivilcim.frustumCulled = false;
  scene.add(kivilcim);
  var kivSira = 0, kRenk = new THREE.Color();
  function kivilcimAt(x, y, z, vx, vy, vz, omur, renk, g) {
    var i = kivSira; kivSira = (kivSira + 1) % KIV;
    kivPos[i * 3] = x; kivPos[i * 3 + 1] = y; kivPos[i * 3 + 2] = z;
    kivVel[i * 3] = vx; kivVel[i * 3 + 1] = vy; kivVel[i * 3 + 2] = vz;
    kivOmur[i] = omur; kivG[i] = g === undefined ? 9 : g;
    kRenk.setHex(renk);
    kivRenk[i * 3] = kRenk.r; kivRenk[i * 3 + 1] = kRenk.g; kivRenk[i * 3 + 2] = kRenk.b;
  }
  function patlama(merkez, n, renk) {
    for (var i = 0; i < n; i++) {
      var u = rnd(-1, 1), a = rnd(0, 6.283), s = Math.sqrt(1 - u * u), hiz = rnd(2, 5);
      kivilcimAt(merkez.x, merkez.y, merkez.z, Math.cos(a) * s * hiz, u * hiz + 2, Math.sin(a) * s * hiz, rnd(0.6, 1.3), renk || 0xffd77a);
    }
  }
  var fiskiyeler = [];
  function fiskiyeAc(x, y, z, sure, renkler) { fiskiyeler.push({ x: x, y: y, z: z, bitis: simdi() + sure, renk: renkler || [0xfff2c8, 0xffd77a, 0xffb74d] }); }
  function kivilcimGuncelle(dt, t) {
    for (var f = fiskiyeler.length - 1; f >= 0; f--) {
      var fs = fiskiyeler[f];
      if (t > fs.bitis) { fiskiyeler.splice(f, 1); continue; }
      var adet = Math.round(220 * dt);
      for (var a = 0; a < adet; a++) kivilcimAt(fs.x + rnd(-0.05, 0.05), fs.y, fs.z + rnd(-0.05, 0.05), rnd(-0.5, 0.5), rnd(6, 9), rnd(-0.5, 0.5), rnd(0.8, 1.3), sec(fs.renk));
    }
    for (var i = 0; i < KIV; i++) {
      if (kivOmur[i] <= 0) continue;
      kivOmur[i] -= dt;
      if (kivOmur[i] <= 0) { kivPos[i * 3 + 1] = -100; continue; }
      kivVel[i * 3 + 1] -= kivG[i] * dt;
      if (kivG[i] < 1) { kivVel[i * 3] += Math.sin(t * 3 + i) * 0.8 * dt; kivVel[i * 3 + 2] += Math.cos(t * 2.6 + i) * 0.8 * dt; }
      kivPos[i * 3] += kivVel[i * 3] * dt; kivPos[i * 3 + 1] += kivVel[i * 3 + 1] * dt; kivPos[i * 3 + 2] += kivVel[i * 3 + 2] * dt;
      if (kivPos[i * 3 + 1] < 0.02) { kivPos[i * 3 + 1] = 0.02; kivVel[i * 3 + 1] *= -0.3; kivVel[i * 3] *= 0.6; kivVel[i * 3 + 2] *= 0.6; }
      var sn = Math.min(1, kivOmur[i] * 1.5);
      kivRenk[i * 3] *= 0.996; kivRenk[i * 3 + 1] *= 0.985; kivRenk[i * 3 + 2] *= 0.97;
      if (sn < 1) { kivRenk[i * 3] *= sn; kivRenk[i * 3 + 1] *= sn; kivRenk[i * 3 + 2] *= sn; }
    }
    kivGeo.attributes.position.needsUpdate = true;
    kivGeo.attributes.color.needsUpdate = true;
  }

  // isik sutunu (yeni katilan): ay mavisi
  var sutunlar = [];
  function isikSutunu(x, z, renk) {
    var m = huzmeMat(renk, 0.6, 9);
    var s = new THREE.Mesh(huzmeGeo(0.7, 0.7, 9), m);
    s.rotation.x = -Math.PI / 2; s.position.set(x, 0, z);
    scene.add(s);
    sutunlar.push({ m: s, bas: simdi() });
  }
  function sutunGuncelle(t) {
    for (var i = sutunlar.length - 1; i >= 0; i--) {
      var s = sutunlar[i], y = t - s.bas;
      if (y > 1.8) { scene.remove(s.m); s.m.material.dispose(); sutunlar.splice(i, 1); continue; }
      s.m.material.uniforms.uGuc.value = 0.34 * (1 - y / 1.8);
      s.m.scale.set(1 + y * 0.4, 1 + y * 0.4, 1);
    }
  }

  // begeni kalpleri
  var kalpDoku = (function () {
    var c = tuvalYap(128, 128), x = c.getContext('2d');
    x.font = '100px Segoe UI Emoji, Apple Color Emoji, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('❤️', 64, 70);
    return new THREE.CanvasTexture(c);
  })();
  var kalpler = [];
  for (var hk = 0; hk < 40; hk++) {
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: kalpDoku, transparent: true, depthWrite: false, fog: false }));
    sp.visible = false; scene.add(sp);
    kalpler.push({ s: sp, omur: 0, v: new THREE.Vector3() });
  }
  var kalpSira = 0;
  function kalpUcur(konum) {
    var k = kalpler[kalpSira]; kalpSira = (kalpSira + 1) % kalpler.length;
    k.s.position.set(konum.x + rnd(-0.3, 0.3), konum.y, konum.z + rnd(-0.3, 0.3));
    k.v.set(rnd(-0.3, 0.3), rnd(1.2, 2), rnd(-0.3, 0.3));
    k.omur = 2.2; k.s.visible = true;
  }
  function kalpGuncelle(dt) {
    for (var i = 0; i < kalpler.length; i++) {
      var k = kalpler[i];
      if (k.omur <= 0) continue;
      k.omur -= dt;
      if (k.omur <= 0) { k.s.visible = false; continue; }
      k.s.position.addScaledVector(k.v, dt);
      var b = 0.35 + (2.2 - k.omur) * 0.2; k.s.scale.set(b, b, 1);
      k.s.material.opacity = Math.min(1, k.omur);
    }
  }

  // altin yagmuru
  var ALTIN = 160;
  var altinlar = new THREE.InstancedMesh(silindir(0.075, 0.075, 0.018, 16), mat('#ffd54a', { metalness: 1, roughness: 0.2, emissive: '#7a5a00' }), ALTIN);
  altinlar.frustumCulled = false;
  var aParca = [];
  (function () {
    var m = new THREE.Matrix4().makeScale(0, 0, 0);
    for (var i = 0; i < ALTIN; i++) { altinlar.setMatrixAt(i, m); aParca.push({ canli: false, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), omur: 0 }); }
    scene.add(altinlar);
  })();
  var aSira = 0;
  function altinYagdir(merkez, n) {
    for (var i = 0; i < n; i++) {
      var a = aParca[aSira]; aSira = (aSira + 1) % ALTIN;
      a.canli = true; a.omur = rnd(2.5, 4);
      a.p.set(merkez.x + rnd(-1.2, 1.2), merkez.y + rnd(2.5, 5), merkez.z + rnd(-1.2, 1.2));
      a.v.set(rnd(-0.5, 0.5), rnd(-1, 0), rnd(-0.5, 0.5));
      a.r.set(rnd(0, 6), rnd(0, 6), rnd(0, 6));
    }
  }
  function altinGuncelle(dt) {
    for (var i = 0; i < ALTIN; i++) {
      var a = aParca[i];
      if (!a.canli) continue;
      a.omur -= dt;
      a.v.y -= 9 * dt; a.p.addScaledVector(a.v, dt);
      if (a.p.y < 0.03) { a.p.y = 0.03; a.v.y *= -0.35; a.v.x *= 0.7; a.v.z *= 0.7; }
      a.r.x += dt * 9; a.r.z += dt * 5;
      kq.setFromEuler(a.r);
      if (a.omur <= 0) { a.canli = false; km.compose(a.p, kq, ksifir); } else km.compose(a.p, kq, ks);
      altinlar.setMatrixAt(i, km);
    }
    altinlar.instanceMatrix.needsUpdate = true;
  }

  // para yagmuru: havaya atilan banknotlar suzulerek duser
  var PARA = DUSUK ? 220 : 420;
  var paraDoku = (function () {
    var c = tuvalYap(256, 128), x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, 256, 128); g.addColorStop(0, '#5fbf72'); g.addColorStop(1, '#2f8a4a');
    x.fillStyle = g; x.fillRect(0, 0, 256, 128);
    x.strokeStyle = '#e9f7d8'; x.lineWidth = 6; x.strokeRect(8, 8, 240, 112);
    x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 2; x.strokeRect(18, 18, 220, 92);
    x.fillStyle = 'rgba(255,255,255,.25)'; x.beginPath(); x.arc(128, 64, 34, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#f4ffe8'; x.font = '900 52px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('₺', 128, 66);
    x.font = '900 26px Arial'; x.fillText('100', 44, 34); x.fillText('100', 212, 96);
    var t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
  })();
  var paralar = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.34, 0.17),
    new THREE.MeshStandardMaterial({ map: paraDoku, side: THREE.DoubleSide, roughness: 0.8, emissive: '#1d3a22' }), PARA);
  paralar.frustumCulled = false;
  var pParca = [];
  (function () {
    var m = new THREE.Matrix4().makeScale(0, 0, 0);
    for (var i = 0; i < PARA; i++) { paralar.setMatrixAt(i, m); pParca.push({ canli: false, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), omur: 0, faz: 0, yerde: false }); }
    scene.add(paralar);
  })();
  var pSira = 0;
  function paraAt(merkez, n) {   // eller hizasindan havaya bir avuc para
    for (var i = 0; i < n; i++) {
      var a = pParca[pSira]; pSira = (pSira + 1) % PARA;
      a.canli = true; a.yerde = false; a.omur = rnd(6, 8); a.faz = rnd(0, 6.28);
      a.p.set(merkez.x + rnd(-0.4, 0.4), merkez.y + rnd(-0.1, 0.2), merkez.z + rnd(-0.4, 0.4));
      var ac = rnd(0, Math.PI * 2), yay = rnd(0.4, 1.8);
      a.v.set(Math.cos(ac) * yay, rnd(4.2, 7), Math.sin(ac) * yay);
      a.r.set(rnd(0, 6), rnd(0, 6), rnd(0, 6)); a.w.set(rnd(-7, 7), rnd(-5, 5), rnd(-7, 7));
    }
  }
  function paraGuncelle(t, dt) {
    for (var i = 0; i < PARA; i++) {
      var a = pParca[i];
      if (!a.canli) continue;
      a.omur -= dt;
      if (!a.yerde) {
        a.v.y -= 9.8 * dt;
        if (a.v.y < -1.0) a.v.y += (-1.0 - a.v.y) * Math.min(1, dt * 7);   // kagit suzulur
        a.v.x *= 1 - Math.min(1, dt * 0.9); a.v.z *= 1 - Math.min(1, dt * 0.9);
        a.p.addScaledVector(a.v, dt);
        if (a.v.y < 0) { a.p.x += Math.sin(t * 3.1 + a.faz) * 0.7 * dt; a.p.z += Math.cos(t * 2.3 + a.faz) * 0.5 * dt; }
        a.r.x += a.w.x * dt; a.r.y += a.w.y * dt; a.r.z += a.w.z * dt;
        if (a.p.y < 0.02) { a.p.y = 0.02; a.yerde = true; a.r.set(-Math.PI / 2, a.r.y, 0); }
      }
      kq.setFromEuler(a.r);
      var olc = a.omur < 0.6 ? Math.max(0, a.omur / 0.6) : 1;
      if (a.omur <= 0) { a.canli = false; km.compose(a.p, kq, ksifir); }
      else km.compose(a.p, kq, gecici3.set(olc, olc, olc));
      paralar.setMatrixAt(i, km);
    }
    paralar.instanceMatrix.needsUpdate = true;
  }
  var gecici3 = new THREE.Vector3();

  // para hediyesi: gelin ile damadin ustune yakin planda para sacilir
  function paraSac(veren, adet) {
    var dam = rolSahibi('damat'), gel = rolSahibi('gelin');
    var ana = dam || gel || rolSahibi('halaybasi') || hat[0];
    if (!ana) return;
    var ikisi = !!(dam && gel);
    olayEkle({
      tur: 'para', dansci: ana, ikinci: ikisi ? gel : null, veren: veren, sure: 5 + Math.min(3, (adet - 1) * 0.6), guc: Math.min(3, adet),
      ust: '💸 PARA SAÇILIYOR!', ad: veren ? veren.isim : 'Biri',
      alt: ikisi ? ('Alfa Kurt & Leydi Alfa\'ya para yağıyor! 💵') : (dam ? 'Alfa Kurt\'a para yağıyor! 💵' : (gel ? 'Leydi Alfa\'ya para yağıyor! 💵' : 'Halaya para yağıyor! 💵')),
      basla: function () {
        if (veren) balonGoster(veren, '💸 Gelin damada para saçıyorum!', 3);
        if (dam) balonGoster(dam, '💵 Eyvallah! 🐺', 3);
        if (gel) setTimeout(function () { balonGoster(gel, '💵 Sağ ol! 🌙', 3); }, 500);
        cosku = Math.min(1, cosku + 0.2); atesPatla = 1;
      }
    });
    kayitKirli = true;
  }
  var _paraNokta = new THREE.Vector3();
  function paraOlayKare(o, y, gir, dt) {   // olay boyunca avuc avuc para atilir
    if (o.tur !== 'para' || y < gir * 0.6 || y > gir + o.sure - 0.8) return;
    o.paraZaman = (o.paraZaman || 0) - dt;
    if (o.paraZaman > 0) return;
    o.paraZaman = 0.16;
    var a = o.dansci.kok.position, b = (o.ikinci || o.dansci).kok.position;
    _paraNokta.copy(a).add(b).multiplyScalar(0.5); _paraNokta.y = 2.0;
    paraAt(_paraNokta, 5 + 2 * o.guc);
  }

  // ============================================================ ses (uluma, orman)
  function sahneSesi() { return !!window.HalaySes && muzik.cikis === 'sahne'; }
  function ulumaSesi(alfa, leydi, suru) {
    wsGonder({ tur: 'halayUluma', alfa: !!alfa, leydi: !!leydi, suru: suru || 0 });
    if (sahneSesi()) HalaySes.koro(!!alfa, !!leydi, suru || 0);
  }
  function ortamUygula() {
    if (!window.HalaySes) return;
    HalaySes.seviye(ayar.efektSes);
    HalaySes.ortam(!!ayar.ortamAcik && muzik.cikis === 'sahne', ayar.ortamSes);
  }

  // ============================================================ olaylar ve kamera
  var olaylar = [], aktifOlay = null, sonCiftCekimi = simdi(), sonUluma = simdi() - 20, sonGezinti = simdi();
  var dAvatar = document.getElementById('dAvatar'), duyuru = document.getElementById('duyuru');
  function olayEkle(o) { olaylar.push(o); }

  function duyuruAc(o) {
    var d = o.veren || o.dansci;
    document.getElementById('dUst').textContent = o.ust || '';
    document.getElementById('dAd').textContent = o.ad || d.isim;
    document.getElementById('dAlt').textContent = o.alt || '';
    var yedek = document.getElementById('dYedek');
    yedek.textContent = o.tur === 'uluma' ? '🌕' : (d.rol ? ROL_EMOJI[d.rol] : '🐺');
    if (d.avatar && o.tur !== 'uluma') { dAvatar.src = '/avatar?u=' + encodeURIComponent(d.avatar); dAvatar.style.display = 'block'; yedek.style.display = 'none'; }
    else { dAvatar.style.display = 'none'; yedek.style.display = 'flex'; }
    duyuru.className = o.tur === 'katil' ? 'acik' : (o.tur === 'uluma' ? 'acik ay' : 'acik altin');
    // uluma cekiminde alfalarin basi duyurunun arkasinda kalmasin: kisa gosterip kapat
    if (o.tur === 'uluma') setTimeout(function () { if (aktifOlay === o) duyuruKapat(); }, 1800);
    if (o.tur === 'para') setTimeout(function () { if (aktifOlay === o) duyuruKapat(); }, 2200);   // para yagmuru acik gorunsun
  }
  function duyuruKapat() { duyuru.className = ''; }

  var genisPoz = new THREE.Vector3(), genisBak = new THREE.Vector3(), yakinPoz = new THREE.Vector3(), yakinBak = new THREE.Vector3();
  var kamPoz = new THREE.Vector3(0, 9, 16), kamBak = new THREE.Vector3(0, 1, -1), gecici = new THREE.Vector3(), gecici2 = new THREE.Vector3();
  var genisFov = 56;

  function genisHesapla(t) {
    var vfov = genisFov * Math.PI / 180;
    var hfov = 2 * Math.atan(Math.tan(vfov / 2) * kamera.aspect);
    var yaricap = hatR + 2.4;
    var mesafe = Math.max(9, yaricap / Math.tan(hfov / 2) * 0.62);
    var aci = Math.sin(t * 0.045) * 0.42;
    var yuk = mesafe * 0.3 + Math.sin(t * 0.13) * 0.3;
    genisPoz.set(MERKEZ.x + Math.sin(aci) * mesafe, yuk, MERKEZ.z + Math.cos(aci) * mesafe);
    genisBak.set(MERKEZ.x, 1.0 + mesafe * 0.02, MERKEZ.z - 1.5);
  }
  // kamera atesin icine girmesin
  function atestenUzak(v, enAz) {
    var r = Math.sqrt(v.x * v.x + v.z * v.z);
    if (r < enAz) { if (r < 0.001) { v.x = enAz; } else { v.x *= enAz / r; v.z *= enAz / r; } }
    return v;
  }

  function yakinHesapla(o, t, ilerl) {
    var d = o.dansci;
    if (o.tur === 'uluma') {
      var a1 = d.kok.position, a2 = (o.ikinci || d).kok.position;
      gecici2.copy(a1).add(a2).multiplyScalar(0.5);
      // kamera alfanin aya gore arkasinda, alcakta: ay alfanin ardinda kadrajda kalir.
      // atesin icine dusecekse atesin obur yanina gecer (alevler on planda kalir)
      var geri = gecici.set(-AY_YON.x, 0, -AY_YON.z).normalize();
      var don = (t - o.bas) * 0.05 - 0.12;
      var gx = geri.x * Math.cos(don) - geri.z * Math.sin(don), gz = geri.x * Math.sin(don) + geri.z * Math.cos(don);
      var uz = [6.2, 7.6, 9.0, 10.4], sec2 = 6.2;
      for (var u = 0; u < uz.length; u++) {
        var px = gecici2.x + gx * uz[u], pz = gecici2.z + gz * uz[u];
        if (Math.sqrt(px * px + pz * pz) >= 2.4) { sec2 = uz[u]; break; }
      }
      yakinPoz.set(gecici2.x + gx * sec2, sec2 > 7 ? 1.5 : 1.2, gecici2.z + gz * sec2);
      yakinBak.set(gecici2.x - gx * 1.2, 3.0, gecici2.z - gz * 1.2);
      return sec2 > 7 ? 44 : 48;
    }
    if (o.tur === 'para') {
      var q1 = d.kok.position, q2 = (o.ikinci || d).kok.position;
      gecici2.copy(q1).add(q2).multiplyScalar(0.5);
      var yn = gecici.set(MERKEZ.x - gecici2.x, 0, MERKEZ.z - gecici2.z).normalize();   // ates tarafindan bak
      var dp = (t - o.bas) * 0.12 + o.aci0 * 0.5, yx = -yn.z, yz = yn.x;
      var px2 = yn.x * Math.cos(dp) + yx * Math.sin(dp), pz2 = yn.z * Math.cos(dp) + yz * Math.sin(dp);
      var uzp = Math.min(o.ikinci ? 4.6 : 3.9, Math.max(2.7, hatR * 0.95));
      yakinPoz.set(gecici2.x + px2 * uzp, 0.95, gecici2.z + pz2 * uzp);
      atestenUzak(yakinPoz, 2.0);
      yakinBak.set(gecici2.x, 1.75, gecici2.z);
      return Math.min(76, Math.max(48, 2 * Math.atan(2.1 / uzp) * 180 / Math.PI));
    }
    if (o.tur === 'cift') {
      var b1 = d.kok.position, b2 = (o.ikinci || d).kok.position;
      gecici2.copy(b1).add(b2).multiplyScalar(0.5);
      var dn = (t - o.bas) * 0.3 + o.aci0 + Math.atan2(gecici2.x, gecici2.z) + Math.PI;
      yakinPoz.set(gecici2.x + Math.sin(dn) * 4.4, 1.25, gecici2.z + Math.cos(dn) * 4.4);
      atestenUzak(yakinPoz, 2.1);
      yakinBak.set(gecici2.x, 1.3, gecici2.z);
      return 44;
    }
    var p = d.kok.position;
    // dansci atese bakar; kamera onun onunde (ates tarafinda)
    var yon = d.oyuncu ? gecici.set(p.x - MERKEZ.x, 0, p.z - MERKEZ.z).normalize() : gecici.set(MERKEZ.x - p.x, 0, MERKEZ.z - p.z).normalize();
    var yanX = -yon.z, yanZ = yon.x;
    // 3/4 acidan bak: kamera atesten uzak kalir, komsu kurtlar kadraji kapatmaz
    // kamera halkanin icinde kalsin (karsidaki kurtlarin icine girmesin); yaklasinca aci genisler, ayaklar kadrajda kalir
    var uzak = Math.min(o.tur === 'tac' ? 4.7 - ilerl * 0.6 : 3.9, Math.max(2.5, hatR * (d.oyuncu ? 1.3 : 0.92)));
    var donus = o.tur === 'tac' ? (ilerl - 0.5) * 1.6 : (o.aci0 >= 0 ? 0.6 : -0.6);
    var cx = yon.x * Math.cos(donus) + yanX * Math.sin(donus), cz = yon.z * Math.cos(donus) + yanZ * Math.sin(donus);
    var yatay = uzak;
    var olc = d.rol === 'damat' ? 1.2 : (d.rol ? 1.1 : 1);
    // kamera diz-kalca hizasinda, govdenin ortasina bakar: ayaklar ve dans kadrajda
    yakinPoz.set(p.x + cx * yatay, 1.05 * olc + Math.sin(t * 1.3) * 0.04, p.z + cz * yatay);
    atestenUzak(yakinPoz, 2.0);
    yakinBak.set(p.x, 1.55 * olc, p.z);   // kurt ust kartlarin altinda kalsin
    return Math.min(72, Math.max(46, 2 * Math.atan(1.85 * olc / uzak) * 180 / Math.PI));
  }

  var etiketAcik = true;
  function etiketlerGorunur(acik) {
    if (acik === etiketAcik) return;
    etiketAcik = acik;
    for (var i = 0; i < hat.length; i++) { hat[i].etiket.visible = acik; if (hat[i].balon && !acik) hat[i].balon.visible = false; }
  }

  function ulumaOlayi() {
    var alfa = rolSahibi('damat'), leydi = rolSahibi('gelin');
    var lider = alfa || leydi || hat[0];
    if (!lider) return;
    var o = { tur: 'uluma', dansci: lider, ikinci: (alfa && leydi) ? leydi : null, sure: 5.2 };
    if (alfa || leydi) {
      o.ust = '🌕 ' + (alfa && leydi ? 'ALFALAR ULUYOR!' : (alfa ? 'ALFA KURT ULUYOR!' : 'LEYDİ ALFA ULUYOR!'));
      o.ad = alfa && leydi ? (alfa.isim + ' & ' + leydi.isim) : lider.isim;
      o.alt = 'Sürü cevap veriyor… AUUUUU! 🐺';
    } else {
      o.ust = '🌕 SÜRÜ AYA ULUYOR!';
      o.ad = 'Alfa koltuğu boş!';
      o.alt = '☕ Çay at, Alfa Kurt sen ol 👑';
    }
    o.basla = function () {
      ulumaLider = lider; ulumaIkinci = o.ikinci;
      ayParlak = 1;
      ulumaSesi(!!alfa, !!leydi, Math.min(6, 2 + Math.floor(hat.length / 4)));
      balonGoster(lider, 'AUUUUUU! 🌕', 4);
      if (o.ikinci) setTimeout(function () { balonGoster(o.ikinci, 'AUUUUU! 🌙', 3.5); }, 700);
      cosku = Math.min(1, cosku + 0.08);
    };
    olayEkle(o);
    sonUluma = simdi();
  }

  function kameraGuncelle(t, dt) {
    genisHesapla(t);
    if (!aktifOlay && olaylar.length) {
      aktifOlay = olaylar.shift();
      aktifOlay.bas = t;
      var kalan = olaylar.length;
      if (aktifOlay.tur === 'katil') aktifOlay.sure = Math.max(1.3, 3.0 - kalan * 0.35);
      aktifOlay.aci0 = rnd(-0.6, 0.6);
      if (aktifOlay.basla) aktifOlay.basla();
      if (aktifOlay.tur !== 'cift' && aktifOlay.tur !== 'gez') duyuruAc(aktifOlay);
    }
    var alfa = rolSahibi('damat'), leydi = rolSahibi('gelin');
    if (!aktifOlay && !olaylar.length) {
      var aralik = (alfa || leydi) ? 40 : 75;
      if (t - sonUluma > aralik) ulumaOlayi();
      else if (t - sonCiftCekimi > 34 && alfa && leydi) {
        sonCiftCekimi = t;
        olayEkle({ tur: 'cift', dansci: alfa, ikinci: leydi, sure: 6 });
      }
      else if (t - sonGezinti > 12) {   // bosta: rastgele bir kurdu yakindan goster
        sonGezinti = t;
        var adaylar = hat.concat(oyunListe());
        var gerc = adaylar.filter(function (x) { return !x.npc; });
        var secilen = sec(gerc.length && Math.random() < 0.75 ? gerc : adaylar);
        if (secilen) olayEkle({ tur: 'gez', dansci: secilen, sure: 5 });
      }
    }
    var k = 0, fov = genisFov, ulumaHedef = 0;
    if (aktifOlay) {
      var o = aktifOlay, y = t - o.bas, gir = 0.9, cik = 1.1;
      if (!o.dansci || !o.dansci.kok.parent) { o.sure = 0; }
      if (o.tur === 'gez' && olaylar.length && y > gir) o.sure = Math.min(o.sure, y - gir);
      // sirada bekleyen varsa genis plana donmeden dogrudan siradakine kay
      if (y >= gir + o.sure && olaylar.length && (olaylar[0].tur === 'katil' || olaylar[0].tur === 'tac') && o.tur !== 'uluma' && o.dansci && o.dansci.kok.parent) {
        duyuruKapat();
        var sonraki = olaylar.shift();
        sonraki.bas = t - gir;
        if (sonraki.tur === 'katil') sonraki.sure = Math.max(1.4, 2.6 - olaylar.length * 0.25);
        sonraki.aci0 = rnd(-0.6, 0.6);
        if (sonraki.basla) sonraki.basla();
        aktifOlay = o = sonraki;
        y = gir;
        setTimeout(function () { if (aktifOlay === sonraki) duyuruAc(sonraki); }, 250);
      }
      if (y < gir) k = yumusak(y / gir);
      else if (y < gir + o.sure) k = 1;
      else if (y < gir + o.sure + cik) { k = 1 - yumusak((y - gir - o.sure) / cik); if (!o.kapandi) { o.kapandi = true; duyuruKapat(); } }
      else { if (!o.kapandi) duyuruKapat(); aktifOlay = null; }
      if (o.tur === 'uluma' && y > 0.2 && y < gir + o.sure - 0.3) ulumaHedef = 1;
      if (o.tur === 'para' && o.dansci && o.dansci.kok.parent) paraOlayKare(o, y, gir, dt);
      if (aktifOlay && o.dansci && o.dansci.kok.parent) {
        var yf = yakinHesapla(o, t, sinirla((y - gir) / Math.max(0.1, o.sure), 0, 1));
        fov = genisFov + (yf - genisFov) * k;
      } else k = 0;
    }
    ulumaW += (ulumaHedef - ulumaW) * Math.min(1, dt * (ulumaHedef ? 3 : 2));
    if (ulumaW < 0.01 && !ulumaHedef) { ulumaLider = null; ulumaIkinci = null; }
    etiketlerGorunur(k < 0.35);
    var hedefPoz = gecici.copy(genisPoz).lerp(yakinPoz, k);
    kamPoz.lerp(hedefPoz, Math.min(1, dt * 5));
    var hedefBak = gecici2.copy(genisBak).lerp(yakinBak, k);
    kamBak.lerp(hedefBak, Math.min(1, dt * 4.5));
    atestenUzak(kamPoz, 1.8);
    if (!isFinite(kamPoz.x + kamPoz.y + kamPoz.z)) kamPoz.copy(genisPoz);   // bir kez bozulursa kendini toparlasin
    if (!isFinite(kamBak.x + kamBak.y + kamBak.z)) kamBak.copy(genisBak);
    kamera.position.copy(kamPoz);
    kamera.lookAt(kamBak);
    if (Math.abs(kamera.fov - fov) > 0.01) { kamera.fov += (fov - kamera.fov) * Math.min(1, dt * 6); kamera.updateProjectionMatrix(); }
  }

  // ============================================================ ortadaki oyun: DONUT KAPMACA
  // Donut atan kurt halaya degil ortaya girer. Atesin cevresindeki halkada dev donutu kapan kacar,
  // digerleri kovalar. Elinde tutan saniyede 1 puan alir; yakalayan donutu kapar (+3), kaptiran sersemler.
  var oyuncular = {}, OYUN_IC = 1.95, OYUN_DIS = 3.35, OYUN_MAKS = 8;
  var dn = { sahip: null, x: 0, y: 1.6, z: 0, vx: 0, vy: 0, vz: 0, ucus: null, tutmaBas: 0, sonAtis: 0, serbest: false };
  var donutKok = (function () {
    var g = new THREE.Group();
    var hamur = new THREE.Mesh(simit(0.17, 0.085, 14, 30), mat('#c98a45', { roughness: 0.75 }));
    hamur.rotation.x = Math.PI / 2; g.add(hamur);
    var krema = new THREE.Mesh(simit(0.17, 0.082, 12, 30), mat('#ff5fa2', { roughness: 0.3, emissive: '#4a0024' }));
    krema.rotation.x = Math.PI / 2; krema.scale.set(1.03, 1.03, 0.62); krema.position.y = 0.035; g.add(krema);
    var renk = ['#ffffff', '#ffd54a', '#4fc3f7', '#81c784', '#ba68c8', '#ff8a65'];
    for (var i = 0; i < 34; i++) {
      var a = rnd(0, Math.PI * 2), r = 0.17 + rnd(-0.06, 0.06);
      var s = new THREE.Mesh(kutu(0.012, 0.012, 0.045), mat(sec(renk), { roughness: 0.5, emissive: '#222222' }));
      s.position.set(Math.cos(a) * r, 0.085, Math.sin(a) * r); s.rotation.y = rnd(0, Math.PI); g.add(s);
    }
    var isil = hale(0xff7ac0, 1.6, 0.55); isil.position.y = 0.05; g.add(isil);
    g.visible = false; scene.add(g);
    return g;
  })();
  var _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();

  function oyunListe() { return Object.keys(oyuncular).map(function (k) { return oyuncular[k]; }); }
  function aciFark(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

  // donutun tasindigi nokta: iki elin ortasinin biraz ustu
  function eldekiYer(o, v) {
    o.kok.updateMatrixWorld(true);
    o.p.kolL.dirsek.localToWorld(v.set(0, -0.36, 0));
    o.p.kolR.dirsek.localToWorld(_v2.set(0, -0.36, 0));
    return v.add(_v2).multiplyScalar(0.5).add(_v2.set(0, 0.16, 0));
  }

  function oyuncuHazirla(o, puan) {
    o.oyuncu = true; o.puan = puan || 0; o.sonHediye = o.sonHediye || Date.now();
    o.sersem = 0; o.turbo = 0; o.adimFaz = rnd(0, 6); o.hiz = 0; o.yon = 0; o.kacisYon = 1; o.hizCarpan = rnd(0.92, 1.08);
    var a = rnd(0, Math.PI * 2), r = rnd(OYUN_IC + 0.2, OYUN_DIS - 0.2);
    o.kok.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    o.yon = Math.atan2(-o.kok.position.x, -o.kok.position.z);
    etiketCiz(o);
  }

  function oyunaKat(m, metin, tasinan) {
    var id = String(m.kullanici || m.isim);
    var o = oyuncular[id];
    if (o) { if (m.avatar && !o.avatar) { o.avatar = m.avatar; avatarYukle(o); } return o; }
    var liste = oyunListe();
    if (liste.length >= OYUN_MAKS) {   // yer yoksa en uzun suredir donut atmayan cikar
      liste.sort(function (a, b) { return a.sonHediye - b.sonHediye; });
      oyundanCikar(liste[0], true);
    }
    o = dansciYap({ id: id, isim: m.isim || id, avatar: m.avatar || '', jeton: bagisJeton(id), gorunum: tasinan ? tasinan.gorunum : null });
    oyuncular[id] = o;
    oyuncuHazirla(o, 0);
    o.giris = simdi() + 0.05;
    o.selamBitis = simdi() + 1.6;
    olayEkle({
      tur: 'katil', dansci: o, ust: '🍩 DONUT KAPMACAYA ATLADI!', alt: metin,
      basla: function () { var p = o.kok.position; isikSutunu(p.x, p.z, 0xff8fc8); patlama(new THREE.Vector3(p.x, 1.4, p.z), 70, 0xffb3d9); }
    });
    kayitKirli = true;
    return o;
  }
  function oyundanCikar(o, efekt) {
    if (dn.sahip === o) donutAt(o, null);
    if (dn.ucus && dn.ucus.hedef === o) dn.ucus = null;
    if (efekt) patlama(o.kok.position.clone().setY(1.2), 40, 0xffb3d9);
    if (aktifOlay && aktifOlay.dansci === o) { aktifOlay = null; duyuruKapat(); }
    olaylar = olaylar.filter(function (x) { return x.dansci !== o; });
    dansciSil(o);
    delete oyuncular[o.id];
    kayitKirli = true;
  }

  // elden firlat: hedef yoksa halkada rastgele bir yere
  function donutAt(o, hedefAci) {
    eldekiYer(o, _v1);
    dn.sahip = null; dn.serbest = true; dn.sonAtis = simdi();
    dn.x = _v1.x; dn.y = _v1.y; dn.z = _v1.z;
    var a = hedefAci === null || hedefAci === undefined ? Math.atan2(dn.z, dn.x) + rnd(1.0, 2.2) * (Math.random() < 0.5 ? -1 : 1) : hedefAci;
    var r = rnd(OYUN_IC + 0.2, OYUN_DIS - 0.2), T = 0.95;
    var hx = Math.cos(a) * r, hz = Math.sin(a) * r;
    dn.vx = (hx - dn.x) / T; dn.vz = (hz - dn.z) / T; dn.vy = (0.14 - dn.y + 0.5 * 9.8 * T * T) / T;
  }
  // donut hediye atana ucar (ilk donutta atesin icinden firlar)
  function donutVer(o) {
    if (dn.sahip === o) return;
    var bas = dn.sahip ? eldekiYer(dn.sahip, new THREE.Vector3()) : new THREE.Vector3(dn.x, dn.y, dn.z);
    if (dn.sahip) { dn.sahip.sersem = 0.8; balonGoster(dn.sahip, '😮 Donutum!', 1.4); }
    dn.sahip = null; dn.serbest = false;
    dn.ucus = { hedef: o, bas: simdi(), sx: bas.x, sy: bas.y, sz: bas.z };
  }
  function donutKap(o, t, kapma) {
    var eski = dn.sahip;
    dn.sahip = o; dn.ucus = null; dn.serbest = false; dn.tutmaBas = t;
    if (kapma && eski) {
      eski.sersem = 1.3;
      o.puan += 3;
      balonGoster(eski, sec(['😵', 'Hey! 😤', 'Geri ver! 😭']), 1.3);
    }
    balonGoster(o, sec(['KAPTIM! 🍩', 'Benim artık! 😋', 'HOP! 🍩', 'Yakala beni! 🏃']), 1.6);
    eldekiYer(o, _v1);
    patlama(_v1.clone(), 40, 0xff9ad0);
    etiketCiz(o);
  }

  // halkada (atesin etrafinda) hedefe dogru yuru: aci + yaricap uzerinden, atesin icinden gecmez
  function halkadaYuru(o, hx, hz, hiz, dt) {
    var x = o.kok.position.x, z = o.kok.position.z;
    var r = Math.sqrt(x * x + z * z) || 0.01, a = Math.atan2(z, x);
    var hr = sinirla(Math.sqrt(hx * hx + hz * hz), OYUN_IC, OYUN_DIS), ha = Math.atan2(hz, hx);
    var yay = aciFark(ha - a) * r, dr = hr - r, top = Math.sqrt(yay * yay + dr * dr), adim = Math.min(top, hiz * dt);
    if (top > 1e-4) { a += (yay / top) * adim / r; r += (dr / top) * adim; }
    r = sinirla(r, OYUN_IC, OYUN_DIS);
    var nx = Math.cos(a) * r, nz = Math.sin(a) * r, ddt = Math.max(dt, 1e-4);
    var vx = (nx - x) / ddt, vz = (nz - z) / ddt, v = Math.sqrt(vx * vx + vz * vz);
    o.kok.position.set(nx, 0, nz);
    o.hiz += (v - o.hiz) * Math.min(1, dt * 8);
    if (v > 0.25) o.yon += aciFark(Math.atan2(vx, vz) - o.yon) * Math.min(1, dt * 10);
    o.kok.rotation.y = o.yon;
  }

  function oyunGuncelle(t, dt, e) {
    var L = oyunListe(), i, o;
    donutKok.visible = L.length > 0;
    if (!L.length) { dn.sahip = null; dn.ucus = null; return; }
    if (dn.sahip && !oyuncular[dn.sahip.id]) dn.sahip = null;
    if (!dn.sahip && !dn.ucus && !dn.serbest) donutVer(L[0]);

    // ---- hareket
    for (i = 0; i < L.length; i++) {
      o = L[i];
      o.sersem = Math.max(0, o.sersem - dt); o.turbo = Math.max(0, o.turbo - dt);
      var px = o.kok.position.x, pz = o.kok.position.z, hx = px, hz = pz, hiz = 0;
      if (o.sersem > 0) { hiz = 0; }
      else if (dn.sahip === o) {   // kac: en yakin kovalayanin tersine
        var yakin = null, yd = 1e9;
        for (var j = 0; j < L.length; j++) {
          var q = L[j]; if (q === o || q.sersem > 0) continue;
          var dd = Math.hypot(q.kok.position.x - px, q.kok.position.z - pz);
          if (dd < yd) { yd = dd; yakin = q; }
        }
        var a0 = Math.atan2(pz, px);
        if (yakin && yd < 3) o.kacisYon = aciFark(a0 - Math.atan2(yakin.kok.position.z, yakin.kok.position.x)) >= 0 ? 1 : -1;
        var ha = a0 + o.kacisYon * 1.0, hr = OYUN_IC + (OYUN_DIS - OYUN_IC) * (0.5 + 0.45 * Math.sin(t * 0.9 + o.faz));
        hx = Math.cos(ha) * hr; hz = Math.sin(ha) * hr;
        hiz = yakin ? 2.25 : 1.4;
      } else if (dn.sahip) {
        var sp = dn.sahip.kok.position;
        hx = sp.x; hz = sp.z; hiz = 2.55;
      } else if (dn.ucus) {
        var up = dn.ucus.hedef.kok.position;
        hx = up.x; hz = up.z; hiz = dn.ucus.hedef === o ? 0.6 : 1.6;
      } else { hx = dn.x; hz = dn.z; hiz = 2.7; }
      hiz *= (o.turbo > 0 ? 1.5 : 1) * (0.92 + 0.12 * e) * o.hizCarpan;
      halkadaYuru(o, hx, hz, hiz, dt);
    }
    // birbirinin icine girmesinler
    for (i = 0; i < L.length; i++) for (var k = i + 1; k < L.length; k++) {
      var A = L[i].kok.position, B = L[k].kok.position, dx = B.x - A.x, dz = B.z - A.z, d2 = Math.sqrt(dx * dx + dz * dz) || 0.01;
      if (d2 < 0.62) { var it = (0.62 - d2) * 0.5 / d2; A.x -= dx * it; A.z -= dz * it; B.x += dx * it; B.z += dz * it; }
    }

    // ---- donut
    if (dn.ucus) {
      var u = (t - dn.ucus.bas) / 0.85, hd = dn.ucus.hedef;
      eldekiYer(hd, _v1);
      if (u >= 1) donutKap(hd, t, false);
      else {
        var w = yumusak(u);
        dn.x = dn.ucus.sx + (_v1.x - dn.ucus.sx) * w;
        dn.y = dn.ucus.sy + (_v1.y - dn.ucus.sy) * w + Math.sin(Math.PI * u) * 1.8;
        dn.z = dn.ucus.sz + (_v1.z - dn.ucus.sz) * w;
        if (Math.random() < dt * 30) kivilcimAt(dn.x, dn.y, dn.z, rnd(-0.3, 0.3), rnd(0, 0.5), rnd(-0.3, 0.3), rnd(0.4, 0.8), sec([0xff9ad0, 0xffffff, 0xffd54a]), 1);
      }
    } else if (dn.serbest) {
      dn.vy -= 9.8 * dt;
      dn.x += dn.vx * dt; dn.y += dn.vy * dt; dn.z += dn.vz * dt;
      if (dn.y < 0.14) { dn.y = 0.14; dn.vy = Math.abs(dn.vy) > 1.2 ? -dn.vy * 0.4 : 0; dn.vx *= 0.75; dn.vz *= 0.75; }
      var r0 = Math.sqrt(dn.x * dn.x + dn.z * dn.z) || 0.01, r1 = sinirla(r0, OYUN_IC, OYUN_DIS);
      if (r1 !== r0) { dn.x *= r1 / r0; dn.z *= r1 / r0; dn.vx *= -0.3; dn.vz *= -0.3; }
      // en yakin kurt yerden kapar
      var aday = null, ad = 0.6;
      for (i = 0; i < L.length; i++) {
        if (L[i].sersem > 0 || dn.y > 1.0) continue;
        var dd2 = Math.hypot(L[i].kok.position.x - dn.x, L[i].kok.position.z - dn.z);
        if (dd2 < ad) { ad = dd2; aday = L[i]; }
      }
      if (aday) donutKap(aday, t, false);
    }
    if (dn.sahip) {
      var sh = dn.sahip;
      sh.puan += dt;
      if (Math.floor(sh.puan) !== sh.sonPuan) { sh.sonPuan = Math.floor(sh.puan); etiketCiz(sh); }
      // kovalayan yetisirse kapar
      if (t - dn.tutmaBas > 1.2) {
        for (i = 0; i < L.length; i++) {
          o = L[i]; if (o === sh || o.sersem > 0) continue;
          if (Math.hypot(o.kok.position.x - sh.kok.position.x, o.kok.position.z - sh.kok.position.z) < 0.66) { donutKap(o, t, true); break; }
        }
      }
      // oyun durmasin: cok uzun tutan donutu ortaya firlatir; tek kisiyse kendine atar, kosup yakalar
      if (dn.sahip === sh) {
        if (L.length > 1 && t - dn.tutmaBas > 14) { balonGoster(sh, sec(['Al bakalım! 🍩', 'Kim kaparsa! 😄']), 1.5); donutAt(sh, null); }
        else if (L.length === 1 && t - Math.max(dn.tutmaBas, dn.sonAtis) > 6) donutAt(sh, Math.atan2(sh.kok.position.z, sh.kok.position.x) + sh.kacisYon * 0.7);
      }
    }
    // pozlar
    for (i = 0; i < L.length; i++) oyuncuPoz(L[i], t, dt, e);
    if (dn.sahip) { eldekiYer(dn.sahip, _v1); dn.x = _v1.x; dn.y = _v1.y; dn.z = _v1.z; }
    donutKok.position.set(dn.x, dn.y, dn.z);
    donutKok.rotation.y += dt * (dn.serbest || dn.ucus ? 9 : 1.5);
    donutKok.rotation.z = dn.serbest && dn.y > 0.2 ? Math.sin(t * 12) * 0.6 : 0;
  }

  function oyuncuPoz(o, t, dt, e) {
    var h = sinirla(o.hiz / 2.6, 0, 1.2);
    o.adimFaz += dt * (2 + 10 * h);
    var f = o.adimFaz, s = Math.sin(f), P = P0();
    P.tR = -0.85 * s * h; P.tL = 0.85 * s * h;
    P.kR = 0.2 + 1.15 * Math.max(0, Math.sin(f + 1.3)) * h; P.kL = 0.2 + 1.15 * Math.max(0, Math.sin(f + 1.3 + Math.PI)) * h;
    P.y = -0.06 * h; P.zip = 0.1 * Math.abs(Math.cos(f)) * h;
    P.gx = 0.32 * h; P.bx = -0.2 * h;
    P.olx = 0.75 * s * h; P.orx = -0.75 * s * h; P.olz = 0.25; P.orz = -0.25; P.odl = P.odr = -0.2 - 1.1 * h;
    P.kuy = -0.1 + 0.3 * h; P.cene = 0.15 + 0.25 * h;
    if (dn.sahip === o) {   // donut bas ustunde, iki elle
      P.olz = 2.55; P.orz = -2.55; P.olx = P.orx = -0.25; P.odl = P.odr = -0.55; P.gx *= 0.5; P.cene = 0.45; P.kuy = 0.6;
    }
    if (o.sersem > 0) {   // basi donuyor
      var w = Math.min(1, o.sersem / 0.4), S = P0();
      S.gz = 0.35 * Math.sin(t * 7); S.bz = -0.4 * Math.sin(t * 7); S.olz = 1.1; S.orz = -1.1; S.y = -0.1; S.tR = -0.3; S.kR = 0.6; S.kuy = -0.7; S.cene = 0.35;
      P = karistir(P, S, w);
    }
    if (t < o.selamBitis) P = karistir(P, pozSelam(t), Math.min(1, (o.selamBitis - t) / 0.4));
    pozUygula(o.p, P, t, e, o.faz);
    kurtUstu(o, t);
  }

  // ============================================================ oyun durumu: hediye, rol, coşku
  // Kurallar: GUL -> halaya katil. DONUT -> ortada Donut Kapmaca. CAY -> Alfa Kurt / Leydi Alfa koltugu.
  // Yorum kimseyi halaya katmaz (sadece "alfa"/"leydi" tercihi). Halay basi: toplam jeton fiyati gecen.
  var tercih = {};     // kullanici -> 'damat' | 'gelin' (yorumdan; cay hangi koltuga gitsin)
  var bagis = {};      // kullanici -> { isim, jeton } tum hediyelerin toplami (liste ve halay basi icin)
  var cosku = 0.35;
  var kayitKirli = false;

  function rolSahibi(rol) {
    for (var k in kisiler) if (kisiler[k].rol === rol) return kisiler[k];
    return null;
  }
  function bagisJeton(id) { return bagis[id] ? bagis[id].jeton : 0; }
  function bagisEkle(m, jeton) {
    var id = String(m.kullanici || m.isim || '');
    if (!id) return 0;
    if (!bagis[id]) bagis[id] = { isim: m.isim || id, jeton: 0 };
    if (m.isim) bagis[id].isim = m.isim;
    bagis[id].jeton += jeton;
    return bagis[id].jeton;
  }

  // hediye adini kurala cevir (adlar kontrol panelinden degisir, virgulle)
  function adListe(s) { return String(s || '').split(',').map(function (x) { return x.trim().toLocaleLowerCase('tr'); }).filter(Boolean); }
  function hediyeTuru(ad) {
    var k = String(ad || '').trim().toLocaleLowerCase('tr');
    var turler = [['para', ayar.paraAd], ['cay', ayar.cayAd], ['donut', ayar.donutAd], ['gul', ayar.gulAd]];
    for (var i = 0; i < turler.length; i++) {
      var l = adListe(turler[i][1]);
      for (var j = 0; j < l.length; j++) {
        var w = l[j];
        if (k === w || (' ' + k + ' ').indexOf(' ' + w + ' ') >= 0) return turler[i][0];
      }
    }
    return null;
  }

  function halaydanCikar(d) {
    if (aktifOlay && aktifOlay.dansci === d) { aktifOlay = null; duyuruKapat(); }
    olaylar = olaylar.filter(function (x) { return x.dansci !== d; });
    delete kisiler[d.id];
    patlama(d.kok.position.clone().setY(1.2), 30, 0x9fd8ff);
    dansciSil(d);
    npcAyarla(); siraKur();
    kayitKirli = true;
  }

  function katil(m, hediyeMetni, tasinan) {
    var id = String(m.kullanici || m.isim || ('z' + Math.random()));
    var d = kisiler[id];
    if (d) {
      if (m.avatar && !d.avatar) { d.avatar = m.avatar; avatarYukle(d); }
      return d;
    }
    d = dansciYap({ id: id, isim: m.isim || id, avatar: m.avatar || '', jeton: bagisJeton(id), gorunum: tasinan ? tasinan.gorunum : null });
    kisiler[id] = d;
    npcAyarla();
    siraKur();
    d.giris = simdi() + 0.05;
    d.selamBitis = simdi() + 2.6;
    olayEkle({
      tur: 'katil', dansci: d, ust: 'HALAYA KATILDI! 🌹', alt: hediyeMetni,
      basla: function () { var p = d.kok.position; isikSutunu(p.x, p.z, 0x9fd8ff); patlama(new THREE.Vector3(p.x, 1.4, p.z), 70, 0xbfe4ff); konfetiAt(new THREE.Vector3(p.x, 4.5, p.z), 16, 1.6, 0); }
    });
    kayitKirli = true;
    return d;
  }

  // Halay basi: toplam jeton fiyati gecen; koltuk doluysa daha cok atan kapar
  function rolKontrol(d) {
    if (d.npc || d.rol) return;
    if (d.jeton < ayar.halaybasiFiyat) return;
    var eski = rolSahibi('halaybasi');
    if (eski && eski.jeton >= d.jeton) return;
    if (eski) { eski.rol = null; govdeKur(eski); etiketCiz(eski); }
    rolVer(d, 'halaybasi', eski);
  }
  function bosHalaybasiDoldur() {
    if (rolSahibi('halaybasi')) return;
    var aday = Object.keys(kisiler).map(function (k) { return kisiler[k]; })
      .filter(function (x) { return !x.rol && x.jeton >= ayar.halaybasiFiyat; })
      .sort(function (a, b) { return b.jeton - a.jeton; })[0];
    if (aday) rolVer(aday, 'halaybasi', null);
  }
  // Cay atan: yorumla secilen koltuk, yoksa bos olan, ikisi de doluysa en eski oturulan koltuk
  function cayKoltuk(d) {
    if (d.rol === 'damat' || d.rol === 'gelin') { balonGoster(d, 'Çay için sağ ol! ☕', 2.5); return; }
    var tr = tercih[d.id], rol;
    var dam = rolSahibi('damat'), gel = rolSahibi('gelin');
    if (tr === 'damat' || tr === 'gelin') rol = tr;
    else if (!dam) rol = 'damat';
    else if (!gel) rol = 'gelin';
    else rol = (dam.rolZaman || 0) <= (gel.rolZaman || 0) ? 'damat' : 'gelin';
    var eski = rolSahibi(rol), oncekiRol = d.rol;
    if (eski) { eski.rol = null; govdeKur(eski); etiketCiz(eski); }
    rolVer(d, rol, eski);
    if (eski) rolKontrol(eski);               // tahttan inen, halay basina yetiyorsa oraya gecer
    if (oncekiRol === 'halaybasi') bosHalaybasiDoldur();
  }

  function rolVer(d, rol, eski) {
    d.rol = rol;
    d.rolZaman = Date.now();
    govdeKur(d);
    etiketCiz(d);
    siraKur();
    tabelaGuncelle();
    var ust = rol === 'damat' ? '🐺 YENİ ALFA KURT!' : (rol === 'gelin' ? '🌙 YENİ LEYDİ ALFA!' : '🔥 YENİ HALAY BAŞI!');
    var alt = eski ? (eski.isim + ' koltuğu kaptırdı! 👑') : (rol === 'halaybasi' ? 'Mendil artık onda! 🧣' : 'Çayı içti, sürünün başına geçti! ☕');
    olayEkle({
      tur: 'tac', dansci: d, sure: 4.6, ust: ust, alt: alt,
      basla: function () {
        var p = d.kok.position;
        var renk = rol === 'gelin' ? [0xffffff, 0xcfe4ff, 0x9fd8ff] : (rol === 'halaybasi' ? [0xffd27a, 0xff7a2a, 0xff3d3d] : [0xfff2c8, 0xffd77a, 0xffb74d]);
        for (var i = 0; i < 4; i++) { var a = i / 4 * Math.PI * 2 + 0.785; fiskiyeAc(p.x + Math.cos(a) * 1.1, 0.05, p.z + Math.sin(a) * 1.1, 4.2, renk); }
        konfetiAt(new THREE.Vector3(p.x, 6, p.z), 200, 3.5, 0);
        if (rol !== 'halaybasi') { altinYagdir(p, 60); ayParlak = 1; ulumaSesi(rol === 'damat', rol === 'gelin', 3); balonGoster(d, 'AUUUUU! 👑', 3.5); }
        atesPatla = 1;
        cosku = Math.min(1, cosku + 0.25);
      }
    });
    kayitKirli = true;
  }

  function tabelaGuncelle() {
    var dam = rolSahibi('damat'), gel = rolSahibi('gelin');
    if (dam && gel) tabelaCiz(dam.isim + '  🐺❤🌙  ' + gel.isim, '✦ Alfa Kurt & Leydi Alfa ✦');
    else if (dam) tabelaCiz('🐺 ' + dam.isim, '✦ Leydi Alfa aranıyor! ☕ ✦');
    else if (gel) tabelaCiz('🌙 ' + gel.isim, '✦ Alfa Kurt aranıyor! ☕ ✦');
    else tabelaCiz('KURT HALAYI', '✦ 🌹 Gül at, halaya katıl ✦');
  }

  function hediyeIsle(m) {
    var adet = Number(m.adet || 1), jeton = Number(m.jeton || 1);
    var toplam = Math.max(1, jeton * adet);
    var id = String(m.kullanici || m.isim || '');
    var tur = hediyeTuru(m.hediye);
    var metin = '🎁 ' + (m.hediye || 'hediye') + (adet > 1 ? ' x' + adet : '') + ' gönderdi';
    var hepsi = bagisEkle(m, toplam);
    var d = kisiler[id], o = oyuncular[id], hedef = null;
    cosku = Math.min(1, cosku + 0.05 + Math.min(0.3, toplam * 0.004));

    if (tur === 'donut') {
      if (d && d.rol) { hedef = d; balonGoster(d, ROL_AD[d.rol] + ' halayı bırakmaz! 🍩', 2.5); }   // koltuk sahibi halayda kalir
      else {
        var tasinan = null;
        if (d) { tasinan = { gorunum: d.gorunum }; halaydanCikar(d); }
        var yeni = !o;
        o = oyunaKat(m, metin.replace('gönderdi', '→ ortaya!'), tasinan);
        o.sonHediye = Date.now();
        o.turbo = 4;
        if (!yeni) balonGoster(o, '🍩 Donut bende!', 1.6);
        donutVer(o);
        hedef = o;
      }
    } else if (tur === 'para') {
      if (!d && !o) d = katil(m, metin, null);   // para atan halayda yoksa halaya da girer
      hedef = d || o;
      paraSac(hedef, adet);
    } else if (tur === 'gul' || tur === 'cay') {
      var tas = null;
      if (o) { tas = { gorunum: o.gorunum }; oyundanCikar(o, true); }
      d = katil(m, metin, tas);
      hedef = d;
      if (tur === 'cay') cayKoltuk(d);
    } else {
      hedef = d || o || null;   // diger hediyeler: jeton sayilir, kimseyi bir yere tasimaz
    }

    if (hedef) {
      hedef.jeton = hepsi;
      etiketCiz(hedef);
      var p = hedef.kok.position;
      konfetiAt(new THREE.Vector3(p.x, 5, p.z), Math.min(90, 8 + Math.round(toplam / 2)), 2.2, 0);
      if (toplam >= 99) { altinYagdir(p, Math.min(60, 10 + toplam / 20)); atesPatla = Math.max(atesPatla, 0.7); }
      if (hepsi !== toplam && tur !== 'donut') balonGoster(hedef, metin.replace('gönderdi', '🎉'));
      if (kisiler[hedef.id] === hedef) rolKontrol(hedef);
    } else {
      atesPatla = Math.max(atesPatla, Math.min(1, 0.3 + toplam / 200));   // halayda/oyunda degilse ates harlanir
    }
    takiGuncelle();
    kayitKirli = true;
  }

  function seriIsle(m) {
    var ek = Number(m.jeton || 1) * Math.max(0, Number(m.adet || 1) - 1);
    if (ek <= 0) return;
    var hepsi = bagisEkle(m, ek);
    var id = String(m.kullanici), d = kisiler[id] || oyuncular[id];
    if (d) {
      d.jeton = hepsi;
      etiketCiz(d);
      balonGoster(d, (m.hediye || 'hediye') + ' x' + m.adet + ' 🔥');
      if (kisiler[id] === d) rolKontrol(d);
    }
    takiGuncelle();
    kayitKirli = true;
  }

  function yorumIsle(m) {
    var metin = String(m.metin || '');
    var id = String(m.kullanici || '');
    var kucuk = metin.toLocaleLowerCase('tr');
    if (/leydi|gelin/.test(kucuk)) tercih[id] = 'gelin';
    else if (/alfa|damat/.test(kucuk)) tercih[id] = 'damat';
    cosku = Math.min(1, cosku + 0.006);
    var d = kisiler[id] || oyuncular[id];
    if (d && metin.trim()) balonGoster(d, metin);
  }

  var begeniSay = {};   // kullanici -> halaya katilmak icin biriken begeni
  function begeniIsle(m) {
    var bid = String(m.kullanici || '');
    if (bid && !kisiler[bid] && !oyuncular[bid]) {
      begeniSay[bid] = (begeniSay[bid] || 0) + Math.max(1, Number(m.adet || 1));
      if (begeniSay[bid] >= ayar.begeniKatil) {
        var top = begeniSay[bid]; delete begeniSay[bid];
        katil(m, '❤️ ' + top + ' beğeni gönderdi!', null);
      }
      kayitKirli = true;
    }
    cosku = Math.min(1, cosku + Math.min(0.03, 0.004 * Number(m.adet || 1)));
    var id = String(m.kullanici || '');
    var d = kisiler[id] || oyuncular[id] || rolSahibi('gelin') || rolSahibi('damat') || hat[Math.floor(Math.random() * hat.length)];
    if (!d) return;
    var n = Math.min(4, Number(m.adet || 1));
    for (var i = 0; i < n; i++) kalpUcur(new THREE.Vector3(d.kok.position.x, 2.4, d.kok.position.z));
  }

  // ============================================================ arayuz
  var el = {
    calanAd: document.getElementById('calanAd'), sayac: document.getElementById('sayac'), cosku: document.getElementById('coskuBar'),
    taki: document.getElementById('taki'), kayan: document.getElementById('kayanMetin'),
    koltuk: { damat: document.getElementById('kDamat'), gelin: document.getElementById('kGelin'), halaybasi: document.getElementById('kBasi') },
    baglanti: document.getElementById('baglanti'), kilit: document.getElementById('kilit'), oyun: document.getElementById('oyunSayac')
  };
  function koltukCiz(rol) {
    var kutuEl = el.koltuk[rol];
    if (!kutuEl) return;
    var d = rolSahibi(rol);
    var resim = kutuEl.querySelector('img, .bos');
    var yeni;
    if (d && d.avatar) { yeni = document.createElement('img'); yeni.src = '/avatar?u=' + encodeURIComponent(d.avatar); }
    else { yeni = document.createElement('div'); yeni.className = 'bos'; yeni.textContent = ROL_EMOJI[rol]; }
    var anahtar = d ? (d.id + '|' + d.avatar) : 'bos';
    if (kutuEl.dataset.anahtar !== anahtar) { kutuEl.replaceChild(yeni, resim); kutuEl.dataset.anahtar = anahtar; }
    kutuEl.querySelector('.ad').textContent = d ? d.isim : 'Koltuk boş';
    var cayli = rol !== 'halaybasi';
    kutuEl.querySelector('.fiyat').textContent = cayli
      ? (d ? '☕ Çay atan koltuğu kapar' : '☕ Çay at → ' + ROL_AD[rol] + ' ol')
      : (d ? ('👑 ' + d.jeton + ' 🪙 · geçmek için ' + (d.jeton + 1) + '+') : (fiyat(rol) + ' 🪙 ile ' + ROL_AD[rol] + ' ol'));
    kutuEl.classList.toggle('dolu', !!d);
  }
  function takiGuncelle() {
    var liste = Object.keys(bagis).map(function (k) { return bagis[k]; }).filter(function (d) { return d.jeton > 0; });
    liste.sort(function (a, b) { return b.jeton - a.jeton; });
    var html = '';
    var madalya = ['🥇', '🥈', '🥉', '4', '5'];
    for (var i = 0; i < Math.min(5, liste.length); i++) {
      html += '<li><b>' + madalya[i] + '</b><span>' + kacis(liste[i].isim) + '</span><em>' + liste[i].jeton + ' 🪙</em></li>';
    }
    if (!liste.length) html = '<li class="bos">İlk hediyeyi sen at! 🐾</li>';
    el.taki.innerHTML = html;
    ROLLER.forEach(koltukCiz);
  }
  var ROLLER = ['damat', 'gelin', 'halaybasi'];
  function kacis(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var kayanMetinler = [];
  function kayanKur() {
    kayanMetinler = [
      '🌹 Gül at → kurt halayına katıl!',
      '🍩 Donut at → ortada DONUT KAPMACA oyna!',
      '☕ Çay at → ALFA KURT / LEYDİ ALFA ol!',
      '🔥 ' + ayar.halaybasiFiyat + ' 🪙 → HALAY BAŞI ol, mendili sen salla!',
      '💬 Yoruma "alfa" ya da "leydi" yaz, çayın o koltuğa gitsin',
      '🍩 Donutu tutan puan toplar, yakalayan kapar!',
      '❤️ ' + ayar.begeniKatil + ' beğeni → sen de halaya katıl!',
      '💸 ' + (String(ayar.paraAd).split(',')[0] || 'Para') + ' at → gelin damada para saç!',
      '❤️ Beğen, ateşi harlat!'
    ];
  }
  kayanKur();
  var kayanIdx = 0, sonKayan = 0, sonKilitBak = 0, sonOyunYaz = 0;

  function uiGuncelle(t) {
    el.cosku.style.width = Math.round(cosku * 100) + '%';
    var n = Object.keys(kisiler).length;
    el.sayac.textContent = '🐺 Halayda ' + n + ' kurt';
    if (el.oyun && t - sonOyunYaz > 0.5) {
      sonOyunYaz = t;
      var ol = oyunListe().sort(function (a, b) { return b.puan - a.puan; });
      el.oyun.textContent = ol.length ? ('🍩 Ortada ' + ol.length + ' kurt · 👑 ' + ol[0].isim + ' ' + Math.floor(ol[0].puan)) : '🍩 Donut at, ortada oyna!';
    }
    if (t - sonKayan > 4) {
      sonKayan = t; kayanIdx = (kayanIdx + 1) % kayanMetinler.length;
      el.kayan.style.opacity = 0; el.kayan.style.transform = 'translateY(-10px)';
      setTimeout(function () { el.kayan.textContent = kayanMetinler[kayanIdx]; el.kayan.style.opacity = 1; el.kayan.style.transform = 'none'; }, 350);
    }
    if (t - sonKilitBak > 2) {   // tarayici sesi engellediyse tikla butonu
      sonKilitBak = t;
      var sesLazim = sahneSesi() && ayar.ortamAcik;
      if (sesLazim && window.HalaySes && !HalaySes.calisiyor()) el.kilit.style.display = 'block';
    }
  }

  // ============================================================ muzik
  var muzikSes = new Audio();
  muzikSes.preload = 'auto';
  var muzik = { calan: null, bpm: 96, faz: 0, baslangic: 0, cikis: 'sahne', durum: 'dur' };
  var sesHedefZaman = null;
  muzikSes.addEventListener('loadedmetadata', function () { if (sesHedefZaman !== null) { try { muzikSes.currentTime = sesHedefZaman; } catch (e) { /* yoksay */ } sesHedefZaman = null; } });
  muzikSes.addEventListener('ended', function () { wsGonder({ tur: 'halayBitti', calan: muzik.calan }); });
  el.kilit.addEventListener('click', function () {
    if (window.HalaySes) HalaySes.devam().then(function () { ortamUygula(); }, function () { });
    var oy = muzik.durum === 'cal' && muzik.cikis === 'sahne' ? muzikSes.play() : null;
    if (oy && oy.then) oy.then(function () { el.kilit.style.display = 'none'; }, function () { });
    else el.kilit.style.display = 'none';
  });

  function muzikIsle(m) {
    var eskiCikis = muzik.cikis;
    muzik.calan = m.durum === 'cal' ? m.calan : null;
    muzik.bpm = Number(m.bpm) || 96;
    muzik.faz = Number(m.faz) || 0;
    muzik.baslangic = Number(m.baslangic) || Date.now();
    muzik.cikis = m.cikis || 'sahne';
    muzik.durum = m.durum;
    el.calanAd.textContent = muzik.calan ? muzik.calan : 'Müzik bekleniyor…';
    if (m.durum === 'cal' && muzik.cikis === 'sahne' && m.url) {
      var tam = new URL(m.url, location.href).href;
      var gecen = Math.max(0, (Date.now() - muzik.baslangic) / 1000);
      if (muzikSes.src !== tam) { muzikSes.src = tam; sesHedefZaman = gecen; }
      else if (Math.abs(muzikSes.currentTime - gecen) > 1.5) { try { muzikSes.currentTime = gecen; } catch (e) { /* yoksay */ } }
      muzikSes.volume = sinirla(Number(m.ses === undefined ? 1 : m.ses), 0, 1);
      var oy = muzikSes.play();
      if (oy && oy.catch) oy.catch(function () { el.kilit.style.display = 'block'; });
    } else {
      muzikSes.pause();
    }
    if (eskiCikis !== muzik.cikis) ortamUygula();
  }

  // Dansin vurus sayaci: tempo degisince ziplamadan yumusakca hizlanir/yavaslar, faz muzige kayar
  var vAkis = { t: null, b: 0, bpm: 92 };
  function vurusHesapla(t) {
    var hedef = vurusHedef(t), hBpm = muzik.durum === 'cal' ? muzik.bpm : 92;
    if (vAkis.t === null || !isFinite(vAkis.b)) { vAkis.t = t; vAkis.b = hedef; vAkis.bpm = hBpm; return hedef; }
    var dt = t - vAkis.t;
    if (!(dt > 0)) return vAkis.b;
    vAkis.t = t;
    dt = Math.min(dt, 2);
    vAkis.bpm += (hBpm - vAkis.bpm) * Math.min(1, dt * 0.8);
    vAkis.b += dt * vAkis.bpm / 60;
    var fark = hedef - vAkis.b; fark -= Math.round(fark);   // sadece vurus anini hizala
    vAkis.b += fark * Math.min(1, dt * 0.6);
    return vAkis.b;
  }
  function vurusHedef(t) {
    if (muzik.durum === 'cal') {
      var sn = (muzik.cikis === 'sahne' && !muzikSes.paused && muzikSes.currentTime > 0) ? muzikSes.currentTime : (Date.now() - muzik.baslangic) / 1000;
      return (sn - muzik.faz) * muzik.bpm / 60;
    }
    return t * 92 / 60;   // muzik yokken de halay doner
  }

  // ============================================================ baglanti
  var ws = null;
  function wsGonder(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
  function wsBaglan() {
    try { ws = new WebSocket('ws://' + location.host); } catch (e) { setTimeout(wsBaglan, 2000); return; }
    ws.onopen = function () { el.baglanti.style.display = 'none'; durumGonder(); };
    ws.onclose = function () { el.baglanti.style.display = 'block'; setTimeout(wsBaglan, 2000); };
    ws.onerror = function () { };
    ws.onmessage = function (ev) {
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      mesajIsle(m);
    };
  }
  function mesajIsle(m) {
    switch (m.tur) {
      case 'hediye': hediyeIsle(m); break;
      case 'hediyeSeri': seriIsle(m); break;
      case 'yorum': yorumIsle(m); break;
      case 'begeni': begeniIsle(m); break;
      case 'halayMuzik': muzikIsle(m); break;
      case 'halayVurus': muzik.bpm = Number(m.bpm) || muzik.bpm; if (m.faz !== undefined) muzik.faz = Number(m.faz); break;
      case 'halayAyar':
        if (m.damatFiyat) ayar.damatFiyat = Number(m.damatFiyat);
        if (m.gelinFiyat) ayar.gelinFiyat = Number(m.gelinFiyat);
        if (m.halaybasiFiyat) ayar.halaybasiFiyat = Number(m.halaybasiFiyat);
        if (typeof m.gulAd === 'string') ayar.gulAd = m.gulAd;
        if (typeof m.donutAd === 'string') ayar.donutAd = m.donutAd;
        if (typeof m.cayAd === 'string') ayar.cayAd = m.cayAd;
        if (typeof m.paraAd === 'string') ayar.paraAd = m.paraAd;
        if (m.begeniKatil) ayar.begeniKatil = Math.max(1, Number(m.begeniKatil));
        kayanKur(); takiGuncelle(); kayitKirli = true; break;
      case 'halayAmbiyans':
        if (m.acik !== undefined) ayar.ortamAcik = !!m.acik;
        if (m.ses !== undefined) ayar.ortamSes = sinirla(Number(m.ses), 0, 1);
        if (m.efekt !== undefined) ayar.efektSes = sinirla(Number(m.efekt), 0, 1);
        ortamUygula(); kayitKirli = true; break;
      case 'halayUluIste': if (!olaylar.some(function (o) { return o.tur === 'uluma'; })) ulumaOlayi(); break;
      case 'halayRolKaldir': {
        var d = rolSahibi(m.rol);
        if (d) { d.rol = null; govdeKur(d); etiketCiz(d); siraKur(); tabelaGuncelle(); takiGuncelle(); kayitKirli = true; }
        break;
      }
      case 'halaySifirla': sifirla(); break;
      case 'halayDurumIste': durumGonder(); break;
    }
  }
  function durumGonder() {
    var dam = rolSahibi('damat'), gel = rolSahibi('gelin'), hb = rolSahibi('halaybasi');
    wsGonder({ tur: 'halaySahne', kisi: Object.keys(kisiler).length, oyun: Object.keys(oyuncular).length, damat: dam ? dam.isim : '', gelin: gel ? gel.isim : '', halaybasi: hb ? hb.isim : '', ayar: ayar, calan: muzik.calan });
  }
  setInterval(durumGonder, 4000);

  function sifirla() {
    Object.keys(kisiler).forEach(function (k) { dansciSil(kisiler[k]); });
    kisiler = {}; tercih = {}; bagis = {};
    oyunListe().forEach(function (o) { dansciSil(o); }); oyuncular = {};
    dn.sahip = null; dn.ucus = null; dn.serbest = false; dn.x = 0; dn.y = 1.6; dn.z = 0;
    olaylar = []; aktifOlay = null; duyuruKapat();
    npcAyarla(); siraKur(); tabelaGuncelle(); takiGuncelle();
    kayitKirli = true;
  }

  // ============================================================ kayit (sayfa yenilenirse halay kaybolmasin)
  function kaydet() {
    if (!kayitKirli) return;
    kayitKirli = false;
    try {
      var liste = Object.keys(kisiler).map(function (k) {
        var d = kisiler[k];
        return { id: d.id, isim: d.isim, avatar: d.avatar, jeton: d.jeton, rol: d.rol, gorunum: d.gorunum, katilma: d.katilma };
      });
      var oy = oyunListe().map(function (o) { return { id: o.id, isim: o.isim, avatar: o.avatar, jeton: o.jeton, gorunum: o.gorunum, katilma: o.katilma, puan: o.puan }; });
      localStorage.setItem(KAYIT, JSON.stringify({ kisiler: liste, oyuncular: oy, bagis: bagis, ayar: ayar, tercih: tercih, begeniSay: begeniSay }));
    } catch (e) { /* depolama kapali */ }
  }
  function yukle() {
    try {
      var v = JSON.parse(localStorage.getItem(KAYIT) || 'null');
      if (!v) return;
      if (v.ayar) for (var k in ayar) if (v.ayar[k] !== undefined) ayar[k] = v.ayar[k];
      tercih = v.tercih || {};
      begeniSay = v.begeniSay || {};
      (v.kisiler || []).forEach(function (b) {
        var d = dansciYap(b);
        d.giris = simdi() - 5;
        kisiler[d.id] = d;
      });
      bagis = v.bagis || {};
      Object.keys(kisiler).forEach(function (k) { if (!bagis[k] && kisiler[k].jeton) bagis[k] = { isim: kisiler[k].isim, jeton: kisiler[k].jeton }; });
      (v.oyuncular || []).forEach(function (b) {
        var o = dansciYap(b);
        o.giris = simdi() - 5;
        oyuncular[o.id] = o;
        oyuncuHazirla(o, b.puan);
      });
    } catch (e) { /* bozuk kayit */ }
  }
  setInterval(kaydet, 3000);

  // ============================================================ ana dongu
  var oncekiT = simdi(), sonVurus = -1, oncekiC = 0, sonKare = 0;
  var donuk = false, donukSon = 0;   // test: sahneyi dondur (halay.dondur)
  function dongu() { requestAnimationFrame(dongu); if (!donuk) kare(); }
  // Pencere gizliyken tarayici requestAnimationFrame'i durdurur; yayin kaynagi donmasin diye yedek zamanlayici
  setInterval(function () { if (!donuk && performance.now() - sonKare > 150) kare(); }, 50);

  function hoppa() {
    atesPatla = 1;
    for (var i = 0; i < 110; i++) kivilcimAt(rnd(-0.5, 0.5), 1.0, rnd(-0.5, 0.5), rnd(-2.2, 2.2), rnd(3.5, 7.5), rnd(-2.2, 2.2), rnd(1.2, 2.4), sec([0xffd27a, 0xff9a3a, 0xffffff]), 2.5);
    if (hat[0] && !aktifOlay) balonGoster(hat[0], sec(['HOPPAA! 🔥', 'HAYDEE! 🐺', 'AUUU! HOPPA!', 'ŞIKIDIM! 🔥']), 1.8);
    cosku = Math.min(1, cosku + 0.01);
  }

  function finalVurusu() {
    atesPatla = Math.max(atesPatla, 0.6);
    for (var i = 0; i < 50; i++) kivilcimAt(rnd(-0.4, 0.4), 0.6, rnd(-0.4, 0.4), rnd(-1.6, 1.6), rnd(2, 4.5), rnd(-1.6, 1.6), rnd(0.8, 1.6), sec([0xffd27a, 0xff9a3a]), 2.5);
    if (hat[0] && !aktifOlay && Math.random() < 0.5) balonGoster(hat[0], sec(['YALLA! 🔥', 'DABKEEE! 🐺', 'HEY! 👣']), 1.4);
  }

  function kare() {
    sonKare = performance.now();
    var t = simdi(), dt = Math.min(0.05, t - oncekiT);
    oncekiT = t;
    var b = vurusHesapla(t);
    cosku = Math.max(0.25, cosku - dt * 0.012);
    var e = muzik.durum === 'cal' ? cosku : cosku * 0.7;
    atesGuc = 0.75 + 0.5 * cosku;

    var c = mod(b, 32);
    if (oncekiC < 29.4 && c >= 29.4 && c < 29.9) hoppa();          // ziplama inisi
    if (oncekiC < 31 && c >= 31 && c < 31.5) finalVurusu();        // final taban vurusu
    oncekiC = c;

    hatGuncelle(b, dt);
    for (var i = 0; i < hat.length; i++) danset(hat[i], b, t, e);
    mendilGuncelle(dt, t);
    oyunGuncelle(t, dt, e);
    muzisyenOyna(b, t, e);
    for (var g = 0; g < guncellenecek.length; g++) guncellenecek[g](t, b, e, dt);
    atesGuncelle(t, dt, b, e);
    if (bloom) bloom.strength = (0.8 + 0.15 * e + 0.25 * atesPatla + 0.2 * ayParlak) * (GUNDUZ ? 0.32 : 1);

    if (Math.floor(b) !== sonVurus) {
      sonVurus = Math.floor(b);
      if (e > 0.75 && Math.random() < (e - 0.65)) konfetiAt(new THREE.Vector3(MERKEZ.x + rnd(-5, 5), 9, MERKEZ.z + rnd(-5, 5)), 10, 2, 0);
    }

    // alfa uzerinde ay huzmesi ve gumus parilti
    var lider = rolSahibi('damat') || rolSahibi('gelin');
    if (lider) {
      alfaIsigi.intensity += (2.6 - alfaIsigi.intensity) * Math.min(1, dt * 2);
      alfaIsigi.position.set(lider.kok.position.x + AY_YON.x * 8, 13, lider.kok.position.z + AY_YON.z * 8);
      alfaIsigi.target.position.copy(lider.kok.position);
      if (Math.random() < dt * 22) { var lp = lider.kok.position; kivilcimAt(lp.x + rnd(-0.6, 0.6), rnd(0.3, 2.6), lp.z + rnd(-0.6, 0.6), 0, rnd(0.1, 0.4), 0, rnd(0.8, 1.5), 0xdfe8ff, -0.15); }
    } else alfaIsigi.intensity *= 0.95;

    konfetiGuncelle(dt, t);
    kivilcimGuncelle(dt, t);
    sutunGuncelle(t);
    kalpGuncelle(dt);
    altinGuncelle(dt);
    paraGuncelle(t, dt);
    kameraGuncelle(t, dt);
    if (testKamera) testKamera();   // yalniz test: halay.yakin(...)
    uiGuncelle(t);
    if (window.HalaySes && Math.random() < dt) HalaySes.ates(0.6 + atesGuc * 0.5 + atesPatla);

    if (composer) composer.render(); else renderer.render(scene, kamera);
  }

  // ============================================================ basla
  yukle();
  npcAyarla();
  siraKur();
  tabelaGuncelle();
  takiGuncelle();
  boyutla();
  wsBaglan();
  ortamUygula();
  dongu();

  // Test: tarayici konsolundan ya da ?demo=1 ile
  var testKamera = null;
  window.halay = {
    // test: bir kurda yakindan bak (hedef: kok nesnesi, uzaklik, yukseklik, aci). Bos cagri normale dondurur.
    yakin: function (hedef, uz, yuk, aci) {
      if (!hedef) { testKamera = null; return; }
      testKamera = function () {
        var p = new THREE.Vector3(); hedef.getWorldPosition(p);
        var a = hedef.rotation.y + (aci || 0);
        kamera.position.set(p.x + Math.sin(a) * uz, p.y + yuk, p.z + Math.cos(a) * uz);
        kamera.lookAt(p.x, p.y + yuk * 0.9, p.z); kamera.fov = 40; kamera.updateProjectionMatrix();
      };
    },
    sahneKurtlar: function () { var r = []; scene.traverse(function (o) { if (o.geometry && o.geometry === modelOnb.kafa) r.push(o.parent.parent.parent.parent); }); return r; },
    mesaj: mesajIsle, sifirla: sifirla, kamera: kamera, uluma: ulumaOlayi,
    olay: function () { return aktifOlay ? aktifOlay.tur + ':' + aktifOlay.dansci.isim + ' t=' + (simdi() - aktifOlay.bas).toFixed(2) : null; },
    kuyruk: function () { return olaylar.length; },
    kisi: function (id) { return kisiler[id]; },
    oyuncu: function (id) { return oyuncular[id]; },
    lider: function () { return hat[0]; },
    donut: function () { return dn.sahip ? dn.sahip.isim : (dn.ucus ? 'ucuyor' : (dn.serbest ? 'yerde' : 'yok')); },
    vurus: function () { return vurusHesapla(simdi()); },
    // gizli sekmede zamanlayici yavaslar; testte sahneyi 1/30 sn adimlarla ileri sar
    ileri: function (sn) {
      if (donuk) zamanKaydir -= performance.now() / 1000 - donukSon;   // donukken gecen gercek zaman sayilmasin
      for (var i = 0; i < Math.round(sn * 30); i++) { zamanKaydir += 1 / 30; kare(); }
      donukSon = performance.now() / 1000;
    },
    dondur: function (d) {
      if (donuk && !d) zamanKaydir -= performance.now() / 1000 - donukSon;
      donuk = !!d; donukSon = performance.now() / 1000;
    }
  };
  if (Q.get('demo') === '1') {
    var adlar = ['Ayşe', 'Mehmet', 'Zeynep', 'Emre', 'Elif', 'Burak', 'Selin', 'Can', 'Derya', 'Kaan'];
    adlar.forEach(function (a, i) {   // cogu gul (halay), bazilari donut (ortadaki oyun)
      var donut = i % 3 === 2;
      setTimeout(function () { mesajIsle({ tur: 'hediye', kullanici: 'demo' + i, isim: a, hediye: donut ? 'Doughnut' : 'Rose', adet: 1, jeton: donut ? 30 : 1 }); }, 1500 + i * 2600);
    });
    setTimeout(function () { mesajIsle({ tur: 'hediye', kullanici: 'demo3', isim: 'Emre', hediye: 'Kaykay', adet: 1, jeton: 300 }); }, 28000);
    setTimeout(function () { mesajIsle({ tur: 'hediye', kullanici: 'demo1', isim: 'Mehmet', hediye: 'Çay', adet: 1, jeton: 50 }); }, 34000);
    setTimeout(function () { mesajIsle({ tur: 'yorum', kullanici: 'demo4', isim: 'Elif', metin: 'ben leydi alfa olmak istiyorum' }); }, 38000);
    setTimeout(function () { mesajIsle({ tur: 'hediye', kullanici: 'demo4', isim: 'Elif', hediye: 'Tea', adet: 1, jeton: 50 }); }, 40000);
  }
})();
