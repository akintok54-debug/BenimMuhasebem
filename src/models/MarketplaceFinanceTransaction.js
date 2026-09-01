const mongoose = require("mongoose");
const MarketplaceFinanceTransactionSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true }, connectionId: { type: mongoose.Schema.Types.ObjectId, ref: "IntegrationConnection", required: true, index: true }, provider: { type: String, required: true },
    externalTransactionId: { type: String, required: true }, externalOrderId: { type: String, default: "" },
    type: { type: String, enum: ["SALE", "REFUND", "COMMISSION", "COMMISSION_REFUND", "CARGO", "SERVICE_FEE", "ADVERTISING", "DISCOUNT", "COUPON", "WITHHOLDING", "PAYMENT", "TRANSFER", "OTHER"], required: true },
    amount: { type: Number, required: true }, currency: { type: String, default: "TRY" }, transactionDate: { type: Date, required: true, index: true }, paymentDate: { type: Date, default: null }, rawData: { type: mongoose.Schema.Types.Mixed, default: {} },
    bankMovementId: { type: mongoose.Schema.Types.ObjectId, ref: "ParaHareket", default: null }, reconciliationStatus: { type: String, enum: ["UNMATCHED", "SUGGESTED", "MATCHED"], default: "UNMATCHED" }, matchedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", default: null }, matchedAt: { type: Date, default: null }
}, { timestamps: true });
MarketplaceFinanceTransactionSchema.index({ tenantId: 1, provider: 1, externalTransactionId: 1 }, { unique: true });
module.exports = mongoose.model("MarketplaceFinanceTransaction", MarketplaceFinanceTransactionSchema);
