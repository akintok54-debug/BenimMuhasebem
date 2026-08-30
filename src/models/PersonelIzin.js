const mongoose = require("mongoose");

const PersonelIzinSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    personelId: { type: mongoose.Schema.Types.ObjectId, ref: "Personel", required: true, index: true },
    tur: { type: String, enum: ["YILLIK", "MAZERET", "HASTALIK", "UCRETSIZ", "DOGUM", "DIGER"], default: "YILLIK" },
    baslangicTarihi: { type: Date, required: true },
    bitisTarihi: { type: Date, required: true },
    gun: { type: Number, required: true, min: 0.5, max: 365 },
    durum: { type: String, enum: ["BEKLIYOR", "ONAYLANDI", "REDDEDILDI", "IPTAL"], default: "BEKLIYOR", index: true },
    aciklama: { type: String, trim: true, default: "" },
    kararNotu: { type: String, trim: true, default: "" },
    olusturanKullaniciId: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", default: null },
    kararVerenKullaniciId: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", default: null },
    kararTarihi: { type: Date, default: null }
}, { timestamps: true });

PersonelIzinSchema.index({ tenantId: 1, personelId: 1, baslangicTarihi: -1 });
PersonelIzinSchema.index({ tenantId: 1, durum: 1, baslangicTarihi: -1 });
module.exports = mongoose.model("PersonelIzin", PersonelIzinSchema);
