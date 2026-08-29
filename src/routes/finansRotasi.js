const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/finansController");
const { yetkiKontrol } = require("../middleware/yetkiKontrol");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);

router.get("/ozet", controller.ozet);

router.get("/kasalar", controller.kasaListele);
router.post("/kasalar", yetkiKontrol("cash.write"), controller.kasaOlustur);

router.get("/bankalar", controller.bankaListele);
router.post("/bankalar", yetkiKontrol("cash.write"), controller.bankaOlustur);
router.patch("/hesaplar/:tip/:id", yetkiKontrol("cash.write"), controller.hesapGuncelle);

router.get("/para-hareketleri", controller.paraHareketleri);
router.post("/para-hareketleri", yetkiKontrol("cash.write"), controller.hesapHareketi);

router.post("/transfer", yetkiKontrol("cash.write"), controller.transfer);

module.exports = router;
