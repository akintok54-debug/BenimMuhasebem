const ROL_ESLEME = { SATIS: "SALES", MUHASEBE: "ACCOUNTING", ETICARET: "ECOMMERCE", DEPO: "WAREHOUSE" };
const YETKILER = {
    SUPER_ADMIN: ["*"], OWNER: ["*"], ADMIN: ["*"],
    MANAGER: ["sales.*", "purchase.*", "stock.*", "party.*", "reports.read"],
    SALES: ["sales.*", "party.read", "party.write", "stock.read", "reports.read"],
    CASHIER: ["cash.*", "party.read", "sales.read"],
    ACCOUNTING: ["cash.*", "accounting.*", "party.*", "reports.read", "sales.read", "purchase.read"],
    WAREHOUSE: ["stock.*", "sales.read", "purchase.read"],
    ECOMMERCE: ["sales.*", "party.read", "stock.read"]
};

function izinVar(rol, gerekli) {
    const normalized = ROL_ESLEME[String(rol || "").toUpperCase()] || String(rol || "").toUpperCase();
    const izinler = YETKILER[normalized] || [];
    return izinler.some(izin => izin === "*" || izin === gerekli || (izin.endsWith(".*") && gerekli.startsWith(izin.slice(0, -1))));
}

function yetkiKontrol(...gerekliYetkiler) {
    return (req, res, next) => {
        const rol = req.kullanici?.rol || req.user?.rol;
        if (gerekliYetkiler.some(izin => izinVar(rol, izin))) return next();
        res.locals.guvenlikOlayi = { kategori: "YETKISIZ_ERISIM", seviye: "UYARI" };
        return res.status(403).json({ basarili: false, mesaj: "Bu işlem için yetkiniz bulunmuyor." });
    };
}

module.exports = { yetkiKontrol, izinVar, YETKILER, ROL_ESLEME };
