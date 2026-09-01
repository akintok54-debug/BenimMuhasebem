const mongoose = require("mongoose");

const Kalem = new mongoose.Schema({
    urunId: { type: mongoose.Schema.Types.ObjectId, ref: "Urun", required: true },
    miktar: { type: Number, required: true, min: 0.0001 },
    birimFiyat: { type: Number, required: true, min: 0 },
    kdv: { type: Number, default: 20, min: 0 },
    iskonto: { type: Number, default: 0, min: 0 },
    toplam: { type: Number, default: 0 }
}, { _id: true });

const AlisIadeSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    belgeNo: { type: String, required: true, trim: true, uppercase: true },
    tarih: { type: Date, default: Date.now },
    tedarikciId: { type: mongoose.Schema.Types.ObjectId, ref: "Tedarikci", required: true, index: true },
    depoId: { type: mongoose.Schema.Types.ObjectId, ref: "Depo", required: true },
    kalemler: { type: [Kalem], required: true },
    genelToplam: { type: Number, default: 0, min: 0 },
    aciklama: { type: String, trim: true, default: "" },
    kullaniciId: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", default: null },
    durum: { type: String, enum: ["AKTIF", "IPTAL_ISLENIYOR", "IPTAL"], default: "AKTIF", index: true },
    iptalTarihi: { type: Date, default: null },
    iptalNedeni: { type: String, trim: true, default: "" },
    iptalEdenKullaniciId: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", default: null }
}, { timestamps: true });

AlisIadeSchema.index({ tenantId: 1, belgeNo: 1 }, { unique: true });
AlisIadeSchema.plugin(require("./plugins/transactionPlugin"));
module.exports = mongoose.model("AlisIade", AlisIadeSchema);
