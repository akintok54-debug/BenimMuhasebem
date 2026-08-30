const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/eticaretController");
const { yetkiKontrol } = require("../middleware/yetkiKontrol");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);
router.use(yetkiKontrol("sales.read"));

router.get("/siparisler", controller.listele);
router.post("/siparisler/al", yetkiKontrol("sales.write"), controller.al);

module.exports = router;
