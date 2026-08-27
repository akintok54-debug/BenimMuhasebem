const mongoose = require("mongoose");

const OzelFiyatSchema = new mongoose.Schema(
    {
        tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
        urunId: { type: mongoose.Schema.Types.ObjectId, ref: "Urun", required: true, index: true },
        fiyat: { type: Number, required: true, min: 0 },
        aciklama: { type: String, trim: true, maxlength: 250, default: "" }
    },
    { timestamps: true }
);

OzelFiyatSchema.index({ tenantId: 1, urunId: 1 }, { unique: true });

module.exports = mongoose.model("OzelFiyat", OzelFiyatSchema);
