const test=require('node:test'),assert=require('node:assert/strict');
test('Audit follows purchase payment ledger and includes sale correction quantity; rejects wrong links',async t=>{
 const purchase={_id:'purchase',tenantId:'tenant',belgeNo:'AL',kalemler:[],belgeOdemeAyrildi:true,belgeOdemeTutari:3300,hesapTipi:'KASA',hesapId:'cash'};
 const sale={_id:'sale',tenantId:'tenant',belgeNo:'SAT',kalemler:[{urunId:'product'}]};
 const money={_id:'money',tenantId:'tenant',kaynak:'ALIS_ODEME',kaynakId:'payment',hesapTipi:'KASA',hesapId:'cash',tip:'CIKIS',tutar:3300};
 const correction={_id:'stock',tenantId:'tenant',urunId:'product',depoId:'depot',kaynak:'SATIS_DUZELTME',kaynakId:'sale',tip:'SAYIM_EKSI',miktar:1};
 const rows={Alis:[purchase],Satis:[sale],StokHareket:[correction],CariHareket:[{_id:'debt',tenantId:'tenant',kaynak:'ALIS',kaynakId:'purchase',tip:'ALACAK'},{_id:'payment',tenantId:'tenant',kaynak:'ALIS_ODEME',kaynakId:'purchase',tip:'ODEME',tutar:3300},{_id:'receivable',tenantId:'tenant',kaynak:'SATIS',kaynakId:'sale',tip:'BORC'}],ParaHareket:[money],CekSenetPortfoy:[],Urun:[],Depo:[],Musteri:[],Tedarikci:[],Kasa:[],Banka:[],Siparis:[]};
 for(const [model,values]of Object.entries(rows))t.mock.method(require('../src/models/'+model),'find',()=>{let fields;const q={select(v){fields=v.split(' ');return q;},limit(){return q;},async lean(){return values.map(x=>fields?Object.fromEntries(Object.entries(x).filter(([k])=>k==='_id'||fields.includes(k))):{...x});}};return q;});
 const run=()=>require('../scripts/muhasebe-butunluk-audit').run({connect:false,output:false});
 assert.deepEqual((await run()).hatalar,[]);
 money.tutar=10;assert.ok((await run()).hatalar.some(x=>x.eksik==='kasa/banka çıkışı'));
 money.tutar=3300;money.tenantId='other';assert.ok((await run()).hatalar.some(x=>x.eksik==='kasa/banka çıkışı'));
 money.tenantId='tenant';money.kaynakId='purchase';assert.deepEqual((await run()).hatalar,[]);
 correction.miktar=0;assert.ok((await run()).hatalar.some(x=>x.eksik==='stok hareketi:product'));
});
