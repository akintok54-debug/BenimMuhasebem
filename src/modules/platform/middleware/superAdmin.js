function superAdminKontrol(req, res, next) {

    const kullanici = req.kullanici || req.user;

    if (!kullanici) {
        return res.status(401).json({
            basarili: false,
            mesaj: "Kimlik doğrulaması gerekli."
        });
    }

    const rol = kullanici.rol || kullanici.role;

    if (rol !== "SUPER_ADMIN") {
        return res.status(403).json({
            basarili: false,
            mesaj: "Bu işlem yalnızca Süper Admin tarafından yapılabilir."
        });
    }

    req.kullanici = kullanici;
    req.user = kullanici;

    next();
}

module.exports = superAdminKontrol;
