const express = require("express");

const kimlikKontrol = require("../../../middleware/kimlikKontrol");
const superAdminKontrol = require("../middleware/superAdmin");
const dashboardController = require("../controllers/dashboardController");

const router = express.Router();

router.use(kimlikKontrol);
router.use(superAdminKontrol);

router.get("/", dashboardController.dashboard);

module.exports = router;
