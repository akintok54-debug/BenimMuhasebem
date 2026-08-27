const mongoose = require("mongoose");

const UrunKategoriSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    ad: { type: String, required: true, trim: true },
    aktif: { type: Boolean, default: true }
}, { timestamps: true });

UrunKategoriSchema.index({ tenantId: 1, ad: 1 }, { unique: true });

module.exports = mongoose.model("UrunKategori", UrunKategoriSchema);
