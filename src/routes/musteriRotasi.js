const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const musteriController = require("../controllers/musteriController");
const { yetkiKontrol } = require("../middleware/yetkiKontrol");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);
router.use(yetkiKontrol("customer.read"));

router.get("/", musteriController.listele);
router.get("/:id", musteriController.detay);
router.post("/", yetkiKontrol("customer.write"), musteriController.olustur);
router.patch("/:id", yetkiKontrol("customer.write"), musteriController.guncelle);
router.patch("/:id/durum", yetkiKontrol("customer.write"), musteriController.durumDegistir);
router.delete("/:id", yetkiKontrol("customer.write"), musteriController.sil);

module.exports = router;
