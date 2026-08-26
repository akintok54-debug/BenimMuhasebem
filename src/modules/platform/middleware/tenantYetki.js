const TenantSubscription = require("../models/TenantSubscription");
const Plan = require("../models/Plan");

async function tenantYetki(req, res, next) {
    try {
        const tenantId =
            req.tenantId ||
            req.user?.tenantId ||
            req.kullanici?.tenantId;

        if (!tenantId) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Tenant ba?lam? bulunamad?."
            });
        }

        const subscription =
            await TenantSubscription.findOne({
                tenantId,
                status: {
                    $in: ["trial", "active"]
                }
            }).populate("planId");

        if (!subscription || !subscription.planId) {
            return res.status(403).json({
                basarili: false,
                mesaj: "Aktif abonelik veya plan bulunamad?."
            });
        }

        const plan = subscription.planId;

        if (
            subscription.expiresAt &&
            new Date(subscription.expiresAt) < new Date()
        ) {
            return res.status(403).json({
                basarili: false,
                mesaj: "Abonelik s?resi dolmu?."
            });
        }

        req.tenantSubscription = subscription;
        req.tenantPlan = plan;

        next();
    } catch (error) {
        next(error);
    }
}

function modulGerekli(modul) {
    return function(req, res, next) {
        const plan = req.tenantPlan;

        if (!plan) {
            return res.status(403).json({
                basarili: false,
                mesaj: "Plan bilgisi bulunamad?."
            });
        }

        if (!plan.modules.includes(modul)) {
            return res.status(403).json({
                basarili: false,
                mesaj: "Bu mod?l mevcut plan?n?zda aktif de?il.",
                modul
            });
        }

        next();
    };
}

function kotaKontrol(kota) {
    return function(req, res, next) {
        const subscription = req.tenantSubscription;
        const plan = req.tenantPlan;

        if (!subscription || !plan) {
            return res.status(403).json({
                basarili: false,
                mesaj: "Abonelik bilgisi bulunamad?."
            });
        }

        const limit = plan.limits?.[kota];
        const usage = subscription.usage?.[kota] || 0;

        if (
            typeof limit === "number" &&
            limit >= 0 &&
            usage >= limit
        ) {
            return res.status(429).json({
                basarili: false,
                mesaj: "Kullan?m kotas? dolmu?tur.",
                kota,
                limit,
                usage
            });
        }

        next();
    };
}

module.exports = {
    tenantYetki,
    modulGerekli,
    kotaKontrol
};
