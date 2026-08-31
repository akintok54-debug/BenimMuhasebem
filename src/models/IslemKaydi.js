const mongoose = require("mongoose");

const IslemKaydiSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    transactionId: { type: String, required: true, trim: true, maxlength: 160 },
    kapsam: { type: String, required: true, trim: true, maxlength: 80 },
    durum: { type: String, enum: ["ISLENIYOR", "TAMAMLANDI", "BASARISIZ"], default: "ISLENIYOR", index: true },
    httpStatus: { type: Number, default: null },
    yanit: { type: mongoose.Schema.Types.Mixed, default: null },
    tamamlanmaTarihi: { type: Date, default: null }
}, { timestamps: true });

IslemKaydiSchema.index({ tenantId: 1, transactionId: 1 }, { unique: true });
IslemKaydiSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

module.exports = mongoose.model("IslemKaydi", IslemKaydiSchema);
