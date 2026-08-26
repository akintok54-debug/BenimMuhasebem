const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/eticaretController");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);

router.get("/siparisler", controller.listele);
router.post("/siparisler/al", controller.al);

module.exports = router;
