const express = require("express");

const kimlikKontrol =
    require("../middleware/kimlikKontrol");

const tenantKontrol =
    require("../middleware/tenantKontrol");

const controller =
    require("../controllers/piyasaController");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);

router.get("/", controller.piyasa);

module.exports = router;
