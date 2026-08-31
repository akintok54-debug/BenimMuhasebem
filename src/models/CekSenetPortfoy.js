const mongoose = require("mongoose");

const CekSenetPortfoySchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    tur: { type: String, enum: ["CEK", "SENET"], required: true, index: true },
    hareketTipi: { type: String, enum: ["GIRIS", "IADE"], default: "GIRIS" },
    musteriId: { type: mongoose.Schema.Types.ObjectId, ref: "Musteri", required: true, index: true },
    tutar: { type: Number, required: true, min: 0.01 },
    paraBirimi: { type: String, enum: ["TRY", "USD", "EUR"], default: "TRY" },
    belgeNo: { type: String, trim: true, default: "" },
    vadeTarihi: { type: Date, default: null },
    banka: { type: String, trim: true, default: "" },
    kesideci: { type: String, trim: true, default: "" },
    durum: { type: String, enum: ["PORTFOYDE", "IADE", "TAHSIL_EDILDI", "IPTAL"], default: "PORTFOYDE", index: true },
    kaynak: { type: String, required: true, trim: true },
    kaynakId: { type: mongoose.Schema.Types.ObjectId, required: true },
    aciklama: { type: String, trim: true, default: "" },
    kullaniciId: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", default: null }
}, { timestamps: true });

CekSenetPortfoySchema.index(
    { tenantId: 1, kaynak: 1, kaynakId: 1, tur: 1, hareketTipi: 1 },
    { unique: true }
);
CekSenetPortfoySchema.index({ tenantId: 1, durum: 1, vadeTarihi: 1 });

CekSenetPortfoySchema.plugin(require("./plugins/transactionPlugin"));
module.exports = mongoose.model("CekSenetPortfoy", CekSenetPortfoySchema);
