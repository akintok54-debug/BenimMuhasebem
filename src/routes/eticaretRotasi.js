const express = require("express");

const kimlikKontrol = require("../middleware/kimlikKontrol");
const tenantKontrol = require("../middleware/tenantKontrol");
const controller = require("../controllers/eticaretController");
const merkez = require("../controllers/eticaretMerkeziController");
const { yetkiKontrol } = require("../middleware/yetkiKontrol");

const router = express.Router();

router.use(kimlikKontrol);
router.use(tenantKontrol);
router.get("/dashboard", yetkiKontrol("ecommerce.view"), merkez.dashboard);
router.get("/connections", yetkiKontrol("ecommerce.view"), merkez.connections);
router.post("/connections", yetkiKontrol("ecommerce.settings"), merkez.connectionCreate);
router.patch("/connections/:id", yetkiKontrol("ecommerce.settings"), merkez.connectionUpdate);
router.delete("/connections/:id", yetkiKontrol("ecommerce.settings"), merkez.connectionDisable);
router.post("/connections/:id/test", yetkiKontrol("ecommerce.settings"), merkez.connectionTest);
router.post("/sync", yetkiKontrol("ecommerce.sync"), merkez.syncCreate);
router.get("/sync-jobs", yetkiKontrol("ecommerce.view"), merkez.syncJobs);
router.get("/errors", yetkiKontrol("ecommerce.view"), merkez.errors);
router.post("/errors/:id/retry", yetkiKontrol("ecommerce.sync"), merkez.errorRetry);
router.get("/products/mappings", yetkiKontrol("ecommerce.products"), merkez.mappings);
router.put("/products/:productId/mapping", yetkiKontrol("ecommerce.products"), merkez.mappingUpsert);
router.get("/category-mappings", yetkiKontrol("ecommerce.products"), merkez.categoryMappings);
router.put("/category-mappings", yetkiKontrol("ecommerce.products"), merkez.categoryMappingUpsert);
router.get("/returns", yetkiKontrol("ecommerce.returns", "ecommerce.view"), merkez.returns);
router.get("/finance", yetkiKontrol("ecommerce.finance"), merkez.finance);
router.post("/finance/:id/match", yetkiKontrol("ecommerce.finance"), merkez.financeMatch);
router.get("/documents", yetkiKontrol("ecommerce.documents"), merkez.documents);
router.get("/documents/:id/file/:format", yetkiKontrol("ecommerce.documents"), merkez.documentFile);
router.post("/documents/:id/match-supplier", yetkiKontrol("ecommerce.documents"), merkez.documentMatchSupplier);
router.post("/documents/:id/approve-expense", yetkiKontrol("ecommerce.documents", "ecommerce.finance"), merkez.documentApproveExpense);
router.post("/documents/:id/archive", yetkiKontrol("ecommerce.documents"), merkez.documentArchive);
router.get("/questions", yetkiKontrol("ecommerce.orders", "ecommerce.view"), merkez.questions);
router.post("/questions/:id/answer", yetkiKontrol("ecommerce.orders"), merkez.questionAnswer);
router.get("/siparisler", yetkiKontrol("ecommerce.view", "ecommerce.orders", "sales.read"), controller.listele);
router.post("/siparisler/al", yetkiKontrol("ecommerce.orders", "sales.write"), controller.al);

module.exports = router;
