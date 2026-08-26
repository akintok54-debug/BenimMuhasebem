const express = require("express");
const kimlikKontrol = require("../../../middleware/kimlikKontrol");

const superAdminKontrol = require("../middleware/superAdmin");
const controller = require("../controllers/planController");

const router = express.Router();

router.use(kimlikKontrol);

router.use(superAdminKontrol);

router.get("/", controller.listele);
router.post("/", controller.olustur);
router.patch("/:id/status", controller.durumDegistir);

module.exports = router;


