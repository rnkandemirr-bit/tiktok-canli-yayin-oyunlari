// Muck TikTok modu (BepInEx 5).
// TikTokKopru'nun TCP cikisina (varsayilan 127.0.0.1:21214) baglanir; yorum, begeni ve hediyeleri
// oyunda yaratik/boss/yardim olarak uygular. Sadece oyunu kuran (host) oyuncuda calisir.
// Oyun acilinca kopru calismiyorsa kendisi baslatir, oyun kapaninca kapatir.
//
// Hediye eslesmesi (jeton):
//   yorum / begeni -> lil Dave / Goblin      1-4   Gul         -> Wolf / Fire Dave
//   5-9  Parmak kalp -> Wyvern               10-29 Yardim      -> inek yagmuru
//   30-99 Donut      -> Big Chunk / Gronk    100-499 Orta      -> Guardian / Chief
//   500+ Buyuk hediye -> BOB
//
// Test tuslari: F5 yorum, F6 Gul, F7 Parmak kalp, F8 Yardim, F9 Donut, F10 Orta, F11 Bob, F12 panel
using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using BepInEx;
using BepInEx.Configuration;
using UnityEngine;

[Serializable]
public class TikTokMesaj
{
    public string tur;
    public string kullanici;
    public string isim;
    public string metin;
    public string hediye;
    public int adet;
    public int jeton;
    public bool bagli;
}

[BepInPlugin("zombiavcisi.mucktiktok", "Muck TikTok", "1.1.0")]
public class MuckTikTok : BaseUnityPlugin
{
    // ------------------------------------------------------------ kart turleri
    private enum KartStil { Mor, Pembe, Yesil, Buyuk }

    private class Kart
    {
        public string ikon, ad, cikan, etiket;
        public string[] yaratiklar;   // kartta gorseli gosterilecek yaratiklar
        public KartStil stil;
        public float parlama = -10f;
        public Kart(string ikon, string ad, string cikan, string etiket, KartStil stil, params string[] yaratiklar)
        {
            this.ikon = ikon; this.ad = ad; this.cikan = cikan; this.etiket = etiket; this.stil = stil;
            this.yaratiklar = yaratiklar;
        }
    }

    private const int K_YORUM = 0, K_GUL = 1, K_KALP = 2, K_DONUT = 3, K_ORTA = 4, K_YARDIM = 5, K_BOB = 6;
    private Kart[] kartlar;

    private class AkisSatiri
    {
        public string ikon, metin, yaratik;
        public Color renk;
        public float zaman;
    }

    // ------------------------------------------------------------ ayarlar
    private ConfigEntry<int> portAyar;
    private ConfigEntry<int> yorumBekleme;
    private ConfigEntry<int> tiktokYaratikSiniri;
    private ConfigEntry<int> kalpJeton, yardimJeton, donutJeton, ortaJeton, bobJeton;
    private ConfigEntry<bool> kopruOtomatik;
    private ConfigEntry<string> kopruKlasoru;
    private System.Diagnostics.Process kopruSureci;

    // ------------------------------------------------------------ baglanti
    private Thread okuyucu;
    private volatile bool calisiyor = true;
    private readonly Queue<string> gelenler = new Queue<string>();
    private volatile bool kopruBagli;
    private volatile bool tiktokBagli;

    // ------------------------------------------------------------ oyun
    private readonly Queue<TikTokMesaj> bekleyenHediyeler = new Queue<TikTokMesaj>();
    private readonly Dictionary<string, float> sonYorum = new Dictionary<string, float>();
    private readonly List<int> tiktokYaratiklari = new List<int>();
    private readonly List<AkisSatiri> akis = new List<AkisSatiri>();
    private bool panelAcik = true;
    private bool isimlerYazildi;

    // ------------------------------------------------------------ cizim
    private readonly Dictionary<string, Texture2D> ikonlar = new Dictionary<string, Texture2D>();
    private Texture2D bobDegrade;
    private Font fontBaslik, fontMetin;
    private GUIStyle stEtiketSol, stKartAltSar;
    private GUIStyle stBaslik, stKartAd, stKartAlt, stEtiket, stRozet, stBuyukAd, stBuyukAlt, stAkis, stAfis;
    private string afisMetin, afisIkon, afisYaratik;
    private Color afisRenk;
    private float afisZaman = -10f;

    // ------------------------------------------------------------ dikey (TikTok 9:16) mod
    private ConfigEntry<int> dikeyGenislik, dikeyYukseklik;
    private ConfigEntry<bool> oyunIciKartlar;
    private bool dikeyIstek;          // oyun "-dikey" ile baslatildi
    private float dikeyDeneme;
    private bool kameraDegisti;

    private static Color Hex(string h, float a = 1f)
    {
        Color c;
        ColorUtility.TryParseHtmlString(h, out c);
        c.a = a;
        return c;
    }

    private void Awake()
    {
        portAyar = Config.Bind("Baglanti", "Port", 21214, "TikTokKopru TCP portu (WebSocket portu + 1)");
        string varsayilanKopru = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Muck_TikTok_Yayin\\TikTokKopru");
        kopruOtomatik = Config.Bind("Baglanti", "KopruyuOtomatikBaslat", true, "Oyun acilinca kopru calismiyorsa kendisi baslatir, oyun kapaninca kapatir");
        kopruKlasoru = Config.Bind("Baglanti", "KopruKlasoru", varsayilanKopru, "kopru.js dosyasinin oldugu klasor");
        yorumBekleme = Config.Bind("Kurallar", "YorumBeklemeSn", 0, "Ayni izleyici yorum/begeni ile kac saniyede bir dusman cagirabilir");
        tiktokYaratikSiniri = Config.Bind("Kurallar", "YorumYaratikSiniri", 25, "Yorum/begeni ile cagrilan en fazla canli dusman");
        kalpJeton = Config.Bind("Hediyeler", "ParmakKalpJeton", 5, "Bu jetondan itibaren: Wyvern");
        yardimJeton = Config.Bind("Hediyeler", "YardimDropJeton", 10,"Bu jetondan itibaren: yardim (inek yagmuru)");
        donutJeton = Config.Bind("Hediyeler", "DonutJeton", 30, "Bu jetondan itibaren: Big Chunk / Gronk");
        ortaJeton = Config.Bind("Hediyeler", "OrtaHediyeJeton", 100, "Bu jetondan itibaren: Guardian / Chief");
        bobJeton = Config.Bind("Hediyeler", "BobJeton", 500, "Bu jetondan itibaren: Bob (ejderha)");
        oyunIciKartlar = Config.Bind("Gorunum", "OyunIciKartlar", false,
            "Yatay oyunda sag/sol hediye kartlari ve olay listesi. Kapaliyken sadece ortadaki hediye afisi gorunur (kartlar yayinda ayri panelde: http://127.0.0.1:21213/panel)");
        dikeyGenislik = Config.Bind("Dikey", "Genislik", 608, "Oyun -dikey ile acilinca pencere genisligi");
        dikeyYukseklik = Config.Bind("Dikey", "Yukseklik", 1080, "Oyun -dikey ile acilinca pencere yuksekligi");
        foreach (var a in Environment.GetCommandLineArgs())
            if (string.Equals(a, "-dikey", StringComparison.OrdinalIgnoreCase)) dikeyIstek = true;
        if (dikeyIstek) Logger.LogInfo("Dikey mod: " + dikeyGenislik.Value + "x" + dikeyYukseklik.Value);

        kartlar = new[]
        {
            new Kart("1f4ac", "Yorum / Beğeni", "Her yorum ve beğeni", "", KartStil.Mor, "lil dave", "goblin"),
            new Kart("1f339", "Gül", JetonAraligi(1, kalpJeton.Value), "", KartStil.Pembe, "wolf", "dave (fire)"),
            new Kart("1faf0", "Parmak Kalp", JetonAraligi(kalpJeton.Value, yardimJeton.Value) + " · uçan", "", KartStil.Mor, "wyvern"),
            new Kart("1f369", "Donut", JetonAraligi(donutJeton.Value, ortaJeton.Value) + " · BOSS", "", KartStil.Mor, "big chunk", "gronk"),
            new Kart("1f381", "Orta Hediye", JetonAraligi(ortaJeton.Value, bobJeton.Value) + " · BOSS", "", KartStil.Mor, "guardian", "chief"),
            new Kart("1f404", "Yardım Drop", JetonAraligi(yardimJeton.Value, donutJeton.Value) + " · inek yağmuru", "", KartStil.Yesil, "cow"),
            new Kart("1f981", "BÜYÜK HEDİYE (ASLAN)", "BOB EJDERHASI ULTIMATE BOSS", bobJeton.Value + "+ jeton", KartStil.Buyuk, "bob"),
        };

        IkonlariYukle();
        if (kopruOtomatik.Value) KopruyuBaslat();

        okuyucu = new Thread(OkumaDongusu) { IsBackground = true, Name = "MuckTikTok" };
        okuyucu.Start();
        Logger.LogInfo("Muck TikTok yuklendi. Kopru portu: " + portAyar.Value);
    }

    private static string JetonAraligi(int alt, int ust)
    {
        return ust - 1 > alt ? alt + "-" + (ust - 1) + " jeton" : alt + " jeton";
    }

    private void IkonlariYukle()
    {
        var asm = Assembly.GetExecutingAssembly();
        foreach (string ad in asm.GetManifestResourceNames())
        {
            if (!ad.EndsWith(".png")) continue;
            using (var s = asm.GetManifestResourceStream(ad))
            {
                if (s == null) continue;
                var ms = new MemoryStream();
                s.CopyTo(ms);
                var t = new Texture2D(2, 2, TextureFormat.RGBA32, false);
                if (t.LoadImage(ms.ToArray()))
                {
                    t.filterMode = FilterMode.Bilinear;
                    ikonlar[Path.GetFileNameWithoutExtension(ad)] = t;
                }
            }
        }
        // Buyuk kartin turuncu degradesi (#e65100 -> #f57c00 -> #ff9800)
        bobDegrade = new Texture2D(256, 1, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        Color a = Hex("#e65100"), b = Hex("#f57c00"), c = Hex("#ff9800");
        for (int i = 0; i < 256; i++)
        {
            float t = i / 255f;
            bobDegrade.SetPixel(i, 0, t < 0.5f ? Color.Lerp(a, b, t * 2f) : Color.Lerp(b, c, (t - 0.5f) * 2f));
        }
        bobDegrade.Apply();
    }

    private void OnDestroy()
    {
        calisiyor = false;
        KopruyuKapat();
    }

    private void OnApplicationQuit()
    {
        calisiyor = false;
        KopruyuKapat();
    }

    // ============================================================ kopruyu otomatik baslat
    private bool PortAcik(int port)
    {
        try
        {
            using (var c = new TcpClient())
            {
                var r = c.BeginConnect("127.0.0.1", port, null, null);
                return r.AsyncWaitHandle.WaitOne(300) && c.Connected;
            }
        }
        catch (Exception) { return false; }
    }

    private static string NodeYolu()
    {
        string path = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (string k in path.Split(';'))
        {
            try
            {
                string aday = Path.Combine(k.Trim().Trim('"'), "node.exe");
                if (File.Exists(aday)) return aday;
            }
            catch (Exception) { }
        }
        string varsayilan = @"C:\Program Files\nodejs\node.exe";
        return File.Exists(varsayilan) ? varsayilan : null;
    }

    private void KopruyuBaslat()
    {
        try
        {
            if (PortAcik(portAyar.Value))
            {
                Logger.LogInfo("Kopru zaten calisiyor, yeniden baslatilmadi.");
                return;
            }
            string klasor = kopruKlasoru.Value;
            string betik = Path.Combine(klasor, "kopru.js");
            if (!File.Exists(betik))
            {
                Logger.LogWarning("Kopru bulunamadi: " + betik + " (config: KopruKlasoru)");
                return;
            }
            string node = NodeYolu();
            if (node == null)
            {
                Logger.LogWarning("node.exe bulunamadi; Node.js kurulu mu?");
                return;
            }
            var bilgi = new System.Diagnostics.ProcessStartInfo(node, "kopru.js")
            {
                WorkingDirectory = klasor,
                UseShellExecute = true,
                WindowStyle = System.Diagnostics.ProcessWindowStyle.Minimized
            };
            kopruSureci = System.Diagnostics.Process.Start(bilgi);
            Logger.LogInfo("Kopru baslatildi: " + betik);
        }
        catch (Exception e)
        {
            Logger.LogError("Kopru baslatilamadi: " + e.Message);
        }
    }

    private void KopruyuKapat()
    {
        try
        {
            if (kopruSureci != null && !kopruSureci.HasExited) kopruSureci.Kill();
        }
        catch (Exception) { }
        kopruSureci = null;
    }

    // ============================================================ TCP okuma (arka plan)
    private void OkumaDongusu()
    {
        while (calisiyor)
        {
            try
            {
                using (var istemci = new TcpClient())
                {
                    istemci.Connect("127.0.0.1", portAyar.Value);
                    kopruBagli = true;
                    lock (yazKilit) yazAkis = istemci.GetStream();
                    Gonder(KartlarJson());   // yayin paneli kartlari moddan alir
                    using (var okuyucuAkis = new StreamReader(istemci.GetStream(), Encoding.UTF8))
                    {
                        string satir;
                        while (calisiyor && (satir = okuyucuAkis.ReadLine()) != null)
                        {
                            lock (gelenler)
                            {
                                if (gelenler.Count < 500) gelenler.Enqueue(satir);
                            }
                        }
                    }
                }
            }
            catch (Exception)
            {
                // kopru kapali; tekrar dene
            }
            lock (yazKilit) yazAkis = null;
            kopruBagli = false;
            tiktokBagli = false;
            Thread.Sleep(3000);
        }
    }

    // ------------------------------------------------------------ kopruye geri bildirim (yayin paneli icin)
    private readonly object yazKilit = new object();
    private NetworkStream yazAkis;

    private void Gonder(string json)
    {
        lock (yazKilit)
        {
            if (yazAkis == null) return;
            try
            {
                var b = Encoding.UTF8.GetBytes(json + "\n");
                yazAkis.Write(b, 0, b.Length);
            }
            catch (Exception) { yazAkis = null; }
        }
    }

    private static string J(string s)
    {
        if (s == null) return "null";
        var sb = new StringBuilder("\"");
        foreach (char c in s)
        {
            if (c == '"' || c == '\\') sb.Append('\\').Append(c);
            else if (c < ' ') sb.Append("\\u").Append(((int)c).ToString("x4"));
            else sb.Append(c);
        }
        return sb.Append('"').ToString();
    }

    private string KartlarJson()
    {
        var sb = new StringBuilder("{\"tur\":\"kartlar\",\"kartlar\":[");
        for (int i = 0; i < kartlar.Length; i++)
        {
            var k = kartlar[i];
            if (i > 0) sb.Append(',');
            sb.Append("{\"id\":").Append(i)
              .Append(",\"ikon\":").Append(J(k.ikon))
              .Append(",\"ad\":").Append(J(k.ad))
              .Append(",\"cikan\":").Append(J(k.cikan))
              .Append(",\"etiket\":").Append(J(k.etiket))
              .Append(",\"stil\":").Append(J(k.stil.ToString()))
              .Append(",\"yaratiklar\":[");
            for (int j = 0; j < k.yaratiklar.Length; j++)
            {
                if (j > 0) sb.Append(',');
                sb.Append(J(k.yaratiklar[j]));
            }
            sb.Append("]}");
        }
        // panelde gosterim sirasi: ucuzdan pahaliya
        sb.Append("],\"sira\":[").Append(K_YORUM).Append(',').Append(K_GUL).Append(',').Append(K_KALP).Append(',')
          .Append(K_YARDIM).Append(',').Append(K_DONUT).Append(',').Append(K_ORTA).Append(',').Append(K_BOB).Append("]}");
        return sb.ToString();
    }

    // ============================================================ ana dongu
    private void Update()
    {
        // Muck acilista kendi kayitli cozunurlugunu uygular; dikey modda pencereyi geri dikeye ceker
        if (dikeyIstek && Time.unscaledTime > dikeyDeneme
            && (Screen.width != dikeyGenislik.Value || Screen.height != dikeyYukseklik.Value))
        {
            dikeyDeneme = Time.unscaledTime + 2f;
            Screen.SetResolution(dikeyGenislik.Value, dikeyYukseklik.Value, FullScreenMode.Windowed);
        }

        TuslariKontrolEt();

        for (int i = 0; i < 20; i++)
        {
            string satir;
            lock (gelenler)
            {
                if (gelenler.Count == 0) break;
                satir = gelenler.Dequeue();
            }
            TikTokMesaj m = null;
            try { m = JsonUtility.FromJson<TikTokMesaj>(satir); } catch (Exception) { }
            if (m != null) Isle(m);
        }

        if (!Hazir()) return;

        if (!Portreler.Hazir)
            Portreler.HepsiniCek(Path.Combine(Path.GetDirectoryName(kopruKlasoru.Value) ?? "", "Yaratik_Gorselleri"),
                s => Logger.LogInfo(s));

        if (!isimlerYazildi)
        {
            isimlerYazildi = true;
            var sb = new StringBuilder("Yaratik listesi: ");
            var l = MobSpawner.Instance.allMobs;
            for (int i = 0; i < l.Length; i++) sb.Append(i).Append('=').Append(l[i].name).Append(", ");
            Logger.LogInfo(sb.ToString());
        }

        if (bekleyenHediyeler.Count > 0) HediyeUygula(bekleyenHediyeler.Dequeue());
    }

    private static bool Hazir()
    {
        return HazirDegilNeden() == null;
    }

    // Neden hazir degil? (null = hazir). "dead" bayragi olup dirilince bazen sifirlanmiyor, can'a bakiyoruz.
    private static string HazirDegilNeden()
    {
        if (!LocalClient.serverOwner) return "oda sahibi degil";
        if (GameManager.state != GameManager.GameState.Playing) return "durum " + GameManager.state;
        // Yeni oyunda Muck'in tekil yoneticileri eski (yok edilmis) kopyayi gosterebiliyor; canlisini bulup bagla.
        if (MobSpawner.Instance == null) MobSpawner.Instance = UnityEngine.Object.FindObjectOfType<MobSpawner>();
        if (MobManager.Instance == null) MobManager.Instance = UnityEngine.Object.FindObjectOfType<MobManager>();
        if (ItemManager.Instance == null) ItemManager.Instance = UnityEngine.Object.FindObjectOfType<ItemManager>();
        if (MobSpawner.Instance == null) return "MobSpawner yok";
        if (MobManager.Instance == null) return "MobManager yok";
        if (ItemManager.Instance == null) return "ItemManager yok";
        if (PlayerMovement.Instance == null) return "oyuncu yok";
        if (PlayerStatus.Instance == null) return "oyuncu durumu yok";
        if (PlayerStatus.Instance.hp <= 0f) return "oyuncu olu";
        return null;
    }

    private void Isle(TikTokMesaj m)
    {
        switch (m.tur)
        {
            case "durum":
                tiktokBagli = m.bagli;
                break;
            case "yorum":
            case "begeni":
                YorumBegeni(m);
                break;
            case "hediye":
                if (Hazir()) HediyeUygula(m);
                else if (bekleyenHediyeler.Count < 30) bekleyenHediyeler.Enqueue(m);
                break;
        }
    }

    // ============================================================ yorum / begeni
    private void YorumBegeni(TikTokMesaj m)
    {
        string ad = Ad(m);
        if (!Hazir()) { Logger.LogInfo("Yorum atlandi (" + ad + "): " + HazirDegilNeden()); return; }
        float simdi = Time.time;
        float son;
        if (sonYorum.TryGetValue(ad, out son) && simdi - son < yorumBekleme.Value) return;   // bekleme: sessiz (begeniler cok sik gelir)

        TemizleOlenleri();
        if (tiktokYaratiklari.Count >= tiktokYaratikSiniri.Value)
        {
            Logger.LogInfo("Yorum atlandi (" + ad + "): sahada zaten " + tiktokYaratiklari.Count + " izleyici yaratigi var");
            return;
        }
        sonYorum[ad] = simdi;

        int id = YaratikCagir(Rastgele(new[] { "lil dave", "goblin" }), ad, 1f, 1f, Mob.BossType.None, true);
        if (id != -1)
        {
            string neden = m.tur == "begeni" ? "beğendi" : "yorum yazdı";
            Duyur(K_YORUM, ad + " " + neden + " → " + MobAdi(id), true, MobAdi(id));   // ustte isim afisi
        }
        else Logger.LogWarning("Yorum yaratigi cagrilamadi (" + ad + ")");
    }

    // ============================================================ hediyeler
    private void HediyeUygula(TikTokMesaj m)
    {
        string ad = Ad(m);
        int jeton = Math.Max(1, m.jeton);
        int adet = Mathf.Clamp(m.adet, 1, 10);
        string hediye = string.IsNullOrEmpty(m.hediye) ? "hediye" : m.hediye;

        if (jeton >= bobJeton.Value)
        {
            int id = YaratikCagir("bob", ad, 1f, BossCarpani(), Mob.BossType.BossShrine, false);
            if (id == -1)
            {
                YaratikCagir(Rastgele(new[] { "guardian", "chief" }), ad, 1f, BossCarpani(), Mob.BossType.BossShrine, false);
                YaratikCagir(Rastgele(new[] { "big chunk", "gronk" }), ad, 1f, BossCarpani(), Mob.BossType.BossShrine, false);
            }
            Duyur(K_BOB, ad + " " + hediye + " attı → BOB EJDERHASI GELİYOR!", true, "bob");
        }
        else if (jeton >= ortaJeton.Value)
        {
            int id = YaratikCagir(Rastgele(new[] { "guardian", "chief" }), ad, 1f, BossCarpani(), Mob.BossType.BossShrine, false);
            Duyur(K_ORTA, ad + " " + hediye + " attı → " + MobAdi(id) + "!", true, MobAdi(id));
        }
        else if (jeton >= donutJeton.Value)
        {
            int id = YaratikCagir(Rastgele(new[] { "big chunk", "gronk" }), ad, 1f, BossCarpani(), Mob.BossType.BossShrine, false);
            Duyur(K_DONUT, ad + " " + hediye + " attı → " + MobAdi(id) + "!", true, MobAdi(id));
        }
        else if (jeton >= yardimJeton.Value)
        {
            int sayi = 0;
            for (int i = 0; i < 6; i++)
                if (YaratikCagir("cow", ad, 1f, 1f, Mob.BossType.None, false, 6f, 14f) != -1) sayi++;
            Duyur(K_YARDIM, ad + " " + hediye + " attı → " + sayi + " inek yağdı! Et zamanı", true, "cow");
        }
        else if (jeton >= kalpJeton.Value)
        {
            int n = Mathf.Clamp(adet, 1, 5);
            for (int i = 0; i < n; i++) YaratikCagir("wyvern", ad, 1f, 1f, Mob.BossType.None, false);
            Duyur(K_KALP, ad + " " + hediye + " attı → " + (n > 1 ? n + " " : "") + "Wyvern", false, "wyvern");
        }
        else
        {
            int ilk = -1;
            for (int i = 0; i < adet; i++)
            {
                int id = YaratikCagir(Rastgele(new[] { "wolf", "dave (fire)" }), ad, 1f, 1f, Mob.BossType.None, false);
                if (ilk == -1) ilk = id;
            }
            Duyur(K_GUL, ad + " " + hediye + (adet > 1 ? " x" + adet : "") + " → " + MobAdi(ilk), false, MobAdi(ilk));
        }
    }

    private static float BossCarpani()
    {
        return 0.9f + 0.1f * GameManager.instance.GetPlayersAlive();
    }

    private static string MobAdi(int id)
    {
        Mob mob;
        if (id != -1 && MobManager.Instance.mobs.TryGetValue(id, out mob) && mob != null && mob.mobType != null)
            return mob.mobType.name;
        return "düşman";
    }

    // ============================================================ oyun islemleri
    private int YaratikBul(string anahtar)
    {
        var liste = MobSpawner.Instance.allMobs;
        for (int i = 0; i < liste.Length; i++)
            if (liste[i] != null && liste[i].name.ToLowerInvariant() == anahtar) return i;
        for (int i = 0; i < liste.Length; i++)
            if (liste[i] != null && liste[i].name.ToLowerInvariant().Contains(anahtar)) return i;
        return -1;
    }

    private int YaratikCagir(string anahtar, string sahip, float carpan, float bossCarpan, Mob.BossType bossTuru,
        bool yorumdan, float minUzak = 15f, float maxUzak = 30f)
    {
        try
        {
            int tur = YaratikBul(anahtar);
            if (tur == -1)
            {
                Logger.LogWarning("Yaratik bulunamadi: " + anahtar);
                return -1;
            }
            Vector3 konum;
            if (!KonumBul(minUzak, maxUzak, out konum)) return -1;
            int guardian = MobSpawner.Instance.allMobs[tur].name.ToLowerInvariant().Contains("guardian")
                ? UnityEngine.Random.Range(1, 6) : -1;
            int id = MobManager.Instance.GetNextId();
            MobSpawner.Instance.ServerSpawnNewMob(id, tur, konum, carpan, bossCarpan, bossTuru, guardian);
            Mob mob;
            if (MobManager.Instance.mobs.TryGetValue(id, out mob) && mob != null)
                Etiket.Ekle(mob.gameObject, sahip, bossTuru != Mob.BossType.None);
            if (yorumdan) tiktokYaratiklari.Add(id);
            return id;
        }
        catch (Exception e)
        {
            Logger.LogError("Yaratik cagrilamadi (" + anahtar + "): " + e);
            return -1;
        }
    }

    private static bool KonumBul(float minUzak, float maxUzak, out Vector3 konum)
    {
        Vector3 merkez = PlayerMovement.Instance.transform.position;
        LayerMask zemin = GameLoop.Instance != null ? GameLoop.Instance.whatIsSpawnable : (LayerMask)~0;
        for (int deneme = 0; deneme < 12; deneme++)
        {
            Vector2 yon = UnityEngine.Random.insideUnitCircle.normalized * UnityEngine.Random.Range(minUzak, maxUzak);
            // tepeden (yuksek bir noktadan) asagi isin: yamacta / dag dibinde de zemini bulsun
            Vector3 ust = new Vector3(merkez.x + yon.x, merkez.y + 250f, merkez.z + yon.y);
            RaycastHit vurus;
            if (Physics.Raycast(ust, Vector3.down, out vurus, 1000f, zemin))
            {
                konum = vurus.point;
                return true;
            }
        }
        // zemin bulunamadi: oyuncunun yakinina, biraz havaya (dusup yere iner)
        Vector2 y2 = UnityEngine.Random.insideUnitCircle.normalized * minUzak * 0.6f;
        konum = merkez + new Vector3(y2.x, 3f, y2.y);
        Debug.Log("[MuckTikTok] Zemin bulunamadi, oyuncu yanina cagriliyor");
        return true;
    }

    private void TemizleOlenleri()
    {
        tiktokYaratiklari.RemoveAll(id => !MobManager.Instance.mobs.ContainsKey(id) || MobManager.Instance.mobs[id] == null);
    }

    // ============================================================ yardimcilar
    private static string Ad(TikTokMesaj m)
    {
        string ad = !string.IsNullOrEmpty(m.isim) ? m.isim : m.kullanici;
        if (string.IsNullOrEmpty(ad)) ad = "izleyici";
        return ad.Length > 18 ? ad.Substring(0, 18) : ad;
    }

    private static string Rastgele(string[] dizi)
    {
        return dizi[UnityEngine.Random.Range(0, dizi.Length)];
    }

    private Color KartRengi(int kart)
    {
        switch (kartlar[kart].stil)
        {
            case KartStil.Pembe: return Hex("#fe2c55");
            case KartStil.Yesil: return Hex("#25f4ee");
            case KartStil.Buyuk: return Hex("#ff9800");
            default: return Hex("#9fb0ff");
        }
    }

    private void Duyur(int kart, string metin, bool afis, string yaratik = null)
    {
        kartlar[kart].parlama = Time.time;
        Gonder("{\"tur\":\"tetik\",\"kart\":" + kart + ",\"metin\":" + J(metin) + ",\"yaratik\":" + J(yaratik) + ",\"buyuk\":" + (afis ? "true" : "false") + "}");
        akis.Insert(0, new AkisSatiri { ikon = kartlar[kart].ikon, metin = metin, renk = KartRengi(kart), zaman = Time.time, yaratik = yaratik });
        if (akis.Count > 5) akis.RemoveAt(akis.Count - 1);
        if (afis)
        {
            afisMetin = metin;
            afisYaratik = yaratik;
            afisIkon = kartlar[kart].ikon;
            afisRenk = KartRengi(kart);
            afisZaman = Time.time;
        }
        try
        {
            if (ChatBox.Instance != null)
                ChatBox.Instance.AppendMessage(-1, "<color=#" + ColorUtility.ToHtmlStringRGB(KartRengi(kart)) + ">" + metin + "</color>", "");
        }
        catch (Exception) { }
        Logger.LogInfo(metin);
    }

    // ============================================================ test tuslari
    private void TuslariKontrolEt()
    {
        if (Input.GetKeyDown(KeyCode.F12)) panelAcik = !panelAcik;
        if (Input.GetKeyDown(KeyCode.F5)) Isle(Sahte("yorum", 0, "selam"));
        if (Input.GetKeyDown(KeyCode.F6)) Isle(Sahte("hediye", 1, "Gül"));
        if (Input.GetKeyDown(KeyCode.F7)) Isle(Sahte("hediye", kalpJeton.Value, "Parmak Kalp"));
        if (Input.GetKeyDown(KeyCode.F8)) Isle(Sahte("hediye", yardimJeton.Value, "Gökkuşağı"));
        if (Input.GetKeyDown(KeyCode.F9)) Isle(Sahte("hediye", donutJeton.Value, "Donut"));
        if (Input.GetKeyDown(KeyCode.F10)) Isle(Sahte("hediye", ortaJeton.Value, "Kalp Kutusu"));
        if (Input.GetKeyDown(KeyCode.F11)) Isle(Sahte("hediye", bobJeton.Value, "Aslan"));
    }

    private static int sahteNo;

    private static TikTokMesaj Sahte(string tur, int jeton, string metin)
    {
        sahteNo++;
        string ad = "test_" + sahteNo;
        return new TikTokMesaj { tur = tur, kullanici = ad, isim = ad, metin = metin, hediye = metin, adet = 1, jeton = jeton };
    }

    // ============================================================ ekran paneli (sag ve sol)
    private void StilleriKur(float s)
    {
        if (fontBaslik == null)
        {
            fontBaslik = Font.CreateDynamicFontFromOSFont(new[] { "Bahnschrift SemiBold Condensed", "Bahnschrift", "Impact", "Arial" }, 32);
            fontMetin = Font.CreateDynamicFontFromOSFont(new[] { "Segoe UI Semibold", "Segoe UI", "Arial" }, 16);
        }
        if (stBaslik == null)
        {
            stBaslik = new GUIStyle { font = fontBaslik, richText = true, alignment = TextAnchor.MiddleLeft };
            stKartAd = new GUIStyle { font = fontBaslik, alignment = TextAnchor.UpperLeft, clipping = TextClipping.Clip };
            stKartAlt = new GUIStyle { font = fontMetin, alignment = TextAnchor.UpperLeft, clipping = TextClipping.Clip };
            stKartAltSar = new GUIStyle { font = fontMetin, alignment = TextAnchor.UpperLeft, clipping = TextClipping.Clip, wordWrap = true };
            stEtiket = new GUIStyle { font = fontMetin, alignment = TextAnchor.MiddleRight };
            stEtiketSol = new GUIStyle { font = fontMetin, alignment = TextAnchor.MiddleLeft };
            stRozet = new GUIStyle { font = fontMetin, alignment = TextAnchor.MiddleCenter };
            stBuyukAd = new GUIStyle { font = fontBaslik, alignment = TextAnchor.UpperLeft, clipping = TextClipping.Clip };
            stBuyukAlt = new GUIStyle { font = fontMetin, alignment = TextAnchor.UpperLeft, clipping = TextClipping.Clip };
            stAkis = new GUIStyle { font = fontMetin, alignment = TextAnchor.MiddleLeft, clipping = TextClipping.Clip };
            stAfis = new GUIStyle { font = fontBaslik, alignment = TextAnchor.MiddleLeft };
        }
        stBaslik.fontSize = R(24 * s);
        stKartAd.fontSize = R(23 * s);
        stKartAlt.fontSize = R(15 * s);
        stKartAltSar.fontSize = R(14 * s);
        stEtiket.fontSize = R(12 * s);
        stEtiketSol.fontSize = R(12 * s);
        stRozet.fontSize = R(13 * s);
        stBuyukAd.fontSize = R(22 * s);
        stBuyukAlt.fontSize = R(14 * s);
        stAkis.fontSize = R(14 * s);
        stAfis.fontSize = R(34 * s);
    }

    private static int R(float f) { return Mathf.Max(1, Mathf.RoundToInt(f)); }

    private static void Kutu(Rect r, Color dolgu, Color kenar, float yaricap, float kalinlik)
    {
        GUI.DrawTexture(r, Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0f, dolgu, 0f, yaricap);
        if (kalinlik > 0f)
            GUI.DrawTexture(r, Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0f, kenar, kalinlik, yaricap);
    }

    private void Ikon(Rect r, string ad)
    {
        Texture2D t;
        if (ad != null && ikonlar.TryGetValue(ad, out t)) GUI.DrawTexture(r, t, ScaleMode.ScaleToFit, true);
    }

    private static void Yazi(Rect r, string metin, GUIStyle st, Color renk, bool golge = false)
    {
        // sigmazsa yaziyi kucult (kesilmesin)
        int asil = st.fontSize;
        var ic = new GUIContent(metin);
        while (st.fontSize > 9 && st.CalcSize(ic).x > r.width) st.fontSize--;
        try { YaziCiz(r, metin, st, renk, golge); }
        finally { st.fontSize = asil; }
    }

    private static void YaziCiz(Rect r, string metin, GUIStyle st, Color renk, bool golge)
    {
        if (golge)
        {
            st.normal.textColor = new Color(0f, 0f, 0f, 0.45f);
            GUI.Label(new Rect(r.x + 1, r.y + 2, r.width, r.height), metin, st);
        }
        st.normal.textColor = renk;
        GUI.Label(r, metin, st);
    }

    private void OnGUI()
    {
        if (!panelAcik || kartlar == null) return;
        if (GameManager.instance == null || PlayerMovement.Instance == null) return;   // ana menude gosterme, sadece oyunda
        if (Dikey()) { DikeyCiz(); return; }
        float s = Screen.height / 1080f;
        StilleriKur(s);
        if (!oyunIciKartlar.Value)
        {
            AfisCiz(s, Screen.height * 0.08f);   // sadece ortadaki hediye afisi
            return;
        }

        float kenar = 18 * s, w = 390 * s, kartH = 90 * s, ara = 12 * s;

        // ---------------- SOL: baslik + yorum, gul, parmak kalp
        // (Muck'in kendi sol ust sayaci ~440 px'e kadar iner, onun altindan baslar)
        float x = kenar, y = 462 * s;
        BaslikCiz(new Rect(x, y, w, 46 * s), s);
        y += 46 * s + ara;
        foreach (int k in new[] { K_YORUM, K_GUL, K_KALP })
        {
            KartCiz(new Rect(x, y, w, kartH), kartlar[k], s);
            y += kartH + ara;
        }

        // ---------------- SAG: donut, orta, yardim + buyuk (Bob) + son olaylar
        x = Screen.width - kenar - w;
        y = 150 * s;
        foreach (int k in new[] { K_DONUT, K_ORTA, K_YARDIM })
        {
            KartCiz(new Rect(x, y, w, kartH), kartlar[k], s);
            y += kartH + ara;
        }
        BuyukKartCiz(new Rect(x, y + 6 * s, w, 96 * s), kartlar[K_BOB], s);
        y += 96 * s + 6 * s + ara + 14 * s;
        AkisCiz(x, y, w, s);

        // ---------------- ORTA UST: buyuk olay afisi
        AfisCiz(s, Screen.height * 0.08f);
    }

    // ============================================================ dikey yerlesim
    // Ust kisim: hediye kartlari (2 sutun, ucuzdan pahaliya) + Bob. Alt kisim: oyun.
    private const float D_KENAR = 10f, D_BASLIK = 36f, D_KART = 104f, D_ARA = 8f, D_BOB = 80f;

    private static bool Dikey() { return Screen.height > Screen.width; }

    private static float DikeyOlcek() { return Screen.width / 600f; }

    private static float DikeyPanelH()
    {
        return (D_KENAR + D_BASLIK + D_ARA + 3 * (D_KART + D_ARA) + 4f + D_BOB + 12f) * DikeyOlcek();
    }

    private bool OyunEkraninda()
    {
        return panelAcik && kartlar != null && GameManager.instance != null && PlayerMovement.Instance != null;
    }

    // Oyun kameralari sadece alt kisma cizer; kartlar oyunun ustunu kapatmaz
    private void LateUpdate()
    {
        bool dikey = Dikey() && OyunEkraninda();
        if (!dikey && !kameraDegisti) return;
        float oran = dikey ? Mathf.Clamp01(1f - DikeyPanelH() / Screen.height) : 1f;
        var alan = new Rect(0f, 0f, 1f, oran);
        foreach (var c in Camera.allCameras)
            if (c.targetTexture == null && c.rect != alan) c.rect = alan;
        kameraDegisti = dikey;
    }

    private void DikeyCiz()
    {
        float s = DikeyOlcek();
        StilleriKur(s);
        float m = D_KENAR * s, gw = Screen.width - 2 * m, ph = DikeyPanelH();

        // panel zemini (oyun bu kisma cizmiyor)
        GUI.DrawTexture(new Rect(0, 0, Screen.width, ph), Texture2D.whiteTexture, ScaleMode.StretchToFill, false, 0f, Hex("#05070d"), 0f, 0f);
        GUI.DrawTexture(new Rect(0, ph - 2 * s, Screen.width, 2 * s), Texture2D.whiteTexture, ScaleMode.StretchToFill, false, 0f, Hex("#7c4dff", 0.8f), 0f, 0f);

        float y = m;
        BaslikCiz(new Rect(m, y, gw, D_BASLIK * s), s);
        y += (D_BASLIK + D_ARA) * s;

        float kw = (gw - D_ARA * s) / 2f, kh = D_KART * s;
        int[] sira = { K_YORUM, K_GUL, K_KALP, K_YARDIM, K_DONUT, K_ORTA };
        for (int i = 0; i < sira.Length; i++)
        {
            int sut = i % 2, sat = i / 2;
            KartDikeyCiz(new Rect(m + sut * (kw + D_ARA * s), y + sat * (kh + D_ARA * s), kw, kh), kartlar[sira[i]], s);
        }
        y += 3 * (kh + D_ARA * s) + 4 * s;
        BuyukKartCiz(new Rect(m, y, gw, D_BOB * s), kartlar[K_BOB], s);

        // oyun alaninin ustunde: olay afisi ve son olaylar
        AkisCiz(m, ph + 96 * s, 340 * s, s);
        AfisCiz(s, ph + 14 * s);
    }

    private void KartDikeyCiz(Rect r, Kart k, float s)
    {
        Color adRenk, altRenk, vurgu;
        r = KartZemin(r, k, s, out adRenk, out altRenk, out vurgu);
        float ik = 28 * s;
        Ikon(new Rect(r.x + 12 * s, r.y + 9 * s, ik, ik), k.ikon);
        float tx = r.x + 12 * s + ik + 8 * s;
        Yazi(new Rect(tx, r.y + 6 * s, r.xMax - tx - 8 * s, 32 * s), k.ad, stKartAd, adRenk);
        float boy = r.height - 42 * s;
        float sol = PortreleriCiz(r.xMax - 6 * s, r.y + 36 * s, boy, k.yaratiklar, s, vurgu);
        stKartAltSar.normal.textColor = altRenk;
        GUI.Label(new Rect(r.x + 12 * s, r.y + 46 * s, sol - r.x - 18 * s, r.height - 50 * s), k.cikan, stKartAltSar);
    }

    private void BaslikCiz(Rect r, float s)
    {
        Kutu(r, Hex("#090c15", 0.92f), new Color(1f, 1f, 1f, 0.10f), 12 * s, 1f);
        Ikon(new Rect(r.x + 12 * s, r.y + 11 * s, 24 * s, 24 * s), "26a1");
        string durum; Color renk;
        if (!kopruBagli) { durum = "● Kapalı"; renk = Hex("#ff6060"); }
        else if (tiktokBagli) { durum = "● Canlı"; renk = Hex("#00f2fe"); }
        else { durum = "● Bekliyor"; renk = Hex("#ffd45c"); }
        float rw = 84 * s;
        Yazi(new Rect(r.x + 42 * s, r.y, r.width - 42 * s - rw - 16 * s, r.height), "HEDİYE TETİKLEYİCİ", stBaslik, Color.white);
        var rozet = new Rect(r.xMax - rw - 10 * s, r.y + 10 * s, rw, r.height - 20 * s);
        Kutu(rozet, new Color(renk.r, renk.g, renk.b, 0.06f), renk, rozet.height / 2f, 1f);
        Yazi(rozet, durum, stRozet, renk);
    }

    private void KartCiz(Rect r, Kart k, float s)
    {
        Color adRenk, altRenk, vurgu;
        r = KartZemin(r, k, s, out adRenk, out altRenk, out vurgu);
        float ik = 36 * s;
        Ikon(new Rect(r.x + 16 * s, r.y + (r.height - ik) / 2f, ik, ik), k.ikon);
        float tx = r.x + 16 * s + ik + 14 * s;
        float sag = PortreleriCiz(r.xMax - 8 * s, r.y + 4 * s, r.height - 8 * s, k.yaratiklar, s, vurgu);
        float tw = sag - tx - 6 * s;
        Yazi(new Rect(tx, r.y + r.height / 2f - 28 * s, tw, 30 * s), k.ad, stKartAd, adRenk);
        Yazi(new Rect(tx, r.y + r.height / 2f + 3 * s, tw, 22 * s), k.cikan, stKartAlt, altRenk);
    }

    // Kart arka plani + tetiklenince parlama; kaymis kutuyu dondurur
    private Rect KartZemin(Rect r, Kart k, float s, out Color adRenk, out Color altRenk, out Color vurgu)
    {
        Color kenar;
        adRenk = Color.white;
        switch (k.stil)
        {
            case KartStil.Pembe: kenar = Hex("#5d1d33"); vurgu = Hex("#fe2c55"); altRenk = Hex("#cf6679"); break;
            case KartStil.Yesil: kenar = Hex("#0e4e3b"); vurgu = Hex("#00f2fe"); altRenk = Hex("#5cdbb5"); adRenk = Hex("#25f4ee"); break;
            default: kenar = Hex("#2b3353"); vurgu = Hex("#55629c"); altRenk = Hex("#70809b"); break;
        }
        // tetiklenince 1.5 sn parlar ve hafif yukari kalkar
        float p = Mathf.Clamp01(1f - (Time.time - k.parlama) / 1.5f);
        r.y -= 3f * s * p;
        if (p > 0f)
            Kutu(new Rect(r.x - 4 * s, r.y - 4 * s, r.width + 8 * s, r.height + 8 * s),
                new Color(vurgu.r, vurgu.g, vurgu.b, 0.25f * p), Color.clear, 15 * s, 0f);
        Color dolgu = Color.Lerp(new Color(15 / 255f, 20 / 255f, 32 / 255f, 0.86f), new Color(vurgu.r * 0.3f, vurgu.g * 0.3f, vurgu.b * 0.3f, 0.92f), p * 0.6f);
        Kutu(r, dolgu, Color.Lerp(kenar, vurgu, p), 12 * s, 1.5f * s);
        return r;
    }

    // sagX'ten sola dogru, ust y'sinden baslayarak boy x boy yaratik gorselleri cizer;
    // yazilarin bitmesi gereken x'i dondurur
    private float PortreleriCiz(float sagX, float ust, float boy, string[] yaratiklar, float s, Color vurgu)
    {
        float x = sagX;
        if (yaratiklar == null) return x;
        for (int i = yaratiklar.Length - 1; i >= 0; i--)
        {
            var t = Portreler.Bul(yaratiklar[i]);
            if (t == null) continue;
            x -= boy;
            var pr = new Rect(x, ust, boy, boy);
            // her yaratigin arkasinda koyu bir cerceve, altinda renkli isik
            Kutu(pr, new Color(0f, 0f, 0f, 0.35f), new Color(vurgu.r, vurgu.g, vurgu.b, 0.45f), 10 * s, 1f);
            Kutu(new Rect(pr.x + boy * 0.15f, pr.yMax - boy * 0.22f, boy * 0.7f, boy * 0.16f),
                new Color(vurgu.r, vurgu.g, vurgu.b, 0.30f), Color.clear, boy * 0.08f, 0f);
            GUI.DrawTexture(new Rect(pr.x + 3 * s, pr.y + 3 * s, boy - 6 * s, boy - 6 * s), t, ScaleMode.ScaleToFit, true);
            x -= 6 * s;
        }
        return x;
    }

    private void BuyukKartCiz(Rect r, Kart k, float s)
    {
        float p = Mathf.Clamp01(1f - (Time.time - k.parlama) / 2.5f);
        float nabiz = 0.5f + 0.5f * Mathf.Sin(Time.time * 3f);
        // turuncu parlama (surekli hafif nabiz, tetiklenince guclu)
        float g = 6 * s + 6 * s * p;
        Kutu(new Rect(r.x - g, r.y - g, r.width + 2 * g, r.height + 2 * g),
            new Color(230 / 255f, 81 / 255f, 0f, 0.18f + 0.12f * nabiz + 0.35f * p), Color.clear, 14 * s + g, 0f);
        GUI.DrawTexture(r, bobDegrade, ScaleMode.StretchToFill, true, 0f, Color.white, 0f, 12 * s);
        GUI.DrawTexture(r, Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0f, Hex("#ffb74d"), 2f * s, 12 * s);

        float ik = 40 * s;
        Ikon(new Rect(r.x + 16 * s, r.y + (r.height - ik) / 2f, ik, ik), k.ikon);
        var bob = Portreler.Bul("bob");
        float bobBoy = r.height + 26 * s;
        if (bob != null)
            GUI.DrawTexture(new Rect(r.xMax - bobBoy + 8 * s, r.y - 22 * s, bobBoy, bobBoy), bob, ScaleMode.ScaleToFit, true);
        else
            Ikon(new Rect(r.xMax - 16 * s - 34 * s, r.y + (r.height - 34 * s) / 2f, 34 * s, 34 * s), "1f409");
        float tx = r.x + 16 * s + ik + 14 * s;
        float tw = r.xMax - tx - (bob != null ? bobBoy - 14 * s : 56 * s);
        Yazi(new Rect(tx, r.y + 20 * s, tw, 30 * s), k.ad, stBuyukAd, Color.white, true);
        Yazi(new Rect(tx, r.y + 51 * s, tw, 22 * s), k.cikan, stBuyukAlt, Hex("#ffe0b2"), true);
        Yazi(new Rect(tx, r.y + 4 * s, tw, 16 * s), k.etiket, stEtiketSol, Hex("#fff3e0"), true);
    }

    private void AkisCiz(float x, float y, float w, float s)
    {
        float h = 30 * s;
        foreach (var a in akis)
        {
            float yas = Time.time - a.zaman;
            float alfa = yas < 20f ? 1f : Mathf.Clamp01(1f - (yas - 20f) / 5f);
            if (alfa <= 0f) continue;
            var r = new Rect(x, y, w, h);
            Kutu(r, new Color(9 / 255f, 12 / 255f, 21 / 255f, 0.78f * alfa), new Color(a.renk.r, a.renk.g, a.renk.b, 0.35f * alfa), 8 * s, 1f);
            Kutu(new Rect(r.x, r.y, 4 * s, r.height), new Color(a.renk.r, a.renk.g, a.renk.b, alfa), Color.clear, 2 * s, 0f);
            GUI.color = new Color(1f, 1f, 1f, alfa);
            Ikon(new Rect(r.x + 10 * s, r.y + 5 * s, 20 * s, 20 * s), a.ikon);
            var yt = Portreler.Bul(a.yaratik);
            if (yt != null) GUI.DrawTexture(new Rect(r.xMax - 40 * s, r.y - 6 * s, 40 * s, 40 * s), yt, ScaleMode.ScaleToFit, true);
            GUI.color = Color.white;
            Yazi(new Rect(r.x + 38 * s, r.y, w - 46 * s - (yt != null ? 34 * s : 0f), h), a.metin, stAkis, new Color(1f, 1f, 1f, alfa));
            y += h + 6 * s;
        }
    }

    private void AfisCiz(float s, float ustY)
    {
        float yas = Time.time - afisZaman;
        if (yas > 4f || string.IsNullOrEmpty(afisMetin)) return;
        float giris = Mathf.Clamp01(yas / 0.25f);
        float alfa = yas < 3.4f ? giris : Mathf.Clamp01(1f - (yas - 3.4f) / 0.6f);
        float olcek = Mathf.Lerp(0.85f, 1f, giris);

        Vector2 boyut = stAfis.CalcSize(new GUIContent(afisMetin));
        var yt = Portreler.Bul(afisYaratik);
        float ekW = yt != null ? 96 * s : 0f;
        float w = (boyut.x + 110 * s + ekW) * olcek, h = 70 * s * olcek;
        w = Mathf.Min(w, Screen.width - 24 * s);   // dar (dikey) ekranda tasmasin, yazi kuculur
        var r = new Rect((Screen.width - w) / 2f, ustY, w, h);
        Kutu(new Rect(r.x - 6 * s, r.y - 6 * s, r.width + 12 * s, r.height + 12 * s),
            new Color(afisRenk.r, afisRenk.g, afisRenk.b, 0.22f * alfa), Color.clear, 20 * s, 0f);
        Kutu(r, new Color(9 / 255f, 12 / 255f, 21 / 255f, 0.92f * alfa), new Color(afisRenk.r, afisRenk.g, afisRenk.b, alfa), 14 * s, 2f * s);
        GUI.color = new Color(1f, 1f, 1f, alfa);
        float ik = 46 * s * olcek;
        Ikon(new Rect(r.x + 18 * s, r.y + (r.height - ik) / 2f, ik, ik), afisIkon);
        if (yt != null)
        {
            float pb = 120 * s * olcek;
            GUI.DrawTexture(new Rect(r.xMax - pb + 10 * s, r.y + r.height - pb + 8 * s, pb, pb), yt, ScaleMode.ScaleToFit, true);
        }
        GUI.color = Color.white;
        float tx = r.x + 18 * s + ik + 16 * s;
        Yazi(new Rect(tx, r.y, r.xMax - tx - ekW * olcek - 6 * s, r.height), afisMetin, stAfis, new Color(1f, 1f, 1f, alfa));
    }
}

// Yaratigin ustunde, kameraya donuk izleyici adi
public class Etiket : MonoBehaviour
{
    private Transform kamera;

    public static void Ekle(GameObject hedef, string metin, bool boss)
    {
        float yukseklik = 3f;
        var cizici = hedef.GetComponentInChildren<Renderer>();
        if (cizici != null) yukseklik = cizici.bounds.max.y - hedef.transform.position.y + 0.8f;
        yukseklik = Mathf.Clamp(yukseklik, 2f, 30f);

        float olcek = Mathf.Max(0.01f, hedef.transform.lossyScale.y);
        var go = new GameObject("TikTokEtiket");
        go.transform.SetParent(hedef.transform, false);
        go.transform.localPosition = Vector3.up * yukseklik / olcek;
        Color renk = boss ? new Color(1f, 0.35f, 0.3f) : new Color(1f, 0.85f, 0.35f);

        // Muck'in kendi TextMeshPro fontu (oyuncu isimleri bununla). Eski TextMesh'in shader'i
        // oyunda olmadigi icin harfler sari blok gibi gorunuyordu.
        var font = OyunFontu();
        if (font != null)
        {
            var tmp = go.AddComponent<TMPro.TextMeshPro>();
            tmp.font = font;
            tmp.text = metin;
            tmp.fontSize = (boss ? 14f : 8f) / olcek;
            tmp.alignment = TMPro.TextAlignmentOptions.Bottom;
            tmp.enableWordWrapping = false;
            tmp.color = renk;
            tmp.fontStyle = TMPro.FontStyles.Bold;
            tmp.rectTransform.sizeDelta = new Vector2(30f / olcek, 4f / olcek);
            try { tmp.outlineWidth = 0.25f; tmp.outlineColor = new Color32(0, 0, 0, 255); } catch (Exception) { }
        }
        else
        {
            var tm = go.AddComponent<TextMesh>();
            tm.text = metin;
            tm.anchor = TextAnchor.LowerCenter;
            tm.alignment = TextAlignment.Center;
            tm.fontSize = 64;
            tm.characterSize = (boss ? 0.09f : 0.05f) / olcek;
            tm.color = renk;
            var f = Resources.GetBuiltinResource<Font>("Arial.ttf");
            var sh = Shader.Find("UI/Default");
            if (f != null)
            {
                tm.font = f;
                var mat = sh != null ? new Material(sh) : new Material(f.material);
                mat.mainTexture = f.material.mainTexture;
                go.GetComponent<MeshRenderer>().material = mat;
            }
        }
        go.AddComponent<Etiket>();
    }

    private static TMPro.TMP_FontAsset oyunFontu;
    private static TMPro.TMP_FontAsset OyunFontu()
    {
        if (oyunFontu != null) return oyunFontu;
        try
        {
            var hepsi = Resources.FindObjectsOfTypeAll<TMPro.TMP_FontAsset>();
            foreach (var f in hepsi)
                if (f != null && f.material != null) { oyunFontu = f; break; }
        }
        catch (Exception) { }
        return oyunFontu;
    }

    private void LateUpdate()
    {
        if (kamera == null)
        {
            var c = Camera.main;
            if (c == null) return;
            kamera = c.transform;
        }
        transform.rotation = Quaternion.LookRotation(transform.position - kamera.position);
    }
}
