const mongoose = require("mongoose");

const Musteri = require("../models/Musteri");
const Tedarikci = require("../models/Tedarikci");
const CariHareket = require("../models/CariHareket");
const Kasa = require("../models/Kasa");
const Banka = require("../models/Banka");
const ParaHareket = require("../models/ParaHareket");
const Alis = require("../models/Alis");

const TARAF_MODELLERI = { MUSTERI: Musteri, TEDARIKCI: Tedarikci };
const HESAP_MODELLERI = { KASA: Kasa, BANKA: Banka };

function objectId(value, alan) {
    if (!mongoose.Types.ObjectId.isValid(String(value || ""))) {
        const error = new Error(`Geçersiz ${alan}.`);
        error.status = 400;
        throw error;
    }
    return new mongoose.Types.ObjectId(String(value));
}

function odemeBilgisi(body = {}) {
    const yontem = String(body.odemeYontemi || (body.hesapTipi === "BANKA" ? "KREDI_KARTI" : "NAKIT")).toUpperCase();
    if (!["NAKIT", "KREDI_KARTI", "IBAN", "SENET", "CEK"].includes(yontem)) return null;
    if (yontem === "NAKIT") return { yontem, hesapTipi: "KASA" };
    if (["KREDI_KARTI", "IBAN"].includes(yontem)) return { yontem, hesapTipi: "BANKA" };
    return { yontem, hesapTipi: null };
}

async function hesapBul({ tenantId, hesapTipi, hesapId, aktif = true }) {
    const Model = HESAP_MODELLERI[String(hesapTipi || "").toUpperCase()];
    if (!Model || !mongoose.Types.ObjectId.isValid(String(hesapId || ""))) return null;
    return Model.findOne({
        _id: hesapId,
        tenantId: objectId(tenantId, "tenant"),
        ...(aktif ? { aktif: { $ne: false } } : {})
    });
}

/**
 * Müşteri ve tedarikçi bakiyesi ile buna bağlı cari/kasa hareketlerinin tek yazma noktası.
 * Eski koleksiyonları korur; controller'ların aynı muhasebe kuralını farklı uygulamasını engeller.
 */
async function hareketKaydet({
    tenantId,
    tarafTipi,
    tarafId,
    tip,
    tutar,
    bakiyeDegisimi,
    aciklama = "",
    kaynak = "MANUEL",
    kaynakId = null,
    belgeNo = "",
    odemeYontemi = null,
    tarih = new Date(),
    kullaniciId = null,
    hesap = null,
    paraTipi = null,
    islemAnahtari
}) {
    const tId = objectId(tenantId, "tenant");
    const tarafTuru = String(tarafTipi || "").toUpperCase();
    const Model = TARAF_MODELLERI[tarafTuru];
    const miktar = Number(tutar);
    const degisim = Number(bakiyeDegisimi);
    if (!Model || !Number.isFinite(miktar) || miktar <= 0 || !Number.isFinite(degisim)) {
        const error = new Error("Cari işlem türü, tutarı veya bakiye değişimi geçersiz.");
        error.status = 400;
        throw error;
    }

    const taraf = await Model.findOne({ _id: objectId(tarafId, "cari hesap"), tenantId: tId });
    if (!taraf) {
        const error = new Error(tarafTuru === "TEDARIKCI" ? "Tedarikçi bulunamadı." : "Müşteri bulunamadı.");
        error.status = 404;
        throw error;
    }

    const oncekiBakiye = Number(taraf.bakiye || 0);
    const hesapDegisimi = paraTipi === "GIRIS" ? miktar : paraTipi === "CIKIS" ? -miktar : 0;
    if (hesap && hesapDegisimi < 0 && Number(hesap.bakiye || 0) < miktar) {
        const error = new Error("Ödeme hesabında yeterli bakiye yok.");
        error.status = 409;
        throw error;
    }

    let cariHareket = null;
    let paraHareket = null;
    taraf.bakiye = oncekiBakiye + degisim;
    if (hesap) hesap.bakiye = Number(hesap.bakiye || 0) + hesapDegisimi;

    try {
        await taraf.save();
        if (hesap) await hesap.save();
        cariHareket = await CariHareket.create({
            tenantId: tId, tarafTipi: tarafTuru, tarafId: taraf._id, tip, tutar: miktar,
            bakiyeDegisimi: degisim, oncekiBakiye, sonrakiBakiye: taraf.bakiye,
            aciklama: String(aciklama || "").trim(), kaynak, kaynakId,
            belgeNo: String(belgeNo || "").trim(), odemeYontemi,
            tarih, kullaniciId, islemAnahtari
        });
        if (hesap && paraTipi) {
            paraHareket = await ParaHareket.create({
                tenantId: tId,
                hesapTipi: hesap.constructor.modelName === "Kasa" ? "KASA" : "BANKA",
                hesapId: hesap._id,
                tip: paraTipi,
                tutar: miktar,
                paraBirimi: hesap.paraBirimi || "TRY",
                aciklama: String(aciklama || "").trim(),
                kaynak,
                kaynakId: cariHareket._id,
                belgeNo: String(belgeNo || "").trim(),
                tarih,
                kullaniciId
            });
        }
        return { taraf, cariHareket, paraHareket };
    } catch (error) {
        if (paraHareket?._id) await ParaHareket.deleteOne({ _id: paraHareket._id, tenantId: tId }).catch(() => {});
        if (cariHareket?._id) await CariHareket.deleteOne({ _id: cariHareket._id, tenantId: tId }).catch(() => {});
        taraf.bakiye = oncekiBakiye;
        await taraf.save().catch(() => {});
        if (hesap) {
            hesap.bakiye = Number(hesap.bakiye || 0) - hesapDegisimi;
            await hesap.save().catch(() => {});
        }
        throw error;
    }
}

async function tedarikciAlisKaydet({ tenantId, tedarikciId, genelToplam, odenenTutar = 0, hesap = null, kaynakId, belgeNo, tarih, kullaniciId }) {
    const toplam = Number(genelToplam || 0);
    const odenen = Number(odenenTutar || 0);
    const alis = await hareketKaydet({
        tenantId, tarafTipi: "TEDARIKCI", tarafId: tedarikciId, tip: "ALACAK",
        tutar: toplam, bakiyeDegisimi: toplam, aciklama: `Alış ${belgeNo}`,
        kaynak: "ALIS", kaynakId, belgeNo, tarih, kullaniciId
    });
    if (!odenen) return { taraf: alis.taraf, alisHareketi: alis.cariHareket, odemeHareketi: null, paraHareket: null };
    try {
        const odeme = await hareketKaydet({
            tenantId, tarafTipi: "TEDARIKCI", tarafId: tedarikciId, tip: "ODEME",
            tutar: odenen, bakiyeDegisimi: -odenen, aciklama: `Alış ödemesi ${belgeNo}`,
            kaynak: "ALIS_ODEME", kaynakId, belgeNo, tarih, kullaniciId,
            hesap, paraTipi: hesap ? "CIKIS" : null
        });
        return { taraf: odeme.taraf, alisHareketi: alis.cariHareket, odemeHareketi: odeme.cariHareket, paraHareket: odeme.paraHareket };
    } catch (error) {
        await CariHareket.deleteOne({ _id: alis.cariHareket._id, tenantId: objectId(tenantId, "tenant") }).catch(() => {});
        await Tedarikci.updateOne({ _id: tedarikciId, tenantId: objectId(tenantId, "tenant") }, { $inc: { bakiye: -toplam } }).catch(() => {});
        throw error;
    }
}

async function tedarikciOdemeKaydet({ tenantId, tedarikciId, tutar, hesap = null, belgeNo, aciklama, odemeYontemi, tarih, kullaniciId }) {
    const miktar = Number(tutar || 0);
    const sonuc = await hareketKaydet({
        tenantId, tarafTipi: "TEDARIKCI", tarafId: tedarikciId,
        tip: "ODEME", tutar: miktar, bakiyeDegisimi: -miktar,
        aciklama: aciklama || "Tedarikçi ödemesi", kaynak: "ODEME",
        belgeNo, odemeYontemi, tarih, kullaniciId,
        hesap, paraTipi: hesap ? "CIKIS" : null
    });

    const tId = objectId(tenantId, "tenant");
    const faturalar = await Alis.find({
        tenantId: tId,
        tedarikciId: objectId(tedarikciId, "tedarikçi"),
        kalanTutar: { $gt: 0 }
    }).sort({ tarih: 1, createdAt: 1 });
    let dagitilacak = miktar;
    const guncellemeler = [];
    for (const fatura of faturalar) {
        if (dagitilacak <= 0) break;
        const eskiKalan = Number(fatura.kalanTutar || 0);
        const pay = Math.min(eskiKalan, dagitilacak);
        const yeniKalan = Math.max(0, eskiKalan - pay);
        const yeniOdenen = Math.min(Number(fatura.genelToplam || 0), Number(fatura.odenenTutar || 0) + pay);
        guncellemeler.push({
            updateOne: {
                filter: { _id: fatura._id, tenantId: tId },
                update: { $set: { odenenTutar: yeniOdenen, kalanTutar: yeniKalan, odemeDurumu: yeniKalan <= 0.000001 ? "ODENDI" : "KISMI" } }
            }
        });
        dagitilacak -= pay;
    }

    try {
        if (guncellemeler.length) await Alis.bulkWrite(guncellemeler);
        return { ...sonuc, faturalaraDagitilan: miktar - dagitilacak, avansTutari: Math.max(0, dagitilacak) };
    } catch (error) {
        if (sonuc.paraHareket?._id) await ParaHareket.deleteOne({ _id: sonuc.paraHareket._id, tenantId: tId }).catch(() => {});
        if (sonuc.cariHareket?._id) await CariHareket.deleteOne({ _id: sonuc.cariHareket._id, tenantId: tId }).catch(() => {});
        await Tedarikci.updateOne({ _id: tedarikciId, tenantId: tId }, { $inc: { bakiye: miktar } }).catch(() => {});
        if (hesap) {
            const HesapModeli = hesap.constructor.modelName === "Kasa" ? Kasa : Banka;
            await HesapModeli.updateOne({ _id: hesap._id, tenantId: tId }, { $inc: { bakiye: miktar } }).catch(() => {});
        }
        throw error;
    }
}

module.exports = { odemeBilgisi, hesapBul, hareketKaydet, tedarikciAlisKaydet, tedarikciOdemeKaydet };
