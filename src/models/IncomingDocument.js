const mongoose = require("mongoose");
const IncomingDocumentSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    connectionId: { type: mongoose.Schema.Types.ObjectId, ref: "IntegrationConnection", default: null }, provider: { type: String, required: true },
    uuid: { type: String, required: true, trim: true }, invoiceNo: { type: String, default: "" }, scenario: { type: String, default: "" },
    invoiceType: { type: String, enum: ["E_FATURA", "E_ARSIV", "E_IRSALIYE", "IADE_FATURASI", "ALIS_FATURASI", "HIZMET_FATURASI", "KOMISYON_FATURASI", "KARGO_FATURASI", "DIGER"], default: "DIGER" },
    senderVknTckn: { type: String, default: "" }, senderTitle: { type: String, default: "" }, receiverVknTckn: { type: String, default: "" },
    issueDate: { type: Date, required: true }, dueDate: { type: Date, default: null }, currency: { type: String, default: "TRY" },
    subtotal: { type: Number, min: 0, default: 0 }, taxTotal: { type: Number, min: 0, default: 0 }, grandTotal: { type: Number, min: 0, default: 0 }, taxLines: { type: [mongoose.Schema.Types.Mixed], default: [] },
    xmlFile: { type: String, default: "", select: false }, pdfFile: { type: String, default: "", select: false }, rawStatus: { type: String, default: "" }, normalizedStatus: { type: String, default: "RECEIVED" },
    matchedSupplierId: { type: mongoose.Schema.Types.ObjectId, ref: "Tedarikci", default: null }, matchedExpenseId: { type: mongoose.Schema.Types.ObjectId, ref: "Masraf", default: null }, matchedPurchaseId: { type: mongoose.Schema.Types.ObjectId, ref: "Alis", default: null },
    processingStatus: { type: String, enum: ["UNPROCESSED", "MATCHED", "APPROVAL_REQUIRED", "PROCESSED", "ARCHIVED", "ERROR"], default: "UNPROCESSED", index: true }
}, { timestamps: true });
IncomingDocumentSchema.index({ tenantId: 1, uuid: 1 }, { unique: true });
module.exports = mongoose.model("IncomingDocument", IncomingDocumentSchema);
