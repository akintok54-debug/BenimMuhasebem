const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/stokController");
const { yetkiKontrol } = require("../middleware/yetkiKontrol");
const tekIslemKontrol = require("../middleware/tekIslemKontrol");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);
router.use(yetkiKontrol("stock.read"));

router.get("/depolar", controller.depolar);
router.post("/depolar", yetkiKontrol("stock.write"), controller.depoOlustur);
router.patch("/depolar/:id", yetkiKontrol("stock.write"), controller.depoGuncelle);

router.get("/", controller.listele);
router.post("/hareket", yetkiKontrol("stock.write"), tekIslemKontrol("STOK_HAREKETI"), controller.hareket);
router.post("/transfer", yetkiKontrol("stock.write"), tekIslemKontrol("STOK_TRANSFERI"), controller.transfer);
router.get("/transferler", controller.transferler);
router.post("/sayim", yetkiKontrol("stock.write"), tekIslemKontrol("STOK_SAYIMI"), controller.sayim);
router.get("/sayimlar", controller.sayimlar);
router.get("/hareketler", controller.hareketler);

module.exports = router;
