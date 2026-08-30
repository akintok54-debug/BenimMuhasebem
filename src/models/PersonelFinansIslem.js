const mongoose = require("mongoose");

const PersonelFinansIslemSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    personelId: { type: mongoose.Schema.Types.ObjectId, ref: "Personel", required: true, index: true },
    tur: {
        type: String,
        enum: ["MAAS_TAHAKKUK", "PRIM_TAHAKKUK", "MAAS_ODEME", "PRIM_ODEME", "AVANS_ODEME", "AVANS_TAHSILAT", "AVANS_MAHSUP", "KESINTI"],
        required: true,
        index: true
    },
    tarih: { type: Date, required: true, default: Date.now },
    donem: { type: String, trim: true, default: "", index: true },
    tutar: { type: Number, required: true, min: 0.01 },
    paraBirimi: { type: String, enum: ["TRY", "USD", "EUR"], default: "TRY" },
    aciklama: { type: String, trim: true, default: "" },
    belgeNo: { type: String, trim: true, default: "" },
    hesapTipi: { type: String, enum: ["KASA", "BANKA", null], default: null },
    hesapId: { type: mongoose.Schema.Types.ObjectId, default: null },
    paraHareketId: { type: mongoose.Schema.Types.ObjectId, ref: "ParaHareket", default: null },
    masrafId: { type: mongoose.Schema.Types.ObjectId, ref: "Masraf", default: null },
    durum: { type: String, enum: ["AKTIF", "IPTAL"], default: "AKTIF", index: true },
    iptalTarihi: { type: Date, default: null },
    iptalNedeni: { type: String, trim: true, default: "" },
    iptalParaHareketId: { type: mongoose.Schema.Types.ObjectId, ref: "ParaHareket", default: null },
    olusturanKullaniciId: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", default: null },
    iptalEdenKullaniciId: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", default: null }
}, { timestamps: true });

PersonelFinansIslemSchema.index({ tenantId: 1, personelId: 1, tarih: -1 });
PersonelFinansIslemSchema.index(
    { tenantId: 1, personelId: 1, tur: 1, donem: 1 },
    { unique: true, partialFilterExpression: { tur: "MAAS_TAHAKKUK", durum: "AKTIF" } }
);

module.exports = mongoose.model("PersonelFinansIslem", PersonelFinansIslemSchema);
