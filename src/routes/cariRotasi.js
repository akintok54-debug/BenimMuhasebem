const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/cariController");
const { yetkiKontrol } = require("../middleware/yetkiKontrol");
const tekIslemKontrol = require("../middleware/tekIslemKontrol");

const router = express.Router();

router.get("/paylasim/:token", controller.paylasilanEkstre);

router.use(kimlikKontrol);
router.use(tenantKontrol);

router.get("/ozet", yetkiKontrol("customer.read", "supplier.read"), controller.ozet);
router.get("/hareketler", yetkiKontrol("customer.read", "supplier.read"), controller.hareketler);

router.post("/musteri/tahsilat", yetkiKontrol("customer.write"), yetkiKontrol("accounting.write", "cash.write", "field.write"), tekIslemKontrol("MUSTERI_TAHSILAT"), controller.musteriTahsilat);
router.patch("/musteri/tahsilat/:id", yetkiKontrol("customer.write"), yetkiKontrol("accounting.write", "cash.write"), tekIslemKontrol("MUSTERI_TAHSILAT_GUNCELLEME"), controller.musteriTahsilatGuncelle);
router.delete("/musteri/tahsilat/:id", yetkiKontrol("customer.write"), yetkiKontrol("accounting.write", "cash.write"), tekIslemKontrol("MUSTERI_TAHSILAT_IPTAL"), controller.musteriTahsilatSil);
router.post("/musteri/odeme", yetkiKontrol("customer.write"), yetkiKontrol("accounting.write", "cash.write"), tekIslemKontrol("MUSTERI_ODEME"), controller.musteriOdeme);
router.patch("/musteri/:musteriId/bakiye", yetkiKontrol("customer.write"), yetkiKontrol("balance.adjust"), tekIslemKontrol("MUSTERI_BAKIYE_DUZELTME"), controller.musteriBakiyeDuzelt);
router.post("/musteri/hareket", yetkiKontrol("customer.write"), yetkiKontrol("accounting.write"), tekIslemKontrol("MUSTERI_CARI"), controller.musteriManuelHareket);
router.post("/musteri/:musteriId/ekstre-paylas", yetkiKontrol("customer.read"), controller.ekstrePaylas);
router.post("/tedarikci/odeme", yetkiKontrol("supplier.write"), yetkiKontrol("accounting.write", "cash.write"), tekIslemKontrol("TEDARIKCI_ODEME"), controller.tedarikciOdeme);
router.patch("/tedarikci/odeme/:id", yetkiKontrol("supplier.write"), yetkiKontrol("accounting.write", "cash.write"), tekIslemKontrol("TEDARIKCI_ODEME_DUZELTME"), controller.tedarikciOdemeGuncelle);
router.post("/tedarikci/odeme/:id/iptal", yetkiKontrol("supplier.write"), yetkiKontrol("accounting.write", "cash.write"), tekIslemKontrol("TEDARIKCI_ODEME_IPTAL"), controller.tedarikciOdemeIptal);
router.post("/tedarikci/tahsilat", yetkiKontrol("supplier.write"), yetkiKontrol("accounting.write", "cash.write"), tekIslemKontrol("TEDARIKCI_TAHSILAT"), controller.tedarikciTahsilat);
router.post("/tedarikci/hareket", yetkiKontrol("supplier.write"), yetkiKontrol("accounting.write"), tekIslemKontrol("TEDARIKCI_CARI"), controller.tedarikciManuelHareket);
router.patch("/tedarikci/:tedarikciId/bakiye", yetkiKontrol("supplier.write"), yetkiKontrol("balance.adjust"), tekIslemKontrol("TEDARIKCI_BAKIYE_DUZELTME"), controller.tedarikciBakiyeDuzelt);

module.exports = router;
