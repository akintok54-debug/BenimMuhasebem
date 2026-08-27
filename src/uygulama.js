require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const hataYonetici = require("./middleware/hataYonetici");
const saglikRotasi = require("./routes/saglikRotasi");
const authRotasi = require("./modules/auth/routes/authRotasi");
const { rateLimit, istekKimligi, girdiTemizleme, httpsZorunlulugu } = require("./middleware/guvenlikKatmani");
const auditMiddleware = require("./middleware/auditMiddleware");
const { csrfKontrol } = require("./services/oturumGuvenligi");

const uygulama = express();
if (process.env.NODE_ENV === "production") uygulama.set("trust proxy", 1);

uygulama.get(["/", "/giris", "/login"], (req, res) => {
    res.redirect(302, "/erp/login.html");
});

uygulama.use(helmet({ crossOriginResourcePolicy: { policy: "same-origin" } }));
uygulama.use(istekKimligi);
uygulama.use(auditMiddleware);
const corsIzinleri = new Set([
    ...String(process.env.CORS_ORIGINS || "").split(","),
    process.env.PUBLIC_APP_URL,
    "https://benimmuhasebe.com",
    "https://www.benimmuhasebe.com"
].map(x => String(x || "").trim().replace(/\/$/, "")).filter(Boolean));
uygulama.use(cors({
    credentials: true,
    origin(origin, callback) {
        const yerel = !origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
        if (yerel || corsIzinleri.has(String(origin).replace(/\/$/, ""))) return callback(null, true);
        return callback(Object.assign(new Error("CORS erişimi reddedildi."), { status: 403 }));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id", "X-CSRF-Token"]
}));
uygulama.use(express.json({ limit: "10mb" }));
uygulama.use(express.urlencoded({ extended: true }));
uygulama.use(girdiTemizleme);
uygulama.use(csrfKontrol);
uygulama.use(httpsZorunlulugu);
uygulama.use(rateLimit({ pencereMs: 15 * 60 * 1000, limit: 500, anahtar: req => `api:${req.ip}` }));
uygulama.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev", { skip: req => req.path === "/api/saglik" }));

const publicKlasoru = path.join(__dirname, "..", "public");
uygulama.use(express.static(publicKlasoru));
uygulama.use(
    "/vendor/xlsx",
    express.static(path.join(__dirname, "..", "node_modules", "xlsx", "dist"))
);

uygulama.get("/api/saglik", saglikRotasi);
const tenantRotasi = require("./routes/tenantRotasi");
uygulama.use("/api/tenant", tenantRotasi);

const musteriRotasi = require("./routes/musteriRotasi");
uygulama.use("/api/tenant/musteriler", musteriRotasi);

const tedarikciRotasi = require("./routes/tedarikciRotasi");
uygulama.use("/api/tenant/tedarikciler", tedarikciRotasi);

const urunRotasi = require("./routes/urunRotasi");
const stokRotasi = require("./routes/stokRotasi");
const ayarRotasi = require("./routes/ayarRotasi");

uygulama.use("/api/tenant/urunler", urunRotasi);
uygulama.use("/api/tenant/stok", stokRotasi);
uygulama.use("/api/tenant/ayarlar", ayarRotasi);

const alisRotasi = require("./routes/alisRotasi");
uygulama.use("/api/tenant/alis", alisRotasi);

const satisRotasi = require("./routes/satisRotasi");
uygulama.use("/api/tenant/satis", satisRotasi);

const cariRotasi = require("./routes/cariRotasi");
uygulama.use("/api/tenant/cari", cariRotasi);

const teklifRotasi = require("./routes/teklifRotasi");
const siparisRotasi = require("./routes/siparisRotasi");

uygulama.use("/api/tenant/teklifler", teklifRotasi);
uygulama.use("/api/tenant/siparisler", siparisRotasi);

const personelRotasi = require("./routes/personelRotasi");
const raporRotasi = require("./routes/raporRotasi");

uygulama.use("/api/tenant/personeller", personelRotasi);
uygulama.use("/api/tenant/kullanicilar", require("./routes/kullaniciYonetimRotasi"));
uygulama.use("/api/tenant/raporlar", raporRotasi);

const eticaretRotasi = require("./routes/eticaretRotasi");
const whatsappRotasi = require("./routes/whatsappRotasi");

uygulama.use("/api/tenant/eticaret", eticaretRotasi);
uygulama.use("/api/tenant/whatsapp", whatsappRotasi);

const finansRotasi = require("./routes/finansRotasi");
uygulama.use("/api/tenant/finans", finansRotasi);

const masrafRotasi = require("./routes/masrafRotasi");
uygulama.use("/api/tenant/masraflar", masrafRotasi);

const piyasaRotasi =
    require("./routes/piyasaRotasi");

uygulama.use(
    "/api/tenant/piyasa",
    piyasaRotasi
);

uygulama.use("/api/auth", authRotasi);

try {
    const platformRotasi = require("./modules/platform/routes/platformRotasi");
    uygulama.use("/api/platform", platformRotasi);
} catch (error) {
    console.warn("Platform rotası yüklenemedi:", error.message);
}

try {
    const planRotasi = require("./modules/platform/routes/planRotasi");
    uygulama.use("/api/platform/plans", planRotasi);
} catch (error) {
    console.warn("Plan rotası yüklenemedi:", error.message);
}

try {
    const tenantYetkiRotasi = require("./modules/platform/routes/tenantYetkiRotasi");
    uygulama.use("/api/platform/tenant-yetki", tenantYetkiRotasi);
} catch (error) {
    console.warn("Tenant yetki rotası yüklenemedi:", error.message);
}

try {
    const dashboardRotasi = require("./modules/platform/routes/dashboardRotasi");
    uygulama.use("/api/platform/dashboard", dashboardRotasi);
} catch (error) {
    console.warn("Dashboard rotası yüklenemedi:", error.message);
}

try {
    const subscriptionRotasi = require("./modules/platform/routes/subscriptionRotasi");
    uygulama.use("/api/platform/subscriptions", subscriptionRotasi);
} catch (error) {
    console.warn("Subscription rotası yüklenemedi:", error.message);
}

uygulama.use(hataYonetici);

module.exports = uygulama;















