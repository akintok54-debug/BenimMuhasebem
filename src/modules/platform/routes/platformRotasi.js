const express = require("express");

const kimlikKontrol = require("../../../middleware/kimlikKontrol");
const superAdminKontrol = require("../middleware/superAdmin");
const tenantController = require("../controllers/tenantController");
const guvenlikController = require("../controllers/guvenlikController");
const kullaniciController = require("../controllers/kullaniciController");

const router = express.Router();

/*
 * SUPER ADMIN GUVENLIK ZINCIRI
 * 1. JWT kimlik kontrolü
 * 2. SUPER_ADMIN rol kontrolü
 * 3. şlem
 */
router.use(kimlikKontrol);
router.use(superAdminKontrol);
const { rateLimit } = require("../../../middleware/guvenlikKatmani");
const { onayKontrol } = require("../services/platformGuvenligi");
const operations = require("../controllers/operationsController");
router.use(rateLimit({ pencereMs: 60000, limit: 180, anahtar: req => `platform:${req.currentUser._id}` }));
router.use(onayKontrol);
router.get("/health", operations.health);
router.get("/notifications", require("../controllers/notificationController").listele);
router.get("/integrations", operations.integrations);
router.get("/tenants/:id/overview", operations.firma);
router.patch("/tenants/:id/subscription", operations.subscriptionUpdate);
router.post("/tenants/:id/users/:userId/password-reset", operations.passwordReset);
router.post("/support", operations.supportStart);
router.get("/support/:id", operations.supportRead);
router.post("/support/:id/close", operations.supportEnd);
router.patch("/errors/:id/resolution", operations.errorResolve);

/* KIRACI YONETIMI */
router.get("/tenants", tenantController.listele);
router.get("/tenants/:id", tenantController.detay);
router.post("/tenants", tenantController.olustur);
router.patch("/tenants/:id/status", tenantController.durumDegistir);
router.patch("/tenants/:id/modules", tenantController.modulGuncelle);
router.post("/tenants/:id/users", tenantController.kullaniciOlustur);
router.get("/users", kullaniciController.listele);
router.get("/guvenlik-merkezi", guvenlikController.merkez);
router.get("/audit-kayitlari", guvenlikController.auditKayitlari);
router.get("/sistem-hatalari", guvenlikController.sistemHatalari);

/* PLATFORM DURUMU */
router.get("/durum", (req, res) => {
    res.json({
        basarili: true,
        sistem: "BENIMMUHASEBE PLATFORM",
        domain: "benimmuhasebe.com",
        rol: "SUPER_ADMIN",
        kullanici: {
            email: req.kullanici.email || "",
            rol: req.kullanici.rol
        }
    });
});

module.exports = router;


