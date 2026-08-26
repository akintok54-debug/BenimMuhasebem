function aiTenantGuvenlik(req, res, next) {
    const kullanici = req.kullanici;

    if (!kullanici) {
        return res.status(401).json({
            basarili: false,
            mesaj: "Kimlik do?rulamas? gerekli."
        });
    }

    if (!req.tenantId && kullanici.rol !== "SUPER_ADMIN") {
        return res.status(400).json({
            basarili: false,
            mesaj: "Tenant ba?lam? bulunamad?."
        });
    }

    next();
}

module.exports = aiTenantGuvenlik;
