const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/personelController");
const { yetkiKontrol } = require("../middleware/yetkiKontrol");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);

router.get("/", controller.listele);
router.get("/:id", controller.detay);
router.post("/", yetkiKontrol("tenant.users"), controller.olustur);
router.patch("/:id", yetkiKontrol("tenant.users"), controller.guncelle);

module.exports = router;
