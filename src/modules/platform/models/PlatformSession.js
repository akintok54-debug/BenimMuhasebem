const mongoose = require("mongoose");
const schema = new mongoose.Schema({
    fingerprint: { type: String, required: true, unique: true, select: false },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", required: true, index: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", default: null, index: true },
    expiresAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    closedAt: { type: Date, default: null },
    ip: { type: String, default: "" },
    userAgent: { type: String, maxlength: 500, default: "" }
}, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model("PlatformSession", schema);
