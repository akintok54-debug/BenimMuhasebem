const TenantSubscription =
    require("../models/TenantSubscription");

const Plan =
    require("../models/Plan");

async function kontrolEt({
    tenantId,
    kota
}) {
    const subscription =
        await TenantSubscription.findOne({
            tenantId,
            status: {
                $in: ["trial", "active"]
            }
        }).populate("planId");

    if (!subscription || !subscription.planId) {
        return {
            izin: false,
            neden: "AKTIF_ABONELIK_YOK"
        };
    }

    const plan = subscription.planId;

    if (
        subscription.expiresAt &&
        new Date(subscription.expiresAt) < new Date()
    ) {
        return {
            izin: false,
            neden: "ABONELIK_SURESI_DOLDU"
        };
    }

    const limit = plan.limits?.[kota];
    const usage = subscription.usage?.[kota] || 0;

    if (
        typeof limit === "number" &&
        limit >= 0 &&
        usage >= limit
    ) {
        return {
            izin: false,
            neden: "KOTA_DOLDU",
            kota,
            limit,
            usage
        };
    }

    return {
        izin: true,
        kota,
        limit,
        usage,
        kalan:
            typeof limit === "number" && limit >= 0
                ? Math.max(limit - usage, 0)
                : null
    };
}

async function arttir({
    tenantId,
    kota,
    miktar = 1
}) {
    const result =
        await kontrolEt({
            tenantId,
            kota
        });

    if (!result.izin) {
        return result;
    }

    const subscription =
        await TenantSubscription.findOne({
            tenantId,
            status: {
                $in: ["trial", "active"]
            }
        });

    if (!subscription) {
        return {
            izin: false,
            neden: "AKTIF_ABONELIK_YOK"
        };
    }

    subscription.usage[kota] =
        (subscription.usage[kota] || 0) + miktar;

    await subscription.save();

    return {
        izin: true,
        kota,
        usage: subscription.usage[kota]
    };
}

module.exports = {
    kontrolEt,
    arttir
};
