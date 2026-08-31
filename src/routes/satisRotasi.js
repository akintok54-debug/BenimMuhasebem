const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/satisController");
const { yetkiKontrol } = require("../middleware/yetkiKontrol");
const tekIslemKontrol = require("../middleware/tekIslemKontrol");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);
router.use(yetkiKontrol("sales.read"));

router.get("/", controller.listele);
router.get("/panel", controller.panel);
router.get("/iade", controller.iadeleriListele);
router.post("/iade", yetkiKontrol("sales.write"), tekIslemKontrol("SATIS_IADE"), controller.iadeAl);
router.get("/:id", controller.detay);
router.patch("/:id", yetkiKontrol("sales.write"), tekIslemKontrol("SATIS_GUNCELLEME"), controller.guncelle);
router.delete("/:id", yetkiKontrol("sales.write"), tekIslemKontrol("SATIS_IPTAL"), controller.sil);
router.post("/", yetkiKontrol("sales.write"), tekIslemKontrol("SATIS"), controller.olustur);

module.exports = router;
