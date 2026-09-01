const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/alisController");
const { yetkiKontrol } = require("../middleware/yetkiKontrol");
const tekIslemKontrol = require("../middleware/tekIslemKontrol");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);
router.use(yetkiKontrol("purchase.read"));
router.use(yetkiKontrol("supplier.read"));

router.get("/", controller.listele);
router.get("/iade", controller.iadeleriListele);
router.post("/iade", yetkiKontrol("purchase.write"), tekIslemKontrol("ALIS_IADE"), controller.iadeOlustur);
router.get("/iade/:id", controller.iadeDetay);
router.post("/iade/:id/iptal", yetkiKontrol("purchase.write"), tekIslemKontrol("ALIS_IADE_IPTAL"), controller.iadeIptalEt);
router.get("/siparis", controller.siparisleriListele);
router.post("/siparis", yetkiKontrol("purchase.write"), controller.siparisOlustur);
router.get("/:id", controller.detay);
router.patch("/:id", yetkiKontrol("purchase.write"), tekIslemKontrol("ALIS_DUZELTME"), controller.guncelle);
router.post("/:id/iptal", yetkiKontrol("purchase.write"), tekIslemKontrol("ALIS_IPTAL"), controller.iptalEt);
router.post("/", yetkiKontrol("purchase.write"), tekIslemKontrol("ALIS"), controller.olustur);

module.exports = router;
