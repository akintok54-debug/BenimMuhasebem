const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const tedarikciController = require("../controllers/tedarikciController");
const { yetkiKontrol } = require("../middleware/yetkiKontrol");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);
router.use(yetkiKontrol("supplier.read"));

router.get("/", tedarikciController.listele);
router.get("/:id/merkez", yetkiKontrol("purchase.read"), tedarikciController.merkez);
router.get("/:id", tedarikciController.detay);
router.post("/", yetkiKontrol("supplier.write"), tedarikciController.olustur);
router.patch("/:id", yetkiKontrol("supplier.write"), tedarikciController.guncelle);
router.patch("/:id/durum", yetkiKontrol("supplier.write"), tedarikciController.durumDegistir);
router.delete("/:id", yetkiKontrol("supplier.write"), tedarikciController.sil);

module.exports = router;
