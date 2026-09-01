const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

process.env.ENCRYPTION_KEY ||= "test-encryption-key-at-least-32-characters";
const ROOT = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(ROOT, file), "utf8");
const IntegrationConnection = require("./models/IntegrationConnection");
const EticaretSiparis = require("./models/EticaretSiparis");
const IncomingDocument = require("./models/IncomingDocument");
const MarketplaceReturn = require("./models/MarketplaceReturn");
const MarketplaceFinanceTransaction = require("./models/MarketplaceFinanceTransaction");
const MarketplaceCategoryMapping = require("./models/MarketplaceCategoryMapping");
const MarketplaceAdapter = require("./integrations/marketplace/MarketplaceAdapter");
const TrendyolAdapter = require("./integrations/marketplace/TrendyolAdapter");
const { guvenliDetay, tekrarDene } = require("./services/eticaretSyncServisi");

function uniqueIndex(Model, keys) { return Model.schema.indexes().some(([fields, options]) => keys.every(key => fields[key] === 1) && options.unique); }

test("Tenant A bağlantı sorgusu Tenant B kaydını kapsamayacak şekilde tenantId zorunludur", () => {
    const source = read("src/controllers/eticaretMerkeziController.js");
    assert.match(source, /IntegrationConnection\.find\(\{ tenantId: tId\(req\) \}\)/);
    assert.match(source, /_id: req\.params\.id, tenantId: tId\(req\)/);
});

test("Pazaryeri siparişleri tenant bazında listelenir", () => {
    const source = read("src/controllers/eticaretController.js");
    assert.match(source, /EticaretSiparis\.find\(\{\s*tenantId: tenantId\(req\)/);
});

test("API secret varsayılan sorguda seçilmez ve JSON response'tan çıkarılır", () => {
    assert.equal(IntegrationConnection.schema.path("encryptedCredentials").options.select, false);
    const doc = new IntegrationConnection({ tenantId: "507f1f77bcf86cd799439011", provider: "TRENDYOL", storeName: "Mağaza", encryptedCredentials: "secret" });
    assert.equal(doc.toJSON().encryptedCredentials, undefined);
});

test("Aynı marketplace siparişi tenant + provider + external ID ile tekildir", () => {
    assert.equal(uniqueIndex(EticaretSiparis, ["tenantId", "platform", "externalOrderId"]), true);
});

test("Aynı e-fatura UUID'si tenant içinde tekildir", () => {
    assert.equal(uniqueIndex(IncomingDocument, ["tenantId", "uuid"]), true);
});

test("İade iki kez işlenemez; dış iade kimliği tekildir ve processedAt izi vardır", () => {
    assert.equal(uniqueIndex(MarketplaceReturn, ["tenantId", "marketplace", "externalReturnId"]), true);
    assert.ok(MarketplaceReturn.schema.path("processedAt"));
});

test("Finans hareketi externalTransactionId ile idempotenttir", () => {
    assert.equal(uniqueIndex(MarketplaceFinanceTransaction, ["tenantId", "provider", "externalTransactionId"]), true);
});

test("Kategori eşleştirmesi tenant, bağlantı ve ERP kategorisi bazında tekildir", () => {
    assert.equal(uniqueIndex(MarketplaceCategoryMapping, ["tenantId", "connectionId", "erpCategory"]), true);
});

test("Entegrasyon ayarları yalnızca ecommerce.settings izniyle değişir", () => {
    const routes = read("src/routes/eticaretRotasi.js");
    for (const method of ["post", "patch", "delete"]) assert.match(routes, new RegExp(`router\\.${method}\\(\\"/connections`));
    assert.ok((routes.match(/yetkiKontrol\("ecommerce\.settings"\)/g) || []).length >= 4);
});

test("Eksik veya hatalı credential başarılı bağlantı gibi davranmaz", async () => {
    const adapter = new TrendyolAdapter({ provider: "TRENDYOL", environment: "STAGE", sellerId: "" }, {});
    await assert.rejects(() => adapter.testConnection(), error => error.code === "INTEGRATION_NOT_CONFIGURED");
});

test("Provider çökmesi kontrollü hata olur ve ERP işleminden çıkabilir", async () => {
    let count = 0;
    await assert.rejects(() => tekrarDene(async () => { count++; throw Object.assign(new Error("provider down"), { retryable: true }); }), /provider down/);
    assert.equal(count, 4);
});

test("Fatura gönderimi başarısızlığı sipariş modelini silen bir akış içermez", () => {
    const sync = read("src/services/eticaretSyncServisi.js");
    assert.doesNotMatch(sync, /EticaretSiparis\.delete/);
    assert.match(read("src/models/EticaretSiparis.js"), /providerInvoiceStatus/);
});

test("Masraf faturası açık kullanıcı onayı olmadan kaydedilmez", () => {
    const controller = read("src/controllers/eticaretMerkeziController.js");
    assert.match(controller, /body\.confirm !== true/);
    assert.match(controller, /USER_APPROVAL_REQUIRED/);
});

test("Stok ve fiyat yalnızca son gönderilen değerden değiştiğinde kuyruğa eklenir", () => {
    const sync = read("src/services/eticaretSyncServisi.js");
    assert.match(sync, /lastStockSent/); assert.match(sync, /lastPriceSent/); assert.match(sync, /if \(\(job\.type === "STOCK_PUSH" && !stockChanged\)/);
});

test("Teknik hata detaylarından secret, token ve authorization alanları temizlenir", () => {
    assert.deepEqual(guvenliDetay({ message: "x", apiKey: "a", nested: { token: "b", safe: 1 }, authorization: "c" }), { message: "x", nested: { safe: 1 } });
});

test("Marketplace adapter sözleşmesi istenen operasyonları taşır", () => {
    const methods = ["testConnection","getCategories","getCategoryAttributes","pushProducts","updateProducts","updateStock","updatePrices","pullOrders","getOrder","updateOrderStatus","pullReturns","pullCancellations","getCargoCompanies","createShipment","getShippingLabel","sendInvoice","pullSettlements","pullFinancialTransactions","pullCustomerQuestions"];
    for (const method of methods) assert.equal(typeof MarketplaceAdapter.prototype[method], "function", method);
});

test("E-Ticaret API kimliksiz erişimi reddeder", async () => {
    const app = require("./uygulama"), server = app.listen(0); await new Promise(resolve => server.once("listening", resolve));
    try { const { port } = server.address(); const status = await new Promise((resolve, reject) => { const req = http.get({ hostname: "127.0.0.1", port, path: "/api/tenant/eticaret/dashboard" }, res => { res.resume(); resolve(res.statusCode); }); req.on("error", reject); }); assert.equal(status, 401); }
    finally { await new Promise(resolve => server.close(resolve)); }
});

test("Frontend 13 sekme, tarih/pazaryeri filtresi ve responsive tasarım sunar", () => {
    const js = read("public/erp/erp.js"), css = read("public/erp/erp.css");
    const sekmeler = js.slice(js.indexOf("const eticaretSekmeleri"), js.indexOf("const eticaretProviderEtiketi"));
    assert.match(js, /E-Ticaret & E-Belge Entegrasyon Merkezi/); assert.equal((sekmeler.match(/\[\"/g) || []).length, 13);
    assert.match(js, /Özel Tarih Aralığı/); assert.match(js, /Tüm Pazaryerleri/); assert.match(css, /ecommerce-tabs/); assert.match(css, /max-width: 760px/);
    assert.match(js, /eticaretTabloAraclari/); assert.match(js, /XLSX\.utils\.table_to_sheet/); assert.match(js, /Bu tabloda ara/);
    assert.match(js, /ALINDI: "Alındı"/); assert.match(js, /TEST_MAGAZA: "Test Mağaza"/);
    assert.doesNotMatch(js.slice(js.indexOf("function raporHucre"), js.indexOf("function raporSatirlariniHazirla")), /JSON\.stringify/);
    assert.match(read("public/erp/index.html"), /topbar-logout/);
});
