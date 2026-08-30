const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/cariController");
const { yetkiKontrol } = require("../middleware/yetkiKontrol");

const router = express.Router();

router.get("/paylasim/:token", controller.paylasilanEkstre);

router.use(kimlikKontrol);
router.use(tenantKontrol);

router.get("/ozet", yetkiKontrol("customer.read", "supplier.read"), controller.ozet);
router.get("/hareketler", yetkiKontrol("customer.read", "supplier.read"), controller.hareketler);

router.post("/musteri/tahsilat", yetkiKontrol("customer.write"), yetkiKontrol("accounting.write", "cash.write"), controller.musteriTahsilat);
router.patch("/musteri/tahsilat/:id", yetkiKontrol("customer.write"), yetkiKontrol("accounting.write", "cash.write"), controller.musteriTahsilatGuncelle);
router.delete("/musteri/tahsilat/:id", yetkiKontrol("customer.write"), yetkiKontrol("accounting.write", "cash.write"), controller.musteriTahsilatSil);
router.post("/musteri/odeme", yetkiKontrol("customer.write"), yetkiKontrol("accounting.write", "cash.write"), controller.musteriOdeme);
router.patch("/musteri/:musteriId/bakiye", yetkiKontrol("customer.write"), yetkiKontrol("balance.adjust"), controller.musteriBakiyeDuzelt);
router.post("/musteri/hareket", yetkiKontrol("customer.write"), yetkiKontrol("accounting.write"), controller.musteriManuelHareket);
router.post("/musteri/:musteriId/ekstre-paylas", yetkiKontrol("customer.read"), controller.ekstrePaylas);
router.post("/tedarikci/odeme", yetkiKontrol("supplier.write"), yetkiKontrol("accounting.write", "cash.write"), controller.tedarikciOdeme);
router.post("/tedarikci/tahsilat", yetkiKontrol("supplier.write"), yetkiKontrol("accounting.write", "cash.write"), controller.tedarikciTahsilat);
router.post("/tedarikci/hareket", yetkiKontrol("supplier.write"), yetkiKontrol("accounting.write"), controller.tedarikciManuelHareket);
router.patch("/tedarikci/:tedarikciId/bakiye", yetkiKontrol("supplier.write"), yetkiKontrol("balance.adjust"), controller.tedarikciBakiyeDuzelt);

module.exports = router;
