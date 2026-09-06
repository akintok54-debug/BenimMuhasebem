const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const oku = dosya => fs.readFileSync(path.join(__dirname, "..", dosya), "utf8");

test("alış formunda ürün alanı ödeme alanından önce gelir", () => {
    const kaynak = oku("public/erp/erp.js");
    const formBaslangici = kaynak.indexOf("async function tedarikciBelgeFormu");
    const formSonu = kaynak.indexOf("async function tedarikciOdemeFormu", formBaslangici);
    const form = kaynak.slice(formBaslangici, formSonu);

    assert.ok(formBaslangici >= 0 && formSonu > formBaslangici);
    assert.ok(form.indexOf("2 · ÜRÜN EKLEME") < form.indexOf("${odemeAlanlari}"));
    assert.match(form, /Ürün ara veya barkod okut/);
    assert.match(form, /En az bir ürün eklemelisiniz\./);
});

test("alış satırı gerekli mobil ürün bilgilerini ve toplamları gösterir", () => {
    const kaynak = oku("public/erp/erp.js");

    assert.match(kaynak, /purchase-line-image/);
    assert.match(kaynak, /purchase-line-copy/);
    assert.match(kaynak, /data-label="Adet"/);
    assert.match(kaynak, /data-label="Alış Fiyatı"/);
    assert.match(kaynak, /data-label="KDV"/);
    assert.match(kaynak, /data-label="İskonto"/);
    assert.match(kaynak, /data-label="Satır Toplamı"/);
    assert.match(kaynak, /id="tedIskontoToplam"/);
});

test("mobil alış formu görünür, kaydırılabilir ve taşmaya dayanıklıdır", () => {
    const css = oku("public/erp/erp.css");

    assert.match(css, /@media \(max-width: 900px\) \{\s*\.document-entry-modal/);
    assert.match(css, /\.purchase-entry-form > \* \{[^}]*flex: 0 0 auto[^}]*max-width: 100%[^}]*min-width: 0/s);
    assert.match(css, /\.product-picker-section \{ display: block !important; visibility: visible !important; \}/);
    assert.match(css, /\.document-entry-modal form \{[^}]*overflow-y: auto[^}]*scroll-padding-bottom:/s);
    assert.match(css, /\.purchase-line-product \{[^}]*display: flex[^}]*width: 100%[^}]*overflow: hidden/s);
    assert.match(css, /\.purchase-line-copy \{ flex: 1 1 0; min-width: 0; \}/);
    assert.match(css, /\.purchase-entry-form \.kdv-mode-toggle input \{[^}]*width: 18px/s);
    assert.match(css, /@media \(max-width: 360px\) \{[^}]*\.document-product-tools \{ grid-template-columns: minmax\(0, 1fr\)/s);
});
