const test = require("node:test");
const assert = require("node:assert/strict");
const { stokMaliyetAnalizi } = require("../src/services/profesyonelRaporServisi");

test("aynı iş günündeki stok hareketleri oluşturulma sırasıyla değerlendirilir", () => {
    const baslangic = new Date("2026-09-01T00:00:00Z"), bitis = new Date("2026-09-30T23:59:59Z");
    const hareketler = [
        { _id: "2", urunId: "u1", depoId: "d1", tip: "CIKIS", kaynak: "SATIS", kaynakId: "s1", miktar: 3, birimMaliyet: 10, tarih: new Date("2026-09-01T00:00:00Z"), createdAt: new Date("2026-09-01T14:00:00Z") },
        { _id: "1", urunId: "u1", depoId: "d1", tip: "DEVIR_GIRIS", kaynak: "HIZLI_SATIS_URUNU", miktar: 5, birimMaliyet: 10, tarih: new Date("2026-09-01T13:00:00Z"), createdAt: new Date("2026-09-01T13:00:00Z") }
    ];
    const analiz = stokMaliyetAnalizi([{ urunId: "u1", depoId: "d1", miktar: 2 }], hareketler, [], baslangic, bitis, { satis: new Set(["s1"]), siparis: new Set() });
    assert.ok(!analiz.nedenler.some(x => x.includes("negatif miktar")));
});

test("iptal edilmiş satışın sıfır maliyetli eski çıkışı aktif SMM'yi bozmaz", () => {
    const baslangic = new Date("2026-08-01T00:00:00Z"), bitis = new Date("2026-08-31T23:59:59Z");
    const hareketler = [
        { urunId: "u1", depoId: "d1", tip: "GIRIS", kaynak: "MANUEL", miktar: 1, birimMaliyet: 0, createdAt: new Date("2026-08-10T10:00:00Z") },
        { urunId: "u1", depoId: "d1", tip: "CIKIS", kaynak: "SATIS", kaynakId: "iptal-satis", miktar: 1, birimMaliyet: 0, createdAt: new Date("2026-08-10T11:00:00Z") }
    ];
    const analiz = stokMaliyetAnalizi([{ urunId: "u1", depoId: "d1", miktar: 0 }], hareketler, [], baslangic, bitis, { satis: new Set(), siparis: new Set() });
    assert.equal(analiz.guvenilir, true);
    assert.equal(analiz.satilanMalinMaliyeti, 0);
});

test("populate edilmiş stok ürün ve depo kimlikleri hareket defteriyle eşleşir", () => {
    const baslangic = new Date("2026-09-01T00:00:00Z"), bitis = new Date("2026-09-30T23:59:59Z");
    const stoklar = [{ urunId: { _id: "u1", kod: "U1" }, depoId: { _id: "d1", ad: "Merkez" }, miktar: 2 }];
    const hareketler = [{ urunId: "u1", depoId: "d1", tip: "DEVIR_GIRIS", kaynak: "DEVIR", miktar: 2, birimMaliyet: 10, createdAt: new Date("2026-09-01T10:00:00Z") }];
    const analiz = stokMaliyetAnalizi(stoklar, hareketler, [], baslangic, bitis);
    assert.ok(!analiz.nedenler.some(x => x.includes("uyuşmuyor")));
});
