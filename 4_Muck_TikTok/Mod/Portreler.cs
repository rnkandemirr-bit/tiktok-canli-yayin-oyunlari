// Yaratik portreleri: oyunun kendi modellerinden seffaf arka planli PNG uretir.
// Prefab, pasif bir tutucunun altina kopyalanir (hicbir script calismaz), sadece meshleri
// ayri bir katmanda gecici bir kamerayla cekilir.
using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

public static class Portreler
{
    private const int KATMAN = 31;
    private const int BOYUT = 256;

    // anahtar: yaratik adi (kucuk harf)
    public static readonly Dictionary<string, Texture2D> Doku = new Dictionary<string, Texture2D>();
    public static bool Hazir;

    public static Texture2D Bul(string anahtar)
    {
        if (string.IsNullOrEmpty(anahtar)) return null;
        anahtar = anahtar.ToLowerInvariant();
        Texture2D t;
        if (Doku.TryGetValue(anahtar, out t)) return t;
        foreach (var kv in Doku)
            if (kv.Key.Contains(anahtar)) return kv.Value;
        return null;
    }

    // Tum yaratiklari bir kez ceker; kayitKlasoru bos degilse PNG olarak da kaydeder.
    public static void HepsiniCek(string kayitKlasoru, Action<string> log)
    {
        if (Hazir || MobSpawner.Instance == null) return;
        Hazir = true;

        bool sis = RenderSettings.fog;
        RenderSettings.fog = false;

        var rt = new RenderTexture(BOYUT, BOYUT, 24, RenderTextureFormat.ARGB32) { antiAliasing = 4 };
        var kamGo = new GameObject("TikTokPortreKamera");
        var kam = kamGo.AddComponent<Camera>();
        kam.enabled = false;
        kam.clearFlags = CameraClearFlags.SolidColor;
        kam.backgroundColor = new Color(0f, 0f, 0f, 0f);
        kam.cullingMask = 1 << KATMAN;
        kam.fieldOfView = 26f;
        kam.nearClipPlane = 0.05f;
        kam.farClipPlane = 5000f;
        kam.targetTexture = rt;
        kam.allowHDR = false;
        kam.allowMSAA = true;

        var isikGo = new GameObject("TikTokPortreIsik");
        var isik = isikGo.AddComponent<Light>();
        isik.type = LightType.Directional;
        isik.cullingMask = 1 << KATMAN;
        isik.intensity = 1.15f;
        isik.shadows = LightShadows.None;
        isikGo.transform.rotation = Quaternion.Euler(35f, 150f, 0f);
        var isik2Go = new GameObject("TikTokPortreIsik2");
        var isik2 = isik2Go.AddComponent<Light>();
        isik2.type = LightType.Directional;
        isik2.cullingMask = 1 << KATMAN;
        isik2.intensity = 0.45f;
        isik2.shadows = LightShadows.None;
        isik2Go.transform.rotation = Quaternion.Euler(20f, -40f, 0f);

        var tutucu = new GameObject("TikTokPortreTutucu");
        tutucu.SetActive(false);   // altindaki kopyalar hic uyanmaz

        if (!string.IsNullOrEmpty(kayitKlasoru))
        {
            try { Directory.CreateDirectory(kayitKlasoru); } catch (Exception) { kayitKlasoru = null; }
        }

        var yapilan = new HashSet<string>();
        foreach (var tur in MobSpawner.Instance.allMobs)
        {
            if (tur == null || tur.mobPrefab == null) continue;
            string ad = tur.name.ToLowerInvariant();
            if (!yapilan.Add(ad)) continue;
            try
            {
                var doku = Cek(tur.mobPrefab, tutucu.transform, kam, rt);
                if (doku == null) continue;
                doku.name = tur.name;
                Doku[ad] = doku;
                if (kayitKlasoru != null)
                    File.WriteAllBytes(Path.Combine(kayitKlasoru, DosyaAdi(tur.name) + ".png"), doku.EncodeToPNG());
            }
            catch (Exception e)
            {
                if (log != null) log("Portre cekilemedi (" + tur.name + "): " + e.Message);
            }
        }

        RenderSettings.fog = sis;
        kam.targetTexture = null;
        RenderTexture.active = null;
        rt.Release();
        UnityEngine.Object.Destroy(rt);
        UnityEngine.Object.Destroy(kamGo);
        UnityEngine.Object.Destroy(isikGo);
        UnityEngine.Object.Destroy(isik2Go);
        UnityEngine.Object.Destroy(tutucu);
        if (log != null) log("Yaratik portreleri hazir: " + Doku.Count);
    }

    private static string DosyaAdi(string ad)
    {
        foreach (char c in Path.GetInvalidFileNameChars()) ad = ad.Replace(c, '_');
        return ad.Replace("(", "").Replace(")", "").Replace(' ', '_');
    }

    private static bool KopyadaAktif(Transform t, Transform kok)
    {
        for (var x = t; x != null; x = x.parent)
        {
            if (!x.gameObject.activeSelf) return false;
            if (x == kok) return true;
        }
        return true;
    }

    private static Texture2D Cek(GameObject prefab, Transform tutucu, Camera kam, RenderTexture rt)
    {
        var kopya = UnityEngine.Object.Instantiate(prefab, tutucu);
        kopya.transform.position = Vector3.zero;
        kopya.transform.rotation = Quaternion.identity;
        PozVer(kopya);
        // kopya'nin kendisi aktif (tutucu pasif oldugu icin hala uyumuyor)
        var poz = new GameObject("TikTokPortre");
        poz.layer = KATMAN;
        var konum = new Vector3(0f, -20000f, 0f);
        poz.transform.position = konum;

        bool var_ = false;
        Bounds sinir = new Bounds();
        foreach (var r in kopya.GetComponentsInChildren<Renderer>(true))
        {
            if (!r.enabled || !KopyadaAktif(r.transform, kopya.transform)) continue;
            Mesh mesh = null;
            Material[] mats = r.sharedMaterials;
            Vector3 olcek = r.transform.lossyScale;
            var smr = r as SkinnedMeshRenderer;
            if (smr != null)
            {
                if (smr.sharedMesh == null) continue;
                mesh = new Mesh { name = "TikTokPisirilmis" };
                smr.BakeMesh(mesh);
                olcek = Vector3.one;   // BakeMesh olcegi zaten icerir
            }
            else if (r is MeshRenderer)
            {
                var mf = r.GetComponent<MeshFilter>();
                if (mf == null || mf.sharedMesh == null) continue;
                mesh = mf.sharedMesh;
            }
            else continue;   // parcacik, cizgi vb. atla

            var parca = new GameObject("parca");
            parca.layer = KATMAN;
            parca.transform.SetParent(poz.transform, false);
            parca.transform.position = konum + r.transform.position - kopya.transform.position;
            parca.transform.rotation = r.transform.rotation;
            parca.transform.localScale = olcek;
            parca.AddComponent<MeshFilter>().sharedMesh = mesh;
            var mr = parca.AddComponent<MeshRenderer>();
            mr.sharedMaterials = mats;
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            mr.receiveShadows = false;
            if (!var_) { sinir = mr.bounds; var_ = true; }
            else sinir.Encapsulate(mr.bounds);
        }
        UnityEngine.Object.DestroyImmediate(kopya);
        if (!var_)
        {
            Temizle(poz);
            return null;
        }

        // 3/4 onden, hafif yukaridan
        float yaricap = sinir.extents.magnitude;
        float uzak = yaricap / Mathf.Sin(kam.fieldOfView * 0.5f * Mathf.Deg2Rad) * 0.92f;
        Vector3 yon = new Vector3(0.55f, 0.28f, 1f).normalized;
        kam.transform.position = sinir.center + yon * uzak;
        kam.transform.LookAt(sinir.center);
        kam.Render();

        var eski = RenderTexture.active;
        RenderTexture.active = rt;
        var doku = new Texture2D(BOYUT, BOYUT, TextureFormat.RGBA32, false);
        doku.ReadPixels(new Rect(0, 0, BOYUT, BOYUT), 0, 0);
        doku.Apply();
        RenderTexture.active = eski;
        // Destroy kare sonuna kadar bekler; hemen silmezsek sonraki yaratigin fotografina girer
        Temizle(poz);
        return Kirp(doku);
    }

    private static void Temizle(GameObject poz)
    {
        foreach (var mf in poz.GetComponentsInChildren<MeshFilter>(true))
            if (mf.sharedMesh != null && mf.sharedMesh.name == "TikTokPisirilmis")
                UnityEngine.Object.DestroyImmediate(mf.sharedMesh);
        UnityEngine.Object.DestroyImmediate(poz);
    }

    // T-poz yerine animasyonun (tercihen idle) bir karesini uygular
    private static void PozVer(GameObject kopya)
    {
        try
        {
            var an = kopya.GetComponentInChildren<Animator>(true);
            if (an == null || an.runtimeAnimatorController == null) return;
            var klipler = an.runtimeAnimatorController.animationClips;
            if (klipler == null || klipler.Length == 0) return;
            AnimationClip sec = null;
            foreach (var c in klipler)
                if (c != null && c.name.ToLowerInvariant().Contains("idle")) { sec = c; break; }
            if (sec == null)
                foreach (var c in klipler)
                    if (c != null && (c.name.ToLowerInvariant().Contains("walk") || c.name.ToLowerInvariant().Contains("run"))) { sec = c; break; }
            if (sec == null) sec = klipler[0];
            if (sec != null) sec.SampleAnimation(an.gameObject, sec.length * 0.25f);
        }
        catch (Exception) { }
    }

    // Seffaf kenarlari kirpar, yaratigi kare bir dokuya ortalar (kartlarda buyuk gorunsun)
    private static Texture2D Kirp(Texture2D t)
    {
        var px = t.GetPixels32();
        int w = t.width, h = t.height, x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
                if (px[y * w + x].a > 10)
                {
                    if (x < x0) x0 = x;
                    if (x > x1) x1 = x;
                    if (y < y0) y0 = y;
                    if (y > y1) y1 = y;
                }
        Texture2D sonuc = t;
        if (x1 >= x0)
        {
            int bw = x1 - x0 + 1, bh = y1 - y0 + 1;
            int kenar = Mathf.Max(bw, bh) + 6;
            var yeni = new Color32[kenar * kenar];
            int ox = (kenar - bw) / 2, oy = 3;   // ortali, alta hizali
            for (int y = 0; y < bh; y++)
                for (int x = 0; x < bw; x++)
                    yeni[(y + oy) * kenar + x + ox] = px[(y + y0) * w + x + x0];
            sonuc = new Texture2D(kenar, kenar, TextureFormat.RGBA32, false);
            sonuc.SetPixels32(yeni);
            sonuc.Apply();
            UnityEngine.Object.Destroy(t);
        }
        sonuc.filterMode = FilterMode.Bilinear;
        sonuc.wrapMode = TextureWrapMode.Clamp;
        return sonuc;
    }
}
