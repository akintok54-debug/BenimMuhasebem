const test = require("node:test");
const assert = require("node:assert/strict");
const { farkPlani } = require("../src/services/alisDuzeltmeServisi");

test("1.650 TL açık alış 4.350 TL olduğunda cari yalnızca 2.700 TL artar", () => {
    const eski = { genelToplam: 1650, odenenTutar: 0, kalemler: [{ urunId: "urun-1", miktar: 10 }] };
    const yeni = { genelToplam: 4350, odenenTutar: 0, kalemler: [{ urunId: "urun-1", miktar: 10 }] };
    assert.deepEqual(farkPlani(eski, yeni), { stokFarklari: [], cariFarki: 2700, odemeHesabiFarki: 0 });
});

test("ödenmiş 1.650 TL alış 4.350 TL olduğunda stok sabit, ödeme hesabı 2.700 TL azalır", () => {
    const eski = { genelToplam: 1650, odenenTutar: 1650, kalemler: [{ urunId: "urun-1", miktar: 4 }] };
    const yeni = { genelToplam: 4350, odenenTutar: 4350, kalemler: [{ urunId: "urun-1", miktar: 4 }] };
    assert.deepEqual(farkPlani(eski, yeni), { stokFarklari: [], cariFarki: 0, odemeHesabiFarki: -2700 });
});

test("alış miktarı değişirse yalnızca miktar farkı stok hareketine dönüşür", () => {
    const eski = { genelToplam: 1650, odenenTutar: 0, kalemler: [{ urunId: "urun-1", miktar: 4 }] };
    const yeni = { genelToplam: 4350, odenenTutar: 0, kalemler: [{ urunId: "urun-1", miktar: 7 }, { urunId: "urun-2", miktar: 2 }] };
    assert.deepEqual(farkPlani(eski, yeni).stokFarklari, [
        { urunId: "urun-1", miktarFarki: 3 },
        { urunId: "urun-2", miktarFarki: 2 }
    ]);
});
