const test = require("node:test");
const assert = require("node:assert/strict");
const { belgeTutarOzeti, belgeOzetleriniEkle, belgeSunumMiddleware } = require("../src/services/belgeTutarOzetiServisi");
const sunum = require("../public/erp/belge-sunum");

test("tutar özeti kaydedilmiş iskonto sonrası matrahları ve farklı KDV oranlarını kullanır", () => {
    const belge = { araToplam: 380, toplamKdv: 39.9, genelToplam: 419.9, kalemler: [
        { miktar: 1, birimFiyat: 100, iskonto: 10, kdv: 1, araToplam: 90, kdvTutari: 0.9, toplam: 90.9 },
        { miktar: 2, birimFiyat: 100, iskonto: 5, kdv: 10, araToplam: 190, kdvTutari: 19, toplam: 209 },
        { miktar: 1, birimFiyat: 100, iskonto: 0, kdv: 20, araToplam: 100, kdvTutari: 20, toplam: 120 }
    ] };
    const o = belgeTutarOzeti(belge);
    assert.equal(o.brutToplam, 400); assert.equal(o.toplamIskonto, 20);
    assert.equal(o.kdvMatrahi, 380); assert.equal(o.genelToplam, 419.9);
    assert.deepEqual(o.kdvGruplari.map(g => [g.oran, g.tutar]), [[1, 0.9], [10, 19], [20, 20]]);
    assert.equal(o.detayDogrulandi, true);
});

test("KDV dahil girilip net olarak saklanan fiyatın üzerine tekrar vergi eklenmez", () => {
    const b = { araToplam: 100, toplamKdv: 20, genelToplam: 120, kalemler: [{ miktar: 1, birimFiyat: 100, kdv: 20, araToplam: 100, kdvTutari: 20, toplam: 120 }] };
    assert.equal(belgeTutarOzeti(b).genelToplam, 120);
    const dahil = { ...b, kdvDahil: true, kalemler: [{ ...b.kalemler[0], birimFiyat: 120 }] };
    assert.equal(belgeTutarOzeti(dahil).brutToplam, 100);
    assert.equal(belgeTutarOzeti(dahil).kdvTutari, 20);
});

test("eski iadenin kaydedilmiş vergi dahil toplamından matrah ayrıştırılır", () => {
    const o = belgeTutarOzeti({ genelToplam: 216, kalemler: [{ miktar: 2, birimFiyat: 100, iskonto: 10, kdv: 20, toplam: 216 }] });
    assert.equal(o.araToplam, 180); assert.equal(o.kdvTutari, 36); assert.equal(o.toplamIskonto, 20);
});

test("uyumsuz eski kayıtların genel toplamı yeniden hesaplanıp değiştirilmez", () => {
    const b = { genelToplam: 99, araToplam: 100, toplamKdv: 20, kalemler: [{ miktar: 1, birimFiyat: 100, kdv: 20, araToplam: 100, kdvTutari: 20, toplam: 120 }] };
    const o = belgeTutarOzeti(b);
    assert.equal(o.genelToplam, 99); assert.equal(o.detayDogrulandi, false); assert.deepEqual(o.kdvGruplari, []);
    assert.equal(belgeTutarOzeti({ tutar: 100, kalemler: [] }), null);
});

test("Türkçe para ve miktar biçimi belgenin değerini değiştirmeden gösterir", () => {
    assert.equal(sunum.para(3376.65), "3.376,65 TL");
    assert.equal(sunum.miktar(9.9999, "ADET"), "10 Adet");
    assert.equal(sunum.miktar(2.375, "KG"), "2,375 KG");
    assert.equal(sunum.miktar(-3, "ADET"), "-3 Adet");
    assert.equal(sunum.para(null), "—");
    const html = sunum.tutarOzeti({ genelToplam: 0, tutar: 123 });
    assert.match(html, /0,00 TL/); assert.doesNotMatch(html, /123,00/);
});

test("saha, müşteri ve paylaşım yanıtlarında özet eklenir, orijinal kayıt değişmez", () => {
    const original = { saha: { satislar: [{ genelToplam: 120, araToplam: 100, toplamKdv: 20, kalemler: [{ miktar: 1, birimFiyat: 100, kdv: 20, araToplam: 100, kdvTutari: 20, toplam: 120 }] }] } };
    const result = belgeOzetleriniEkle(original);
    assert.equal(result.saha.satislar[0].tutarOzeti.genelToplam, 120);
    assert.equal(original.saha.satislar[0].tutarOzeti, undefined);
    for (const url of ["/api/tenant/saha/panel", "/api/tenant/satis/panel?donem=BUGUN", "/api/paylasim/test"]) {
        let output; const res = { json(value) { output = value; } };
        belgeSunumMiddleware({ method: "GET", originalUrl: url }, res, () => {});
        res.json(original); assert.equal(output.saha.satislar[0].tutarOzeti.genelToplam, 120);
    }
});
