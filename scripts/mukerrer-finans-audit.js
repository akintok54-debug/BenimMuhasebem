require("dotenv").config();
const mongoose = require("mongoose");

const CariHareket = require("../src/models/CariHareket");
const ParaHareket = require("../src/models/ParaHareket");
const StokHareket = require("../src/models/StokHareket");
const CekSenetPortfoy = require("../src/models/CekSenetPortfoy");

async function adaylar(Model, alanlar, { transactionOnly = false } = {}) {
    const id = Object.fromEntries(alanlar.map(alan => [alan, `$${alan}`]));
    const match = transactionOnly
        ? { transactionId: { $exists: true, $nin: [null, ""] } }
        : { kaynakId: { $exists: true, $ne: null } };
    return Model.aggregate([
        { $match: match },
        { $sort: { createdAt: -1 } },
        { $limit: 50000 },
        { $group: { _id: id, adet: { $sum: 1 }, kayitlar: { $push: "$_id" } } },
        { $match: { adet: { $gt: 1 } } },
        { $project: { _id: 0, anahtar: "$_id", adet: 1, kayitlar: { $slice: ["$kayitlar", 10] } } },
        { $limit: 100 }
    ]).option({ maxTimeMS: 15000, allowDiskUse: true });
}

async function main() {
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI tanımlı değil.");
    await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, serverSelectionTimeoutMS: 10000 });
    const tanimlar = {
        transactionCari: [CariHareket, ["tenantId", "transactionId", "tarafTipi", "tarafId", "tip", "kaynak"], { transactionOnly: true }],
        transactionPara: [ParaHareket, ["tenantId", "transactionId", "hesapTipi", "hesapId", "tip", "kaynak"], { transactionOnly: true }],
        transactionStok: [StokHareket, ["tenantId", "transactionId", "urunId", "depoId", "tip", "kaynak"], { transactionOnly: true }],
        legacyCariKaynak: [CariHareket, ["tenantId", "kaynak", "kaynakId", "tarafTipi", "tarafId", "tip"], {}],
        legacyParaKaynak: [ParaHareket, ["tenantId", "kaynak", "kaynakId", "hesapTipi", "hesapId", "tip"], {}],
        legacyStokKaynak: [StokHareket, ["tenantId", "kaynak", "kaynakId", "urunId", "depoId", "tip"], {}],
        legacyCekSenetKaynak: [CekSenetPortfoy, ["tenantId", "kaynak", "kaynakId", "tur", "hareketTipi"], {}]
    };
    const sonuclar = await Promise.all(Object.values(tanimlar).map(args => adaylar(...args)));
    const kontroller = Object.fromEntries(Object.keys(tanimlar).map((key, index) => [key, sonuclar[index]]));
    for (const aday of kontroller.legacyStokKaynak) {
        aday.hareketDetayi = await StokHareket.find({ _id: { $in: aday.kayitlar } })
            .select("miktar birimMaliyet maliyetKaynagi aciklama tarih createdAt islemAnahtari")
            .sort({ createdAt: 1 })
            .lean();
    }
    const ozet = Object.fromEntries(Object.entries(kontroller).map(([key, value]) => [key, value.length]));
    process.stdout.write(`${JSON.stringify({ saltOkunur: true, orneklem: "Her koleksiyondaki en yeni 50.000 uygun kayıt", ozet, adaylar: kontroller }, null, 2)}\n`);
    await mongoose.disconnect();
}

main().catch(async error => {
    process.stderr.write(`Mükerrer audit çalıştırılamadı: ${error.message}\n`);
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
});
