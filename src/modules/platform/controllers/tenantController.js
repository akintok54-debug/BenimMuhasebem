const Tenant = require("../models/Tenant");
const { kaydet } = require("../services/auditServisi");

async function listele(req, res, next) {
    try {
        const tenants = await Tenant.find()
            .sort({ createdAt: -1 })
            .lean();

        res.json({
            basarili: true,
            toplam: tenants.length,
            tenants
        });
    } catch (error) {
        next(error);
    }
}

async function detay(req, res, next) {
    try {
        const tenant = await Tenant.findById(req.params.id).lean();

        if (!tenant) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Kiracı bulunamadı."
            });
        }

        res.json({
            basarili: true,
            tenant
        });
    } catch (error) {
        next(error);
    }
}

async function olustur(req, res, next) {
    try {
        const tenant = await Tenant.create({
            name: req.body.name,
            slug: req.body.slug,
            domain: req.body.domain || null,
            plan: req.body.plan || "starter",
            status: req.body.status || "trial",
            modules: req.body.modules || [],
            limits: req.body.limits || undefined,
            createdBy: req.user?._id || req.user?.id || null
        });

        await kaydet({
            req,
            action: "TENANT_CREATE",
            resource: "tenant",
            resourceId: tenant._id.toString(),
            tenantId: tenant._id,
            details: {
                name: tenant.name,
                plan: tenant.plan
            }
        });

        res.status(201).json({
            basarili: true,
            tenant
        });
    } catch (error) {
        next(error);
    }
}

async function durumDegistir(req, res, next) {
    try {
        const tenant = await Tenant.findById(req.params.id);

        if (!tenant) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Kiracı bulunamadı."
            });
        }

        const eskiDurum = tenant.status;
        tenant.status = req.body.status;

        await tenant.save();

        await kaydet({
            req,
            action: "TENANT_STATUS_CHANGE",
            resource: "tenant",
            resourceId: tenant._id.toString(),
            tenantId: tenant._id,
            details: {
                eskiDurum,
                yeniDurum: tenant.status
            }
        });

        res.json({
            basarili: true,
            tenant
        });
    } catch (error) {
        next(error);
    }
}

async function modulGuncelle(req, res, next) {
    try {
        const tenant = await Tenant.findById(req.params.id);

        if (!tenant) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Kiracı bulunamadı."
            });
        }

        tenant.modules = Array.isArray(req.body.modules)
            ? req.body.modules
            : tenant.modules;

        await tenant.save();

        await kaydet({
            req,
            action: "TENANT_MODULE_UPDATE",
            resource: "tenant",
            resourceId: tenant._id.toString(),
            tenantId: tenant._id,
            details: {
                modules: tenant.modules
            }
        });

        res.json({
            basarili: true,
            tenant
        });
    } catch (error) {
        next(error);
    }
}


async function kullaniciOlustur(req, res, next) {
    try {
        const bcrypt = require("bcryptjs");
        const Kullanici = require("../../../models/Kullanici");
        const Tenant = require("../models/Tenant");

        const tenantId = req.params.id;

        const tenant = await Tenant.findById(tenantId);

        if (!tenant) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Kiracı bulunamadı."
            });
        }

        const {
            adSoyad,
            email,
            sifre,
            rol
        } = req.body || {};

        if (!adSoyad || !email || !sifre) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Ad Soyad, e-posta ve şifre zorunludur."
            });
        }

        const izinliRoller = ["OWNER", "ADMIN", "MANAGER", "SALES", "CASHIER", "ACCOUNTING", "SATIS", "DEPO", "MUHASEBE", "ETICARET"];
        const guvenliRol = String(rol || "ADMIN").trim().toUpperCase();
        if (!izinliRoller.includes(guvenliRol)) {
            return res.status(400).json({ basarili: false, mesaj: "Desteklenmeyen kullanıcı rolü." });
        }
        if (String(sifre).length < 8) {
            return res.status(400).json({ basarili: false, mesaj: "Parola en az 8 karakter olmalıdır." });
        }

        const mevcut = await Kullanici.findOne({
            email: String(email).trim().toLowerCase()
        });

        if (mevcut) {
            return res.status(409).json({
                basarili: false,
                mesaj: "Bu e-posta zaten kayıtlı."
            });
        }

        const hash = await bcrypt.hash(String(sifre), 12);

        const kullanici = await Kullanici.create({
            adSoyad: String(adSoyad).trim(),
            email: String(email).trim().toLowerCase(),
            sifre: hash,
            rol: guvenliRol,
            tenantId: tenant._id,
            aktif: true
        });

        await kaydet({
            req,
            action: "TENANT_USER_CREATE",
            resource: "user",
            resourceId: kullanici._id.toString(),
            tenantId: tenant._id,
            details: {
                email: kullanici.email,
                rol: kullanici.rol
            }
        });

        res.status(201).json({
            basarili: true,
            kullanici: {
                id: kullanici._id,
                adSoyad: kullanici.adSoyad,
                email: kullanici.email,
                rol: kullanici.rol,
                tenantId: kullanici.tenantId,
                aktif: kullanici.aktif
            }
        });
    } catch (error) {
        next(error);
    }
}
module.exports = {
    listele,
    detay,
    olustur,
    durumDegistir,
    modulGuncelle,
    kullaniciOlustur
};

