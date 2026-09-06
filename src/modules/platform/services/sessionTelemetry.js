const crypto = require("crypto");
const mongoose = require("mongoose");
const Session = require("../models/PlatformSession");
const fingerprint = token => crypto.createHash("sha256").update(token).digest("hex");

// Observability only: this does not issue tokens or alter the existing authentication decision.
async function observe(req, token, payload) {
    if (mongoose.connection.readyState !== 1 || !payload.kullaniciId || !payload.exp || payload.purpose) return;
    try {
        await Session.updateOne({ fingerprint: fingerprint(token) }, {
            $setOnInsert: { userId: payload.kullaniciId, tenantId: payload.tenantId || null, expiresAt: new Date(payload.exp * 1000) },
            $set: { lastSeenAt: new Date(), ip: req.ip || "", userAgent: String(req.headers?.["user-agent"] || "").slice(0,500), closedAt: null }
        }, { upsert: true });
    } catch (_) { console.error("PLATFORM_SESSION_TELEMETRY_FAILED", { requestId: req.id }); }
}

async function close(token) {
    if (!token || mongoose.connection.readyState !== 1) return;
    try { await Session.updateOne({ fingerprint: fingerprint(token) }, { $set: { closedAt: new Date() } }); }
    catch (_) { console.error("PLATFORM_SESSION_CLOSE_TELEMETRY_FAILED"); }
}
module.exports = { observe, close, fingerprint };
