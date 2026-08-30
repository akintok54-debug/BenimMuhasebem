const express = require("express");
const controller = require("../controllers/authController");
const kimlikKontrol = require("../../../middleware/kimlikKontrol");
const tenantKontrol = require("../../../middleware/tenantKontrol");
const { rateLimit } = require("../../../middleware/guvenlikKatmani");

const router = express.Router();

router.post("/login", rateLimit({ pencereMs: 15 * 60 * 1000, limit: 10, anahtar: req => `login:${req.ip}:${String(req.body?.email || "").toLowerCase()}` }), controller.login);
router.post("/kayit", rateLimit({ pencereMs: 60 * 60 * 1000, limit: 5, anahtar: req => `kayit:${req.ip}:${String(req.body?.email || "").toLowerCase()}` }), controller.kayit);
router.post("/sifremi-unuttum", rateLimit({ pencereMs: 15 * 60 * 1000, limit: 5, anahtar: req => `forgot:${req.ip}:${String(req.body?.email || "").toLowerCase()}` }), controller.sifremiUnuttum);
router.post("/sifre-yenile", rateLimit({ pencereMs: 15 * 60 * 1000, limit: 10, anahtar: req => `reset:${req.ip}` }), controller.sifreYenile);
router.post("/2fa-dogrula", rateLimit({ pencereMs: 5 * 60 * 1000, limit: 10, anahtar: req => `2fa:${req.ip}` }), controller.ikiFaktorDogrula);
router.post("/logout", controller.logout);
router.use(kimlikKontrol, tenantKontrol);
router.get("/profil", controller.profil);
router.patch("/profil", controller.profilGuncelle);
router.post("/sifre-degistir", controller.sifreDegistir);
router.delete("/hesap", controller.hesapSil);
router.get("/verilerim", controller.verilerimiDisariAktar);
router.post("/2fa-baslat", controller.ikiFaktorBaslat);
router.post("/2fa-onayla", controller.ikiFaktorOnayla);
router.post("/2fa-kapat", controller.ikiFaktorKapat);

module.exports = router;
