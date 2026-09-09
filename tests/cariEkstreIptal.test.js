const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('shared statement preserves opening, signed corrections and excludes cancelled invoice from balance',async()=>{
 const html=fs.readFileSync('public/erp/cari-ekstre.html','utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)[1],app={innerHTML:''};
 const data={musteri:{unvan:'Customer',bakiye:130,cariAcilisBakiyesi:50},hareketler:[{tip:'BORC',tutar:20312.28,durum:'IPTAL',bakiyeDegisimi:20312.28,tarih:'2026-09-09'},{tip:'BORC',tutar:100,bakiyeDegisimi:100,tarih:'2026-09-09'},{tip:'DUZELTME',tutar:20,bakiyeDegisimi:-20,tarih:'2026-09-09'}]};
 await vm.runInNewContext(script,{document:{getElementById:()=>app},location:{search:'?token=test'},URLSearchParams,fetch:async()=>({ok:true,json:async()=>data}),Intl,Date});
 assert.ok(!app.innerHTML.includes('20.312,28'));assert.match(app.innerHTML,/130,00/);assert.match(app.innerHTML,/150,00/);assert.match(app.innerHTML,/50,00/);assert.match(app.innerHTML,/20,00/);
});
