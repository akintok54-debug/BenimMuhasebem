const mongoose = require("mongoose");
const MarketplaceCustomerQuestionSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true }, connectionId: { type: mongoose.Schema.Types.ObjectId, ref: "IntegrationConnection", required: true }, provider: { type: String, required: true },
    externalQuestionId: { type: String, required: true }, productId: { type: mongoose.Schema.Types.ObjectId, ref: "Urun", default: null }, externalBarcode: { type: String, default: "" }, customerName: { type: String, default: "" }, question: { type: String, required: true }, questionDate: { type: Date, required: true }, answer: { type: String, default: "" }, answerDate: { type: Date, default: null }, status: { type: String, default: "WAITING_FOR_ANSWER" }
}, { timestamps: true });
MarketplaceCustomerQuestionSchema.index({ tenantId: 1, provider: 1, externalQuestionId: 1 }, { unique: true });
module.exports = mongoose.model("MarketplaceCustomerQuestion", MarketplaceCustomerQuestionSchema);
