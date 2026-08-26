const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/tenantDashboardController");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);

router.get("/dashboard", controller.dashboard);

router.get(
    "/firma",
    controller.firma
);

router.patch(
    "/firma",
    controller.firmaGuncelle
);

module.exports = router;

