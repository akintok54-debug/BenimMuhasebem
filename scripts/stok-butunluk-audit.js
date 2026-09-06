require("dotenv").config();
const mongoose = require("mongoose");

const Stok = require("../src/models/Stok");
const StokHareket = require("../src/models/StokHareket");
const Satis = require("../src/models/Satis");
require("../src/models/Urun");
require("../src/models/Depo");
require("../src/models/Musteri");

const GIRIS_TIPLERI = new Set(["GIRIS", "SAYIM_ARTI", "IADE_GIRIS", "TRANSFER_GIRIS", "DEVIR_GIRIS"]);
const kimlik = (deger) => String(deger?._id || deger || "");
const anahtar = (h) => `${kimlik(h.tenantId)}:${kimlik(h.urunId)}:${kimlik(h.depoId)}`;
const yuvarla = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 1000000) / 1000000;

async function main() {
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI tanımlı değil.");
    await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, serverSelectionTimeoutMS: 10000 });

    const [stoklar, hareketHam, aktifSatislar] = await Promise.all([
        Stok.find({}).select("tenantId urunId depoId miktar maliyet").populate("urunId", "kod ad").populate("depoId", "kod ad").lean(),
        StokHareket.find({}).select("tenantId urunId depoId tip miktar birimMaliyet maliyetDogrulandi maliyetKaynagi kaynak kaynakId tarih createdAt durum").populate("urunId", "kod ad alisFiyati").lean(),
        Satis.find({ durum: { $ne: "IPTAL" } }).select("tenantId _id belgeNo tarih musteriId genelToplam").populate("musteriId", "kod unvan adSoyad aktif").lean()
    ]);
    const tarihYaz = (deger) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(deger));
    const hareketler = hareketHam.sort((a, b) => tarihYaz(a.tarih || a.createdAt).localeCompare(tarihYaz(b.tarih || b.createdAt)) || new Date(a.createdAt || a.tarih) - new Date(b.createdAt || b.tarih) || String(a._id).localeCompare(String(b._id)));
    const aktifSatisSet = new Set(aktifSatislar.map((x) => `${x.tenantId}:${x._id}`));
    const aktifSatisMap = new Map(aktifSatislar.map((x) => [`${x.tenantId}:${x._id}`, x]));

    const mevcut = new Map(stoklar.map((s) => [anahtar(s), s]));
    const zincir = new Map();
    const maliyetiEksik = [];
    const satisMaliyetiEksik = [];

    for (const h of hareketler) {
        const key = anahtar(h);
        const kayit = zincir.get(key) || { net: 0, minimum: 0, ilkTarih: h.tarih || h.createdAt, hareketSayisi: 0, akis: [] };
        const yon = GIRIS_TIPLERI.has(h.tip) ? 1 : -1;
        kayit.net = yuvarla(kayit.net + yon * Number(h.miktar || 0));
        kayit.minimum = Math.min(kayit.minimum, kayit.net);
        kayit.hareketSayisi += 1;
        kayit.akis.push({ hareketId: String(h._id), tip: h.tip, miktar: h.miktar, kaynak: h.kaynak, kaynakId: h.kaynakId ? String(h.kaynakId) : null, tarih: h.tarih || h.createdAt });
        zincir.set(key, kayit);

        if (!(Number(h.birimMaliyet || 0) > 0)) {
            const stok = mevcut.get(key);
            const ozet = { tenantId: String(h.tenantId), hareketId: String(h._id), urunId: kimlik(h.urunId), urunKodu: h.urunId?.kod || "", urun: h.urunId?.ad || "", urunAlisFiyati: Number(h.urunId?.alisFiyati || 0), stokMaliyeti: Number(stok?.maliyet || 0), kaynak: h.kaynak, kaynakId: h.kaynakId ? String(h.kaynakId) : null, tip: h.tip, miktar: h.miktar, tarih: h.tarih || h.createdAt };
            maliyetiEksik.push(ozet);
            if (h.tip === "CIKIS" && h.kaynak === "SATIS" && aktifSatisSet.has(`${h.tenantId}:${h.kaynakId}`)) {
                const satis = aktifSatisMap.get(`${h.tenantId}:${h.kaynakId}`);
                satisMaliyetiEksik.push({ ...ozet, belgeNo: satis?.belgeNo || "", musteriKodu: satis?.musteriId?.kod || "", musteri: satis?.musteriId?.unvan || satis?.musteriId?.adSoyad || "", musteriAktif: satis?.musteriId?.aktif !== false, belgeToplami: satis?.genelToplam });
            }
        }
    }

    const uyusmazliklar = [];
    const tumAnahtarlar = new Set([...mevcut.keys(), ...zincir.keys()]);
    for (const key of tumAnahtarlar) {
        const stok = mevcut.get(key);
        const hareket = zincir.get(key) || { net: 0, minimum: 0, hareketSayisi: 0 };
        const stokMiktari = Number(stok?.miktar || 0);
        const fark = yuvarla(stokMiktari - Number(hareket.net || 0));
        if (Math.abs(fark) <= 0.005 && hareket.minimum >= -0.005) continue;
        uyusmazliklar.push({
            tenantId: String(stok?.tenantId || key.split(":")[0]),
            urunId: String(stok?.urunId?._id || stok?.urunId || key.split(":")[1]),
            urunKodu: stok?.urunId?.kod || "",
            urun: stok?.urunId?.ad || "",
            depoId: String(stok?.depoId?._id || stok?.depoId || key.split(":")[2]),
            depo: stok?.depoId?.ad || "",
            stokMiktari: yuvarla(stokMiktari),
            hareketNeti: yuvarla(hareket.net),
            fark,
            zincirMinimumu: yuvarla(hareket.minimum),
            hareketSayisi: hareket.hareketSayisi,
            hareketAkisi: hareket.akis
        });
    }

    const sonuc = {
        saltOkunur: true,
        kapsam: { stok: stoklar.length, stokHareket: hareketler.length },
        ozet: { uyusmazlik: uyusmazliklar.length, maliyetiEksikHareket: maliyetiEksik.length, satisMaliyetiEksik: satisMaliyetiEksik.length },
        uyusmazliklar: uyusmazliklar.slice(0, 500),
        satisMaliyetiEksik: satisMaliyetiEksik.slice(0, 500),
        maliyetiEksik: maliyetiEksik.slice(0, 500)
    };
    process.stdout.write(`${JSON.stringify(sonuc, null, 2)}\n`);
    if (uyusmazliklar.length || satisMaliyetiEksik.length) process.exitCode = 2;
}

main().catch((error) => {
    process.stderr.write(`Stok bütünlük auditi çalıştırılamadı: ${error.message}\n`);
    process.exitCode = 1;
}).finally(() => mongoose.disconnect());
