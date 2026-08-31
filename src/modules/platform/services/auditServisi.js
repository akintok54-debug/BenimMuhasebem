const PlatformAuditLog = require("../models/PlatformAuditLog");
const mongoose = require("mongoose");

async function kaydet({
    req,
    action,
    resource,
    resourceId = null,
    tenantId = null,
    details = {}
    , category = "ISLEM", severity = "BILGI", success = true, httpStatus = null
}) {
    if (mongoose.connection.readyState !== 1) return null;
    return PlatformAuditLog.create({
        actorUserId: req?.currentUser?._id || req?.user?._id || req?.user?.id || req?.user?.kullaniciId || req?.kullanici?.kullaniciId || null,
        tenantId: tenantId || req?.tenantId || req?.user?.tenantId || null,
        action,
        resource,
        resourceId,
        ip: req?.ip || null,
        userAgent: req?.headers?.["user-agent"] || null,
        details,
        category,
        severity,
        success,
        httpStatus,
        requestId: req?.id || "",
        method: req?.method || "",
        path: req?.originalUrl?.split("?")[0] || ""
    });
}

module.exports = { kaydet };
