const express = require("express");
const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const { yetkiKontrol } = require("../middleware/yetkiKontrol");
const tekIslemKontrol = require("../middleware/tekIslemKontrol");
const controller = require("../controllers/sahaController");

const router = express.Router();
router.use(kimlikKontrol);
router.use(tenantKontrol);
router.use(yetkiKontrol("field.read"));
router.use((req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });

router.get("/panel", controller.panel);
router.get("/takip", yetkiKontrol("field.settle"), controller.takip);
router.get("/musteriler/:id/finans", controller.musteriFinans);
router.post("/gun/baslat", yetkiKontrol("field.write"), controller.gunBaslat);
router.post("/gun/bitir", yetkiKontrol("field.write"), controller.gunBitir);
router.patch("/rota", yetkiKontrol("field.write"), controller.rotaGuncelle);
router.post("/ziyaret/baslat", yetkiKontrol("field.write"), controller.ziyaretBaslat);
router.post("/ziyaret/:id/bitir", yetkiKontrol("field.write"), controller.ziyaretBitir);
router.post("/mola/baslat", yetkiKontrol("field.write"), controller.molaBaslat);
router.post("/mola/:id/bitir", yetkiKontrol("field.write"), controller.molaBitir);
router.post("/masraf", yetkiKontrol("field.write"), tekIslemKontrol("SAHA_MASRAF"), controller.masrafOlustur);
router.post("/tesellum/:id/teslim-al", yetkiKontrol("field.settle"), tekIslemKontrol("GUN_SONU_TESELLUM"), controller.teslimAl);
router.post("/kasa-teslim", yetkiKontrol("field.settle"), tekIslemKontrol("GUN_SONU_TESELLUM"), controller.kasaTeslim);
router.post("/tesellum/paylas", yetkiKontrol("field.read"), controller.tesellumPaylas);

module.exports = router;
