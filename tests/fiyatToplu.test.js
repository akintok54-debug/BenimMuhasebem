const test=require('node:test'),assert=require('node:assert/strict');
const f=require('../public/erp/fiyat'),bulk=require('../src/services/urunTopluServisi');
const product={_id:'000000000000000000000001',tenantId:'000000000000000000000002',kod:'SKU1',ad:'Parça',satisFiyati:120,bayiFiyati:100,perakendeFiyati:150,kdv:20,updatedAt:new Date('2026-01-01')};
test('Bulk VAT conversion uses each product VAT and leaves other tiers untouched',()=>{
 for(const kdv of [0,1,10,20])for(const alan of ['satisFiyati','bayiFiyati','perakendeFiyati']){
  const p={...product,kdv,[alan]:100};
  const added=bulk.fiyatPlani([p],{alan,islem:'KDV_EKLE'}).satirlar[0];
  assert.deepEqual(added.yeni,{[alan]:100+kdv});
  assert.equal(bulk.fiyatPlani([{...p,...added.yeni}],{alan,islem:'KDV_CIKAR'}).satirlar[0].yeni[alan],100);
 }
 assert.deepEqual(bulk.fiyatPlani([product],{alan:'kdv',oran:10}).satirlar[0].yeni,{kdv:10});
 assert.deepEqual(bulk.fiyatPlani([product],{alan:'iskonto',oran:12.5}).satirlar[0].yeni,{iskonto:12.5});
 for(const oran of [-1,101,NaN])assert.throws(()=>bulk.fiyatPlani([product],{alan:'iskonto',oran}));
});
test('Product and catalog Excel export handle embedded images beyond Excel cell limit',async()=>{
 const vm=require('node:vm'),fs=require('node:fs'),xlsx=require('xlsx');
 const huge={...product,gorsel:'data:image/png;base64,'+'A'.repeat(50000),notlar:'N'.repeat(40000)};
 const writes=[];
 const XLSX={...xlsx,writeFile(wb,name){const data=xlsx.write(wb,{type:'buffer',bookType:'xlsx'});writes.push({name,wb:xlsx.read(data,{type:'buffer'})});}};
 const ctx={window:{XLSX},XLSX};vm.runInNewContext(fs.readFileSync('public/erp/urun-toplu.js','utf8'),ctx);
 ctx.window.ERPToplu.excel([huge]);
 const source=fs.readFileSync('public/erp/erp.js','utf8');
 const fn=source.slice(source.indexOf('    async function katalogIslemi('),source.indexOf('    async function teklifSiparisYukle('));
 const catalog=vm.runInNewContext('('+fn.trim()+')',{window:{XLSX},XLSX,ERPFiyat:f,alert:m=>{throw Error(m);},firmaProfiliGetir:()=>{throw Error('Excel must not require company profile');}});
 await catalog('excel',[huge,{...huge,kategori:'Other'}],undefined);
 assert.equal(writes.length,2);
 for(const {wb}of writes){const rows=xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);assert.equal(rows[0]['Görsel URL'],'');assert.equal(rows[0]['Satış Fiyatı'],120);}
});
test('Shared prices preserve tiers, explicit zero overrides and VAT totals',()=>{
 assert.equal(f.fiyatSec(product,'PERAKENDE'),150);
 assert.equal(f.fiyatSec({...product,bayiFiyati:0},'BAYI'),120);
 assert.equal(f.fiyatlandir(product,{b2b:{fiyatlar:[{urunId:product._id,fiyat:0}]}}).netFiyat,0);
 assert.deepEqual(f.hesapla([{miktar:2,birimFiyat:120,kdvDahil:true,kdv:20,iskonto:10}]).genelToplam,216);
 for(const bad of [NaN,Infinity,-1,'',null,true])assert.throws(()=>f.kalem({miktar:1,birimFiyat:bad}));
});
test('Campaigns honor customer, product, tier and end boundary without stacking',()=>{
 const now=new Date('2026-09-19'),base={_id:'c',aktif:true,tur:'KAMPANYA',baslangic:'2026-09-01',bitis:'2026-10-01',fiyatTurleri:['BAYI'],indirimOrani:10};
 assert.equal(f.fiyatlandir(product,{},null,[base,{...base,indirimOrani:20}],now).netFiyat,80);
 for(const c of [{...base,bitis:now},{...base,musteriIds:['other']},{...base,urunIds:['other']},{...base,fiyatTurleri:['SATIS']}])assert.equal(f.fiyatlandir(product,{},null,[c],now).netFiyat,100);
 assert.equal(f.fiyatlandir(product,{},null,[base],now).eskiKdvDahilFiyat,120);
});
test('Excel preserves blank prices, converts supplied VAT and rejects duplicates/conflicts',()=>{
 let plan=bulk.aktarimPlani([{kod:'SKU1',satisFiyati:'',bayiFiyati:120}],[product],[],[],true);
 assert.equal(plan.hatalar.length,0);assert.equal(plan.satirlar[0].yeni.bayiFiyati,100);assert.ok(!('satisFiyati' in plan.satirlar[0].yeni));
 plan=bulk.aktarimPlani([{kod:'SKU1'},{kod:'SKU1'}],[product]);assert.equal(plan.hatalar.length,1);
 plan=bulk.aktarimPlani([{kod:'SKU1',barkod:'OTHER'}],[product,{...product,_id:'000000000000000000000003',kod:'SKU2',barkod:'OTHER'}]);assert.equal(plan.hatalar.length,1);
 assert.equal(bulk.aktarimPlani([{kod:'SKU1',stokMiktari:3}],[product],[]).hatalar.length,1);
});
test('Bulk approval is bound to tenant, request and unchanged preview',()=>{
 process.env.JWT_SECRET||='local-test-signing-secret';
 const body={alan:'satisFiyati',islem:'ZAM',oran:10},plan=bulk.fiyatPlani([product],body);
 assert.equal(plan.satirlar[0].yeni.satisFiyati,132);
 const token=bulk.onayOlustur('tenant','FIYAT',body,plan);
 assert.doesNotThrow(()=>bulk.onayDogrula(token,'tenant','FIYAT',body,plan));
 assert.throws(()=>bulk.onayDogrula(token,'other','FIYAT',body,plan));
 assert.throws(()=>bulk.onayDogrula(token,'tenant','FIYAT',{...body,oran:20},plan));
 assert.throws(()=>bulk.onayDogrula(token,'tenant','FIYAT',body,bulk.fiyatPlani([{...product,satisFiyati:140}],body)));
 assert.throws(()=>bulk.filtre({}));
});
test('Payment display rejects invalid IBAN and explicitly labelled demo accounts',()=>{
 const {yayinlanabilir}=require('../src/services/odemeHesabiServisi');
 const bank={bankaAdi:'Banka',iban:'TR330006100519786457841326',aktif:true};
 assert.equal(yayinlanabilir(bank),true);assert.equal(yayinlanabilir({...bank,iban:'TR00'}),false);
 assert.equal(yayinlanabilir({...bank,bankaAdi:'Test banka'}),false);assert.equal(yayinlanabilir({...bank,aktif:false}),false);
});
