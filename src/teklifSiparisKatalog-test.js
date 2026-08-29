require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Teklif = require("./models/Teklif");
const Siparis = require("./models/Siparis");
const BelgePaylasim = require("./models/BelgePaylasim");

test("Teklif ve sipariş profesyonel durum akışlarını destekler", () => {
    for (const durum of ["GONDERILDI", "ONAYLANDI", "SURESI_DOLDU", "SIPARISE_DONUSTU"]) assert.ok(Teklif.schema.path("durum").enumValues.includes(durum));
    for (const durum of ["HAZIRLANIYOR", "KISMI_SEVK", "SEVK_EDILDI", "TAMAMLANDI"]) assert.ok(Siparis.schema.path("durum").enumValues.includes(durum));
    for (const alan of ["paraBirimi", "teslimSuresiGun", "odemeKosullari", "teslimatKosullari"]) assert.ok(Teklif.schema.path(alan));
    for (const alan of ["paraBirimi", "teslimTarihi", "sevkAdresi", "odemeKosullari"]) assert.ok(Siparis.schema.path(alan));
});

test("Paylaşım modeli süre, iptal ve görüntülenme denetimi içerir", () => {
    for (const alan of ["tokenHash", "tur", "firma", "belge", "sonGecerlilikTarihi", "aktif", "goruntulenmeSayisi"]) assert.ok(BelgePaylasim.schema.path(alan));
    assert.deepEqual(BelgePaylasim.schema.path("tur").enumValues, ["KATALOG", "TEKLIF", "SIPARIS"]);
    assert.equal(BelgePaylasim.schema.path("tokenHash").options.select, false);
});

test("Teklif ekranı katalog PDF, Excel ve güvenli bağlantı sunar", () => {
    const js = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "erp.js"), "utf8");
    const page = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "paylasim.html"), "utf8");
    for (const ifade of ["TEKLİF VE KATALOG YÖNETİMİ", "katalogPdf", "katalogExcel", "katalogLink", "Siparişe Çevir", "profesyonelPaylasimMesaji"]) assert.ok(js.includes(ifade), ifade);
    assert.ok(page.includes("noindex,nofollow,noarchive"));
    assert.ok(page.includes("Bağlantıyı yalnızca yetkili alıcılarla paylaşınız"));
});

test("Paylaşım oluşturma endpointi kimliksiz erişimi reddeder", async () => {
    const uygulama = require("./uygulama");
    const server = uygulama.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    try {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/tenant/paylasim`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tur: "KATALOG" }) });
        assert.equal(response.status, 401);
    } finally { await new Promise(resolve => server.close(resolve)); }
});
