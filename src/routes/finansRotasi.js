const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/finansController");
const { yetkiKontrol } = require("../middleware/yetkiKontrol");
const tekIslemKontrol = require("../middleware/tekIslemKontrol");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);
router.use(yetkiKontrol("cash.read"));
router.use((req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
});

router.get("/ozet", controller.ozet);

router.get("/kasalar", controller.kasaListele);
router.get("/kasalar/:id/ekstre", controller.kasaEkstresi);
router.get("/kasalar/:id/rapor", controller.kasaRaporu);
router.post("/kasalar", yetkiKontrol("cash.write"), tekIslemKontrol("KASA_ACILIS"), controller.kasaOlustur);

router.get("/bankalar", controller.bankaListele);
router.post("/bankalar", yetkiKontrol("cash.write"), tekIslemKontrol("BANKA_ACILIS"), controller.bankaOlustur);
router.patch("/hesaplar/:tip/:id", yetkiKontrol("cash.write"), controller.hesapGuncelle);

router.get("/para-hareketleri", controller.paraHareketleri);
router.get("/para-hareketleri/:id", controller.paraHareketDetay);
router.get("/cek-senet-portfoyu", controller.cekSenetPortfoyu);
router.post("/para-hareketleri", yetkiKontrol("cash.write"), tekIslemKontrol("PARA_HAREKETI"), controller.hesapHareketi);
router.post("/para-hareketleri/:id/iptal", yetkiKontrol("cash.write"), tekIslemKontrol("PARA_HAREKETI_IPTAL"), controller.manuelHareketIptal);

router.post("/transfer", yetkiKontrol("cash.write"), tekIslemKontrol("HESAP_TRANSFERI"), controller.transfer);

module.exports = router;
