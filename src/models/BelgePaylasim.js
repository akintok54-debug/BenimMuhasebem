const mongoose = require("mongoose");

const BelgePaylasimSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true, select: false },
    tur: { type: String, enum: ["KATALOG", "TEKLIF", "SIPARIS"], required: true },
    baslik: { type: String, required: true, trim: true, maxlength: 160 },
    firma: { type: mongoose.Schema.Types.Mixed, default: {} },
    belge: { type: mongoose.Schema.Types.Mixed, required: true },
    sonGecerlilikTarihi: { type: Date, required: true, index: { expires: 0 } },
    aktif: { type: Boolean, default: true, index: true },
    goruntulenmeSayisi: { type: Number, default: 0, min: 0 },
    sonGoruntulenmeTarihi: { type: Date, default: null },
    kullaniciId: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", default: null }
}, { timestamps: true });

BelgePaylasimSchema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.model("BelgePaylasim", BelgePaylasimSchema);
