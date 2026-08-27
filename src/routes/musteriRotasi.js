const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const musteriController = require("../controllers/musteriController");
const { yetkiKontrol } = require("../middleware/yetkiKontrol");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);

router.get("/", musteriController.listele);
router.get("/:id", musteriController.detay);
router.post("/", yetkiKontrol("party.write"), musteriController.olustur);
router.patch("/:id", yetkiKontrol("party.write"), musteriController.guncelle);
router.patch("/:id/durum", yetkiKontrol("party.write"), musteriController.durumDegistir);
router.delete("/:id", yetkiKontrol("party.write"), musteriController.sil);

module.exports = router;
