const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const tedarikciController = require("../controllers/tedarikciController");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);

router.get("/", tedarikciController.listele);
router.get("/:id", tedarikciController.detay);
router.post("/", tedarikciController.olustur);
router.patch("/:id", tedarikciController.guncelle);
router.patch("/:id/durum", tedarikciController.durumDegistir);

module.exports = router;
