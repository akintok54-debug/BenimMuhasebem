const mongoose = require("mongoose");

const PlatformAuditLogSchema = new mongoose.Schema({
    actorUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Kullanici"
    },

    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Tenant",
        default: null
    },

    action: {
        type: String,
        required: true
    },

    resource: {
        type: String,
        required: true
    },

    resourceId: {
        type: String,
        default: null
    },

    ip: String,
    userAgent: String,

    details: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
        immutable: true
    },
    category: { type: String, default: "ISLEM", index: true, immutable: true },
    severity: { type: String, enum: ["BILGI", "UYARI", "KRITIK"], default: "BILGI", index: true, immutable: true },
    success: { type: Boolean, default: true, index: true, immutable: true },
    httpStatus: { type: Number, default: null, immutable: true },
    requestId: { type: String, default: "", index: true, immutable: true },
    method: { type: String, default: "", immutable: true },
    path: { type: String, default: "", immutable: true }
}, {
    timestamps: true
});

PlatformAuditLogSchema.index({ tenantId: 1, createdAt: -1 });
PlatformAuditLogSchema.index({ actorUserId: 1, createdAt: -1 });
PlatformAuditLogSchema.index({ category: 1, severity: 1, createdAt: -1 });

PlatformAuditLogSchema.pre("save", function auditDegismez() {
    if (!this.isNew) throw new Error("Audit kayıtları değiştirilemez.");
});

for (const hook of ["updateOne", "updateMany", "findOneAndUpdate", "deleteOne", "deleteMany", "findOneAndDelete"]) {
    PlatformAuditLogSchema.pre(hook, function engelle() {
        throw new Error("Audit kayıtları değiştirilemez veya silinemez.");
    });
}

module.exports = mongoose.model("PlatformAuditLog", PlatformAuditLogSchema);
