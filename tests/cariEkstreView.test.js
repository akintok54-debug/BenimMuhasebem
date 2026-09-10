const test = require('node:test'), assert = require('node:assert/strict');
const {summarize} = require('../public/erp/cari-ekstre');
test('statement date range carries opening and totals ledger deltas without counting product lines', () => {
    const data = {musteri:{cariAcilisBakiyesi:100},hareketler:[
        {_id:'1',tarih:'2026-08-01',tip:'BORC',tutar:500},
        {_id:'2',tarih:'2026-09-01',tip:'BORC',tutar:20312.28,bakiyeDegisimi:8829.80,kalemler:[{toplam:8829.80}]},
        {_id:'3',tarih:'2026-09-02',tip:'TAHSILAT',tutar:1000},
        {_id:'4',tarih:'2026-09-03',tip:'BORC',tutar:999,durum:'IPTAL'},
        {_id:'5',tarih:'2026-10-01',tip:'BORC',tutar:500}
    ]};
    const s = summarize(data,'2026-09-01','2026-09-30');
    assert.equal(s.opening,600); assert.equal(s.debit,8829.8); assert.equal(s.credit,1000); assert.equal(s.balance,8429.8); assert.equal(s.rows.length,3);
});
test('same-day timestamp ordering and negative opening survive normal statement rendering', () => {
    const s = summarize({musteri:{cariAcilisBakiyesi:-50},hareketler:[{_id:'b',tarih:'2026-09-01',createdAt:'2026-09-01T12:00Z',tip:'ALACAK',tutar:25},{_id:'a',tarih:'2026-09-01',createdAt:'2026-09-01T10:00Z',tip:'BORC',tutar:100}]});
    assert.equal(s.rows[0]._id,'a'); assert.equal(s.balance,25);
});
test('sale detail lookup scopes invoice and products to tenant and original customer', async t => {
    const Sale=require('../src/models/Satis'),Product=require('../src/models/Urun');
    const q=v=>({select(){return this;},lean:async()=>v});
    t.mock.method(Sale,'find',f=>{assert.equal(f.tenantId,'tenant');assert.deepEqual(f.$or,[{_id:'sale',musteriId:'customer'}]);return q([{_id:'sale',musteriId:'other',kalemler:[]}]);});
    t.mock.method(Product,'find',f=>{assert.equal(f.tenantId,'tenant');return q([]);});
    const result=await require('../src/services/cariEkstreDetayServisi').detaylandir('tenant',[{tarafTipi:'MUSTERI',tarafId:'customer',kaynak:'SATIS',kaynakId:'sale'}]);
    assert.equal(result[0].kalemler,undefined);
});
