const mongoose = require("mongoose");

const StokTransferSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    belgeNo: { type: String, required: true, trim: true, uppercase: true },
    tarih: { type: Date, default: Date.now, index: true },
    urunId: { type: mongoose.Schema.Types.ObjectId, ref: "Urun", required: true },
    kaynakDepoId: { type: mongoose.Schema.Types.ObjectId, ref: "Depo", required: true },
    hedefDepoId: { type: mongoose.Schema.Types.ObjectId, ref: "Depo", required: true },
    miktar: { type: Number, required: true, min: 0.0001 },
    birimMaliyet: { type: Number, default: 0, min: 0 },
    aciklama: { type: String, trim: true, default: "" },
    kullaniciId: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", default: null }
}, { timestamps: true });

StokTransferSchema.index({ tenantId: 1, belgeNo: 1 }, { unique: true });

StokTransferSchema.plugin(require("./plugins/transactionPlugin"));
module.exports = mongoose.model("StokTransfer", StokTransferSchema);
