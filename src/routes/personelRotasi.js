const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/personelController");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);

router.get("/", controller.listele);
router.get("/:id", controller.detay);
router.post("/", controller.olustur);
router.patch("/:id", controller.guncelle);

module.exports = router;
