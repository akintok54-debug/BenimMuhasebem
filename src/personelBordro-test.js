require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const PersonelFinansIslem = require("./models/PersonelFinansIslem");
const { ozetHesapla } = require("./controllers/personelFinansController");

async function istek(url, options = {}) {
    const uygulama = require("./uygulama");
    const server = uygulama.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    try { return await fetch(`http://127.0.0.1:${server.address().port}${url}`, { headers: { "Content-Type": "application/json" }, ...options }); }
    finally { await new Promise(resolve => server.close(resolve)); }
}

test("Personel bordro ve finans rotaları kimliksiz erişimi reddeder", async () => {
    const id = "507f1f77bcf86cd799439011";
    for (const [method, url] of [["GET", `/api/tenant/personeller/${id}/finans`], ["POST", `/api/tenant/personeller/${id}/finans/islem`], ["POST", "/api/tenant/personeller/bordro/tahakkuk"], ["POST", `/api/tenant/personeller/${id}/finans/${id}/iptal`]]) {
        const response = await istek(url, { method, body: method === "POST" ? "{}" : undefined });
        assert.equal(response.status, 401, `${method} ${url}`);
    }
});

test("Personel finans modeli tahakkuk, ödeme, avans, tahsilat ve ters kayıt izini destekler", () => {
    const turler = PersonelFinansIslem.schema.path("tur").enumValues;
    for (const tur of ["MAAS_TAHAKKUK", "PRIM_TAHAKKUK", "MAAS_ODEME", "PRIM_ODEME", "AVANS_ODEME", "AVANS_TAHSILAT", "AVANS_MAHSUP", "KESINTI"]) assert.ok(turler.includes(tur), tur);
    for (const alan of ["tenantId", "personelId", "donem", "hesapTipi", "hesapId", "paraHareketId", "masrafId", "durum", "iptalParaHareketId"]) assert.ok(PersonelFinansIslem.schema.path(alan), alan);
    assert.ok(PersonelFinansIslem.schema.indexes().some(([, ayarlar]) => ayarlar.unique && ayarlar.partialFilterExpression?.tur === "MAAS_TAHAKKUK"));
});

test("Bordro özeti hak ediş, kesinti ve açık avansı doğru hesaplar", () => {
    const islemler = [
        { tur: "MAAS_TAHAKKUK", tutar: 30000, paraBirimi: "TRY", durum: "AKTIF" },
        { tur: "PRIM_TAHAKKUK", tutar: 5000, paraBirimi: "TRY", durum: "AKTIF" },
        { tur: "KESINTI", tutar: 1000, paraBirimi: "TRY", durum: "AKTIF" },
        { tur: "MAAS_ODEME", tutar: 10000, paraBirimi: "TRY", durum: "AKTIF" },
        { tur: "AVANS_ODEME", tutar: 4000, paraBirimi: "TRY", durum: "AKTIF" },
        { tur: "AVANS_TAHSILAT", tutar: 1500, paraBirimi: "TRY", durum: "AKTIF" },
        { tur: "AVANS_MAHSUP", tutar: 500, paraBirimi: "TRY", durum: "AKTIF" },
        { tur: "PRIM_ODEME", tutar: 999, paraBirimi: "TRY", durum: "IPTAL" }
    ];
    const ozet = ozetHesapla(islemler, "TRY");
    assert.equal(ozet.kalanHakEdis, 23500);
    assert.equal(ozet.acikAvans, 2000);
    assert.equal(ozet.netDurum, 21500);
});

test("Nakit personel ödemeleri güvenli bakiye, para hareketi, masraf ve rollback uygular", () => {
    const kaynak = fs.readFileSync(path.join(__dirname, "controllers", "personelFinansController.js"), "utf8");
    assert.match(kaynak, /filter\.bakiye = \{ \$gte: tutar \}/);
    assert.match(kaynak, /kaynak: "PERSONEL"/);
    assert.match(kaynak, /kategori: "PERSONEL"/);
    assert.match(kaynak, /personelFinansIslemId: finansIslem\._id/);
    assert.match(kaynak, /res\.json\(\{ basarili: true, personel, islemler, ozetler, hesaplar \}\)/);
    assert.match(kaynak, /aktif: \{ \$ne: false \}/);
    assert.match(kaynak, /kaynak: "PERSONEL_IPTAL"/);
    assert.match(kaynak, /\$inc: \{ bakiye: -hesapYon \* islemTutari \}/);
});

test("Toplu tahakkuk rotası dinamik personel rotasından önce tanımlıdır", () => {
    const rota = fs.readFileSync(path.join(__dirname, "routes", "personelRotasi.js"), "utf8");
    assert.ok(rota.indexOf('router.post("/bordro/tahakkuk"') < rota.indexOf('router.get("/:id"'));
    assert.match(rota, /Cache-Control", "private, no-store"/);
});

test("Personel satırı finans profiline; avans, prim, maaş ve ödeme işlemlerine bağlıdır", () => {
    const js = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "erp.js"), "utf8");
    for (const metin of ["personelFinansDetayAc", "Toplu Maaş Tahakkuku", "Maaş Öde", "Prim Öde", "Avans Ver", "Ödeme Al", "/finans/islem", "/bordro/tahakkuk"]) assert.ok(js.includes(metin), metin);
});
