require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { odemeBilgisi } = require("./services/cariHesapServisi");

test("ortak cari servisi müşteri ve tedarikçi ödeme yöntemlerini tek kuralla çözer", () => {
    assert.deepEqual(odemeBilgisi({ odemeYontemi: "NAKIT" }), { yontem: "NAKIT", hesapTipi: "KASA" });
    assert.deepEqual(odemeBilgisi({ odemeYontemi: "IBAN" }), { yontem: "IBAN", hesapTipi: "BANKA" });
    assert.deepEqual(odemeBilgisi({ odemeYontemi: "CEK" }), { yontem: "CEK", hesapTipi: null });
});

test("alış ve cari controllerları aynı cari yazma servisini kullanır", () => {
    const oku = file => fs.readFileSync(path.join(__dirname, file), "utf8");
    const alis = oku("controllers/alisController.js");
    const cari = oku("controllers/cariController.js");
    assert.match(alis, /services\/cariHesapServisi/);
    assert.match(alis, /tedarikciAlisKaydet/);
    assert.match(cari, /services\/cariHesapServisi/);
    assert.match(cari, /tedarikciOdemeKaydet/);
    assert.match(cari, /tarafTipi: "MUSTERI"/);
    assert.match(cari, /tarafTipi: "TEDARIKCI"/);
});

test("tedarikçi ödemesi açık faturaları ortak serviste FIFO kapatır", () => {
    const servis = fs.readFileSync(path.join(__dirname, "services", "cariHesapServisi.js"), "utf8");
    assert.match(servis, /sort\(\{ tarih: 1, createdAt: 1 \}\)/);
    assert.match(servis, /Alis\.bulkWrite\(guncellemeler\)/);
    assert.match(servis, /faturalaraDagitilan/);
    assert.match(servis, /avansTutari/);
});

test("tedarikçi kartı merkez API ve gerekli işlem/ekstre görünümlerini kullanır", () => {
    const js = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "erp.js"), "utf8");
    const controller = fs.readFileSync(path.join(__dirname, "controllers", "tedarikciController.js"), "utf8");
    assert.match(js, /tedarikciler\/\$\{encodeURIComponent\(id\)\}\/merkez/);
    for (const metin of ["Hızlı Ödeme", "+ Yeni Alış", "PDF Ekstre", "Excel Ekstre", "Avanslar", "Vade", "Son İşlemler"]) assert.equal(js.includes(metin), true, metin);
    for (const alan of ["alislar", "odemeler", "avanslar", "iadeler", "cariHareketler", "ekstre", "vadeler", "sonIslemler"]) assert.match(controller, new RegExp(alan));
});

test("alış ekranı yalnızca genel liste, yeni alış ve raporlama sekmelerini sunar", () => {
    const js = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "erp.js"), "utf8");
    assert.match(js, /\["alislar", "Tüm Alış Faturaları"\]/);
    assert.match(js, /\["yeni", "Yeni Alış"\]/);
    assert.match(js, /\["rapor", "Raporlama"\]/);
});
