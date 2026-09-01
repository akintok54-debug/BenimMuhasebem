const mongoose = require("mongoose");
const MarketplaceCategoryMappingSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true }, connectionId: { type: mongoose.Schema.Types.ObjectId, ref: "IntegrationConnection", required: true, index: true }, provider: { type: String, required: true },
    erpCategory: { type: String, required: true, trim: true }, externalCategoryId: { type: String, required: true }, externalCategoryName: { type: String, default: "" }, attributeMappings: { type: mongoose.Schema.Types.Mixed, default: {} }, status: { type: String, enum: ["PENDING", "MAPPED", "ERROR"], default: "MAPPED" }, lastSyncedAt: { type: Date, default: null }, lastError: { type: String, default: "" }
}, { timestamps: true });
MarketplaceCategoryMappingSchema.index({ tenantId: 1, connectionId: 1, erpCategory: 1 }, { unique: true });
module.exports = mongoose.model("MarketplaceCategoryMapping", MarketplaceCategoryMappingSchema);
