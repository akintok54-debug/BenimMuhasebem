const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/personelController");
const finansController = require("../controllers/personelFinansController");
const { yetkiKontrol } = require("../middleware/yetkiKontrol");
const tekIslemKontrol = require("../middleware/tekIslemKontrol");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);
router.use(yetkiKontrol("tenant.users"));
router.use((req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });

router.get("/panel", controller.panel);
router.get("/", controller.listele);
router.get("/izinler", controller.izinListele);
router.post("/izinler", controller.izinOlustur);
router.patch("/izinler/:id/durum", controller.izinDurumGuncelle);
router.get("/devam", controller.devamListele);
router.post("/devam", controller.devamKaydet);
router.post("/bordro/tahakkuk", tekIslemKontrol("PERSONEL_TOPLU_TAHAKKUK"), finansController.topluMaasTahakkuku);
router.get("/:id/finans", finansController.finansDetay);
router.post("/:id/finans/islem", tekIslemKontrol("PERSONEL_FINANS"), finansController.islemOlustur);
router.post("/:id/finans/:islemId/iptal", tekIslemKontrol("PERSONEL_FINANS_IPTAL"), finansController.iptalEt);
router.get("/:id", controller.detay);
router.post("/", controller.olustur);
router.patch("/:id", controller.guncelle);

module.exports = router;
