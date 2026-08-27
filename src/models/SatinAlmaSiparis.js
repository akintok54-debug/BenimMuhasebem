const mongoose = require("mongoose");

const Kalem = new mongoose.Schema({
    urunId: { type: mongoose.Schema.Types.ObjectId, ref: "Urun", required: true },
    miktar: { type: Number, required: true, min: 0.0001 },
    birimFiyat: { type: Number, required: true, min: 0 },
    kdv: { type: Number, default: 20, min: 0 },
    iskonto: { type: Number, default: 0, min: 0 },
    toplam: { type: Number, default: 0 }
}, { _id: true });

const SatinAlmaSiparisSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    siparisNo: { type: String, required: true, trim: true, uppercase: true },
    tarih: { type: Date, default: Date.now },
    tedarikciId: { type: mongoose.Schema.Types.ObjectId, ref: "Tedarikci", required: true, index: true },
    kalemler: { type: [Kalem], required: true },
    genelToplam: { type: Number, default: 0, min: 0 },
    durum: { type: String, enum: ["BEKLIYOR", "ONAYLANDI", "TAMAMLANDI", "IPTAL"], default: "BEKLIYOR" },
    notlar: { type: String, trim: true, default: "" },
    kullaniciId: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", default: null }
}, { timestamps: true });

SatinAlmaSiparisSchema.index({ tenantId: 1, siparisNo: 1 }, { unique: true });
module.exports = mongoose.model("SatinAlmaSiparis", SatinAlmaSiparisSchema);
