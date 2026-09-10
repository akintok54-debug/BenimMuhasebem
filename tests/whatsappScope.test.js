const test=require('node:test'),assert=require('node:assert/strict');
const Customer=require('../src/models/Musteri'),Message=require('../src/models/WhatsAppMesaj'),controller=require('../src/controllers/whatsappController');
const id='000000000000000000000001',actor='000000000000000000000002',customer='000000000000000000000003';
const query=value=>{const q={then:(r,j)=>Promise.resolve(value).then(r,j)};for(const method of ['select','lean','sort'])q[method]=()=>q;return q;};
test('sales message list is restricted to assigned customers and tenant-safe population',async t=>{
 t.mock.method(Customer,'find',filter=>{assert.equal(String(filter.tenantId),id);assert.deepEqual(filter.$or,[{temsilciId:actor},{olusturanKullaniciId:actor}]);return query([{_id:customer}]);});
 t.mock.method(Message,'find',filter=>{assert.equal(String(filter.tenantId),id);assert.deepEqual(filter.musteriId,{$in:[customer]});const q=query([]);q.populate=spec=>{assert.equal(String(spec.match.tenantId),id);return q;};return q;});
 let result;await controller.listele({tenantId:id,currentUser:{_id:actor,rol:'SALES'}},{json:x=>result=x},e=>{throw e;});assert.equal(result.toplam,0);
});
test('sales user cannot queue messages for an unassigned customer',async t=>{
 t.mock.method(Customer,'findOne',filter=>{assert.equal(String(filter.tenantId),id);assert.ok(filter.$or);return Promise.resolve(null);});t.mock.method(Message,'create',()=>assert.fail('Unauthorized write'));
 const res={status(code){this.code=code;return this;},json(){}};await controller.kuyrugaEkle({tenantId:id,currentUser:{_id:actor,rol:'SATIS'},body:{musteriId:customer,mesaj:'test'}},res,e=>{throw e;});assert.equal(res.code,404);
});
