const mongoose = require("mongoose");

const StokSayimSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    belgeNo: { type: String, required: true, trim: true, uppercase: true },
    tarih: { type: Date, default: Date.now, index: true },
    depoId: { type: mongoose.Schema.Types.ObjectId, ref: "Depo", required: true },
    durum: { type: String, enum: ["TAMAMLANDI"], default: "TAMAMLANDI" },
    kalemler: [{
        urunId: { type: mongoose.Schema.Types.ObjectId, ref: "Urun", required: true },
        sistemMiktari: { type: Number, required: true, min: 0 },
        sayilanMiktar: { type: Number, required: true, min: 0 },
        fark: { type: Number, required: true },
        birimMaliyet: { type: Number, default: 0, min: 0 }
    }],
    aciklama: { type: String, trim: true, default: "" },
    kullaniciId: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", default: null }
}, { timestamps: true });

StokSayimSchema.index({ tenantId: 1, belgeNo: 1 }, { unique: true });

module.exports = mongoose.model("StokSayim", StokSayimSchema);
