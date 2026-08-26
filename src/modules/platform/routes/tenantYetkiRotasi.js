const express = require("express");
const kimlikKontrol = require("../../../middleware/kimlikKontrol");

const superAdminKontrol =
    require("../middleware/superAdmin");

const controller =
    require("../controllers/tenantYetkiController");

const router = express.Router();

router.use(kimlikKontrol);

router.use(superAdminKontrol);

router.get(
    "/:tenantId",
    controller.durum
);

router.get(
    "/:tenantId/kota/:kota",
    controller.kota
);

module.exports = router;


