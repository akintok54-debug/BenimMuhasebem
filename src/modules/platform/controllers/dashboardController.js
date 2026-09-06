const Tenant = require("../models/Tenant");
const Kullanici = require("../../../models/Kullanici");

async function dashboard(req, res, next) {
    try {
        const [
            toplamKiraci,
            aktifKiraci,
            denemeKiraci,
            pasifKiraci,
            toplamKullanici
        ] = await Promise.all([
            Tenant.countDocuments(),
            Tenant.countDocuments({ status: "active" }),
            Tenant.countDocuments({ status: "trial" }),
            Tenant.countDocuments({
                status: { $in: ["suspended", "passive", "cancelled"] }
            }),
            Kullanici.countDocuments()
        ]);

        const Subscription = require("../models/TenantSubscription");
        const now = new Date();
        // Start of the current civil day in Turkey (UTC+03:00).
        const day = new Date(new Date(now.getTime() + 10800000).toISOString().slice(0,10) + "T00:00:00+03:00");
        const activeFilter = { status: "active", $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] };
        const [suspended, todayUsers, activeSubscriptions, expiring] = await Promise.all([
            Tenant.countDocuments({ status: "suspended" }),
            Kullanici.countDocuments({ aktif: true, silinmeTarihi: null, sonGirisTarihi: { $gte: day } }),
            Subscription.distinct("tenantId", activeFilter),
            Subscription.distinct("tenantId", { status: { $in: ["active", "trial"] }, $or: [
                { expiresAt: { $gt: now, $lte: new Date(now.getTime() + 7 * 86400000) } },
                { status: "trial", trialEndsAt: { $gt: now, $lte: new Date(now.getTime() + 7 * 86400000) } }
            ] })
        ]);
        res.json({
            basarili: true,
            sistem: "BENIMMUHASEBE PLATFORM",
            domain: "benimmuhasebe.com",
            dashboard: {
                abonelikler: { aktif: activeSubscriptions.length, yaklasan: expiring.length, yaklasanGun: 7 },
                kiracilar: {
                    toplam: toplamKiraci,
                    aktif: aktifKiraci,
                    deneme: denemeKiraci,
                    pasif: pasifKiraci, askida: suspended
                },
                kullanicilar: {
                    toplam: toplamKullanici, bugunAktif: todayUsers
                }
            }
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    dashboard
};
