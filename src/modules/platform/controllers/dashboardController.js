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

        res.json({
            basarili: true,
            sistem: "BENIMMUHASEBE PLATFORM",
            domain: "benimmuhasebe.com",
            dashboard: {
                kiracilar: {
                    toplam: toplamKiraci,
                    aktif: aktifKiraci,
                    deneme: denemeKiraci,
                    pasif: pasifKiraci
                },
                kullanicilar: {
                    toplam: toplamKullanici
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
