const Tenant = require("../models/Tenant");
const Plan = require("../models/Plan");
const TenantSubscription = require("../models/TenantSubscription");
const { kaydet } = require("../services/auditServisi");

async function listele(req, res, next) {
    try {
        const subscriptions = await TenantSubscription.find()
            .populate("tenantId", "name slug domain status")
            .populate("planId", "name code modules limits monthlyPrice yearlyPrice")
            .sort({ createdAt: -1 })
            .lean();

        res.json({
            basarili: true,
            toplam: subscriptions.length,
            subscriptions
        });
    } catch (error) {
        next(error);
    }
}

async function tenantAbonelik(req, res, next) {
    try {
        const subscription = await TenantSubscription.findOne({
            tenantId: req.params.tenantId
        })
        .populate("tenantId", "name slug domain status")
        .populate("planId", "name code modules limits monthlyPrice yearlyPrice")
        .lean();

        if (!subscription) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Bu kirac? i?in abonelik bulunamad?."
            });
        }

        res.json({
            basarili: true,
            subscription
        });
    } catch (error) {
        next(error);
    }
}

async function ata(req, res, next) {
    try {
        const { tenantId, planId, status, expiresAt, autoRenew } = req.body;

        if (!tenantId || !planId) {
            return res.status(400).json({
                basarili: false,
                mesaj: "tenantId ve planId zorunludur."
            });
        }

        const tenant = await Tenant.findById(tenantId);

        if (!tenant) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Kirac? bulunamad?."
            });
        }

        const plan = await Plan.findById(planId);

        if (!plan) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Plan bulunamad?."
            });
        }

        const eski = await TenantSubscription.findOne({
            tenantId
        }).lean();

        const subscription = await TenantSubscription.findOneAndUpdate(
            { tenantId },
            {
                tenantId,
                planId,
                status: status || "active",
                expiresAt: expiresAt || null,
                autoRenew: autoRenew !== false
            },
            {
                new: true,
                upsert: true,
                setDefaultsOnInsert: true
            }
        );

        await kaydet({
            req,
            action: eski ? "SUBSCRIPTION_UPDATE" : "SUBSCRIPTION_CREATE",
            resource: "tenant_subscription",
            resourceId: subscription._id.toString(),
            tenantId,
            details: {
                planId: plan._id.toString(),
                planCode: plan.code,
                eskiPlanId: eski?.planId
                    ? eski.planId.toString()
                    : null,
                status: subscription.status
            }
        });

        res.status(eski ? 200 : 201).json({
            basarili: true,
            mesaj: eski
                ? "Kirac? aboneli?i g?ncellendi."
                : "Kirac?ya plan atand?.",
            subscription
        });
    } catch (error) {
        next(error);
    }
}

async function durumDegistir(req, res, next) {
    try {
        const subscription = await TenantSubscription.findById(
            req.params.id
        );

        if (!subscription) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Abonelik bulunamad?."
            });
        }

        const eskiDurum = subscription.status;
        subscription.status = req.body.status;

        await subscription.save();

        await kaydet({
            req,
            action: "SUBSCRIPTION_STATUS_CHANGE",
            resource: "tenant_subscription",
            resourceId: subscription._id.toString(),
            tenantId: subscription.tenantId,
            details: {
                eskiDurum,
                yeniDurum: subscription.status
            }
        });

        res.json({
            basarili: true,
            subscription
        });
    } catch (error) {
        next(error);
    }
}

async function kullanimGuncelle(req, res, next) {
    try {
        const subscription = await TenantSubscription.findById(
            req.params.id
        );

        if (!subscription) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Abonelik bulunamad?."
            });
        }

        const allowed = [
            "users",
            "products",
            "storageMb",
            "aiRequests"
        ];

        for (const key of allowed) {
            if (req.body[key] !== undefined) {
                const value = Number(req.body[key]);

                if (!Number.isFinite(value) || value < 0) {
                    return res.status(400).json({
                        basarili: false,
                        mesaj: key + " ge?ersiz."
                    });
                }

                subscription.usage[key] = value;
            }
        }

        await subscription.save();

        await kaydet({
            req,
            action: "SUBSCRIPTION_USAGE_UPDATE",
            resource: "tenant_subscription",
            resourceId: subscription._id.toString(),
            tenantId: subscription.tenantId,
            details: {
                usage: subscription.usage
            }
        });

        res.json({
            basarili: true,
            subscription
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    listele,
    tenantAbonelik,
    ata,
    durumDegistir,
    kullanimGuncelle
};
