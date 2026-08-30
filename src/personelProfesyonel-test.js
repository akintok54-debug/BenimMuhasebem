require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Personel = require("./models/Personel");
const PersonelIzin = require("./models/PersonelIzin");
const PersonelDevam = require("./models/PersonelDevam");
const { izinVar } = require("./middleware/yetkiKontrol");

async function istek(url) {
    const uygulama = require("./uygulama");
    const server = uygulama.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    try {
        return await fetch(`http://127.0.0.1:${server.address().port}${url}`);
    } finally { await new Promise(resolve => server.close(resolve)); }
}

test("Personel merkezi kimliksiz erişimi reddeder", async () => {
    for (const url of ["/api/tenant/personeller/panel", "/api/tenant/personeller", "/api/tenant/personeller/izinler", "/api/tenant/personeller/devam"]) {
        assert.equal((await istek(url)).status, 401, url);
    }
});

test("Personel maaş ve özlük verileri yalnızca tenant yöneticilerine açıktır", () => {
    assert.equal(izinVar("OWNER", "tenant.users"), true);
    assert.equal(izinVar("ADMIN", "tenant.users"), true);
    for (const rol of ["MANAGER", "SALES", "ACCOUNTING", "WAREHOUSE"]) assert.equal(izinVar(rol, "tenant.users"), false, rol);
    const rota = fs.readFileSync(path.join(__dirname, "routes", "personelRotasi.js"), "utf8");
    assert.match(rota, /router\.use\(yetkiKontrol\("tenant\.users"\)\)/);
});

test("Personel modeli profesyonel özlük ve çalışma alanlarını içerir", () => {
    for (const alan of ["yonetici", "lokasyon", "istihdamTuru", "calismaDurumu", "cikisTarihi", "dogumTarihi", "maasParaBirimi", "iban", "sgkMeslekKodu", "yillikIzinHakki", "adres.il", "acilDurum.telefon"]) assert.ok(Personel.schema.path(alan), alan);
    assert.deepEqual(Personel.schema.path("calismaDurumu").enumValues, ["AKTIF", "IZINLI", "ASKIDA", "AYRILDI"]);
});

test("İzin ve devam modelleri tenant izolasyonlu iş akışlarına sahiptir", () => {
    for (const alan of ["tenantId", "personelId", "baslangicTarihi", "bitisTarihi", "gun", "durum", "kararVerenKullaniciId"]) assert.ok(PersonelIzin.schema.path(alan), alan);
    for (const alan of ["tenantId", "personelId", "tarih", "durum", "girisSaati", "cikisSaati", "calismaDakika"]) assert.ok(PersonelDevam.schema.path(alan), alan);
    assert.ok(PersonelDevam.schema.indexes().some(([alanlar, ayarlar]) => alanlar.tenantId === 1 && alanlar.personelId === 1 && alanlar.tarih === 1 && ayarlar.unique));
});

test("Personel rotalarında sabit yollar dinamik detay yolundan önce tanımlıdır", () => {
    const rota = fs.readFileSync(path.join(__dirname, "routes", "personelRotasi.js"), "utf8");
    const detay = rota.indexOf('router.get("/:id"');
    for (const sabit of ['router.get("/panel"', 'router.get("/izinler"', 'router.get("/devam"']) assert.ok(rota.indexOf(sabit) > -1 && rota.indexOf(sabit) < detay, sabit);
});

test("ERP Personel ekranı kayıt, izin, onay ve puantaj uçlarına bağlıdır", () => {
    const js = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "erp.js"), "utf8");
    for (const metin of ["PERSONEL VE İK YÖNETİMİ", "personelMerkeziYukle", "/api/tenant/personeller/panel", "/api/tenant/personeller/izinler", "/api/tenant/personeller/devam", "data-izin-onay"]) assert.ok(js.includes(metin), metin);
});
