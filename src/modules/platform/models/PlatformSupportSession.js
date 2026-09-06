const mongoose = require("mongoose");
const schema = new mongoose.Schema({
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", required: true, index: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
    reason: { type: String, required: true, maxlength: 500 },
    expiresAt: { type: Date, required: true, index: true },
    closedAt: { type: Date, default: null }
}, { timestamps: true });
module.exports = mongoose.model("PlatformSupportSession", schema);
