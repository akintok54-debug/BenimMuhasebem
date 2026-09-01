const mongoose = require("mongoose");
const MarketplaceProductMappingSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Urun", required: true, index: true },
    provider: { type: String, required: true, index: true },
    storeConnectionId: { type: mongoose.Schema.Types.ObjectId, ref: "IntegrationConnection", required: true, index: true },
    connectionId: { type: mongoose.Schema.Types.ObjectId, ref: "IntegrationConnection", default: null, index: true },
    externalProductId: { type: String, default: "" }, externalBarcode: { type: String, default: "" }, externalSku: { type: String, default: "" }, externalCategoryId: { type: String, default: "" },
    categoryAttributes: { type: mongoose.Schema.Types.Mixed, default: {} },
    safetyStock: { type: Number, min: 0, default: 0 }, reservedStock: { type: Number, min: 0, default: 0 },
    syncStatus: { type: String, enum: ["NOT_LINKED", "PENDING", "SYNCED", "PARTIAL", "ERROR"], default: "NOT_LINKED" },
    lastStockSent: { type: Number, default: null }, lastPriceSent: { type: Number, default: null }, lastSyncedAt: { type: Date, default: null }, lastError: { type: String, default: "" }
}, { timestamps: true });
MarketplaceProductMappingSchema.index({ tenantId: 1, productId: 1, storeConnectionId: 1 }, { unique: true });
module.exports = mongoose.model("MarketplaceProductMapping", MarketplaceProductMappingSchema);
