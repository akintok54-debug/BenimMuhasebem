const mongoose = require("mongoose");
const schema = new mongoose.Schema({
    _id: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant" },
    aktif: { type: Boolean, default: false },
    bayiKdvDahil: { type: Boolean, default: false },
    perakendeKdvDahil: { type: Boolean, default: true },
    depoId: { type: mongoose.Schema.Types.ObjectId, ref: "Depo", default: null },
    bankaId: { type: mongoose.Schema.Types.ObjectId, ref: "Banka", default: null },
    kasaId: { type: mongoose.Schema.Types.ObjectId, ref: "Kasa", default: null },
    havale: { type: Boolean, default: true },
    kapida: { type: Boolean, default: true },
    kart: { type: Boolean, default: true },
    paytrMerchantId: { type: String, default: "", maxlength: 30 },
    paytrSecret: { type: String, default: "", select: false },
    paytrTest: { type: Boolean, default: true }
}, { timestamps: true });
module.exports = mongoose.model("MagazaAyar", schema);
