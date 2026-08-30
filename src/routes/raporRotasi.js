const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/raporController");
const { yetkiKontrol } = require("../middleware/yetkiKontrol");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);
router.use(yetkiKontrol("reports.read"));

router.get("/genel", controller.genel);
router.get("/satis", controller.satis);
router.get("/alis", controller.alis);
router.get("/stok", controller.stok);
router.get("/cari", controller.cari);
router.get("/personel", controller.personel);

module.exports = router;
