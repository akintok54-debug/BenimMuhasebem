const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/alisController");
const { yetkiKontrol } = require("../middleware/yetkiKontrol");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);
router.use(yetkiKontrol("purchase.read"));

router.get("/", controller.listele);
router.get("/iade", controller.iadeleriListele);
router.post("/iade", yetkiKontrol("purchase.write"), controller.iadeOlustur);
router.get("/siparis", controller.siparisleriListele);
router.post("/siparis", yetkiKontrol("purchase.write"), controller.siparisOlustur);
router.get("/:id", controller.detay);
router.post("/", yetkiKontrol("purchase.write"), controller.olustur);

module.exports = router;
