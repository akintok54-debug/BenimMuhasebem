const mongoose = require("mongoose");
const IntegrationErrorSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true }, connectionId: { type: mongoose.Schema.Types.ObjectId, ref: "IntegrationConnection", default: null }, provider: { type: String, required: true },
    operation: { type: String, required: true }, entityType: { type: String, default: "" }, entityId: { type: String, default: "" }, errorCode: { type: String, required: true }, errorMessage: { type: String, required: true, maxlength: 2000 },
    technicalDetails: { type: mongoose.Schema.Types.Mixed, default: {}, select: false }, attemptCount: { type: Number, default: 1 }, lastAttemptAt: { type: Date, default: Date.now }, status: { type: String, enum: ["OPEN", "RETRYING", "RESOLVED", "IGNORED"], default: "OPEN", index: true }, retryable: { type: Boolean, default: false }
}, { timestamps: true });
IntegrationErrorSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
module.exports = mongoose.model("IntegrationError", IntegrationErrorSchema);
