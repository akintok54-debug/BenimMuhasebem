const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const musteriController = require("../controllers/musteriController");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);

router.get("/", musteriController.listele);
router.get("/:id", musteriController.detay);
router.post("/", musteriController.olustur);
router.patch("/:id", musteriController.guncelle);
router.patch("/:id/durum", musteriController.durumDegistir);

module.exports = router;
