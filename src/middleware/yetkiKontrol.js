const ROL_ESLEME = { SATIS: "SALES", MUHASEBE: "ACCOUNTING", ETICARET: "ECOMMERCE", DEPO: "WAREHOUSE" };
const Kullanici = require("../models/Kullanici");
const YETKI_KATALOGU = [
    { kod: "field.read", grup: "Saha", ad: "Saha operasyonunu görüntüle" }, { kod: "field.write", grup: "Saha", ad: "Saha günü, ziyaret ve rota yönet" }, { kod: "field.settle", grup: "Saha", ad: "Saha personeli gün sonu teslim al" },
    { kod: "sales.read", grup: "Satış", ad: "Satışları görüntüle" }, { kod: "sales.write", grup: "Satış", ad: "Satış, teklif ve sipariş oluştur / değiştir" },
    { kod: "customer.read", grup: "Müşteri", ad: "Müşterileri görüntüle" }, { kod: "customer.write", grup: "Müşteri", ad: "Müşteri yönet" },
    { kod: "supplier.read", grup: "Tedarikçi", ad: "Tedarikçileri görüntüle" }, { kod: "supplier.write", grup: "Tedarikçi", ad: "Tedarikçi yönet" },
    { kod: "stock.read", grup: "Stok", ad: "Ürün ve stokları görüntüle" }, { kod: "stock.write", grup: "Stok", ad: "Ürün, sayım ve transfer yönet" },
    { kod: "purchase.read", grup: "Satın Alma", ad: "Alışları görüntüle" }, { kod: "purchase.write", grup: "Satın Alma", ad: "Alış ve alış iadesi oluştur" },
    { kod: "cash.read", grup: "Finans", ad: "Kasa ve banka görüntüle" }, { kod: "cash.write", grup: "Finans", ad: "Kasa hareketi ve transfer yap" },
    { kod: "accounting.read", grup: "Muhasebe", ad: "Cari ve masrafları görüntüle" }, { kod: "accounting.write", grup: "Muhasebe", ad: "Tahsilat, ödeme ve masraf yönet" },
    { kod: "reports.read", grup: "Yönetim", ad: "Raporları görüntüle" }, { kod: "tenant.users", grup: "Yönetim", ad: "Kullanıcı ve yetkileri yönet" },
    { kod: "tenant.settings", grup: "Yönetim", ad: "Firma ve sistem ayarlarını yönet" }, { kod: "balance.adjust", grup: "Kritik", ad: "Cari bakiye düzelt" }
];
const YETKILER = {
    SUPER_ADMIN: ["*"], OWNER: ["*"], ADMIN: ["*"],
    MANAGER: ["sales.*", "purchase.*", "stock.*", "customer.*", "supplier.*", "field.*", "cash.read", "reports.read"],
    SALES: ["sales.*", "field.read", "field.write", "customer.read", "customer.write", "stock.read"],
    CASHIER: ["cash.*", "customer.read", "sales.read"],
    ACCOUNTING: ["cash.*", "accounting.*", "customer.*", "supplier.*", "reports.read", "sales.read", "purchase.read"],
    WAREHOUSE: ["stock.*", "sales.read", "purchase.read", "supplier.read"],
    ECOMMERCE: ["sales.*", "customer.read", "stock.read"]
};

const ESKI_CARI_YETKILERI = {
    "customer.read": ["party.read"],
    "customer.write": ["party.write"],
    "supplier.read": ["party.read"],
    "supplier.write": ["party.write"]
};

function izinListesindeVar(izinler, gerekli) {
    const kabulEdilenler = [gerekli, ...(ESKI_CARI_YETKILERI[gerekli] || [])];
    return izinler.some(izin => izin === "*" || kabulEdilenler.some(kod => izin === kod || (izin.endsWith(".*") && kod.startsWith(izin.slice(0, -1)))));
}

function kullaniciIzinListesindeVar(kullanici, gerekli) {
    const rol = ROL_ESLEME[String(kullanici?.rol || "").toUpperCase()] || String(kullanici?.rol || "").toUpperCase();
    const izinler = kullanici?.ozelYetkiler || [];
    if (rol === "SALES" && gerekli.startsWith("supplier.")) {
        return izinler.some(izin => izin === "*" || izin === gerekli || (izin.endsWith(".*") && gerekli.startsWith(izin.slice(0, -1))));
    }
    return izinListesindeVar(izinler, gerekli);
}

function izinVar(rol, gerekli) {
    const normalized = ROL_ESLEME[String(rol || "").toUpperCase()] || String(rol || "").toUpperCase();
    const izinler = YETKILER[normalized] || [];
    return izinListesindeVar(izinler, gerekli);
}

function etkinYetkiler(kullanici) {
    if (["SUPER_ADMIN", "OWNER", "ADMIN"].includes(String(kullanici?.rol || "").toUpperCase())) return YETKI_KATALOGU.map(x => x.kod);
    if (kullanici?.yetkiModu === "OZEL") return YETKI_KATALOGU.map(x => x.kod).filter(kod => kullaniciIzinListesindeVar(kullanici, kod));
    return YETKI_KATALOGU.map(x => x.kod).filter(kod => izinVar(kullanici?.rol, kod) || kullaniciIzinListesindeVar(kullanici, kod));
}

function yetkiKontrol(...gerekliYetkiler) {
    return async (req, res, next) => {
        const guncel = req.currentUser;
        const rol = guncel?.rol || req.kullanici?.rol || req.user?.rol;
        if (["SUPER_ADMIN", "OWNER", "ADMIN"].includes(String(rol || "").toUpperCase())) return next();
        if (guncel?.yetkiModu === "OZEL" && gerekliYetkiler.some(izin => kullaniciIzinListesindeVar(guncel, izin))) return next();
        if (guncel?.yetkiModu !== "OZEL" && gerekliYetkiler.some(izin => izinVar(rol, izin) || kullaniciIzinListesindeVar(guncel, izin))) return next();
        const kullaniciId = req.kullanici?.kullaniciId || req.user?.kullaniciId;
        if (kullaniciId) {
            const kullanici = await Kullanici.findOne({ _id: kullaniciId, aktif: true }).select("rol ozelYetkiler yetkiModu").lean();
            if (gerekliYetkiler.some(izin => kullaniciIzinListesindeVar(kullanici, izin))) return next();
        }
        res.locals.guvenlikOlayi = { kategori: "YETKISIZ_ERISIM", seviye: "UYARI" };
        return res.status(403).json({ basarili: false, mesaj: "Bu işlem için yetkiniz bulunmuyor." });
    };
}

module.exports = { yetkiKontrol, izinVar, etkinYetkiler, izinListesindeVar, kullaniciIzinListesindeVar, YETKILER, YETKI_KATALOGU, ROL_ESLEME };
