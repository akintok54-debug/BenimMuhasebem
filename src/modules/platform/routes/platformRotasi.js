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


