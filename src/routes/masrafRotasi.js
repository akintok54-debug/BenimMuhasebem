const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/masrafController");
const { yetkiKontrol } = require("../middleware/yetkiKontrol");
const tekIslemKontrol = require("../middleware/tekIslemKontrol");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);
router.use(yetkiKontrol("accounting.read"));

router.get("/", controller.listele);
router.get("/ozet", controller.ozet);
router.post("/", yetkiKontrol("accounting.write"), tekIslemKontrol("MASRAF"), controller.olustur);
router.get("/:id", controller.detay);
router.patch("/:id", yetkiKontrol("accounting.write"), controller.guncelle);
router.post("/:id/iptal", yetkiKontrol("accounting.write"), tekIslemKontrol("MASRAF_IPTAL"), controller.iptalEt);

module.exports = router;
