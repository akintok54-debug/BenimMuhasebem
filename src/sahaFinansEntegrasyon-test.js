const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Kasa = require("./models/Kasa");
const SahaGun = require("./models/SahaGun");
const CariHareket = require("./models/CariHareket");
const StokHareket = require("./models/StokHareket");
const CekSenetPortfoy = require("./models/CekSenetPortfoy");
const { izinVar } = require("./middleware/yetkiKontrol");

const oku = dosya => fs.readFileSync(path.join(__dirname, dosya), "utf8");

test("saha nakdi personele ait tekil saha kasasına bağlanır", () => {
    assert.ok(Kasa.schema.path("sorumluKullaniciId"));
    assert.ok(Kasa.schema.path("sahaKasasi"));
    assert.ok(SahaGun.schema.path("sahaKasaId"));
    const index = Kasa.schema.indexes().find(([keys]) => keys.tenantId === 1 && keys.sorumluKullaniciId === 1);
    assert.equal(index?.[1]?.unique, true);
});

test("saha finans ve stok hareketleri tekrar işlem anahtarlarıyla korunur", () => {
    for (const Model of [CariHareket, StokHareket]) {
        assert.ok(Model.schema.path("islemAnahtari"));
        const index = Model.schema.indexes().find(([keys]) => keys.tenantId === 1 && keys.islemAnahtari === 1);
        assert.equal(index?.[1]?.unique, true);
        assert.equal(index?.[1]?.sparse, true);
    }
    const satis = oku("controllers/satisController.js"), cari = oku("controllers/cariController.js");
    assert.match(satis, /satisKanali:\s*perakende[\s\S]+"SAHA"/);
    assert.match(satis, /SATIS:\$\{satis\._id\}:STOK/);
    assert.match(cari, /Bu tahsilat daha önce finans sistemine işlendi/);
});

test("çek ve senet satış ile tahsilattan ana portföye işlenir", () => {
    for (const alan of ["tenantId", "tur", "hareketTipi", "musteriId", "tutar", "kaynak", "kaynakId", "durum"]) assert.ok(CekSenetPortfoy.schema.path(alan), alan);
    assert.deepEqual(CekSenetPortfoy.schema.path("tur").enumValues, ["CEK", "SENET"]);
    assert.match(oku("controllers/satisController.js"), /CekSenetPortfoy\.create/);
    assert.match(oku("controllers/cariController.js"), /CekSenetPortfoy\.create/);
    assert.match(oku("routes/finansRotasi.js"), /cek-senet-portfoyu/);
});

test("gün sonu teslim alma yalnızca yönetici yetkisiyle, atomik sahiplenme ve audit ile çalışır", () => {
    assert.equal(izinVar("SALES", "field.settle"), false);
    assert.equal(izinVar("MANAGER", "field.settle"), true);
    const rota = oku("routes/sahaRotasi.js"), controller = oku("controllers/sahaController.js"), arayuz = oku("../public/erp/erp.js");
    assert.match(rota, /tesellum\/:id\/teslim-al[\s\S]+field\.settle/);
    assert.match(controller, /"kasaTeslimi\.teslimTarihi": null/);
    assert.match(controller, /SAHA_GUN_SONU_TESLIM_AL/);
    assert.match(controller, /kimdenKullaniciId/);
    assert.match(controller, /kimTarafindanKullaniciId/);
    assert.match(arayuz, /Saha Personeli Takip \/ Gün Sonu Tesellüm/);
    assert.match(arayuz, /TESLİM ETMESİ GEREKEN NET TUTAR/);
});
