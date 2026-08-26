const TenantSubscription =
    require("../models/TenantSubscription");

const { kontrolEt } =
    require("../services/kotaServisi");

async function durum(req, res, next) {
    try {
        const tenantId = req.params.tenantId;

        const subscription =
            await TenantSubscription.findOne({
                tenantId
            })
            .populate(
                "planId",
                "name code modules limits"
            )
            .populate(
                "tenantId",
                "name slug domain status"
            )
            .lean();

        if (!subscription) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Tenant aboneli?i bulunamad?."
            });
        }

        res.json({
            basarili: true,
            tenant: subscription.tenantId,
            plan: subscription.planId,
            subscription: {
                status: subscription.status,
                expiresAt: subscription.expiresAt,
                autoRenew: subscription.autoRenew
            },
            usage: subscription.usage
        });
    } catch (error) {
        next(error);
    }
}

async function kota(req, res, next) {
    try {
        const sonuc =
            await kontrolEt({
                tenantId: req.params.tenantId,
                kota: req.params.kota
            });

        res.json({
            basarili: true,
            ...sonuc
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    durum,
    kota
};
