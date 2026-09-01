const mongoose = require("mongoose");

const IntegrationConnectionSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    type: { type: String, enum: ["MARKETPLACE", "EDOCUMENT"], default: "MARKETPLACE", index: true },
    provider: { type: String, enum: ["TRENDYOL", "HEPSIBURADA", "N11", "AMAZON_TR", "CICEKSEPETI", "PAZARAMA", "IDEASOFT", "CUSTOM", "EDOCUMENT_CUSTOM"], required: true, index: true },
    storeName: { type: String, required: true, trim: true, maxlength: 160 },
    sellerId: { type: String, trim: true, maxlength: 160, default: "" },
    merchantId: { type: String, trim: true, maxlength: 160, default: "" },
    encryptedCredentials: { type: String, required: true, select: false },
    credentialMask: { type: String, default: "********" },
    apiBaseUrl: { type: String, trim: true, default: "" },
    environment: { type: String, enum: ["PRODUCTION", "STAGE"], default: "PRODUCTION" },
    active: { type: Boolean, default: true, index: true },
    pilotStatus: { type: String, enum: ["NOT_STARTED", "RUNNING", "SUCCESS", "FAILED", "PARTIAL"], default: "NOT_STARTED" },
    pilotCompletedAt: { type: Date, default: null },
    pilotResults: { type: mongoose.Schema.Types.Mixed, default: null },
    lastSuccessfulSyncAt: { type: Date, default: null }, lastErrorAt: { type: Date, default: null }, lastError: { type: String, default: "", maxlength: 1000 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", default: null }
}, { timestamps: true });

IntegrationConnectionSchema.index({ tenantId: 1, provider: 1, storeName: 1 }, { unique: true });
IntegrationConnectionSchema.set("toJSON", { transform(_doc, ret) { delete ret.encryptedCredentials; return ret; } });
module.exports = mongoose.model("IntegrationConnection", IntegrationConnectionSchema);
