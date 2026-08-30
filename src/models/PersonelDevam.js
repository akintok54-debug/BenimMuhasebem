const mongoose = require("mongoose");

const PersonelDevamSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    personelId: { type: mongoose.Schema.Types.ObjectId, ref: "Personel", required: true, index: true },
    tarih: { type: Date, required: true, index: true },
    durum: { type: String, enum: ["GELDI", "GEC", "GELMEDI", "IZINLI", "RAPORLU", "UZAKTAN"], default: "GELDI" },
    girisSaati: { type: String, trim: true, default: "" },
    cikisSaati: { type: String, trim: true, default: "" },
    calismaDakika: { type: Number, default: 0, min: 0, max: 1440 },
    notlar: { type: String, trim: true, default: "" },
    kaydedenKullaniciId: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", default: null }
}, { timestamps: true });

PersonelDevamSchema.index({ tenantId: 1, personelId: 1, tarih: 1 }, { unique: true });
PersonelDevamSchema.index({ tenantId: 1, tarih: -1, durum: 1 });
module.exports = mongoose.model("PersonelDevam", PersonelDevamSchema);
