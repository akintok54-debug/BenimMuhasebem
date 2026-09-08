const test=require('node:test'),assert=require('node:assert/strict'),mongoose=require('mongoose');
const Satis=require('../src/models/Satis'),Urun=require('../src/models/Urun'),Musteri=require('../src/models/Musteri'),Stok=require('../src/models/Stok'),Cari=require('../src/models/CariHareket'),SH=require('../src/models/StokHareket'),Iade=require('../src/models/SatisIade'),Audit=require('../src/modules/platform/models/PlatformAuditLog');
const query=value=>{const q={then:(resolve,reject)=>Promise.resolve(value).then(resolve,reject)};q.session=()=>q;q.select=()=>q;q.lean=()=>q;return q;};
test('paid sale correction preserves payment and records only stock/customer differences in one transaction',async t=>{
 const id='000000000000000000000001',pid='000000000000000000000002',cid='000000000000000000000003';let inTransaction=false,ended=false,ledger=[],audits=[];
 const session={withTransaction:async fn=>{inTransaction=true;await fn();inTransaction=false;},endSession:async()=>{ended=true;}};t.mock.method(mongoose,'startSession',async()=>session);
 const sale={_id:id,musteriId:cid,depoId:id,genelToplam:120,odenenTutar:100,kalanTutar:20,belgeNo:'TEST',kalemler:[{urunId:pid,miktar:1}],toObject(){return {genelToplam:this.genelToplam,odenenTutar:this.odenenTutar};},save:async opts=>assert.equal(opts.session,session)};
 const customer={_id:cid,bakiye:30,save:async opts=>assert.equal(opts.session,session)};const stock={miktar:9,maliyet:50,save:async opts=>assert.equal(opts.session,session)};
 t.mock.method(Satis,'findOne',filter=>{assert.equal(String(filter.tenantId),id);return query(sale);});t.mock.method(Iade,'exists',()=>query(null));t.mock.method(Urun,'findOne',()=>query({_id:pid,satisFiyati:100,kdv:20}));t.mock.method(Musteri,'findOne',()=>query(customer));t.mock.method(Stok,'findOne',()=>query(stock));
 t.mock.method(require('../src/services/satisStokServisi'),'satisStokDus',async opts=>{assert.equal(opts.session,session);stock.miktar-=opts.miktar;});
 for(const [model,store] of [[Cari,ledger],[SH,[]],[Audit,audits]])t.mock.method(model,'create',async(rows,opts)=>{assert.ok(inTransaction);assert.equal(opts.session,session);store.push(...rows);return rows;});
 let response,error;const res={status(code){this.statusCode=code;return this;},json(body){response=body;return body;}};
 await require('../src/controllers/satisController').guncelle({tenantId:id,params:{id},currentUser:{rol:'ADMIN'},user:{kullaniciId:id},body:{kalemler:[{urunId:pid,miktar:2,birimFiyat:100,kdv:20,iskonto:0}]}},res,e=>{error=e;});
 assert.ifError(error);assert.equal(response.satis.genelToplam,240);assert.equal(sale.odenenTutar,100);assert.equal(sale.kalanTutar,140);assert.equal(customer.bakiye,150);assert.equal(stock.miktar,8);assert.equal(ledger.length,1);assert.equal(ledger[0].bakiyeDegisimi,120);assert.equal(audits.length,1);assert.ok(ended);
 // A total below the paid amount must fail before any stock/ledger write.
 response=null;error=null;await require('../src/controllers/satisController').guncelle({tenantId:id,params:{id},currentUser:{rol:'ADMIN'},body:{kalemler:[{urunId:pid,miktar:1,birimFiyat:10,kdv:20,iskonto:0}]}},res,e=>{error=e;});assert.equal(error.status,409);assert.equal(stock.miktar,8);assert.equal(ledger.length,1);
});
