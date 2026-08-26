const express = require("express");
const kimlikKontrol = require("../../../middleware/kimlikKontrol");

const superAdminKontrol = require("../middleware/superAdmin");
const controller = require("../controllers/subscriptionController");

const router = express.Router();

router.use(kimlikKontrol);

router.use(superAdminKontrol);

router.get("/", controller.listele);

router.get(
    "/tenant/:tenantId",
    controller.tenantAbonelik
);

router.post(
    "/ata",
    controller.ata
);

router.patch(
    "/:id/status",
    controller.durumDegistir
);

router.patch(
    "/:id/usage",
    controller.kullanimGuncelle
);

module.exports = router;


