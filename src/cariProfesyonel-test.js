require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const CariHareket = require("./models/CariHareket");

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
        ["PATCH", `/api/tenant/cari/musteri/${id}/bakiye`],
        ["DELETE", `/api/tenant/musteriler/${id}`]
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
