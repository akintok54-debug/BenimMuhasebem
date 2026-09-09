require("dotenv").config();
const mongoose = require("mongoose");

const Alis = require("../src/models/Alis");
const Satis = require("../src/models/Satis");
const StokHareket = require("../src/models/StokHareket");
const CariHareket = require("../src/models/CariHareket");
const ParaHareket = require("../src/models/ParaHareket");
const CekSenetPortfoy = require("../src/models/CekSenetPortfoy");
const Urun = require("../src/models/Urun");
const Depo = require("../src/models/Depo");
const Musteri = require("../src/models/Musteri");
const Tedarikci = require("../src/models/Tedarikci");
const Kasa = require("../src/models/Kasa");
const Banka = require("../src/models/Banka");
const Siparis = require("../src/models/Siparis");

const anahtar = (...parcalar) => parcalar.map((deger) => String(deger || "")).join(":");
const aktif = { durum: { $ne: "IPTAL" } };

function hataEkle(hatalar, tur, belge, eksik) {
    hatalar.push({ tur, tenantId: String(belge.tenantId), belgeId: String(belge._id), belgeNo: belge.belgeNo, eksik });
}

async function main({ connect = true, output = true } = {}) {
    if (connect && !process.env.MONGODB_URI) throw new Error("MONGODB_URI tanımlı değil.");
    if (connect) await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, serverSelectionTimeoutMS: 10000 });

    const [alislar, satislar, tumAlislar, tumSatislar, siparisler, stoklar, cariler, paralar, portfoyler, urunler, depolar, musteriler, tedarikciler, kasalar, bankalar] = await Promise.all([
        Alis.find(aktif).select("tenantId belgeNo kalemler odenenTutar belgeOdemeTutari belgeOdemeAyrildi hesapId durum").limit(50000).lean(),
        Satis.find(aktif).select("tenantId belgeNo kalemler odenenTutar odemeTipi hesapId durum").limit(50000).lean(),
        Alis.find({}).select("tenantId _id").limit(50000).lean(),
        Satis.find({}).select("tenantId _id").limit(50000).lean(),
        Siparis.find({ satisId: { $ne: null } }).select("tenantId _id satisId").limit(50000).lean(),
        StokHareket.find(aktif).select("tenantId urunId depoId kaynak kaynakId tip").limit(100000).lean(),
        CariHareket.find(aktif).select("tenantId tarafTipi tarafId kaynak kaynakId tip").limit(100000).lean(),
        ParaHareket.find(aktif).select("tenantId hesapTipi hesapId kaynak kaynakId tip").limit(100000).lean(),
        CekSenetPortfoy.find(aktif).select("tenantId kaynak kaynakId tur hareketTipi").limit(50000).lean(),
        Urun.find({}).select("tenantId _id").lean(), Depo.find({}).select("tenantId _id").lean(),
        Musteri.find({}).select("tenantId _id").lean(), Tedarikci.find({}).select("tenantId _id").lean(),
        Kasa.find({}).select("tenantId _id").lean(), Banka.find({}).select("tenantId _id").lean()
    ]);

    const stokSet = new Set(stoklar.map((h) => anahtar(h.tenantId, h.kaynak, h.kaynakId, h.urunId)));
    const cariSet = new Set(cariler.map((h) => anahtar(h.tenantId, h.kaynak, h.kaynakId, h.tip)));
    const paraSet = new Set(paralar.map((h) => anahtar(h.tenantId, h.kaynak, h.kaynakId)));
    const portfoySet = new Set(portfoyler.map((h) => anahtar(h.tenantId, h.kaynak, h.kaynakId, h.tur)));
    const satisSiparisleri = new Map(siparisler.map((siparis) => [anahtar(siparis.tenantId, siparis.satisId), siparis]));
    const belgeSet = new Set([
        ...tumAlislar.map((b) => anahtar(b.tenantId, "ALIS", b._id)),
        ...tumSatislar.map((b) => anahtar(b.tenantId, "SATIS", b._id))
    ]);
    const satisDuzeltmeCikislari = new Set(stoklar.filter(h => h.kaynak === "SATIS_DUZELTME" && h.tip === "SAYIM_EKSI" && Number(h.miktar) > 0).map(h => anahtar(h.tenantId, h.kaynakId, h.urunId)));
    const hatalar = [];

    for (const belge of alislar) {
        for (const urunId of new Set(belge.kalemler.map((k) => String(k.urunId)))) {
            if (!stokSet.has(anahtar(belge.tenantId, "ALIS", belge._id, urunId))) hataEkle(hatalar, "ALIS", belge, `stok hareketi:${urunId}`);
        }
        if (!cariSet.has(anahtar(belge.tenantId, "ALIS", belge._id, "ALACAK"))) hataEkle(hatalar, "ALIS", belge, "tedarikçi borç hareketi");
        if (belge.belgeOdemeAyrildi && Number(belge.belgeOdemeTutari || 0) > 0) {
            if (!cariSet.has(anahtar(belge.tenantId, "ALIS_ODEME", belge._id, "ODEME"))) hataEkle(hatalar, "ALIS", belge, "tedarikçi ödeme hareketi");
            if (belge.hesapId && !paraSet.has(anahtar(belge.tenantId, "ALIS_ODEME", belge._id))) hataEkle(hatalar, "ALIS", belge, "kasa/banka çıkışı");
        }
    }

    for (const belge of satislar) {
        for (const urunId of new Set(belge.kalemler.map((k) => String(k.urunId)))) {
            const siparis = satisSiparisleri.get(anahtar(belge.tenantId, belge._id));
            const dogrudan = stokSet.has(anahtar(belge.tenantId, "SATIS", belge._id, urunId));
            const eskiSiparisIzi = siparis && stokSet.has(anahtar(belge.tenantId, "SIPARIS", siparis._id, urunId));
            const duzeltmeIzi = satisDuzeltmeCikislari.has(anahtar(belge.tenantId, belge._id, urunId));
            if (!dogrudan && !eskiSiparisIzi && !duzeltmeIzi) hataEkle(hatalar, "SATIS", belge, `stok hareketi:${urunId}`);
        }
        if (!cariSet.has(anahtar(belge.tenantId, "SATIS", belge._id, "BORC"))) hataEkle(hatalar, "SATIS", belge, "müşteri borç hareketi");
        if (Number(belge.odenenTutar || 0) > 0) {
            if (!cariSet.has(anahtar(belge.tenantId, "SATIS_TAHSILAT", belge._id, "TAHSILAT"))) hataEkle(hatalar, "SATIS", belge, "müşteri tahsilat hareketi");
            if (belge.hesapId && !paraSet.has(anahtar(belge.tenantId, "SATIS", belge._id))) hataEkle(hatalar, "SATIS", belge, "kasa/banka girişi");
            if (["CEK", "SENET"].includes(belge.odemeTipi) && !portfoySet.has(anahtar(belge.tenantId, "SATIS", belge._id, belge.odemeTipi))) hataEkle(hatalar, "SATIS", belge, "çek/senet portföy kaydı");
        }
    }

    const urunSet = new Set(urunler.map((x) => anahtar(x.tenantId, x._id)));
    const depoSet = new Set(depolar.map((x) => anahtar(x.tenantId, x._id)));
    const musteriSet = new Set(musteriler.map((x) => anahtar(x.tenantId, x._id)));
    const tedarikciSet = new Set(tedarikciler.map((x) => anahtar(x.tenantId, x._id)));
    const kasaSet = new Set(kasalar.map((x) => anahtar(x.tenantId, x._id)));
    const bankaSet = new Set(bankalar.map((x) => anahtar(x.tenantId, x._id)));
    const kopukReferanslar = [];
    for (const h of stoklar) {
        if (!urunSet.has(anahtar(h.tenantId, h.urunId)) || !depoSet.has(anahtar(h.tenantId, h.depoId))) kopukReferanslar.push({ koleksiyon: "stokHareket", id: String(h._id), tenantId: String(h.tenantId) });
    }
    for (const h of cariler) {
        const set = h.tarafTipi === "MUSTERI" ? musteriSet : tedarikciSet;
        if (!set.has(anahtar(h.tenantId, h.tarafId))) kopukReferanslar.push({ koleksiyon: "cariHareket", id: String(h._id), tenantId: String(h.tenantId) });
    }
    for (const h of paralar) {
        const set = h.hesapTipi === "KASA" ? kasaSet : bankaSet;
        if (!set.has(anahtar(h.tenantId, h.hesapId))) kopukReferanslar.push({ koleksiyon: "paraHareket", id: String(h._id), tenantId: String(h.tenantId) });
    }
    const yetimBelgeHareketleri = [
        ...stoklar.filter((h) => ["ALIS", "SATIS"].includes(h.kaynak) && !belgeSet.has(anahtar(h.tenantId, h.kaynak, h.kaynakId))),
        ...cariler.filter((h) => ["ALIS", "SATIS"].includes(h.kaynak) && !belgeSet.has(anahtar(h.tenantId, h.kaynak, h.kaynakId))),
        ...paralar.filter((h) => ["ALIS", "SATIS"].includes(h.kaynak) && !belgeSet.has(anahtar(h.tenantId, h.kaynak, h.kaynakId)))
    ].map((h) => ({ kaynak: h.kaynak, tenantId: String(h.tenantId), hareketId: String(h._id), kaynakId: String(h.kaynakId) }));

    const sonuc = {
        saltOkunur: true,
        tamTarama: alislar.length < 50000 && satislar.length < 50000 && tumAlislar.length < 50000 && tumSatislar.length < 50000 && siparisler.length < 50000 && stoklar.length < 100000 && cariler.length < 100000 && paralar.length < 100000 && portfoyler.length < 50000,
        kapsam: { alis: alislar.length, satis: satislar.length, stokHareket: stoklar.length, cariHareket: cariler.length, paraHareket: paralar.length },
        ozet: { eksikBelgeBaglantisi: hatalar.length, kopukReferans: kopukReferanslar.length, yetimBelgeHareketi: yetimBelgeHareketleri.length },
        hatalar: output ? hatalar.slice(0, 200) : hatalar, kopukReferanslar: output ? kopukReferanslar.slice(0, 200) : kopukReferanslar, yetimBelgeHareketleri: output ? yetimBelgeHareketleri.slice(0, 200) : yetimBelgeHareketleri
    };
    if (output) process.stdout.write(`${JSON.stringify(sonuc, null, 2)}\n`);
    if (output && (hatalar.length || kopukReferanslar.length || yetimBelgeHareketleri.length)) process.exitCode = 2;
    return sonuc;
}

if (require.main === module) main().catch((error) => {
    process.stderr.write(`Muhasebe bütünlük auditi çalıştırılamadı: ${error.message}\n`);
    process.exitCode = 1;
}).finally(() => mongoose.disconnect());

module.exports = { run: main };
