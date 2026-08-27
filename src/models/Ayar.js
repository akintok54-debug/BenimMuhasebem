const mongoose = require("mongoose");

const EntegrasyonSchema = new mongoose.Schema({
    tip: { type: String, required: true, trim: true, uppercase: true },
    aktif: { type: Boolean, default: false },
    saglayici: { type: String, trim: true, default: "" },
    apiUrl: { type: String, trim: true, default: "" },
    hesapKodu: { type: String, trim: true, default: "" },
    gizliAnahtar: { type: String, default: "", select: false },
    sonTestTarihi: { type: Date, default: null },
    sonTestBasarili: { type: Boolean, default: null }
}, { _id: false });

const BelgeSchema = new mongoose.Schema({
    kullaniciId: { type: mongoose.Schema.Types.ObjectId, required: true },
    faturaSablonu: { type: String, enum: ["modern", "klasik", "kompakt", "ozel"], default: "modern" },
    irsaliyeSablonu: { type: String, enum: ["modern", "klasik", "kompakt", "ozel"], default: "modern" },
    anaRenk: { type: String, default: "#2563eb" },
    vurguRengi: { type: String, default: "#0f172a" },
    logo: { type: String, default: "" },
    belgeBasligi: { type: String, trim: true, maxlength: 100, default: "" },
    dipnot: { type: String, trim: true, maxlength: 500, default: "Belge elektronik ortamda hazırlanmıştır." },
    bankaBilgisiGoster: { type: Boolean, default: true },
    vergiBilgisiGoster: { type: Boolean, default: true },
    imzaAlaniGoster: { type: Boolean, default: true }
}, { _id: false });

const AyarSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, unique: true, index: true },
    genel: {
        paraBirimi: { type: String, enum: ["TRY", "USD", "EUR", "GBP"], default: "TRY" },
        dil: { type: String, enum: ["tr-TR", "en-US"], default: "tr-TR" },
        saatDilimi: { type: String, default: "Europe/Istanbul" },
        varsayilanKdv: { type: Number, min: 0, max: 100, default: 20 },
        faturaSeri: { type: String, trim: true, uppercase: true, maxlength: 10, default: "FTR" },
        irsaliyeSeri: { type: String, trim: true, uppercase: true, maxlength: 10, default: "IRS" },
        teklifGecerlilikGun: { type: Number, min: 1, max: 365, default: 15 },
        negatifStokEngelle: { type: Boolean, default: true },
        otomatikYedekleme: { type: Boolean, default: true },
        ikiAsamaliOnay: { type: Boolean, default: false }
    },
    entegrasyonlar: { type: [EntegrasyonSchema], default: [] },
    belgeAyarlari: { type: [BelgeSchema], default: [] }
}, { timestamps: true });

module.exports = mongoose.model("Ayar", AyarSchema);
