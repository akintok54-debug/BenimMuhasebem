const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const oku = dosya => fs.readFileSync(path.join(__dirname, "..", dosya), "utf8");

test("rapor merkezi tum ERP kaynaklarini profesyonel rapor servisine baglar", () => {
    const servis = oku("src/services/profesyonelRaporServisi.js");
    const modeller = ["Satis", "Alis", "Stok", "CariHareket", "ParaHareket", "Masraf", "Kasa", "Banka", "Kullanici"];

    for (const model of modeller) assert.match(servis, new RegExp(`const ${model} = require`));
    assert.match(servis, /mevcut\.karsilastirma =/);
    assert.match(servis, /maliyetDurumu/);
    assert.match(servis, /grafikler:/);
});

test("yonetici ozeti karar metrikleri, canli baglanti ve kaynak kapsamini gosterir", () => {
    const kaynak = oku("public/erp/erp.js");

    assert.match(kaynak, /function raporYoneticiOzeti/);
    assert.match(kaynak, /Canlı ERP verisi/);
    assert.match(kaynak, /Brüt Marj/);
    assert.match(kaynak, /Tahsilat Oranı/);
    assert.match(kaynak, /Net İşletme Pozisyonu/);
    assert.match(kaynak, /pay === null \|\| pay === undefined/);
    assert.match(kaynak, /Bağlı veri kaynakları/);
    assert.match(kaynak, /\["Satış", "Alış", "Stok", "Cari", "Kasa \/ Banka", "Gider", "Personel"\]/);
    assert.match(kaynak, /raporGrafikleri\(d\)/);
});

test("adet raporlari para yerine dogru birimle ve mobil kartlarla gosterilir", () => {
    const kaynak = oku("public/erp/erp.js");
    const css = oku("public/erp/erp.css");

    assert.match(kaynak, /kritikStoklar: "ürün"/);
    assert.match(kaynak, /stokMevcudu: "adet"/);
    assert.match(kaynak, /stokHareketleri: "hareket"/);
    assert.match(kaynak, /data-label="\$\{escapeHtml\(key\)\}"/);
    assert.match(css, /\.report-result-table thead \{ display:none; \}/);
    assert.match(css, /grid-template-columns:minmax\(92px,\.7fr\) minmax\(0,1\.3fr\)/);
    assert.match(css, /content:attr\(data-label\)/);
    assert.match(css, /\.report-custom-date\[hidden\] \{ display:none !important; \}/);
    assert.match(css, /\.report-period-tabs \{ display:flex; flex-direction:row;/);
});

test("gider ve borc artislarinda ters performans rengi uygulanir", () => {
    const kaynak = oku("public/erp/erp.js");

    assert.match(kaynak, /kart\("Gider", o\.gider, "gider", true\)/);
    assert.match(kaynak, /kart\("Müşteri Alacağı", o\.musteriAlacagi, "musteriAlacagi", true\)/);
    assert.match(kaynak, /kart\("Tedarikçi Borcu", o\.tedarikciBorcu, "tedarikciBorcu", true\)/);
});
