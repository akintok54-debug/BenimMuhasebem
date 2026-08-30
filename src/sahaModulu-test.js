const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const SahaGun = require("./models/SahaGun");
const Musteri = require("./models/Musteri");
const SatisIade = require("./models/SatisIade");
const BelgePaylasim = require("./models/BelgePaylasim");
const { izinVar, YETKI_KATALOGU } = require("./middleware/yetkiKontrol");

const oku = ad => fs.readFileSync(path.join(__dirname, ad), "utf8");

test("saha günü GPS, araç, ziyaret, mola, prim ve kasa teslim alanlarını içerir", () => {
    for (const alan of ["tenantId", "kullaniciId", "gun", "cikisKm", "donusKm", "toplamKm", "baslangicKonumu", "bitisKonumu", "gunlukZiyaretHedefi", "rota", "ziyaretler", "molalar", "primOrani", "hesaplananPrim", "kasaTeslimi.durum"]) assert.ok(SahaGun.schema.path(alan), alan);
    assert.deepEqual(SahaGun.schema.path("durum").enumValues, ["AKTIF", "TAMAMLANDI"]);
});

test("saha satış rolü ve müşteri sahipliği backend modellerinde tanımlıdır", () => {
    assert.equal(izinVar("SALES", "field.read"), true);
    assert.equal(izinVar("SALES", "field.write"), true);
    assert.equal(izinVar("SALES", "supplier.read"), false);
    assert.ok(YETKI_KATALOGU.some(x => x.kod === "field.write"));
    for (const alan of ["temsilciId", "olusturanKullaniciId", "konum.enlem", "konum.boylam"]) assert.ok(Musteri.schema.path(alan), alan);
});

test("tesellüm ödeme kırılımı ve güvenli belge türleri desteklenir", () => {
    assert.ok(SatisIade.schema.path("odemeTipi").enumValues.includes("BANKA"));
    assert.ok(BelgePaylasim.schema.path("tur").enumValues.includes("SATIS"));
    assert.ok(BelgePaylasim.schema.path("tur").enumValues.includes("TESELLUM"));
    const saha = oku("controllers/sahaController.js");
    for (const ifade of ["posKrediKarti", "iban", "acikHesap", "teslimEdilmesiGereken", "SAHA_KASA_TESLIM", "kasa teslimi zaten yapılmış"]) assert.match(saha, new RegExp(ifade));
});

test("saha API ve satış/müşteri sorguları tenant ile kullanıcı sahipliğini zorunlu tutar", () => {
    const app = oku("uygulama.js"), satis = oku("controllers/satisController.js"), musteri = oku("controllers/musteriController.js"), rota = oku("routes/sahaRotasi.js");
    assert.match(app, /\/api\/tenant\/saha/);
    assert.match(rota, /yetkiKontrol\("field\.read"\)/);
    assert.match(rota, /yetkiKontrol\("field\.write"\)/);
    assert.match(satis, /function sahiplik/);
    assert.match(musteri, /temsilciId/);
    assert.match(musteri, /olusturanKullaniciId/);
});

test("mobil tek akış ekranında gerekli saha işlemleri bulunur", () => {
    const js = oku("../public/erp/erp.js"), html = oku("../public/erp/index.html");
    for (const ifade of ["Güne Başla", "Günü Bitir", "Ziyaret Başlat", "Mola Başlat", "Kasa Teslimi", "PDF Tesellüm", "WhatsApp Tesellüm", "sahaGpsAl"]) assert.match(js, new RegExp(ifade));
    assert.match(html, /data-page="saha"/);
});
