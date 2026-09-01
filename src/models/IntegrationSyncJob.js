const mongoose = require("mongoose");
const IntegrationSyncJobSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true }, provider: { type: String, required: true }, connectionId: { type: mongoose.Schema.Types.ObjectId, ref: "IntegrationConnection", required: true, index: true },
    type: { type: String, enum: ["PRODUCT_PULL", "PRODUCT_PUSH", "STOCK_PUSH", "PRICE_PUSH", "ORDER_PULL", "RETURN_PULL", "INVOICE_PULL", "INVOICE_PUSH", "FINANCE_PULL", "CARGO_SYNC", "QUESTION_PULL"], required: true },
    status: { type: String, enum: ["QUEUED", "RUNNING", "SUCCESS", "PARTIAL", "FAILED"], default: "QUEUED", index: true }, startedAt: { type: Date, default: null }, finishedAt: { type: Date, default: null },
    processedCount: { type: Number, default: 0 }, successCount: { type: Number, default: 0 }, errorCount: { type: Number, default: 0 }, errors: { type: [mongoose.Schema.Types.Mixed], default: [] }, createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", default: null }
}, { timestamps: true, suppressReservedKeysWarning: true });
module.exports = mongoose.model("IntegrationSyncJob", IntegrationSyncJobSchema);
