const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/teklifController");
const { yetkiKontrol } = require("../middleware/yetkiKontrol");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);
router.use(yetkiKontrol("sales.read"));

router.get("/", controller.listele);
router.get("/:id", controller.detay);
router.post("/", yetkiKontrol("sales.write"), controller.olustur);
router.patch("/:id", yetkiKontrol("sales.write"), controller.guncelle);
router.patch("/:id/onayla", yetkiKontrol("sales.write"), controller.onayla);
router.post("/:id/siparise-donustur", yetkiKontrol("sales.write"), controller.sipariseDonustur);

module.exports = router;
