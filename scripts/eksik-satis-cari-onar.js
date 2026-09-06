require("dotenv").config();
const mongoose = require("mongoose");
const Satis = require("../src/models/Satis");
const Musteri = require("../src/models/Musteri");
const CariHareket = require("../src/models/CariHareket");

const SATIS_ID = "6a918601557902649f1de57c";

async function main() {
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI tanımlı değil.");
    const uygula = process.argv.includes("--apply");
    await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, serverSelectionTimeoutMS: 10000 });
    const satis = await Satis.findById(SATIS_ID).lean();
    if (!satis || satis.durum === "IPTAL") throw new Error("Onarılacak aktif satış bulunamadı.");
    const mevcut = await CariHareket.find({ tenantId: satis.tenantId, kaynakId: satis._id, kaynak: { $in: ["SATIS", "SATIS_TAHSILAT"] }, durum: { $ne: "IPTAL" } }).select("kaynak tip tutar").lean();
    const plan = { mod: uygula ? "UYGULA" : "ONIZLEME", belgeNo: satis.belgeNo, genelToplam: satis.genelToplam, odenenTutar: satis.odenenTutar, mevcut };
    if (!uygula) return process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);

    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const belge = await Satis.findOne({ _id: satis._id, tenantId: satis.tenantId, durum: { $ne: "IPTAL" } }).session(session);
            const musteri = await Musteri.findOne({ _id: belge.musteriId, tenantId: belge.tenantId }).session(session);
            if (!musteri) throw new Error("Satış müşterisi bulunamadı.");
            const bakiye = Number(musteri.bakiye || 0);
            const borcVar = await CariHareket.exists({ tenantId: belge.tenantId, kaynak: "SATIS", kaynakId: belge._id, tip: "BORC", durum: { $ne: "IPTAL" } }).session(session);
            if (!borcVar) await CariHareket.create([{
                tenantId: belge.tenantId, tarafTipi: "MUSTERI", tarafId: musteri._id,
                tip: "BORC", tutar: belge.genelToplam, bakiyeDegisimi: belge.genelToplam,
                oncekiBakiye: bakiye, sonrakiBakiye: bakiye + Number(belge.genelToplam || 0),
                aciklama: `Geçmiş satış cari izi onarımı ${belge.belgeNo}`,
                kaynak: "SATIS", kaynakId: belge._id, belgeNo: belge.belgeNo,
                tarih: belge.tarih || belge.createdAt, islemAnahtari: `ONARIM:${belge._id}:CARI:BORC`
            }], { session });
            const tahsilatVar = await CariHareket.exists({ tenantId: belge.tenantId, kaynak: "SATIS_TAHSILAT", kaynakId: belge._id, tip: "TAHSILAT", durum: { $ne: "IPTAL" } }).session(session);
            if (Number(belge.odenenTutar || 0) > 0 && !tahsilatVar) await CariHareket.create([{
                tenantId: belge.tenantId, tarafTipi: "MUSTERI", tarafId: musteri._id,
                tip: "TAHSILAT", tutar: belge.odenenTutar, bakiyeDegisimi: -Number(belge.odenenTutar || 0),
                oncekiBakiye: bakiye + Number(belge.genelToplam || 0), sonrakiBakiye: bakiye,
                aciklama: `Geçmiş satış tahsilat izi onarımı ${belge.belgeNo}`,
                kaynak: "SATIS_TAHSILAT", kaynakId: belge._id, belgeNo: belge.belgeNo,
                tarih: belge.tarih || belge.createdAt, islemAnahtari: `ONARIM:${belge._id}:CARI:TAHSILAT`
            }], { session });
        });
        process.stdout.write(`${JSON.stringify({ basarili: true, belgeNo: satis.belgeNo, netBakiyeDegisimi: 0 }, null, 2)}\n`);
    } finally {
        await session.endSession();
    }
}

main().catch((error) => {
    process.stderr.write(`Eksik satış cari izi onarılamadı: ${error.message}\n`);
    process.exitCode = 1;
}).finally(() => mongoose.disconnect());
