const mongoose = require("mongoose");
const Tenant = require("../modules/platform/models/Tenant");

async function tenantBul(req) {

    if (!req.tenantId) {
        return null;
    }

    if (!mongoose.Types.ObjectId.isValid(req.tenantId)) {
        return null;
    }

    return Tenant.findById(req.tenantId);
}

async function dashboard(req, res, next) {
    try {

        const tenant = await tenantBul(req);

        if (!tenant) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Firma bulunamadı."
            });
        }

        res.json({
            basarili: true,
            tenant: {
                id: tenant._id,
                name: tenant.name,
                slug: tenant.slug,
                domain: tenant.domain,
                plan: tenant.plan,
                status: tenant.status,
                modules: tenant.modules,
                limits: tenant.limits,
                usage: tenant.usage,
                firmaBilgileri: tenant.firmaBilgileri || {}
            }
        });

    } catch (error) {
        next(error);
    }
}

async function firma(req, res, next) {
    try {

        const tenant = await tenantBul(req);

        if (!tenant) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Firma bulunamadı."
            });
        }

        res.json({
            basarili: true,
            firmaBilgileri:
                tenant.firmaBilgileri || {}
        });

    } catch (error) {
        next(error);
    }
}

async function firmaGuncelle(req, res, next) {
    try {

        const tenant = await tenantBul(req);

        if (!tenant) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Firma bulunamadı."
            });
        }

        const body = req.body || {};

        tenant.firmaBilgileri = {
            ...(tenant.firmaBilgileri?.toObject?.() ||
                tenant.firmaBilgileri ||
                {}),

            unvan: String(
                body.unvan ?? ""
            ).trim(),

            yetkili: String(
                body.yetkili ?? ""
            ).trim(),

            vergiDairesi: String(
                body.vergiDairesi ?? ""
            ).trim(),

            vergiNo: String(
                body.vergiNo ?? ""
            ).trim(),

            telefon: String(
                body.telefon ?? ""
            ).trim(),

            adres: String(
                body.adres ?? ""
            ).trim(),

            il: String(
                body.il ?? ""
            ).trim(),

            ilce: String(
                body.ilce ?? ""
            ).trim(),

            postaKodu: String(
                body.postaKodu ?? ""
            ).trim(),

            web: String(
                body.web ?? ""
            ).trim()
        };

        await tenant.save();

        res.json({
            basarili: true,
            mesaj: "Firma bilgileri kaydedildi.",
            firmaBilgileri:
                tenant.firmaBilgileri
        });

    } catch (error) {
        next(error);
    }
}

module.exports = {
    dashboard,
    firma,
    firmaGuncelle
};
