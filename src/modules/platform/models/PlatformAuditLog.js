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
        default: {}
    }
}, {
    timestamps: true
});

PlatformAuditLogSchema.index({ tenantId: 1, createdAt: -1 });
PlatformAuditLogSchema.index({ actorUserId: 1, createdAt: -1 });

module.exports = mongoose.model("PlatformAuditLog", PlatformAuditLogSchema);
