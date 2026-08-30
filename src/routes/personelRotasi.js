const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/personelController");
const { yetkiKontrol } = require("../middleware/yetkiKontrol");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);
router.use(yetkiKontrol("tenant.users"));

router.get("/panel", controller.panel);
router.get("/", controller.listele);
router.get("/izinler", controller.izinListele);
router.post("/izinler", controller.izinOlustur);
router.patch("/izinler/:id/durum", controller.izinDurumGuncelle);
router.get("/devam", controller.devamListele);
router.post("/devam", controller.devamKaydet);
router.get("/:id", controller.detay);
router.post("/", controller.olustur);
router.patch("/:id", controller.guncelle);

module.exports = router;
