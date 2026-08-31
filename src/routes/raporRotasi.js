const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/raporController");
const { yetkiKontrol } = require("../middleware/yetkiKontrol");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);
router.use(yetkiKontrol("reports.read"));

router.get("/filtreler", controller.filtreler);
router.get("/profesyonel", controller.profesyonel);
router.get("/detay/:kod", controller.detay);
router.get("/genel", controller.genel);
router.get("/satis", yetkiKontrol("customer.read"), controller.satis);
router.get("/alis", yetkiKontrol("supplier.read"), yetkiKontrol("purchase.read"), controller.alis);
router.get("/stok", controller.stok);
router.get("/cari", yetkiKontrol("customer.read", "supplier.read"), controller.cari);
router.get("/personel", controller.personel);

module.exports = router;
