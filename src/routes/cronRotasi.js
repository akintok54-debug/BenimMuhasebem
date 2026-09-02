const express = require("express");
const crypto = require("crypto");
const { ideasoftSiparisleriniOtomatikSirayaAl } = require("../services/eticaretSyncServisi");

const router = express.Router();

// Vercel serverless ortamında setInterval kalıcı olmadığından otomatik sipariş çekme Vercel Cron ile tetiklenir.
// Vercel, CRON_SECRET ortam değişkeni tanımlıysa cron isteklerine otomatik "Authorization: Bearer <CRON_SECRET>" ekler.
function cronYetkiKontrol(req, res, next) {
    const secret = String(process.env.CRON_SECRET || "").trim();
    if (!secret) return res.status(404).json({ basarili: false, mesaj: "Bulunamadı." });
    const header = Buffer.from(String(req.headers.authorization || ""));
    const expected = Buffer.from(`Bearer ${secret}`);
    if (header.length !== expected.length || !crypto.timingSafeEqual(header, expected)) return res.status(401).json({ basarili: false, mesaj: "Yetkisiz." });
    next();
}

router.get("/ideasoft-siparisleri", cronYetkiKontrol, async (req, res) => {
    try {
        const connectionCount = await ideasoftSiparisleriniOtomatikSirayaAl();
        res.json({ basarili: true, connectionCount });
    } catch (error) {
        console.error("IDEASOFT_CRON_SIPARIS_HATASI", { name: error.name, message: error.message });
        res.status(500).json({ basarili: false, mesaj: "Senkronizasyon tetiklenemedi." });
    }
});

module.exports = router;
