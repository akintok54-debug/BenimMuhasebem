const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/cariController");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);

router.get("/ozet", controller.ozet);
router.get("/hareketler", controller.hareketler);

router.post("/musteri/tahsilat", controller.musteriTahsilat);
router.post("/tedarikci/odeme", controller.tedarikciOdeme);

module.exports = router;
