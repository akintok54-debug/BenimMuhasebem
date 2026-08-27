const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/cariController");
const { yetkiKontrol } = require("../middleware/yetkiKontrol");

const router = express.Router();

router.get("/paylasim/:token", controller.paylasilanEkstre);

router.use(kimlikKontrol);
router.use(tenantKontrol);

router.get("/ozet", controller.ozet);
router.get("/hareketler", controller.hareketler);

router.post("/musteri/tahsilat", yetkiKontrol("accounting.write", "cash.write"), controller.musteriTahsilat);
router.post("/musteri/odeme", yetkiKontrol("accounting.write", "cash.write"), controller.musteriOdeme);
router.patch("/musteri/:musteriId/bakiye", yetkiKontrol("balance.adjust"), controller.musteriBakiyeDuzelt);
router.post("/musteri/hareket", yetkiKontrol("accounting.write"), controller.musteriManuelHareket);
router.post("/musteri/:musteriId/ekstre-paylas", controller.ekstrePaylas);
router.post("/tedarikci/odeme", yetkiKontrol("accounting.write", "cash.write"), controller.tedarikciOdeme);
router.post("/tedarikci/tahsilat", yetkiKontrol("accounting.write", "cash.write"), controller.tedarikciTahsilat);
router.post("/tedarikci/hareket", yetkiKontrol("accounting.write"), controller.tedarikciManuelHareket);
router.patch("/tedarikci/:tedarikciId/bakiye", yetkiKontrol("balance.adjust"), controller.tedarikciBakiyeDuzelt);

module.exports = router;
