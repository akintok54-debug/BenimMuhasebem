require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const uygulama = require("./uygulama");
const Satis = require("./models/Satis");

test("Satış panel endpointi kimliksiz erişimi reddeder", async () => {
    const server = await new Promise((resolve, reject) => {
        const instance = uygulama.listen(0, "127.0.0.1", () => resolve(instance));
        instance.once("error", reject);
    });
    try {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/tenant/satis/panel`);
        assert.equal(response.status, 401);
    } finally { await new Promise(resolve => server.close(resolve)); }
});

test("Satış silme endpointi kimliksiz erişimi reddeder", async () => {
    const server = await new Promise((resolve, reject) => {
        const instance = uygulama.listen(0, "127.0.0.1", () => resolve(instance));
        instance.once("error", reject);
    });
    try {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/tenant/satis/507f1f77bcf86cd799439011`, { method: "DELETE" });
        assert.equal(response.status, 401);
    } finally { await new Promise(resolve => server.close(resolve)); }
});

test("Satış panel rotası detay rotasından önce tanımlıdır", () => {
    const router = require("./routes/satisRotasi");
    const yollar = router.stack.filter(x => x.route).map(x => x.route.path);
    assert.ok(yollar.indexOf("/panel") >= 0);
    assert.ok(yollar.indexOf("/panel") < yollar.indexOf("/:id"));
});

test("Profesyonel satış arayüzü temel operasyon bağlantılarını içerir", () => {
    const js = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "erp.js"), "utf8");
    const css = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "erp.css"), "utf8");
    for (const ifade of ["SATIŞ OPERASYON MERKEZİ", "/api/tenant/satis/panel", "Yeni Satış", "Satış Temsilcisi Performansı", "Cari / Tahsilat", "Satış İadesi", "Ödeme Durumu", "Kredi Kartı", "Belge Toplamı"]) assert.match(js, new RegExp(ifade.replace("/", "\\/")));
    assert.match(css, /\.sales-kpis/);
    assert.match(css, /@media\(max-width:760px\)/);
});

test("Satış ürün araması kod, barkod ve ada göre sonuç gösterip miktarlı sepete ekler", () => {
    const js = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "erp.js"), "utf8");
    const css = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "erp.css"), "utf8");
    for (const ifade of ["data-sales-search", "salesProductResultCount", "salesProductEmpty", "data-sales-quantity", "data-sales-add", "sepeteEkle", "ürün gösteriliyor"]) assert.match(js, new RegExp(ifade));
    assert.match(js, /\[u\.kod,u\.barkod,u\.ad,u\.marka,u\.model,u\.kategori\]/);
    assert.match(js, /Math\.min\(stok, Math\.floor/);
    assert.match(css, /\.sales-product-add/);
    assert.match(css, /\.sales-cart-quantity input/);
});

test("Perakende satış müşteri seçmeden peşin tahsilat ve ayrı satış kanalı kullanır", () => {
    const js = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "erp.js"), "utf8");
    const controller = fs.readFileSync(path.join(__dirname, "controllers", "satisController.js"), "utf8");
    assert.deepEqual(Satis.schema.path("satisKanali").enumValues, ["NORMAL", "PERAKENDE", "SAHA"]);
    for (const ifade of ["Perakende Satış", "data-sales-mode", "Perakende Satışı Tamamla", "perakendeFiyati", "retail-sale-modal"]) assert.match(js, new RegExp(ifade));
    assert.match(controller, /kod:\s*"PERAKENDE"/);
    assert.match(controller, /unvan:\s*"Perakende Müşteri"/);
    assert.match(controller, /\["NAKIT",\s*"KART",\s*"BANKA"\]/);
    assert.match(controller, /satisKanali:\s*perakende\s*\?\s*"PERAKENDE"/);
});
