const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/urunController");
const { yetkiKontrol } = require("../middleware/yetkiKontrol");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);

router.get("/kategoriler", controller.kategorileriListele);
router.post("/kategoriler", yetkiKontrol("stock.write"), controller.kategoriOlustur);
router.delete("/kategoriler", yetkiKontrol("stock.write"), controller.kategoriSil);
router.delete("/kategoriler/:id", yetkiKontrol("stock.write"), controller.kategoriSil);
router.get("/ozel-fiyatlar", controller.ozelFiyatlariListele);
router.post("/ozel-fiyatlar", yetkiKontrol("sales.write"), controller.ozelFiyatOlustur);
router.patch("/ozel-fiyatlar/:id", yetkiKontrol("sales.write"), controller.ozelFiyatGuncelle);
router.delete("/ozel-fiyatlar/:id", yetkiKontrol("sales.write"), controller.ozelFiyatSil);
router.get("/", controller.listele);
router.get("/:id", controller.detay);
router.post("/", yetkiKontrol("stock.write"), controller.olustur);
router.patch("/:id", yetkiKontrol("stock.write"), controller.guncelle);

module.exports = router;
