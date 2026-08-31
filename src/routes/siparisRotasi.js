const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/siparisController");
const { yetkiKontrol } = require("../middleware/yetkiKontrol");
const tekIslemKontrol = require("../middleware/tekIslemKontrol");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);
router.use(yetkiKontrol("sales.read"));

router.get("/", controller.listele);
router.get("/:id", controller.detay);
router.post("/", yetkiKontrol("sales.write"), controller.olustur);
router.patch("/:id", yetkiKontrol("sales.write"), controller.guncelle);
router.post("/:id/satisa-donustur", yetkiKontrol("sales.write"), tekIslemKontrol("SIPARISTEN_SATIS"), controller.satisdonustur);

module.exports = router;
