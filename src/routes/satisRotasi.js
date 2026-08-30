const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/satisController");
const { yetkiKontrol } = require("../middleware/yetkiKontrol");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);
router.use(yetkiKontrol("sales.read"));

router.get("/", controller.listele);
router.get("/panel", controller.panel);
router.get("/iade", controller.iadeleriListele);
router.post("/iade", yetkiKontrol("sales.write"), controller.iadeAl);
router.get("/:id", controller.detay);
router.patch("/:id", yetkiKontrol("sales.write"), controller.guncelle);
router.delete("/:id", yetkiKontrol("sales.write"), controller.sil);
router.post("/", yetkiKontrol("sales.write"), controller.olustur);

module.exports = router;
