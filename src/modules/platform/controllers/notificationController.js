const Audit = require("../models/PlatformAuditLog");
const Resolution = require("../models/PlatformErrorResolution");
const Tenant = require("../models/Tenant");
const User = require("../../../models/Kullanici");
const IntegrationError = require("../../../models/IntegrationError");
const { errorFilter } = require("../services/hataIzlemeServisi");
exports.listele = async (req, res, next) => {
    try {
        const since = new Date(Date.now() - 30 * 86400000);
        const [errors, integrationCount, integrations, accountCount, disabledUsers, cron, backup] = await Promise.all([
            Audit.aggregate([
                { $match: { ...errorFilter(), createdAt: { $gte: since } } },
                { $lookup: { from: Resolution.collection.name, localField: "_id", foreignField: "auditId", as: "resolution" } },
                { $match: { "resolution.resolved": { $ne: true } } },
                { $facet: { count: [{ $count: "total" }], latest: [{ $sort: { createdAt: -1 } }, { $limit: 8 }, { $project: { action: 1, category: 1, tenantId: 1, actorUserId: 1, createdAt: 1, path: 1, requestId: 1, severity: 1 } }] } }
            ]),
            IntegrationError.countDocuments({ status: { $in: ["OPEN", "RETRYING"] } }),
            IntegrationError.find({ status: { $in: ["OPEN", "RETRYING"] } }).select("provider operation errorCode tenantId lastAttemptAt").populate("tenantId", "name").sort({ lastAttemptAt: -1 }).limit(8).lean(),
            Tenant.countDocuments({ status: { $in: ["expired", "suspended"] } }),
            User.countDocuments({ aktif: false, silinmeTarihi: null }),
            Audit.findOne({ action: "CRON_COMPLETED", success: true }).sort({ createdAt: -1 }).select("createdAt").lean(),
            Audit.findOne({ action: "BACKUP_COMPLETED", success: true }).sort({ createdAt: -1 }).select("createdAt").lean()
        ]);
        await Audit.populate(errors[0]?.latest || [], [{ path: "tenantId", select: "name" }, { path: "actorUserId", select: "email" }]);
        const services = [];
        if (!cron || Date.now() - new Date(cron.createdAt).getTime() > 26 * 3600000) services.push({ code: "CRON", message: "Son 26 saatte başarılı Cron kaydı yok.", lastAt: cron?.createdAt || null });
        if (!backup || Date.now() - new Date(backup.createdAt).getTime() > 48 * 3600000) services.push({ code: "BACKUP", message: "Son 48 saatte başarılı veritabanı yedeği kaydı yok.", lastAt: backup?.createdAt || null });
        const errorCount = errors[0]?.count[0]?.total || 0;
        res.set("Cache-Control", "private, no-store");
        res.json({ basarili: true, checkedAt: new Date(), windowDays: 30,
            counts: { errors: errorCount, integrations: integrationCount, accounts: accountCount, disabledUsers, services: services.length },
            latest: errors[0]?.latest || [], integrations, services,
            delivery: { ...require("../../../services/platformBildirimServisi").durum(), panel: "POLL_30_SECONDS", webhookConfigured: !!process.env.SECURITY_ALERT_WEBHOOK } });
    } catch (error) { next(error); }
};
