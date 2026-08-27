const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/alisController");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);

router.get("/", controller.listele);
router.get("/iade", controller.iadeleriListele);
router.post("/iade", controller.iadeOlustur);
router.get("/siparis", controller.siparisleriListele);
router.post("/siparis", controller.siparisOlustur);
router.get("/:id", controller.detay);
router.post("/", controller.olustur);

module.exports = router;
