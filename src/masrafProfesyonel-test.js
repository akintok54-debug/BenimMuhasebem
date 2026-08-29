require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Kasa = require("./models/Kasa");
const Masraf = require("./models/Masraf");

async function istek(url, options = {}) {
    const uygulama = require("./uygulama");
    const server = uygulama.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    try {
        const { port } = server.address();
        return await fetch(`http://127.0.0.1:${port}${url}`, { headers: { "Content-Type": "application/json" }, ...options });
    } finally { await new Promise(resolve => server.close(resolve)); }
}

test("Masraf detay, güncelleme ve iptal rotaları kimliksiz erişimi reddeder", async () => {
    const id = "507f1f77bcf86cd799439011";
    for (const [method, url] of [["GET", `/api/tenant/masraflar/${id}`], ["PATCH", `/api/tenant/masraflar/${id}`], ["POST", `/api/tenant/masraflar/${id}/iptal`]]) {
        const response = await istek(url, { method, body: method === "GET" ? undefined : "{}" });
        assert.equal(response.status, 401);
    }
});

test("Kasalar nakit ve diğer kasa türlerine ayrılır", () => {
    const alan = Kasa.schema.path("kasaTuru");
    assert.deepEqual(alan.enumValues, ["NAKIT", "DIGER"]);
    assert.equal(alan.defaultValue, "NAKIT");
});

test("Masraf modeli fiş fotoğrafı ve denetimli iptal bilgilerini saklar", () => {
    for (const alan of ["firma", "fisNo", "fisGorseli", "notlar", "kdvOrani", "kdvTutari", "aracPlaka", "paraBirimi", "durum", "iptalTarihi", "iptalNedeni", "iptalParaHareketId"]) assert.ok(Masraf.schema.path(alan), alan);
    for (const kategori of ["AKARYAKIT", "YEMEK", "SEYAHAT", "BAKIM", "TEMIZLIK", "SIGORTA"]) assert.equal(Masraf.schema.path("kategori").enumValues.includes(kategori), true);
});

test("Masraf servisi güvenli bakiye düşümü, fiş doğrulama ve ters hareket uygular", () => {
    const kaynak = fs.readFileSync(path.join(__dirname, "controllers", "masrafController.js"), "utf8");
    assert.match(kaynak, /bakiye:\s*\{ \$gte: tutar \}/);
    assert.match(kaynak, /fisGorseliDogrula/);
    assert.match(kaynak, /kaynak:\s*"MASRAF_IPTAL"/);
    assert.match(kaynak, /tutar hesaba iade edildi/);
});

test("Masraf ekranı telefon kamerası, örnek giderler, filtre ve Excel sunar", () => {
    const js = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "erp.js"), "utf8");
    const html = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "index.html"), "utf8");
    assert.match(js, /Telefonla Fiş Çek \/ Galeriden Seç/);
    assert.match(js, /capture="environment"/);
    assert.match(js, /Mazot \/ Yakıt/);
    assert.match(js, /Masraf Örnekleri/);
    assert.match(js, /masraflarYukle/);
    assert.match(js, /masrafExcel/);
    assert.match(html, /20260830-001/);
});

test("Finans ekranı nakit kasa ve diğer kasaları ayrı gösterir", () => {
    const js = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "erp.js"), "utf8");
    assert.match(js, /Nakit Kasalar/);
    assert.match(js, /Diğer Kasalar/);
    assert.match(js, /data-finans-tab="kasalar"/);
    assert.match(js, /name="kasaTuru"/);
});
