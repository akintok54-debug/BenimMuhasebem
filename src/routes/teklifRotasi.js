const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/teklifController");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);

router.get("/", controller.listele);
router.post("/", controller.olustur);
router.patch("/:id/onayla", controller.onayla);
router.post("/:id/siparise-donustur", controller.sipariseDonustur);

module.exports = router;
