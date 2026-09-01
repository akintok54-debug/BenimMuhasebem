const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const oku = dosya => fs.readFileSync(path.join(__dirname, "..", dosya), "utf8");

test("alış düzeltme ve iptal rotaları transactionId kilidi kullanır", () => {
    const rota = oku("src/routes/alisRotasi.js");
    assert.match(rota, /tekIslemKontrol\("ALIS_DUZELTME"\)/);
    assert.match(rota, /tekIslemKontrol\("ALIS_IPTAL"\)/);
    assert.match(rota, /tekIslemKontrol\("ALIS_IADE_IPTAL"\)/);
});

test("tedarikçi ödeme, manuel para ve manuel stok iptalleri idempotenttir", () => {
    assert.match(oku("src/routes/cariRotasi.js"), /TEDARIKCI_ODEME_(DUZELTME|IPTAL)/);
    assert.match(oku("src/routes/finansRotasi.js"), /PARA_HAREKETI_IPTAL/);
    assert.match(oku("src/routes/stokRotasi.js"), /STOK_HAREKETI_IPTAL/);
});

test("satış iptali fiziksel belge veya hareket silmez", () => {
    const controller = oku("src/controllers/satisController.js");
    const iptal = controller.slice(controller.indexOf("async function sil"), controller.indexOf("module.exports", controller.indexOf("async function sil")));
    assert.doesNotMatch(iptal, /deleteOne|deleteMany/);
    assert.match(iptal, /SATIS_IPTAL/);
    assert.match(iptal, /SALE_CANCELLED/);
});

test("raporlar iptal satış, alış ve iadeleri aktif toplamlara katmaz", () => {
    const rapor = oku("src/services/profesyonelRaporServisi.js");
    assert.match(rapor, /satisFiltre = \{ tenantId, tarih, durum: \{ \$ne: "IPTAL" \}/);
    assert.match(rapor, /alisFiltre = \{ tenantId, tarih, durum: \{ \$ne: "IPTAL" \}/);
    assert.match(rapor, /satisIadeFiltre = \{ tenantId, tarih, durum: \{ \$ne: "IPTAL" \}/);
    assert.match(rapor, /alisIadeFiltre = \{ tenantId, tarih, durum: \{ \$ne: "IPTAL" \}/);
});

test("gün sonu tesellüm iptali ters kasa kaydı ve audit izi üretir", () => {
    const saha = oku("src/controllers/sahaController.js");
    assert.match(saha, /SAHA_KASA_TESLIM_IPTAL/);
    assert.match(saha, /SAHA_GUN_SONU_TESLIM_IPTAL/);
    assert.match(oku("src/routes/sahaRotasi.js"), /GUN_SONU_TESELLUM_IPTAL/);
});
