const Kullanici = require("../../../models/Kullanici");

async function superAdminKontrol(req, res, next) {

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

    try {
        const id = kullanici.kullaniciId || kullanici.id || kullanici._id;
        const current = id && await Kullanici.findOne({ _id: id, rol: "SUPER_ADMIN", aktif: true, silinmeTarihi: null }).select("adSoyad email rol tenantId hesapDurumu").lean();
        if (!current || current.hesapDurumu === "suspended") return res.status(403).json({ basarili: false, mesaj: "Platform yetkisi kaldırılmış veya hesap kilitli." });
        req.currentUser = current;
    } catch (error) { return next(error); }
    req.kullanici = kullanici;
    req.user = kullanici;

    next();
}

module.exports = superAdminKontrol;
