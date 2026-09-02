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
const MarketplaceProductMapping = require("./models/MarketplaceProductMapping");
const MarketplaceAdapter = require("./integrations/marketplace/MarketplaceAdapter");
const TrendyolAdapter = require("./integrations/marketplace/TrendyolAdapter");
const IdeaSoftAdapter = require("./integrations/marketplace/IdeaSoftAdapter");
const { domainUrl } = require("./integrations/marketplace/IdeaSoftAdapter");
const { guvenliDetay, tekrarDene, ideasoftSiparisSatirlariniNormalizeEt } = require("./services/eticaretSyncServisi");

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

test("IdeaSoft cron tetikleyicisi CRON_SECRET olmadan devre dışıdır ve sabit zamanlı karşılaştırma kullanır", () => {
    const source = read("src/routes/cronRotasi.js");
    assert.match(source, /CRON_SECRET/);
    assert.match(source, /timingSafeEqual/);
    assert.match(source, /if \(!secret\) return res\.status\(404\)/);
    assert.match(source, /ideasoftSiparisleriniOtomatikSirayaAl/);
});

test("IdeaSoft cron rotası uygulamaya bağlanır ve Vercel cron zamanlaması tanımlanır", () => {
    const uygulamaSource = read("src/uygulama.js");
    assert.match(uygulamaSource, /require\("\.\/routes\/cronRotasi"\)/);
    assert.match(uygulamaSource, /uygulama\.use\("\/api\/cron", cronRotasi\)/);
    const vercelConfig = JSON.parse(read("vercel.json"));
    assert.ok(Array.isArray(vercelConfig.crons) && vercelConfig.crons.some(x => x.path === "/api/cron/ideasoft-siparisleri"));
});

test("IdeaSoft cron hata loglaması ham hata nesnesini değil yalnızca ad/mesaj alanlarını yazar", () => {
    const source = read("src/routes/cronRotasi.js");
    assert.match(source, /console\.error\("IDEASOFT_CRON_SIPARIS_HATASI", \{ name: error\.name, message: error\.message \}\)/);
    assert.doesNotMatch(source, /error\.stack/);
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
    const methods = ["testConnection","pullProducts","getCategories","getCategoryAttributes","pushProducts","updateProducts","updateStock","updatePrice","updatePrices","pullOrders","getOrder","updateOrderStatus","pullCustomers","pullCategories","pullReturns","pullCancellations","getCargoCompanies","createShipment","getShippingLabel","sendInvoice","pullSettlements","pullFinancialTransactions","pullCustomerQuestions"];
    for (const method of methods) assert.equal(typeof MarketplaceAdapter.prototype[method], "function", method);
});

test("IdeaSoft adapter yalnız resmi HTTPS mağaza domainini ve doğrulanmış Admin API yollarını kullanır", async () => {
    assert.equal(domainUrl("akn-motosiklet.myideasoft.com").toString(), "https://akn-motosiklet.myideasoft.com/");
    assert.equal(domainUrl("idearm25.shops.myideasoft.com").toString(), "https://idearm25.shops.myideasoft.com/");
    assert.throws(() => domainUrl("http://localhost:5000"), /HTTPS/);
    assert.throws(() => domainUrl("https://example.com"), /myideasoft\.com/);
    assert.throws(() => domainUrl("https://myideasoft.com.evil.example"), /myideasoft\.com/);
    const calls = [];
    const adapter = new IdeaSoftAdapter({ provider: "IDEASOFT", apiBaseUrl: "https://akn-motosiklet.myideasoft.com", active: true }, { clientId: "client", clientSecret: "secret", accessToken: "token" });
    adapter.request = async (url, options = {}) => { calls.push({ url, options }); return []; };
    await adapter.pullProducts({ limit: 5 }); await adapter.pullOrders({ limit: 5 }); await adapter.pullCustomers({ limit: 5 }); await adapter.pullCategories({ limit: 5 });
    assert.deepEqual(calls.map(x => x.url), ["/admin-api/products", "/admin-api/orders", "/admin-api/members", "/admin-api/categories"]);
    assert.equal(adapter.authorizationUrl({ redirectUri: "https://www.benimmuhasebe.com/api/tenant/eticaret/ideasoft/oauth/callback", state: "state" }).includes("/panel/auth"), true);
});

test("IdeaSoft stok ve fiyat güncellemesi resmi Product GET/PUT kaynağını kullanır", async () => {
    const calls = [], adapter = new IdeaSoftAdapter({ _id: "507f1f77bcf86cd799439011", tenantId: "507f1f77bcf86cd799439012", provider: "IDEASOFT", apiBaseUrl: "https://akn-motosiklet.myideasoft.com", active: true }, { clientId: "client", clientSecret: "secret", accessToken: "token" });
    adapter.request = async (url, options = {}) => { calls.push({ url, options }); return options.method === "PUT" ? options.body : { id: 123, name: "Ürün", sku: "SKU-1", stockAmount: 2, price1: 10 }; };
    await adapter.updateStock([{ externalProductId: "123", quantity: 7 }]);
    await adapter.updatePrice([{ externalProductId: "123", salePrice: 15.5 }]);
    assert.deepEqual(calls.map(x => [x.url, x.options.method || "GET"]), [["/admin-api/products/123", "GET"], ["/admin-api/products/123", "PUT"], ["/admin-api/products/123", "GET"], ["/admin-api/products/123", "PUT"]]);
    assert.equal(calls[1].options.body.stockAmount, 7);
    assert.equal(calls[3].options.body.price1, 15.5);
});

test("IdeaSoft sipariş satırları stockCode ve iç içe ürün alanlarından normalize edilir", () => {
    const rows = ideasoftSiparisSatirlariniNormalizeEt({ orderItems: [{ quantity: 2, productPrice: 149.9, taxRate: 20, product: { id: 44, stockCode: "AKN-44", barcode: "8690000044" } }] });
    assert.equal(rows.length, 1);
    assert.deepEqual({ sku: rows[0].externalSku, barcode: rows[0].externalBarcode, productId: rows[0].externalProductId, miktar: rows[0].miktar, fiyat: rows[0].birimFiyat, vergi: rows[0].vergi }, { sku: "AKN-44", barcode: "8690000044", productId: "44", miktar: 2, fiyat: 149.9, vergi: 20 });
});

test("Eşleşmeyen IdeaSoft siparişi görünür bekleyen kayıt olarak saklanabilir", () => {
    assert.ok(EticaretSiparis.schema.path("durum").enumValues.includes("ESLESME_BEKLIYOR"));
    assert.equal(Boolean(EticaretSiparis.schema.path("urunler").schema.path("urunId").options.required), false);
});

test("IdeaSoft token ağ hatası kontrollü ve yeniden denenebilir servis hatasına dönüşür", async () => {
    const adapter = new IdeaSoftAdapter({ provider: "IDEASOFT", apiBaseUrl: "https://akn-motosiklet.myideasoft.com", active: true }, { clientId: "client", clientSecret: "secret" });
    adapter.assertPublicStore = async () => {};
    const originalFetch = global.fetch;
    global.fetch = async () => { throw Object.assign(new Error("socket closed"), { name: "TypeError" }); };
    try {
        await assert.rejects(adapter.tokenRequest({ grant_type: "client_credentials" }), error => error.code === "PROVIDER_UNAVAILABLE" && error.status === 503 && error.retryable === true);
    } finally { global.fetch = originalFetch; }
});

test("IdeaSoft tenant izolasyonu oturum tenantıyla korunur ve AKN rollout kimliğiyle sınırlıdır", () => {
    const controller = read("src/controllers/eticaretMerkeziController.js"), routes = read("src/routes/eticaretRotasi.js"), uygulama = read("src/uygulama.js");
    assert.match(controller, /IDEASOFT_AKN_TENANT_ID/);
    assert.match(controller, /req\.user\?\.tenantId/);
    assert.match(controller, /IDEASOFT_AKN_TENANT_ID = "6a8dc53a3ff8c8a32ff9545b"/);
    assert.match(controller, /_id: req\.params\.id, tenantId, active: true/);
    assert.match(controller, /select\("\+encryptedCredentials"\)/);
    assert.match(controller, /pilotStatus !== "SUCCESS"/);
    assert.match(routes, /ideasoft\/pilot-test/);
    assert.match(controller, /api\/integrations\/ideasoft\/callback/);
    assert.match(uygulama, /\/api\/integrations\/ideasoft\/callback/);
});

test("IdeaSoft tenant kontrolü varsayılan AKN tenantını kabul eder ve diğer tenantı reddeder", () => {
    const { ideasoftTenantKontrol } = require("./controllers/eticaretMerkeziController");
    const onceki = process.env.IDEASOFT_AKN_TENANT_ID;
    const tenantA = "6a8dc53a3ff8c8a32ff9545b", tenantB = "507f1f77bcf86cd799439012";
    try {
        delete process.env.IDEASOFT_AKN_TENANT_ID;
        assert.doesNotThrow(() => ideasoftTenantKontrol(tenantA));
        assert.throws(() => ideasoftTenantKontrol(tenantB), error => error.code === "INTEGRATION_NOT_CONFIGURED" && error.status === 409);
        process.env.IDEASOFT_AKN_TENANT_ID = tenantA;
        assert.doesNotThrow(() => ideasoftTenantKontrol(tenantA));
        assert.throws(() => ideasoftTenantKontrol(tenantB), error => error.code === "INTEGRATION_NOT_CONFIGURED" && error.status === 409);
    } finally {
        if (onceki === undefined) delete process.env.IDEASOFT_AKN_TENANT_ID;
        else process.env.IDEASOFT_AKN_TENANT_ID = onceki;
    }
});

test("IdeaSoft eşleşmeyen ürünleri otomatik ERP ürününe dönüştürmez", () => {
    const sync = read("src/services/eticaretSyncServisi.js");
    const pullBlock = sync.slice(sync.indexOf("async function urunleriAl"), sync.indexOf("async function ideasoftPilotTest"));
    assert.doesNotMatch(pullBlock, /Urun\.create/);
    assert.match(pullBlock, /unmatchedProducts/);
    assert.match(sync, /EticaretSiparis\.findOne\(\{ tenantId: job\.tenantId/);
    assert.match(sync, /Siparis\.findOneAndUpdate\(\{ tenantId: job\.tenantId/);
    assert.ok(MarketplaceProductMapping.schema.path("connectionId"));
});

test("IdeaSoft secret ve token alanları response ve loglardan çıkarılır", () => {
    const model = read("src/models/IntegrationConnection.js"), sync = read("src/services/eticaretSyncServisi.js"), ui = read("public/erp/erp.js");
    assert.match(model, /delete ret\.encryptedCredentials/);
    assert.match(sync, /secret\|token\|password\|authorization\|credential/);
    assert.match(ui, /Client Secret/);
    assert.match(ui, /type="password"/);
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

test("E-Ticaret UI beş ana gruba ayrılır ve mobilde taşmayan bölüm seçimi kullanır", () => {
    const js = read("public/erp/erp.js"), css = read("public/erp/erp.css");
    const gruplar = js.slice(js.indexOf("const eticaretMenuGruplari"), js.indexOf("function eticaretTarihSaat"));
    for (const grup of ["GENEL", "PAZARYERI", "E_BELGE", "FINANS", "SISTEM"]) assert.match(gruplar, new RegExp(grup));
    assert.match(js, /ecommerce-mobile-nav/); assert.match(js, /ecommerce-subnav/); assert.match(css, /\.ecommerce-main-tabs/);
    assert.match(css, /@media \(max-width:760px\)/); assert.match(css, /\.ecommerce-main-tabs,\.ecommerce-subnav \{ display:none/);
});

test("Profesyonel entegrasyon UI modal, sipariş drawer, e-belge, finans ve hata araçlarını içerir", () => {
    const js = read("public/erp/erp.js");
    for (const metin of ["Bağlantıyı Test Et", "ecommerce-provider-grid", "ecommerce-account-card", "ecommerce-drawer", "Masraf Olarak Kaydet", "Tedarikçiye Bağla", "Cari Hesaba İşle", "Brüt Satış", "Net Hakediş", "Tekrar Dene", "Teknik detaylar güvenlik nedeniyle ana listede gösterilmez"]) assert.match(js, new RegExp(metin));
    assert.match(js, /API Secret<input name="apiSecret" type="password"/);
});

test("IdeaSoft siparişleri manuel ve otomatik olarak çekilir", () => {
    const js = read("public/erp/erp.js"), sync = read("src/services/eticaretSyncServisi.js"), server = read("src/sunucu.js");
    assert.match(js, /Siparişleri Şimdi Çek/);
    assert.match(js, /type:"ORDER_PULL"/);
    assert.match(js, /eticaretSonOtomatikSiparisCekme/);
    assert.match(js, /Ürün Eşleşmesi Bekliyor/);
    assert.match(sync, /IDEASOFT_ORDER_SYNC_INTERVAL_MS/);
    assert.match(sync, /ideasoftSiparisleriniOtomatikSirayaAl/);
    assert.match(server, /ideasoftOtomatikSenkronizasyonBaslat\(\)/);
});
