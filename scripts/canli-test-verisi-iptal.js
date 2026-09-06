require("dotenv").config();
const mongoose = require("mongoose");
const Satis = require("../src/models/Satis");
const SatisIade = require("../src/models/SatisIade");
const Siparis = require("../src/models/Siparis");
const Musteri = require("../src/models/Musteri");
const Tedarikci = require("../src/models/Tedarikci");
const Stok = require("../src/models/Stok");
const StokHareket = require("../src/models/StokHareket");
const CariHareket = require("../src/models/CariHareket");

const TENANT_ID = "6a8dc53a3ff8c8a32ff9545b";
const TEST_MUSTERI_IDS = ["6a8dc8ee2052493c70e1fede", "6a8f6ab13899dc0b8502c379"];
const TEST_TEDARIKCI_IDS = ["6a8dc994b80aec6dd8a9820f"];
const NEDEN = "Canlı son kullanıcı teslimi öncesi test verisi iptali";

function grupla(kalemler = []) {
    const sonuc = new Map();
    for (const kalem of kalemler) {
        const id = String(kalem.urunId);
        sonuc.set(id, Number(sonuc.get(id) || 0) + Number(kalem.miktar || 0));
    }
    return sonuc;
}

async function cariSifirla(Model, tarafTipi, tarafId, tenantId, session) {
    const taraf = await Model.findOne({ _id: tarafId, tenantId }).session(session);
    if (!taraf) return null;
    const oncekiBakiye = Number(taraf.bakiye || 0);
    if (Math.abs(oncekiBakiye) > 0.000001) {
        taraf.bakiye = 0;
        await CariHareket.create([{
            tenantId, tarafTipi, tarafId: taraf._id, tip: "DUZELTME",
            tutar: Math.abs(oncekiBakiye), bakiyeDegisimi: -oncekiBakiye,
            oncekiBakiye, sonrakiBakiye: 0, aciklama: NEDEN,
            kaynak: "BAKIYE_DUZELTME", belgeNo: "TEST-TEMIZLIK",
            islemAnahtari: `TESLIM:TEST:CARI:${tarafTipi}:${taraf._id}`,
            tarih: new Date()
        }], { session });
    }
    taraf.aktif = false;
    taraf.notlar = [String(taraf.notlar || "").trim(), NEDEN].filter(Boolean).join("\n");
    await taraf.save({ session });
    return { id: String(taraf._id), oncekiBakiye };
}

async function main() {
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI tanımlı değil.");
    const uygula = process.argv.includes("--apply");
    await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, serverSelectionTimeoutMS: 10000 });
    const tenantId = new mongoose.Types.ObjectId(TENANT_ID);
    const musteriIds = TEST_MUSTERI_IDS.map((id) => new mongoose.Types.ObjectId(id));
    const tedarikciIds = TEST_TEDARIKCI_IDS.map((id) => new mongoose.Types.ObjectId(id));
    const [satislar, iadeler, musteriler, tedarikciler] = await Promise.all([
        Satis.find({ tenantId, musteriId: { $in: musteriIds }, durum: { $ne: "IPTAL" } }).select("belgeNo musteriId depoId kalemler genelToplam kalanTutar").lean(),
        SatisIade.find({ tenantId, musteriId: { $in: musteriIds }, durum: { $ne: "IPTAL" } }).select("belgeNo musteriId depoId kalemler genelToplam").lean(),
        Musteri.find({ tenantId, _id: { $in: musteriIds } }).select("kod unvan bakiye aktif").lean(),
        Tedarikci.find({ tenantId, _id: { $in: tedarikciIds } }).select("kod unvan bakiye aktif").lean()
    ]);
    const plan = {
        mod: uygula ? "UYGULA" : "ONIZLEME",
        satislar: satislar.map((x) => ({ id: String(x._id), belgeNo: x.belgeNo, toplam: x.genelToplam })),
        iadeler: iadeler.map((x) => ({ id: String(x._id), belgeNo: x.belgeNo, toplam: x.genelToplam })),
        musteriler, tedarikciler
    };
    if (!uygula) {
        process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
        return;
    }

    const session = await mongoose.startSession();
    const sonuc = { iptalSatis: [], iptalIade: [], iptalSiparis: [], sifirlananCariler: [] };
    try {
        await session.withTransaction(async () => {
            for (const iadeOzet of iadeler) {
                const iade = await SatisIade.findOne({ _id: iadeOzet._id, tenantId, durum: { $ne: "IPTAL" } }).session(session);
                if (!iade) continue;
                for (const [urunId, miktar] of grupla(iade.kalemler)) {
                    const stok = await Stok.findOneAndUpdate(
                        { tenantId, urunId, depoId: iade.depoId, miktar: { $gte: miktar } },
                        { $inc: { miktar: -miktar }, $set: { sonHareketTarihi: new Date() } },
                        { new: true, session }
                    );
                    if (!stok) throw new Error(`Test iadesi iptali için stok yetersiz: ${iade.belgeNo}/${urunId}`);
                    await StokHareket.create([{
                        tenantId, urunId, depoId: iade.depoId, tip: "CIKIS", miktar,
                        tarih: new Date(), birimMaliyet: Number(stok.maliyet || 0),
                        maliyetDogrulandi: Number(stok.maliyet || 0) > 0, maliyetKaynagi: "TEST_TEMIZLIK",
                        kaynak: "SATIS_IADE_IPTAL", kaynakId: iade._id,
                        islemAnahtari: `TESLIM:TEST:STOK:IADE:${iade._id}:${urunId}`,
                        aciklama: `${NEDEN}: ${iade.belgeNo}`
                    }], { session });
                }
                await Musteri.updateOne({ _id: iade.musteriId, tenantId }, { $inc: { bakiye: Number(iade.genelToplam || 0) } }, { session });
                iade.durum = "IPTAL"; iade.iptalTarihi = new Date(); iade.iptalNedeni = NEDEN;
                await iade.save({ session });
                sonuc.iptalIade.push(iade.belgeNo);
            }

            for (const satisOzet of satislar) {
                const satis = await Satis.findOne({ _id: satisOzet._id, tenantId, durum: { $ne: "IPTAL" } }).session(session);
                if (!satis) continue;
                for (const [urunId, miktar] of grupla(satis.kalemler)) {
                    const stok = await Stok.findOneAndUpdate(
                        { tenantId, urunId, depoId: satis.depoId },
                        { $inc: { miktar }, $set: { sonHareketTarihi: new Date() } },
                        { new: true, upsert: true, setDefaultsOnInsert: true, session }
                    );
                    await StokHareket.create([{
                        tenantId, urunId, depoId: satis.depoId, tip: "GIRIS", miktar,
                        tarih: new Date(), birimMaliyet: Number(stok.maliyet || 0),
                        maliyetDogrulandi: Number(stok.maliyet || 0) > 0, maliyetKaynagi: "TEST_TEMIZLIK",
                        kaynak: "SATIS_IPTAL", kaynakId: satis._id,
                        islemAnahtari: `TESLIM:TEST:STOK:SATIS:${satis._id}:${urunId}`,
                        aciklama: `${NEDEN}: ${satis.belgeNo}`
                    }], { session });
                }
                const geriAlinanCari = Number(satis.kalanTutar ?? satis.genelToplam ?? 0);
                if (geriAlinanCari > 0) await Musteri.updateOne({ _id: satis.musteriId, tenantId }, { $inc: { bakiye: -geriAlinanCari } }, { session });
                satis.durum = "IPTAL"; satis.iptalTarihi = new Date(); satis.iptalNedeni = NEDEN;
                await satis.save({ session });
                const siparisler = await Siparis.find({ tenantId, satisId: satis._id, durum: { $ne: "IPTAL" } }).session(session);
                for (const siparis of siparisler) {
                    siparis.durum = "IPTAL";
                    siparis.notlar = [String(siparis.notlar || "").trim(), NEDEN].filter(Boolean).join("\n");
                    await siparis.save({ session });
                    sonuc.iptalSiparis.push(siparis.siparisNo);
                }
                sonuc.iptalSatis.push(satis.belgeNo);
            }

            for (const id of musteriIds) {
                const kayit = await cariSifirla(Musteri, "MUSTERI", id, tenantId, session);
                if (kayit) sonuc.sifirlananCariler.push(kayit);
            }
            for (const id of tedarikciIds) {
                const kayit = await cariSifirla(Tedarikci, "TEDARIKCI", id, tenantId, session);
                if (kayit) sonuc.sifirlananCariler.push(kayit);
            }
        });
        process.stdout.write(`${JSON.stringify({ basarili: true, ...sonuc }, null, 2)}\n`);
    } finally {
        await session.endSession();
    }
}

main().catch((error) => {
    process.stderr.write(`Test verisi iptal edilemedi: ${error.message}\n`);
    process.exitCode = 1;
}).finally(() => mongoose.disconnect());
