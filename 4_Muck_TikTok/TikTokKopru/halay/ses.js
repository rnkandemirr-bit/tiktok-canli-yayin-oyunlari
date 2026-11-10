/* Kurt halayi ses motoru: kurt ulumasi (sentez), orman ortam sesi (cirtlak, ates citirtisi, baykus, ruzgar), davul vurusu.
   Hem sahne hem kontrol sayfasi kullanir. Dosya yok; her sey WebAudio ile uretilir. */
window.HalaySes = (function () {
  'use strict';
  var AC = null, ana = null, yanki = null, gurultu = null;
  var ortamKazanc = null, ortamAcik = false, ortamZaman = null, ruzgar = null;
  var efektSes = 0.8, atesGucu = 1;

  function rnd(a, b) { return a + Math.random() * (b - a); }

  function hazirla() {
    if (AC) return AC;
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    AC = new C();
    ana = AC.createGain(); ana.gain.value = efektSes; ana.connect(AC.destination);
    // orman yankisi: sonen gurultuden yapay oda tepkisi
    yanki = AC.createConvolver();
    var uzun = Math.floor(AC.sampleRate * 3.4), ir = AC.createBuffer(2, uzun, AC.sampleRate);
    for (var k = 0; k < 2; k++) {
      var v = ir.getChannelData(k);
      for (var i = 0; i < uzun; i++) v[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / uzun, 2.6);
    }
    yanki.buffer = ir;
    var yg = AC.createGain(); yg.gain.value = 0.5; yanki.connect(yg); yg.connect(ana);
    var gl = AC.sampleRate * 2;
    gurultu = AC.createBuffer(1, gl, AC.sampleRate);
    var g = gurultu.getChannelData(0);
    for (var j = 0; j < gl; j++) g[j] = Math.random() * 2 - 1;
    ortamKazanc = AC.createGain(); ortamKazanc.gain.value = 0.9; ortamKazanc.connect(ana);
    return AC;
  }
  function devam() {
    hazirla();
    if (AC && AC.state === 'suspended') return AC.resume();
    return Promise.resolve();
  }
  function calisiyor() { return !!AC && AC.state === 'running'; }
  function seviye(v) { efektSes = v; if (ana) ana.gain.setTargetAtTime(v, AC.currentTime, 0.1); }

  // Tek kurt ulumasi: yukselen, titreyen, sonra inen bir ses
  function uluma(gecikme, taban, tepe, sure, guc) {
    var t0 = AC.currentTime + gecikme;
    var g = AC.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(guc, t0 + 0.4);
    g.gain.setValueAtTime(guc, t0 + sure * 0.72);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + sure);
    var lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3;
    lp.frequency.setValueAtTime(tepe * 1.6, t0);
    lp.frequency.linearRampToValueAtTime(tepe * 3.2, t0 + sure * 0.35);
    lp.frequency.linearRampToValueAtTime(tepe * 1.5, t0 + sure);
    var tepeF = AC.createBiquadFilter(); tepeF.type = 'peaking'; tepeF.frequency.value = 1150; tepeF.gain.value = 5; tepeF.Q.value = 1.2;
    lp.connect(tepeF); tepeF.connect(g); g.connect(ana); g.connect(yanki);
    var ses = [['triangle', 1, 1], ['sawtooth', 0.22, 1.003], ['sine', 0.5, 2.001]];
    var titrek = AC.createOscillator(); titrek.frequency.value = rnd(4.6, 5.8);
    var titrekG = AC.createGain(); titrekG.gain.setValueAtTime(0, t0); titrekG.gain.linearRampToValueAtTime(tepe * 0.022, t0 + sure * 0.4);
    titrek.connect(titrekG);
    ses.forEach(function (s) {
      var o = AC.createOscillator(); o.type = s[0];
      var f = o.frequency, c = s[2];
      f.setValueAtTime(taban * c, t0);
      f.exponentialRampToValueAtTime(tepe * c, t0 + sure * 0.3);
      f.setValueAtTime(tepe * c, t0 + sure * 0.6);
      f.exponentialRampToValueAtTime(taban * 0.82 * c, t0 + sure);
      titrekG.connect(f);
      var og = AC.createGain(); og.gain.value = s[1];
      o.connect(og); og.connect(lp);
      o.start(t0); o.stop(t0 + sure + 0.1);
    });
    titrek.start(t0); titrek.stop(t0 + sure + 0.1);
    // nefes: hafif gurultu
    var n = AC.createBufferSource(); n.buffer = gurultu;
    var nb = AC.createBiquadFilter(); nb.type = 'bandpass'; nb.frequency.value = tepe * 2; nb.Q.value = 2;
    var ng = AC.createGain(); ng.gain.setValueAtTime(0.0001, t0); ng.gain.exponentialRampToValueAtTime(guc * 0.25, t0 + 0.3); ng.gain.exponentialRampToValueAtTime(0.0001, t0 + sure);
    n.connect(nb); nb.connect(ng); ng.connect(ana);
    n.start(t0); n.stop(t0 + sure + 0.1);
  }

  // Alfa (kalin), Leydi (ince) ve surudeki diger kurtlar
  function koro(alfa, leydi, suru) {
    if (!hazirla()) return;
    devam();
    if (alfa) uluma(0, 290, 545, 3.8, 0.24);
    if (leydi) uluma(alfa ? 0.75 : 0, 390, 760, 3.5, 0.2);
    if (!alfa && !leydi) uluma(0, 330, 640, 3.4, 0.2);
    for (var i = 0; i < (suru || 0); i++) uluma(1.3 + rnd(0, 1.4), rnd(320, 460), rnd(580, 840), rnd(2.4, 3.2), 0.06);
  }

  function davul(guc) {
    if (!hazirla()) return;
    var t0 = AC.currentTime;
    var o = AC.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(95, t0); o.frequency.exponentialRampToValueAtTime(42, t0 + 0.35);
    var g = AC.createGain(); g.gain.setValueAtTime(guc || 0.5, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
    o.connect(g); g.connect(ana); g.connect(yanki);
    o.start(t0); o.stop(t0 + 0.55);
  }

  // ---- orman ortam sesi
  function citirti(t) {
    var n = AC.createBufferSource(); n.buffer = gurultu;
    var bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = rnd(1400, 4800); bp.Q.value = rnd(0.8, 2.5);
    var g = AC.createGain(), d = rnd(0.012, 0.06), a = rnd(0.02, 0.09) * atesGucu;
    g.gain.setValueAtTime(a, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    n.connect(bp); bp.connect(g); g.connect(ortamKazanc);
    n.start(t, rnd(0, 1.5), d + 0.02);
  }
  function cirtlak(t, perde) {
    var o = AC.createOscillator(); o.type = 'sine'; o.frequency.value = perde;
    var g = AC.createGain(); g.gain.setValueAtTime(0, t);
    for (var i = 0; i < 3; i++) {
      var b = t + i * 0.055;
      g.gain.setValueAtTime(0, b); g.gain.linearRampToValueAtTime(0.018, b + 0.006); g.gain.linearRampToValueAtTime(0, b + 0.035);
    }
    o.connect(g); g.connect(ortamKazanc);
    o.start(t); o.stop(t + 0.2);
  }
  function baykus(t) {
    [0, 0.42, 0.62].forEach(function (k, i) {
      var o = AC.createOscillator(); o.type = 'sine';
      var b = t + k, f = i === 0 ? 380 : 345;
      o.frequency.setValueAtTime(f, b); o.frequency.linearRampToValueAtTime(f * 0.94, b + 0.3);
      var g = AC.createGain(); g.gain.setValueAtTime(0.0001, b); g.gain.exponentialRampToValueAtTime(0.05, b + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, b + (i === 0 ? 0.35 : 0.5));
      o.connect(g); g.connect(ortamKazanc); g.connect(yanki);
      o.start(b); o.stop(b + 0.6);
    });
  }
  var sonrakiCirtlak = 0, sonrakiCirtlak2 = 0, sonrakiBaykus = 0;
  function ortamPlanla() {
    if (!AC || !ortamAcik) return;
    var simdi = AC.currentTime, ufuk = simdi + 0.25;
    var adet = Math.round(rnd(0.5, 1.6) * atesGucu * 1.4);   // ates citirtisi
    for (var i = 0; i < adet; i++) citirti(simdi + rnd(0.02, 0.24));
    if (sonrakiCirtlak < simdi) sonrakiCirtlak = simdi + rnd(0.1, 0.3);
    while (sonrakiCirtlak < ufuk) { cirtlak(sonrakiCirtlak, 4650); sonrakiCirtlak += rnd(0.75, 1.0); }
    if (sonrakiCirtlak2 < simdi) sonrakiCirtlak2 = simdi + rnd(0.3, 0.6);
    while (sonrakiCirtlak2 < ufuk) { cirtlak(sonrakiCirtlak2, 5200); sonrakiCirtlak2 += rnd(1.1, 1.5); }
    if (!sonrakiBaykus) sonrakiBaykus = simdi + rnd(15, 30);
    if (sonrakiBaykus < ufuk) { baykus(sonrakiBaykus); sonrakiBaykus += rnd(40, 80); }
  }
  function ortam(acik, ses) {
    if (!hazirla()) return;
    if (typeof ses === 'number') ortamKazanc.gain.setTargetAtTime(ses, AC.currentTime, 0.2);
    if (acik === ortamAcik) return;
    ortamAcik = acik;
    if (acik) {
      devam();
      ortamZaman = setInterval(ortamPlanla, 200);
      ruzgar = AC.createBufferSource(); ruzgar.buffer = gurultu; ruzgar.loop = true;
      var lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
      var rg = AC.createGain(); rg.gain.value = 0.035;
      var lfo = AC.createOscillator(); lfo.frequency.value = 0.08;
      var lg = AC.createGain(); lg.gain.value = 0.025; lfo.connect(lg); lg.connect(rg.gain);
      ruzgar.connect(lp); lp.connect(rg); rg.connect(ortamKazanc);
      ruzgar.start(); lfo.start();
      ruzgar._lfo = lfo;
    } else {
      clearInterval(ortamZaman); ortamZaman = null;
      if (ruzgar) { try { ruzgar.stop(); ruzgar._lfo.stop(); } catch (e) { /* zaten durdu */ } ruzgar = null; }
    }
  }
  function ates(g) { atesGucu = g; }

  return { hazirla: hazirla, devam: devam, calisiyor: calisiyor, seviye: seviye, koro: koro, davul: davul, ortam: ortam, ates: ates };
})();
