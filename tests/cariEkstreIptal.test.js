const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('shared statement preserves opening, signed corrections and excludes cancelled invoice from balance',async()=>{
 let summary; const html=fs.readFileSync('public/erp/cari-ekstre.html','utf8'),script=fs.readFileSync('public/erp/cari-ekstre-paylasim.js','utf8'),app={innerHTML:''};
 const data={musteri:{unvan:'Customer',bakiye:130,cariAcilisBakiyesi:50},hareketler:[{tip:'BORC',tutar:20312.28,durum:'IPTAL',bakiyeDegisimi:20312.28,tarih:'2026-09-09'},{tip:'BORC',tutar:100,bakiyeDegisimi:100,tarih:'2026-09-09'},{tip:'DUZELTME',tutar:20,bakiyeDegisimi:-20,tarih:'2026-09-09'}]};
 await vm.runInNewContext(script,{document:{getElementById:()=>app},location:{search:'?token=test'},URLSearchParams,CariEkstre:{mount:(host,data)=>{summary=require('../public/erp/cari-ekstre').summarize(data);}},fetch:async()=>({ok:true,json:async()=>data}),Intl,Date});
 assert.equal(summary.balance,130); assert.equal(summary.opening,50); assert.equal(summary.debit,100); assert.equal(summary.credit,20); assert.deepEqual(summary.rows.map(r=>r.balance),[50,150,130]);
});
