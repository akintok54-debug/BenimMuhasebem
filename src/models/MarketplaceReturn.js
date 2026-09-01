const mongoose = require("mongoose");
const MarketplaceReturnSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true }, connectionId: { type: mongoose.Schema.Types.ObjectId, ref: "IntegrationConnection", required: true },
    marketplace: { type: String, required: true }, externalReturnId: { type: String, required: true }, externalOrderId: { type: String, required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Urun", default: null }, quantity: { type: Number, min: 0.0001, required: true }, reason: { type: String, default: "" },
    status: { type: String, enum: ["REQUESTED", "ACCEPTED", "REJECTED", "COMPLETED", "CANCELLED"], default: "REQUESTED" }, returnCargo: { type: mongoose.Schema.Types.Mixed, default: {} }, returnDate: { type: Date, default: null }, refundAmount: { type: Number, min: 0, default: 0 },
    processedAt: { type: Date, default: null }, stockMovementId: { type: mongoose.Schema.Types.ObjectId, ref: "StokHareket", default: null }, salesReturnId: { type: mongoose.Schema.Types.ObjectId, ref: "SatisIade", default: null }
}, { timestamps: true });
MarketplaceReturnSchema.index({ tenantId: 1, marketplace: 1, externalReturnId: 1 }, { unique: true });
module.exports = mongoose.model("MarketplaceReturn", MarketplaceReturnSchema);
