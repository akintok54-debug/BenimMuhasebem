const mongoose = require("mongoose");
const schema = new mongoose.Schema({
    auditId: { type: mongoose.Schema.Types.ObjectId, ref: "PlatformAuditLog", required: true, unique: true },
    resolved: { type: Boolean, default: false },
    note: { type: String, maxlength: 1000, default: "" },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", required: true }
}, { timestamps: true });
module.exports = mongoose.model("PlatformErrorResolution", schema);
