const mongoose = require("mongoose");
const fiyatSchema = new mongoose.Schema({
    urunId: { type: mongoose.Schema.Types.ObjectId, ref: "Urun", required: true },
    fiyat: { type: Number, min: 0, required: true }
}, { _id: false });
const schema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
    ad: { type: String, trim: true, maxlength: 80, required: true },
    iskonto: { type: Number, min: 0, max: 100, default: 0 },
    fiyatlar: { type: [fiyatSchema], default: [] }
}, { timestamps: true });
schema.index({ tenantId: 1, ad: 1 }, { unique: true });
module.exports = mongoose.model("BayiGrubu", schema);
