const test = require('node:test');
const assert = require('node:assert/strict');
const { cariBakiyeSatirlari, kalemNet, belgeNet, stokTarihSatirlari, raporKapsami } = require('../src/services/raporMutabakatServisi');
test('rapor cari kartla aynıdır; eksik eski hareketler bakiyeyi yeniden üretmez', () => {
    const kartlar = [{ _id: 'm', bakiye: 26564.8016 }, { _id: 's', bakiye: 0 }];
    const h = [{ tarafTipi: 'MUSTERI', tarafId: 'm', tip: 'BORC', tutar: 38047.28, tarih: '2026-08-01' }];
    assert.deepEqual(cariBakiyeSatirlari(kartlar, h, 'MUSTERI', new Date('2026-09-06')).map(x => x.bakiye), [26564.8, 0]);
});
test('geçmiş cari bakiye sonraki tahsilatı ve tarihli iptali geri alır', () => {
    const kart = [{ _id: 'm', bakiye: 800 }];
    const h = [{ tarafTipi: 'MUSTERI', tarafId: 'm', tip: 'TAHSILAT', tutar: 200, tarih: '2026-09-05' }, { tarafTipi: 'MUSTERI', tarafId: 'm', tip: 'TAHSILAT', tutar: 300, tarih: '2026-09-01', durum: 'IPTAL', iptalTarihi: '2026-09-04' }];
    assert.equal(cariBakiyeSatirlari(kart, h, 'MUSTERI', new Date('2026-09-03'))[0].bakiye, 700);
    assert.equal(cariBakiyeSatirlari(kart, h, 'MUSTERI', new Date('2026-08-31'))[0].bakiye, 1000);
});
test('tedarikçi ve müşteri hareketleri birbirine karışmaz', () => {
    const h = [{ tarafTipi: 'TEDARIKCI', tarafId: 'm', tip: 'ODEME', tutar: 200, tarih: '2026-09-05' }];
    assert.equal(cariBakiyeSatirlari([{ _id: 'm', bakiye: 500 }], h, 'MUSTERI', new Date('2026-09-01'))[0].bakiye, 500);
    assert.equal(cariBakiyeSatirlari([{ _id: 'm', bakiye: 500 }], h, 'TEDARIKCI', new Date('2026-09-01'))[0].bakiye, 700);
});
test('kaydedilmiş belge ve satır netleri yeniden fiyatlandırılmaz', () => {
    const k = { miktar: 10, birimFiyat: 900, araToplam: 150, toplam: 180, kdv: 20 };
    assert.equal(kalemNet(k), 150);
    assert.equal(belgeNet({ araToplam: 250 }, [k], false), 250);
    assert.equal(belgeNet({ araToplam: 250 }, [k], true), 150);
    assert.equal(kalemNet({ toplam: 120, kdv: 20, birimFiyat: 500 }), 100);
});
test('dönem stok satırları güncel miktarı değil seçilen tarihin miktarını gösterir', () => {
    const stok = [{ urunId: 'u', depoId: 'd', miktar: 7 }];
    const hareket = [{ urunId: 'u', depoId: 'd', tip: 'GIRIS', miktar: 10, birimMaliyet: 5, tarih: '2026-09-01' }, { urunId: 'u', depoId: 'd', tip: 'CIKIS', miktar: 3, birimMaliyet: 5, tarih: '2026-09-05' }];
    assert.equal(stokTarihSatirlari(stok, hareket, new Date('2026-09-03'), false, true)[0].miktar, 10);
    assert.equal(stokTarihSatirlari(stok, hareket, new Date('2026-09-03'), false, true)[0].deger, 50);
    assert.equal(stokTarihSatirlari(stok, hareket, new Date('2026-09-01'), true, false)[0].deger, null);
});
test('alacak raporu ürün filtresiyle ve kâr raporu müşteri filtresiyle yanıltılmaz', () => {
    assert.deepEqual(raporKapsami('musteriAlacaklari', '2026-09-06').filtreAlanlari, ['musteriId']);
    assert.deepEqual(raporKapsami('netKarZarar', '2026-09-06').filtreAlanlari, ['sube']);
});
