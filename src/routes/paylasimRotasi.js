const express = require("express");
const controller = require("../controllers/paylasimController");
const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const { yetkiKontrol } = require("../middleware/yetkiKontrol");

const publicRouter = express.Router();
publicRouter.get("/:token", controller.paylasilanBelge);

const tenantRouter = express.Router();
tenantRouter.use(kimlikKontrol);
tenantRouter.use(tenantKontrol);
tenantRouter.use(yetkiKontrol("sales.read"));
tenantRouter.post("/", yetkiKontrol("sales.write"), controller.paylasimOlustur);

module.exports = { publicRouter, tenantRouter };
