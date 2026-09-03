require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const uygulama = require("./uygulama");
const Urun = require("./models/Urun");

async function testSunucusuAc() {
    return new Promise((resolve, reject) => {
        const instance = uygulama.listen(0, "127.0.0.1", () => resolve(instance));
        instance.once("error", reject);
    });
}

test("Toplu ürün ekle-güncelle API kimliksiz erişimi reddeder", async () => {
    const server = await testSunucusuAc();
    try {
        const { port } = server.address();
        const response = await fetch(`http://127.0.0.1:${port}/api/tenant/urunler/toplu-aktar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ urunler: [] })
        });
        assert.equal(response.status, 401);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test("XLSX tarayıcı paketi API üzerinden sunulur", async () => {
    const server = await testSunucusuAc();
    try {
        const { port } = server.address();
        const response = await fetch(`http://127.0.0.1:${port}/api/assets/xlsx.js`);
        assert.equal(response.status, 200);
        assert.match(response.headers.get("content-type"), /javascript/);
        assert.ok((await response.text()).length > 100000);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test("JSZip tarayıcı paketi API üzerinden sunulur", async () => {
    const server = await testSunucusuAc();
    try {
        const { port } = server.address();
        const response = await fetch(`http://127.0.0.1:${port}/api/assets/jszip.js`);
        assert.equal(response.status, 200);
        assert.match(response.headers.get("content-type"), /javascript/);
        assert.ok((await response.text()).length > 10000);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test("Ürün modeli TRY, USD ve EUR para birimlerini destekler", () => {
    assert.deepEqual(Urun.schema.path("paraBirimi").enumValues, ["TRY", "USD", "EUR"]);
});

test("Ürün Excel arayüzü farklı pazar yeri kolonlarını ve alıştan yeni ürün açmayı destekler", () => {
    const js = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "erp.js"), "utf8");
    const html = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "index.html"), "utf8");
    assert.match(html, /\/api\/assets\/xlsx\.js/);
    assert.match(js, /Trendyol ve IdeaSoft kolonlarını otomatik tanır/);
    assert.match(js, /\/api\/tenant\/urunler\/toplu-aktar/);
    assert.match(js, /id="tedYeniUrun"/);
    assert.match(js, /Dolar \(\$\)/);
    assert.match(js, /Euro \(€\)/);
});
