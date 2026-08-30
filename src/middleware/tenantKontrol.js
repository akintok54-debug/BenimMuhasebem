const mongoose = require("mongoose");
const { tenantAboneliginiKontrolEt } = require("../services/abonelikServisi");
const Kullanici = require("../models/Kullanici");

async function tenantKontrol(req, res, next) {
    try {
        const kullanici = req.kullanici || req.user;
        if (!kullanici) return res.status(401).json({ basarili: false, mesaj: "Kimlik doğrulaması gerekli." });

        const rol = String(kullanici.rol || kullanici.role || "").toUpperCase();
        if (["SUPER_ADMIN", "SUPERADMIN", "PLATFORM_ADMIN"].includes(rol)) {
            return res.status(403).json({ basarili: false, mesaj: "Süper yönetici işletme işlemleri için platform panelini kullanmalıdır." });
        }

        const id = String(kullanici.tenantId || "");
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(403).json({ basarili: false, mesaj: "İşletme erişimi doğrulanamadı." });
        const guncelKullanici = await Kullanici.findOne({ _id: kullanici.kullaniciId, tenantId: id, aktif: true, silinmeTarihi: null })
            .select("adSoyad email telefon rol aktif ozelYetkiler yetkiModu tenantId").lean();
        if (!guncelKullanici) return res.status(401).json({ basarili: false, mesaj: "Kullanıcı hesabı pasif veya oturum yetkisi kaldırılmış." });
        req.currentUser = guncelKullanici;
        req.kullanici.rol = guncelKullanici.rol;
        req.tenantId = id;

        const kontrol = await tenantAboneliginiKontrolEt(id);
        if (!kontrol.erisim) {
            res.locals.guvenlikOlayi = { kategori: "ABONELIK_ERISIMI", seviye: "BILGI" };
            return res.status(kontrol.httpStatus).json({ basarili: false, kod: kontrol.kod, mesaj: kontrol.mesaj, abonelik: kontrol.abonelik || null, yonlendir: "/erp/abonelik.html" });
        }
        req.tenant = kontrol.tenant;
        req.abonelik = kontrol.abonelik;
        return next();
    } catch (_) {
        return res.status(403).json({ basarili: false, mesaj: "İşletme erişimi doğrulanamadı." });
    }
}

module.exports = tenantKontrol;
