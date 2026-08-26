const PlatformAuditLog = require("../models/PlatformAuditLog");

async function kaydet({
    req,
    action,
    resource,
    resourceId = null,
    tenantId = null,
    details = {}
}) {
    return PlatformAuditLog.create({
        actorUserId: req?.user?._id || req?.user?.id || null,
        tenantId,
        action,
        resource,
        resourceId,
        ip: req?.ip || null,
        userAgent: req?.headers?.["user-agent"] || null,
        details
    });
}

module.exports = { kaydet };
