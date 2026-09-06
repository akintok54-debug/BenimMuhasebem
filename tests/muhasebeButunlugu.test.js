const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("alış ve satış oluşturma işlemleri MongoDB transaction ile bütün çalışır", () => {
    for (const dosya of ["alisController.js", "satisController.js", "siparisController.js"]) {
        const kaynak = fs.readFileSync(path.join(__dirname, "..", "src", "controllers", dosya), "utf8");
        assert.match(kaynak, /session\.withTransaction/);
        assert.match(kaynak, /StokHareket\.create\(\[\{/);
        assert.doesNotMatch(kaynak, /rollback\.(alisId|satisId)/);
    }
});

test("üretim başlangıcı indeks silmez; indeks bakımı ayrı ve kontrollüdür", () => {
    const baglanti = fs.readFileSync(path.join(__dirname, "..", "src", "database", "veritabani.js"), "utf8");
    const script = fs.readFileSync(path.join(__dirname, "..", "scripts", "mongodb-index-sync.js"), "utf8");
    assert.doesNotMatch(baglanti, /dropIndex/);
    assert.doesNotMatch(baglanti, /mongodbIndeksServisi|createIndexes/);
    assert.match(script, /--drop-legacy-barcode-index/);
});

test("bütünlük auditi belge, stok, cari, para ve referans zincirlerini kontrol eder", () => {
    const kaynak = fs.readFileSync(path.join(__dirname, "..", "scripts", "muhasebe-butunluk-audit.js"), "utf8");
    for (const ifade of ["eksikBelgeBaglantisi", "kopukReferans", "yetimBelgeHareketi", "ALIS_ODEME", "SATIS_TAHSILAT"]) assert.match(kaynak, new RegExp(ifade));
});

test("hesap transferi ve masraf kaydı bakiye hareketiyle atomiktir", () => {
    for (const dosya of ["finansController.js", "masrafController.js"]) {
        const kaynak = fs.readFileSync(path.join(__dirname, "..", "src", "controllers", dosya), "utf8");
        assert.match(kaynak, /session\.withTransaction/);
    }
    const finans = fs.readFileSync(path.join(__dirname, "..", "src", "controllers", "finansController.js"), "utf8");
    assert.match(finans, /insertMany\(\[[\s\S]+\], \{ session \}\)/);
});

test("canlı test verisi temizliği fiziksel silme yerine transaction ve ters kayıt kullanır", () => {
    const kaynak = fs.readFileSync(path.join(__dirname, "..", "scripts", "canli-test-verisi-iptal.js"), "utf8");
    assert.match(kaynak, /session\.withTransaction/);
    assert.match(kaynak, /SATIS_IPTAL/);
    assert.match(kaynak, /SATIS_IADE_IPTAL/);
    assert.doesNotMatch(kaynak, /deleteMany|deleteOne/);
    assert.match(kaynak, /process\.argv\.includes\("--apply"\)/);
});

test("geçmiş peşin satış cari onarımı net bakiyeyi değiştirmeden çift kayıt üretir", () => {
    const kaynak = fs.readFileSync(path.join(__dirname, "..", "scripts", "eksik-satis-cari-onar.js"), "utf8");
    assert.match(kaynak, /session\.withTransaction/);
    assert.match(kaynak, /tip: "BORC"/);
    assert.match(kaynak, /tip: "TAHSILAT"/);
    assert.match(kaynak, /netBakiyeDegisimi: 0/);
    assert.doesNotMatch(kaynak, /musteri\.save|Musteri\.update/);
});
