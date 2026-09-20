const test=require('node:test'),assert=require('node:assert/strict'),f=require('../src/services/disKanalFiyatServisi');
test('External prices honor VAT mode including zero VAT and explicit zero price',()=>{
 for(const kdv of [0,1,10,20]){
  assert.deepEqual(f.kanalFiyati({satisFiyati:100,perakendeFiyati:150,kdv},'TRENDYOL'),{salePrice:100+kdv,listPrice:150*(1+kdv/100),vatRate:kdv});
  for(const included of [false,true]){
   const out=f.ideasoftDegisiklik({taxIncluded:included,tax:20},{salePrice:100,vatRate:kdv});assert.equal(out.price1,included?100+kdv:100);
   const back=f.ideasoftNet({...out,taxIncluded:included});assert.equal(back.kdv,kdv);assert.ok(Math.abs(back.net-100)<1e-9);
  }
 }
 assert.equal(f.ideasoftNet({price1:0,tax:0,taxIncluded:1}).net,0);
 const fractional=f.ideasoftNet({price1:100,tax:20,taxIncluded:1});assert.equal(f.ideasoftDegisiklik({taxIncluded:1,tax:20},{salePrice:fractional.net}).price1,100);
 for(const taxIncluded of [undefined,null,'no'])assert.throws(()=>f.ideasoftDegisiklik({taxIncluded,tax:20},{salePrice:100}));
});
test('External order stores net unit prices, conserves totals and rejects unallocated fees/discounts',()=>{
 const base={urunId:'p',miktar:2,birimFiyat:120,vergi:20};
 const gross=f.siparisHesapla([base],240);assert.equal(gross.kalemler[0].birimFiyat,100);assert.equal(gross.toplamKdv,40);
 const net=f.siparisHesapla([base],288);assert.equal(net.kalemler[0].birimFiyat,120);assert.equal(net.toplamKdv,48);
 assert.throws(()=>f.siparisHesapla([{...base,kdvDahil:false}],240));
 assert.throws(()=>f.siparisHesapla([base],250));
 assert.throws(()=>f.siparisHesapla([base],200));
 assert.equal(f.siparisHesapla([{...base,vergi:0}],240).toplamKdv,0);
});
test('IdeaSoft price PUT preserves remote VAT mode and stock, rejects unknown tax metadata before write',async()=>{
 const Adapter=require('../src/integrations/marketplace/IdeaSoftAdapter'),a=new Adapter({apiBaseUrl:'example.myideasoft.com'},{});let current={id:1,price1:300,tax:20,taxIncluded:1,stockAmount:7},writes=[];
 a.request=async(path,options={})=>{if(options.method==='PUT'){writes.push(options.body);return options.body;}return current;};
 await a.updatePrices([{externalProductId:'1',salePrice:100,vatRate:10}]);assert.equal(writes[0].price1,110);assert.equal(writes[0].tax,10);assert.equal(writes[0].stockAmount,7);assert.equal(writes[0].taxIncluded,1);
 current={...current,taxIncluded:undefined};await assert.rejects(a.updatePrices([{externalProductId:'1',salePrice:100,vatRate:20}]));assert.equal(writes.length,1);
});
test('Live price check is tenant scoped, read only and distinguishes differences from missing mappings',async t=>{
 const Mapping=require('../src/models/MarketplaceProductMapping');
 t.mock.method(Mapping,'countDocuments',async filter=>{assert.equal(filter.tenantId,'tenant');return 3;});
 t.mock.method(Mapping,'find',filter=>{assert.equal(filter.tenantId,'tenant');const q={populate(opts){assert.equal(opts.match.tenantId,'tenant');return q;},sort(){return q;},skip(){return q;},limit(){return q;},async lean(){return [{_id:'a',externalProductId:1,productId:{satisFiyati:100,kdv:20}},{_id:'b',externalProductId:2,productId:{satisFiyati:90,kdv:20}},{_id:'c',externalProductId:3,productId:null}];}};return q;});
 let calls=0;const adapter={async request(path,options){assert.equal(options,undefined);calls++;return {price1:120,tax:20,taxIncluded:1};}};
 const result=await require('../src/services/disKanalDogrulamaServisi').fiyatKontrol('tenant',{_id:'connection',provider:'IDEASOFT'},adapter);assert.deepEqual(result.rows.map(x=>x.status),['UYUMLU','FARK_VAR','ESLESME_EKSIK']);assert.equal(calls,2);assert.equal(result.nextOffset,null);
});
