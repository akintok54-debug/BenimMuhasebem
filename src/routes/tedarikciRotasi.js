const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const tedarikciController = require("../controllers/tedarikciController");
const { yetkiKontrol } = require("../middleware/yetkiKontrol");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);

router.get("/", tedarikciController.listele);
router.get("/:id", tedarikciController.detay);
router.post("/", yetkiKontrol("party.write"), tedarikciController.olustur);
router.patch("/:id", yetkiKontrol("party.write"), tedarikciController.guncelle);
router.patch("/:id/durum", yetkiKontrol("party.write"), tedarikciController.durumDegistir);

module.exports = router;
