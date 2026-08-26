const mongoose = require("mongoose");

function tenantKontrol(req, res, next) {
    try {
        const kullanici = req.kullanici || req.user;

        if (!kullanici) {
            return res.status(401).json({
                basarili: false,
                mesaj: "Kimlik doğrulaması gerekli."
            });
        }

        const rol = String(
            kullanici.rol ||
            kullanici.role ||
            ""
        ).toUpperCase();

        // Süper admin / platform yöneticisi tenant zorunluluğundan muaftır.
        if (
            rol === "SUPER_ADMIN" ||
            rol === "SUPERADMIN" ||
            rol === "PLATFORM_ADMIN"
        ) {
            return next();
        }

        if (!kullanici.tenantId) {
            return res.status(403).json({
                basarili: false,
                mesaj: "Tenant kimliği bulunamadı."
            });
        }

        const id = String(kullanici.tenantId);

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(403).json({
                basarili: false,
                mesaj: "Geçersiz tenant kimliği."
            });
        }

        req.tenantId = id;

        return next();

    } catch (error) {
        return res.status(403).json({
            basarili: false,
            mesaj: "Tenant erişimi doğrulanamadı."
        });
    }
}

module.exports = tenantKontrol;
