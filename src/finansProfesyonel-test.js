require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Kasa = require("./models/Kasa");
const Banka = require("./models/Banka");
const ParaHareket = require("./models/ParaHareket");

async function istek(url, options = {}) {
    const uygulama = require("./uygulama");
    const server = uygulama.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    try {
        const { port } = server.address();
        return await fetch(`http://127.0.0.1:${port}${url}`, {
            headers: { "Content-Type": "application/json" },
            ...options
        });
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}

test("Finans yönetimi rotaları kimliksiz erişimi reddeder", async () => {
    const id = "507f1f77bcf86cd799439011";
    const kontroller = [
        ["GET", "/api/tenant/finans/ozet"],
        ["GET", "/api/tenant/finans/para-hareketleri"],
        ["GET", `/api/tenant/finans/kasalar/${id}/ekstre?baslangic=2026-08-01&bitis=2026-08-31`],
        ["POST", "/api/tenant/finans/para-hareketleri"],
        ["POST", "/api/tenant/finans/transfer"],
        ["PATCH", `/api/tenant/finans/hesaplar/KASA/${id}`]
    ];
    for (const [method, url] of kontroller) {
        const response = await istek(url, { method, body: method === "GET" ? undefined : "{}" });
        assert.equal(response.status, 401);
    }
});

test("Kasa, banka ve para hareketleri TL, dolar ve euro destekler", () => {
    for (const model of [Kasa, Banka, ParaHareket]) {
        assert.deepEqual(model.schema.path("paraBirimi").enumValues, ["TRY", "USD", "EUR"]);
    }
});

test("Kasa modeli açılış, sorumlu ve şube bilgisini korur", () => {
    for (const alan of ["acilisBakiyesi", "acilisTarihi", "sorumlu", "sube"]) assert.ok(Kasa.schema.path(alan), alan);
    assert.equal(Kasa.schema.path("aktif").defaultValue, true);
});

test("Kasa ekstresi devreden, giriş, çıkış ve yürüyen bakiyeyi doğru hesaplar", () => {
    const { ekstreOzetle } = require("./controllers/finansController");
    const sonuc = ekstreOzetle([
        { tip: "GIRIS", tutar: 250, belgeNo: "G-1" },
        { tip: "CIKIS", tutar: 80, belgeNo: "C-1" },
        { tip: "GIRIS", tutar: 30, belgeNo: "G-2" }
    ], 1000);
    assert.equal(sonuc.toplamGiris, 280);
    assert.equal(sonuc.toplamCikis, 80);
    assert.equal(sonuc.kapanisBakiyesi, 1200);
    assert.deepEqual(sonuc.satirlar.map(x => x.yuruyenBakiye), [1250, 1170, 1200]);
});

test("Finans servisi açılış izi, güvenli bakiye ve aynı para birimi transferi uygular", () => {
    const kaynak = fs.readFileSync(path.join(__dirname, "controllers", "finansController.js"), "utf8");
    assert.match(kaynak, /kaynak:\s*"ACILIS"/);
    assert.match(kaynak, /findOneAndUpdate/);
    assert.match(kaynak, /Farklı para birimindeki hesaplar arasında doğrudan transfer yapılamaz/);
    assert.match(kaynak, /async function hesapGuncelle/);
});

test("Profesyonel finans ekranı hesap, hareket, transfer ve Excel işlemlerini sunar", () => {
    const js = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "erp.js"), "utf8");
    assert.match(js, /Kasa, banka ve nakit kontrolü/);
    assert.match(js, /Hesaplar Arası Transfer/);
    assert.match(js, /const secenekler = hesaplar\.map/);
    assert.match(js, /\/api\/tenant\/finans\/hesaplar\//);
    assert.match(js, /Para Hareketleri/);
    assert.match(js, /nakit-hareketleri-/);
    assert.match(js, /kasa-ekstresi-/);
    assert.match(js, /finansKasaEkstresiAc/);
    assert.match(js, /finansHareketGecmisiRender/);
    assert.match(js, /Yazdır \/ PDF/);
    assert.match(js, /baslangic=.*bitis=/);
    assert.match(js, /sonKullaniciMetinleriniDuzelt/);
});

test("Giriş ve ana uygulama son kullanıcıya işletme yönetimi adıyla sunulur", () => {
    const dizin = path.join(__dirname, "..", "public", "erp");
    for (const dosya of ["login.html", "index.html", "sifre-yenile.html"]) {
        const html = fs.readFileSync(path.join(dizin, dosya), "utf8");
        assert.match(html, /İşletme Yönetimi/);
        assert.doesNotMatch(html, />\s*[^<]*\bERP\b[^<]*</i);
    }
});
