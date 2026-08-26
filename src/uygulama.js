require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const hataYonetici = require("./middleware/hataYonetici");
const saglikRotasi = require("./routes/saglikRotasi");
const authRotasi = require("./modules/auth/routes/authRotasi");

const uygulama = express();

uygulama.use(helmet());
uygulama.use(cors());
uygulama.use(express.json({ limit: "10mb" }));
uygulama.use(express.urlencoded({ extended: true }));
uygulama.use(morgan("dev"));

const publicKlasoru = path.join(__dirname, "..", "public");
uygulama.use(express.static(publicKlasoru));
uygulama.use(
    "/vendor/xlsx",
    express.static(path.join(__dirname, "..", "node_modules", "xlsx", "dist"))
);

uygulama.get("/", (req, res) => {
    res.json({
        basarili: true,
        sistem: "BAHADIR ERP V2",
        platform: "BENIMMUHASEBE",
        domain: "benimmuhasebe.com",
        mesaj: "ERP + E-Ticaret API çalışıyor."
    });
});

uygulama.get("/api/saglik", saglikRotasi);
const tenantRotasi = require("./routes/tenantRotasi");
uygulama.use("/api/tenant", tenantRotasi);

const musteriRotasi = require("./routes/musteriRotasi");
uygulama.use("/api/tenant/musteriler", musteriRotasi);

const tedarikciRotasi = require("./routes/tedarikciRotasi");
uygulama.use("/api/tenant/tedarikciler", tedarikciRotasi);

const urunRotasi = require("./routes/urunRotasi");
const stokRotasi = require("./routes/stokRotasi");

uygulama.use("/api/tenant/urunler", urunRotasi);
uygulama.use("/api/tenant/stok", stokRotasi);

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















