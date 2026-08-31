require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const CariHareket = require("./models/CariHareket");
const { tedarikciOdemeSonrasiBakiye } = require("./controllers/cariController");

async function istek(path, options = {}) {
    const uygulama = require("./uygulama");
    const server = uygulama.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    try {
        const adres = server.address();
        return await fetch(`http://127.0.0.1:${adres.port}${path}`, {
            headers: { "Content-Type": "application/json" },
            ...options
        });
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}

test("Cari yönetim rotaları kimliksiz erişimi reddeder", async () => {
    const id = "507f1f77bcf86cd799439011";
    const kontroller = [
        ["POST", "/api/tenant/cari/musteri/odeme"],
        ["PATCH", `/api/tenant/cari/musteri/tahsilat/${id}`],
        ["DELETE", `/api/tenant/cari/musteri/tahsilat/${id}`],
        ["PATCH", `/api/tenant/cari/musteri/${id}/bakiye`],
        ["DELETE", `/api/tenant/musteriler/${id}`],
        ["POST", "/api/tenant/cari/tedarikci/odeme"],
        ["POST", "/api/tenant/cari/tedarikci/tahsilat"],
        ["POST", "/api/tenant/cari/tedarikci/hareket"],
        ["PATCH", `/api/tenant/cari/tedarikci/${id}/bakiye`],
        ["DELETE", `/api/tenant/tedarikciler/${id}`]
    ];
    for (const [method, path] of kontroller) {
        const response = await istek(path, { method, body: "{}" });
        assert.equal(response.status, 401);
    }
});

test("Cari hareket modeli profesyonel ödeme yöntemlerini ve düzeltme izini destekler", () => {
    const yontemler = CariHareket.schema.path("odemeYontemi").enumValues;
    for (const yontem of ["NAKIT", "KREDI_KARTI", "SENET", "CEK"]) assert.equal(yontemler.includes(yontem), true);
    assert.ok(CariHareket.schema.path("bakiyeDegisimi"));
    assert.ok(CariHareket.schema.path("oncekiBakiye"));
    assert.ok(CariHareket.schema.path("sonrakiBakiye"));
});

test("Cari arayüzü aktif tarafa göre yeni kayıt açar ve müşteri güncellemesini CSRF uyumlu API ile yapar", () => {
    const js = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "erp.js"), "utf8");
    assert.match(js, /aktif === "musteri" \? "\+ Yeni Müşteri" : "\+ Yeni Tedarikçi"/);
    assert.match(js, /aktif === "musteri" \? yeniMusteriPaneli\(\) : tedarikciFormAc\(\)/);
    assert.match(js, /await api\(`\/api\/tenant\/musteriler\/\$\{encodeURIComponent\(id\)\}`/);
    assert.match(js, /musteriTahsilatDuzenleFormu/);
    assert.match(js, /Tutarı Değiştir/);
});

test("Borcu sıfır olan tedarikçiye ödeme avans/alacak bakiyesi oluşturur", () => {
    assert.equal(tedarikciOdemeSonrasiBakiye(0, 8000), -8000);
    assert.equal(tedarikciOdemeSonrasiBakiye(3000, 8000), -5000);

    const controller = fs.readFileSync(path.join(__dirname, "controllers", "cariController.js"), "utf8");
    assert.doesNotMatch(controller, /Ödeme tedarikçi bakiyesini aşamaz/);
    assert.match(controller, /bakiyeDegisimi: -tutar/);
    assert.match(controller, /tenantId: tId/);
});
