const express = require("express");
const aknEntegrasyonKontrol = require("../middleware/aknEntegrasyonKontrol");
const urunController = require("../controllers/urunController");

const router = express.Router();
router.use(aknEntegrasyonKontrol);

router.get("/health", (req, res) => res.json({ basarili: true, entegrasyon: "AKN_ETICARET" }));
router.get("/urunler", urunController.listele);
router.post("/urunler", urunController.olustur);
router.patch("/urunler/:id", urunController.guncelle);
router.get("/kategoriler", urunController.kategorileriListele);
router.post("/kategoriler", urunController.kategoriOlustur);

module.exports = router;
