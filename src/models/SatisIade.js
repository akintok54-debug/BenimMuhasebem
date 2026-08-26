const mongoose = require("mongoose");

const SatisIadeSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    belgeNo: { type: String, required: true, trim: true, uppercase: true },
    tarih: { type: Date, default: Date.now },
    musteriId: { type: mongoose.Schema.Types.ObjectId, ref: "Musteri", required: true, index: true },
    depoId: { type: mongoose.Schema.Types.ObjectId, ref: "Depo", required: true },
    kalemler: [{ urunId: { type: mongoose.Schema.Types.ObjectId, ref: "Urun", required: true }, miktar: Number, birimFiyat: Number, kdv: Number, iskonto: Number, toplam: Number }],
    genelToplam: { type: Number, required: true, min: 0 },
    aciklama: { type: String, trim: true, default: "" },
    kullaniciId: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", default: null }
}, { timestamps: true });

SatisIadeSchema.index({ tenantId: 1, belgeNo: 1 }, { unique: true });
module.exports = mongoose.model("SatisIade", SatisIadeSchema);
