const mongoose = require("mongoose");
const schema = new mongoose.Schema({
    _id: { type: mongoose.Schema.Types.ObjectId, ref: "Siparis" },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
    musteriId: { type: mongoose.Schema.Types.ObjectId, ref: "Musteri", required: true },
    bankaId: { type: mongoose.Schema.Types.ObjectId, ref: "Banka", required: true },
    tutarKurus: { type: Number, required: true, min: 1 },
    secret: { type: String, required: true, select: false },
    merchantId: { type: String, required: true },
    test: { type: Boolean, required: true },
    durum: { type: String, enum: ["BEKLIYOR", "ODENDI", "BASARISIZ", "TEST"], default: "BEKLIYOR" },
    iframeToken: { type: String, default: "", select: false },
    cariHareketId: { type: mongoose.Schema.Types.ObjectId, ref: "CariHareket", default: null }
}, { timestamps: true });
module.exports = mongoose.model("MagazaOdeme", schema);
