require("dotenv").config();
const mongoose = require("mongoose");

const Stok = require("../src/models/Stok");
const StokHareket = require("../src/models/StokHareket");
const Satis = require("../src/models/Satis");
require("../src/models/Urun");

const UYGULA = process.argv.includes("--apply");
const GIRIS_TIPLERI = new Set(["GIRIS", "SAYIM_ARTI", "IADE_GIRIS", "TRANSFER_GIRIS", "DEVIR_GIRIS"]);
const kimlik = (deger) => String(deger?._id || deger || "");
const anahtar = (h) => `${kimlik(h.tenantId)}:${kimlik(h.urunId)}:${kimlik(h.depoId)}`;
const gun = (deger) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(deger));
const yuvarla = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 1000000) / 1000000;

async function hazirla() {
    const [stoklar, hareketler, aktifSatislar] = await Promise.all([
        Stok.find({}).select("tenantId urunId depoId miktar maliyet").populate("urunId", "kod ad alisFiyati").lean(),
        StokHareket.find({}).select("tenantId urunId depoId tip miktar birimMaliyet kaynak kaynakId tarih createdAt").populate("urunId", "kod ad alisFiyati").sort({ createdAt: 1, _id: 1 }).lean(),
        Satis.find({ durum: { $ne: "IPTAL" } }).select("tenantId _id").lean()
    ]);
    const aktifSatisSet = new Set(aktifSatislar.map((x) => `${x.tenantId}:${x._id}`));
    const stokMap = new Map(stoklar.map((s) => [anahtar(s), s]));
    const hareketGruplari = new Map();
    for (const h of hareketler) {
        const key = anahtar(h);
        if (!hareketGruplari.has(key)) hareketGruplari.set(key, []);
        hareketGruplari.get(key).push(h);
    }

    const devirler = [];
    for (const [key, liste] of hareketGruplari) {
        const stok = stokMap.get(key);
        if (!stok) continue;
        const net = yuvarla(liste.reduce((n, h) => n + (GIRIS_TIPLERI.has(h.tip) ? 1 : -1) * Number(h.miktar || 0), 0));
        const fark = yuvarla(Number(stok.miktar || 0) - net);
        if (Math.abs(fark) <= 0.005) continue;
        const ilk = liste.reduce((a, b) => new Date(a.tarih || a.createdAt) < new Date(b.tarih || b.createdAt) ? a : b);
        const maliyet = Number(stok.maliyet || stok.urunId?.alisFiyati || 0);
        devirler.push({
            tenantId: stok.tenantId, urunId: kimlik(stok.urunId), depoId: stok.depoId,
            tip: fark > 0 ? "DEVIR_GIRIS" : "DEVIR_CIKIS", miktar: Math.abs(fark),
            birimMaliyet: maliyet, maliyetDogrulandi: maliyet > 0,
            maliyetKaynagi: maliyet > 0 ? "MEVCUT_STOK_MALIYETI" : "MALIYET_BEKLIYOR",
            kaynak: "BUTUNLUK_ONARIMI", tarih: new Date(new Date(ilk.tarih || ilk.createdAt).getTime() - 1),
            aciklama: "Güncel stok ile hareket defteri arasındaki doğrulanmış miktar farkı için açılış düzeltmesi.",
            islemAnahtari: `stok-butunluk-v1:${key}`,
            urunKodu: stok.urunId?.kod || "", urun: stok.urunId?.ad || ""
        });
    }

    const maliyetGuncellemeleri = new Map();
    const maliyetAta = (h, maliyet, kaynak) => {
        if (!(maliyet > 0) || Number(h.birimMaliyet || 0) > 0) return;
        maliyetGuncellemeleri.set(String(h._id), { hareketId: h._id, urunKodu: h.urunId?.kod || "", urun: h.urunId?.ad || "", maliyet, kaynak });
    };

    for (const h of hareketler) {
        if (Number(h.birimMaliyet || 0) > 0 || h.kaynak !== "ALIS_IPTAL") continue;
        const orijinaller = hareketler.filter((x) => kimlik(x.tenantId) === kimlik(h.tenantId) && x.kaynak === "ALIS" && kimlik(x.kaynakId) === kimlik(h.kaynakId) && kimlik(x.urunId) === kimlik(h.urunId) && kimlik(x.depoId) === kimlik(h.depoId) && Number(x.birimMaliyet || 0) > 0);
        const miktar = orijinaller.reduce((n, x) => n + Number(x.miktar || 0), 0);
        if (miktar > 0) maliyetAta(h, orijinaller.reduce((n, x) => n + Number(x.miktar) * Number(x.birimMaliyet), 0) / miktar, "ORIJINAL_ALIS_HAREKETI");
    }

    for (const h of hareketler) {
        if (Number(h.birimMaliyet || 0) > 0 || h.kaynak !== "SATIS" || !aktifSatisSet.has(`${h.tenantId}:${h.kaynakId}`)) continue;
        const maliyet = Number(h.urunId?.alisFiyati || 0);
        if (!(maliyet > 0)) continue;
        const giris = [...(hareketGruplari.get(anahtar(h)) || [])].reverse().find((x) =>
            GIRIS_TIPLERI.has(x.tip) && Number(x.birimMaliyet || 0) === 0 && gun(x.tarih || x.createdAt) === gun(h.tarih || h.createdAt)
            && new Date(x.createdAt || x.tarih) <= new Date(h.createdAt || h.tarih)
        );
        if (!giris) continue;
        maliyetAta(giris, maliyet, "URUN_KARTI_ESLESMESI");
        maliyetAta(h, maliyet, "URUN_KARTI_ESLESMESI");
    }

    return { devirler, maliyetGuncellemeleri: [...maliyetGuncellemeleri.values()] };
}

async function main() {
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI tanımlı değil.");
    await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, serverSelectionTimeoutMS: 10000 });
    const plan = await hazirla();
    const ozet = {
        mod: UYGULA ? "UYGULA" : "DRY_RUN",
        devirSayisi: plan.devirler.length,
        maliyetGuncellemeSayisi: plan.maliyetGuncellemeleri.length,
        devirler: plan.devirler.map(({ tenantId, urunId, depoId, tip, miktar, birimMaliyet, urunKodu, urun }) => ({ tenantId: String(tenantId), urunId, depoId: String(depoId), tip, miktar, birimMaliyet, urunKodu, urun })),
        maliyetGuncellemeleri: plan.maliyetGuncellemeleri.map(({ hareketId, urunKodu, urun, maliyet, kaynak }) => ({ hareketId: String(hareketId), urunKodu, urun, maliyet: yuvarla(maliyet), kaynak }))
    };
    if (!UYGULA) return process.stdout.write(`${JSON.stringify(ozet, null, 2)}\n`);

    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            for (const d of plan.devirler) {
                const { urunKodu, urun, ...kayit } = d;
                await StokHareket.updateOne({ tenantId: kayit.tenantId, islemAnahtari: kayit.islemAnahtari }, { $setOnInsert: kayit }, { upsert: true, session });
            }
            for (const g of plan.maliyetGuncellemeleri) {
                await StokHareket.updateOne({ _id: g.hareketId, birimMaliyet: { $lte: 0 } }, { $set: { birimMaliyet: yuvarla(g.maliyet), maliyetDogrulandi: true, maliyetKaynagi: g.kaynak } }, { session });
            }
        });
    } finally { await session.endSession(); }
    process.stdout.write(`${JSON.stringify({ ...ozet, sonuc: "TAMAMLANDI" }, null, 2)}\n`);
}

main().catch((error) => {
    process.stderr.write(`Stok defteri onarımı çalıştırılamadı: ${error.message}\n`);
    process.exitCode = 1;
}).finally(() => mongoose.disconnect());
