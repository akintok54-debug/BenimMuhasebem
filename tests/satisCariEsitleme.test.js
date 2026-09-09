const test = require('node:test');
const assert = require('node:assert/strict');
const Cari = require('../src/models/CariHareket');
const Musteri = require('../src/models/Musteri');
const {esitle,bakiyePlani} = require('../src/services/satisCariEsitlemeServisi');
const matches=(row,filter)=>Object.entries(filter).every(([key,value])=>key==='$or'?value.some(f=>matches(row,f)):value && typeof value==='object' && '$in' in value?value.$in.includes(row[key]):value && typeof value==='object' && '$ne' in value?row[key]!==value.$ne:String(row[key])===String(value));
function fixture(t,extra=[]){
 const session={};
 const rows=[{_id:'1',tenantId:'tenant',tarafTipi:'MUSTERI',tarafId:'old',kaynak:'SATIS',kaynakId:'sale',tip:'BORC',tutar:20312.28,bakiyeDegisimi:20312.28,oncekiBakiye:0,durum:'AKTIF'},...extra];
 const customers=[{_id:'old',tenantId:'tenant',bakiye:20312.28,cariAcilisBakiyesi:0},{_id:'new',tenantId:'tenant',bakiye:50,cariAcilisBakiyesi:50}];
 const query=value=>{const q={then:(ok,no)=>Promise.resolve(structuredClone(value)).then(ok,no)};q.session=s=>{assert.equal(s,session);return q;};q.sort=()=>q;q.lean=()=>q;return q;};
 t.mock.method(Cari,'find',f=>{assert.equal(f.tenantId,'tenant');return query(rows.filter(r=>matches(r,f)));});
 t.mock.method(Musteri,'findOne',f=>{assert.equal(f.tenantId,'tenant');return query(customers.find(r=>matches(r,f)));});
 for(const [model,records] of [[Cari,rows],[Musteri,customers]]) for(const method of ['updateOne','updateMany'])t.mock.method(model,method,async(f,u,o)=>{assert.equal(f.tenantId,'tenant');assert.equal(o.session,session);const found=records.filter(r=>matches(r,f));for(const row of method==='updateOne'?found.slice(0,1):found)Object.assign(row,u.$set);return {matchedCount:found.length};});
 t.mock.method(Cari,'bulkWrite',async(writes,o)=>{assert.equal(o.session,session);for(const {updateOne:{filter,update}} of writes){assert.equal(filter.tenantId,'tenant');Object.assign(rows.find(r=>matches(r,filter)),update.$set);}});
 t.mock.method(Cari,'create',()=>assert.fail('Editing must never create a ledger movement'));
 return {rows,customers,session,satis:{_id:'sale',tenantId:'tenant',musteriId:'old',genelToplam:8829.80,durum:'AKTIF'}};
}
test('20312.28 becomes 8829.80 on the same movement; repeated synchronization is idempotent',async t=>{
 const f=fixture(t);await esitle(f);assert.equal(f.rows.length,1);assert.equal(f.rows[0]._id,'1');assert.equal(f.rows[0].tutar,8829.8);assert.equal(f.rows[0].sourceType,'SALE');assert.equal(f.rows[0].sourceId,'sale');assert.equal(f.customers[0].bakiye,8829.8);await esitle(f);assert.equal(f.customers[0].bakiye,8829.8);assert.equal(f.rows.length,1);
});
test('legacy correction is cancelled without counting the difference twice',async t=>{
 const f=fixture(t,[{_id:'2',tenantId:'tenant',tarafTipi:'MUSTERI',tarafId:'old',kaynak:'SATIS_DUZELTME',kaynakId:'sale',tip:'DUZELTME',tutar:11482.48,bakiyeDegisimi:-11482.48,durum:'AKTIF'}]);await esitle(f);assert.equal(f.rows[1].durum,'IPTAL');assert.equal(f.customers[0].bakiye,8829.8);
});
test('customer transfer moves invoice and its payment, rebuilding both customer balances',async t=>{
 const f=fixture(t,[{_id:'2',tenantId:'tenant',tarafTipi:'MUSTERI',tarafId:'old',kaynak:'SATIS_TAHSILAT',kaynakId:'sale',tip:'TAHSILAT',tutar:100,bakiyeDegisimi:-100,durum:'AKTIF'}]);f.satis.musteriId='new';await esitle(f);assert.ok(f.rows.every(r=>r.tarafId==='new'));assert.equal(f.customers[0].bakiye,0);assert.equal(f.customers[1].bakiye,8779.8);
});
test('cancellation removes invoice effect without another movement',async t=>{const f=fixture(t);f.satis.durum='IPTAL';await esitle(f);assert.equal(f.rows[0].durum,'IPTAL');assert.equal(f.customers[0].bakiye,0);assert.equal(f.rows.length,1);});
test('missing, duplicate and foreign-customer source data block writes',async t=>{
 const f=fixture(t);const source=f.rows.pop();await assert.rejects(esitle(f),{status:409});f.rows.push(source,{...source,_id:'duplicate'});await assert.rejects(esitle(f),{status:409});f.rows.pop();f.rows.push({...source,_id:'2',kaynak:'SATIS_DUZELTME',tarafId:'foreign'});await assert.rejects(esitle(f),{status:409});assert.equal(source.tutar,20312.28);
});
test('unknown opening or unsigned adjustment cannot be silently inferred',()=>{assert.throws(()=>bakiyePlani({bakiye:20},[{_id:'1',tip:'BORC',tutar:20}]),{status:409});assert.throws(()=>bakiyePlani({cariAcilisBakiyesi:0},[{tip:'DUZELTME',tutar:10}]),{status:409});});
test('recorded 27985 snapshot proves opening from earlier 185 + 27800 movements',()=>{const plan=bakiyePlani({},[{_id:'1',tip:'BORC',tutar:185},{_id:'2',tip:'BORC',tutar:27800},{_id:'3',tip:'TAHSILAT',tutar:1000,bakiyeDegisimi:-1000,oncekiBakiye:27985}]);assert.equal(plan.opening,0);assert.equal(plan.balance,26985);});
test('normal sale creation validation attaches canonical source fields',async()=>{const id='000000000000000000000001';const row=new Cari({tenantId:id,tarafTipi:'MUSTERI',tarafId:id,tip:'BORC',tutar:10,kaynak:'SATIS',kaynakId:id});await row.validate();assert.equal(row.sourceType,'SALE');assert.equal(String(row.sourceId),id);});
