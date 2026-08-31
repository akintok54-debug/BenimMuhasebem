const mongoose = require("mongoose");
const { tenantAboneliginiKontrolEt } = require("../services/abonelikServisi");
const Kullanici = require("../models/Kullanici");
const Tenant = require("../modules/platform/models/Tenant");
const { kaydet: auditKaydet } = require("../modules/platform/services/auditServisi");

async function eskiTenantSahibiniDogrula(req, kullanici) {
    if (String(kullanici?.rol || "").toUpperCase() !== "ADMIN") return false;
    const tenantId = kullanici.tenantId;
    const [tenant, ownerVar] = await Promise.all([
        Tenant.findById(tenantId).select("createdBy createdAt").lean(),
        Kullanici.exists({ tenantId, rol: "OWNER", silinmeTarihi: null })
    ]);
    if (!tenant || ownerVar) return false;

    let kurucuMu = String(tenant.createdBy || "") === String(kullanici._id);
    if (!tenant.createdBy) {
        const ilkKullanici = await Kullanici.findOne({ tenantId, silinmeTarihi: null }).select("_id").sort({ createdAt: 1, _id: 1 }).lean();
        kurucuMu = String(ilkKullanici?._id || "") === String(kullanici._id);
    }
    if (!kurucuMu) return false;

    const sonuc = await Kullanici.updateOne({ _id: kullanici._id, tenantId, rol: "ADMIN", silinmeTarihi: null }, { $set: { rol: "OWNER" } });
    if (!sonuc.modifiedCount) return false;
    if (!tenant.createdBy) await Tenant.updateOne({ _id: tenantId, createdBy: null }, { $set: { createdBy: kullanici._id } });
    kullanici.rol = "OWNER";
    await auditKaydet({ req, action: "LEGACY_TENANT_OWNER_REPAIR", resource: "Kullanici", resourceId: String(kullanici._id), tenantId, category: "KULLANICI_YETKI", severity: "UYARI", details: { eskiRol: "ADMIN", yeniRol: "OWNER", neden: "Sahibi olmayan eski tenant kurucu hesabı" } });
    return true;
}

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
        await eskiTenantSahibiniDogrula(req, guncelKullanici);
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
module.exports.eskiTenantSahibiniDogrula = eskiTenantSahibiniDogrula;
