const ROL_ESLEME = { SATIS: "SALES", MUHASEBE: "ACCOUNTING", ETICARET: "ECOMMERCE", DEPO: "WAREHOUSE" };
const Kullanici = require("../models/Kullanici");
const YETKI_KATALOGU = [
    { kod: "sales.read", grup: "Satış", ad: "Satışları görüntüle" }, { kod: "sales.write", grup: "Satış", ad: "Satış, teklif ve sipariş oluştur / değiştir" },
    { kod: "party.read", grup: "Cari", ad: "Müşteri ve tedarikçileri görüntüle" }, { kod: "party.write", grup: "Cari", ad: "Müşteri ve tedarikçi yönet" },
    { kod: "stock.read", grup: "Stok", ad: "Ürün ve stokları görüntüle" }, { kod: "stock.write", grup: "Stok", ad: "Ürün, sayım ve transfer yönet" },
    { kod: "purchase.read", grup: "Satın Alma", ad: "Alışları görüntüle" }, { kod: "purchase.write", grup: "Satın Alma", ad: "Alış ve alış iadesi oluştur" },
    { kod: "cash.read", grup: "Finans", ad: "Kasa ve banka görüntüle" }, { kod: "cash.write", grup: "Finans", ad: "Kasa hareketi ve transfer yap" },
    { kod: "accounting.read", grup: "Muhasebe", ad: "Cari ve masrafları görüntüle" }, { kod: "accounting.write", grup: "Muhasebe", ad: "Tahsilat, ödeme ve masraf yönet" },
    { kod: "reports.read", grup: "Yönetim", ad: "Raporları görüntüle" }, { kod: "tenant.users", grup: "Yönetim", ad: "Kullanıcı ve yetkileri yönet" },
    { kod: "tenant.settings", grup: "Yönetim", ad: "Firma ve sistem ayarlarını yönet" }, { kod: "balance.adjust", grup: "Kritik", ad: "Cari bakiye düzelt" }
];
const YETKILER = {
    SUPER_ADMIN: ["*"], OWNER: ["*"], ADMIN: ["*"],
    MANAGER: ["sales.*", "purchase.*", "stock.*", "party.*", "reports.read"],
    SALES: ["sales.*", "party.read", "party.write", "stock.read", "reports.read"],
    CASHIER: ["cash.*", "party.read", "sales.read"],
    ACCOUNTING: ["cash.*", "accounting.*", "party.*", "reports.read", "sales.read", "purchase.read"],
    WAREHOUSE: ["stock.*", "sales.read", "purchase.read"],
    ECOMMERCE: ["sales.*", "party.read", "stock.read"]
};

function izinListesindeVar(izinler, gerekli) {
    return izinler.some(izin => izin === "*" || izin === gerekli || (izin.endsWith(".*") && gerekli.startsWith(izin.slice(0, -1))));
}

function izinVar(rol, gerekli) {
    const normalized = ROL_ESLEME[String(rol || "").toUpperCase()] || String(rol || "").toUpperCase();
    const izinler = YETKILER[normalized] || [];
    return izinListesindeVar(izinler, gerekli);
}

function etkinYetkiler(kullanici) {
    if (["SUPER_ADMIN", "OWNER", "ADMIN"].includes(String(kullanici?.rol || "").toUpperCase())) return YETKI_KATALOGU.map(x => x.kod);
    if (kullanici?.yetkiModu === "OZEL") return YETKI_KATALOGU.map(x => x.kod).filter(kod => izinListesindeVar(kullanici.ozelYetkiler || [], kod));
    return YETKI_KATALOGU.map(x => x.kod).filter(kod => izinVar(kullanici?.rol, kod) || izinListesindeVar(kullanici?.ozelYetkiler || [], kod));
}

function yetkiKontrol(...gerekliYetkiler) {
    return async (req, res, next) => {
        const guncel = req.currentUser;
        const rol = guncel?.rol || req.kullanici?.rol || req.user?.rol;
        if (["SUPER_ADMIN", "OWNER", "ADMIN"].includes(String(rol || "").toUpperCase())) return next();
        if (guncel?.yetkiModu === "OZEL" && gerekliYetkiler.some(izin => izinListesindeVar(guncel.ozelYetkiler || [], izin))) return next();
        if (guncel?.yetkiModu !== "OZEL" && gerekliYetkiler.some(izin => izinVar(rol, izin) || izinListesindeVar(guncel?.ozelYetkiler || [], izin))) return next();
        const kullaniciId = req.kullanici?.kullaniciId || req.user?.kullaniciId;
        if (kullaniciId) {
            const kullanici = await Kullanici.findOne({ _id: kullaniciId, aktif: true }).select("rol ozelYetkiler yetkiModu").lean();
            if (gerekliYetkiler.some(izin => izinListesindeVar(kullanici?.ozelYetkiler || [], izin))) return next();
        }
        res.locals.guvenlikOlayi = { kategori: "YETKISIZ_ERISIM", seviye: "UYARI" };
        return res.status(403).json({ basarili: false, mesaj: "Bu işlem için yetkiniz bulunmuyor." });
    };
}

module.exports = { yetkiKontrol, izinVar, etkinYetkiler, izinListesindeVar, YETKILER, YETKI_KATALOGU, ROL_ESLEME };
