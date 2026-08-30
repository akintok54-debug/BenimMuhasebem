const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/stokController");
const { yetkiKontrol } = require("../middleware/yetkiKontrol");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);
router.use(yetkiKontrol("stock.read"));

router.get("/depolar", controller.depolar);
router.post("/depolar", yetkiKontrol("stock.write"), controller.depoOlustur);

router.get("/", controller.listele);
router.post("/hareket", yetkiKontrol("stock.write"), controller.hareket);
router.post("/transfer", yetkiKontrol("stock.write"), controller.transfer);
router.get("/transferler", controller.transferler);
router.post("/sayim", yetkiKontrol("stock.write"), controller.sayim);
router.get("/sayimlar", controller.sayimlar);
router.get("/hareketler", controller.hareketler);

module.exports = router;
