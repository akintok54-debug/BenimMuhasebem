const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/whatsappController");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);

router.get("/mesajlar", controller.listele);
router.post("/mesajlar/kuyruga-ekle", controller.kuyrugaEkle);

module.exports = router;
