const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/finansController");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);

router.get("/ozet", controller.ozet);

router.get("/kasalar", controller.kasaListele);
router.post("/kasalar", controller.kasaOlustur);

router.get("/bankalar", controller.bankaListele);
router.post("/bankalar", controller.bankaOlustur);

router.get("/para-hareketleri", controller.paraHareketleri);
router.post("/para-hareketleri", controller.hesapHareketi);

router.post("/transfer", controller.transfer);

module.exports = router;
