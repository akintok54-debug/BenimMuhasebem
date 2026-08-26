const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/stokController");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);

router.get("/depolar", controller.depolar);
router.post("/depolar", controller.depoOlustur);

router.get("/", controller.listele);
router.post("/hareket", controller.hareket);
router.get("/hareketler", controller.hareketler);

module.exports = router;
