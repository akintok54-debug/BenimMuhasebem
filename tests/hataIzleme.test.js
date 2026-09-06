const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const express = require("express");
const audit = require("../src/modules/platform/services/auditServisi");
const monitoring = require("../src/modules/platform/services/hataIzlemeServisi");
const User = require("../src/models/Kullanici");
const id = "507f1f77bcf86cd799439011", tenantId = "507f1f77bcf86cd799439012";
const q = value => ({ select() { return this; }, populate() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => value });
async function server(t, app) { const s = await new Promise(resolve => { const instance=app.listen(0,"127.0.0.1",()=>resolve(instance)); });t.after(()=>new Promise(resolve=>s.close(resolve)));return `http://127.0.0.1:${s.address().port}`; }
test("Hata metadata exception mesajı ve URL secret parametrelerini saklamaz", () => {
    const e = { name:"TypeError", message:"password=SECRET", stack:"TypeError: password=SECRET\n    at save (/app/public/erp/erp.js?token=SECRET:10:2)\n    at run (/app/a.js:11:3)" };
    const data=monitoring.errorDetails(e);
    assert.equal(data.name,"TypeError");assert.ok(!JSON.stringify(data).includes("SECRET"));assert.ok(data.frames.some(x=>x.includes("a.js")));
    assert.equal(monitoring.safePath("https://u:secret@example.com/erp/?token=ABC#test"),"/erp/");
});
test("Sunucu 500 yanıtı hata kaydı tamamlandıktan sonra gönderilir ve yanıt değişmez", async t => {
    let captured=false;
    t.mock.method(monitoring,"serverError",async(req,status,error)=>{assert.equal(status,500);assert.equal(error.name,"TypeError");await new Promise(r=>setTimeout(r,15));captured=true;});
    const app=express();app.use(require("../src/middleware/hataIzlemeMiddleware"));
    app.get("/fail",(req,res)=>{res.locals.platformError=new TypeError("private");res.status(500).json({basarili:false,mesaj:"safe"});});
    const base=await server(t,app),response=await fetch(base+"/fail");assert.equal(response.status,500);assert.ok(captured);assert.deepEqual(await response.json(),{basarili:false,mesaj:"safe"});
});
test("Kayıt servisi hata verse bile mevcut 500 yanıtı kilitlenmez", async t => {
    t.mock.method(monitoring,"serverError",async()=>{throw new Error("db unavailable");});
    const app=express();app.use(require("../src/middleware/hataIzlemeMiddleware"));app.get("/fail",(req,res)=>res.status(500).json({basarili:false}));
    const base=await server(t,app),response=await fetch(base+"/fail");assert.equal(response.status,500);
});
test("Anonim tarayıcı hata bildirimi firma/kullanıcı kimliği taklit edemez", async t => {
    let saved;
    t.mock.method(audit,"kaydet",async value=>{saved=value;return {_id:id};});
    const app=express();app.use(express.json());app.use("/telemetry",require("../src/modules/platform/routes/telemetryRotasi"));
    const base=await server(t,app),response=await fetch(base+"/telemetry/client-error",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:"JAVASCRIPT",tenantId,userId:id,role:"SUPER_ADMIN",name:"TypeError",page:"/erp/?token=SECRET",message:"password=SECRET",file:"/erp/erp.js?key=SECRET",line:12,column:3})});
    assert.equal(response.status,202);assert.equal(saved.tenantId,null);assert.equal(saved.req.currentUser,null);assert.equal(saved.details.source,"ANONYMOUS_CLIENT_REPORTED");assert.ok(!JSON.stringify(saved.details).includes("SECRET"));
});
test("Kimliği doğrulanmış tarayıcı bildirimi veritabanındaki tenant bağını kullanır", async t => {
    const old=process.env.JWT_SECRET;process.env.JWT_SECRET="test-error-monitoring-secret-long-enough";t.after(()=>{if(old===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=old;});
    t.mock.method(User,"findOne",()=>q({_id:id,rol:"OWNER",tenantId}));let saved;
    t.mock.method(audit,"kaydet",async value=>{saved=value;return {_id:id};});
    const token=require("../src/services/tokenServisi").tokenOlustur({kullaniciId:id,rol:"OWNER",tenantId});
    const app=express();app.use(express.json());app.use("/telemetry",require("../src/modules/platform/routes/telemetryRotasi"));const base=await server(t,app);
    const response=await fetch(base+"/telemetry/client-error",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({kind:"PROMISE",tenantId:id,page:"/erp/"})});
    assert.equal(response.status,202);assert.equal(saved.tenantId,tenantId);assert.equal(saved.req.currentUser._id,id);
});
test("Tarayıcı bildirimi kalıcı kaydedilemiyorsa kabul edildi denmez", async t => {
    t.mock.method(audit,"kaydet",async()=>null);const app=express();app.use(express.json());app.use(require("../src/modules/platform/routes/telemetryRotasi"));
    const base=await server(t,app);const response=await fetch(base+"/client-error",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:"RESOURCE"})});assert.equal(response.status,503);
});
test("Browser collector tekilleştirir, hassas veri göndermez ve fetch sonucunu korur", async () => {
    const handlers={},calls=[],result={ok:true};const window={fetch:async(...args)=>{calls.push(args);return result;},addEventListener:(name,fn)=>{handlers[name]=fn;}};
    vm.runInNewContext(fs.readFileSync(require.resolve("../public/hata-izleme.js"),"utf8"),{window,location:{href:"https://site.test/erp/?token=SECRET"},document:{cookie:"bm_csrf=csrf"},URL,Map,Date,JSON});
    handlers.error({filename:"https://site.test/erp/erp.js?secret=SECRET",lineno:5,colno:6,error:{name:"TypeError",message:"SECRET"}});
    handlers.error({filename:"https://site.test/erp/erp.js?secret=SECRET",lineno:5,colno:6,error:{name:"TypeError"}});
    assert.equal(calls.length,1);assert.ok(!calls[0][1].body.includes("SECRET"));assert.equal(calls[0][1].headers["X-CSRF-Token"],"csrf");
    assert.equal(await window.fetch("/normal"),result);
});
test("Tutarlılık taraması mevcut denetimi salt okunur çalıştırır ve firma bazlı bulgu yazar", async t => {
    t.mock.method(require("../scripts/muhasebe-butunluk-audit"),"run",async options=>{assert.deepEqual(options,{connect:false,output:false});return {tamTarama:true,hatalar:[{tenantId,belgeId:id,eksik:"stok hareketi"}],kopukReferanslar:[],yetimBelgeHareketleri:[],ozet:{eksikBelgeBaglantisi:1},kapsam:{satis:1}};});
    const saved=[];t.mock.method(audit,"kaydet",async x=>{saved.push(x);return {_id:id};});
    await require("../src/modules/platform/services/tutarlilikIzlemeServisi").run({});assert.equal(saved[0].tenantId,tenantId);assert.equal(saved[0].details.automaticRepair,false);assert.equal(saved[1].action,"INTEGRITY_SCAN_COMPLETED");
});

test("Platform uyarıları çözülmüş auditleri dışlar; gerçek servis ve hesap sayılarını döndürür", async t => {
    const Audit=require("../src/modules/platform/models/PlatformAuditLog"),Tenant=require("../src/modules/platform/models/Tenant"),Integration=require("../src/models/IntegrationError");
    t.mock.method(Audit,"aggregate",async pipeline=>{assert.ok(pipeline.some(x=>x.$match?.["resolution.resolved"]?.$ne===true));return [{count:[{total:3}],latest:[{_id:id,action:"CLIENT_JAVASCRIPT"}]}];});
    t.mock.method(Audit,"populate",async x=>x);t.mock.method(Audit,"findOne",()=>q(null));
    t.mock.method(Tenant,"countDocuments",async filter=>{assert.deepEqual(filter.status.$in,["expired","suspended"]);return 2;});
    t.mock.method(User,"countDocuments",async()=>4);t.mock.method(Integration,"countDocuments",async()=>5);t.mock.method(Integration,"find",()=>q([]));
    let data;await require("../src/modules/platform/controllers/notificationController").listele({}, {set(){},json(x){data=x;}}, error=>{throw error;});
    assert.deepEqual(data.counts,{errors:3,integrations:5,accounts:2,disabledUsers:4,services:2});
    assert.equal(data.delivery.panel,"POLL_30_SECONDS");assert.deepEqual(data.services.map(x=>x.code),["CRON","BACKUP"]);
});

test("Hata kanalı geçersiz türleri reddeder ve anonim istekleri hız sınırına alır", async t => {
    t.mock.method(audit,"kaydet",async()=>({_id:id}));const app=express();app.use(express.json());app.use(require("../src/modules/platform/routes/telemetryRotasi"));const base=await server(t,app);
    const send=kind=>fetch(base+"/client-error",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind})});
    assert.equal((await send("FAKE_ADMIN_ACTION")).status,400);
    let status;for(let i=0;i<11;i++)status=(await send("JAVASCRIPT")).status;
    assert.equal(status,429);
});

test("Bildirim arayüzü gerçek sayaçları gösterir, HTML kaçışını uygular ve 30 saniyede yenilenir", async () => {
    const elements={};for(const id of ["notificationButton","notificationPanel","notificationAlert","logoutButton"])elements[id]={hidden:true,addEventListener(){},setAttribute(){}};
    const data={basarili:true,checkedAt:new Date().toISOString(),counts:{errors:1,integrations:0,accounts:0,disabledUsers:0,services:0},latest:[{_id:id,action:'<script>evil</script>',path:'/api/test',createdAt:new Date().toISOString()}],integrations:[],services:[],delivery:{webhookConfigured:false}};
    let interval;
    vm.runInNewContext(fs.readFileSync(require.resolve("../public/platform/notifications.js"),"utf8"),{document:{getElementById:id=>elements[id],hidden:false,addEventListener(){}},fetch:async()=>({ok:true,status:200,json:async()=>data}),AbortSignal,Date,JSON,setInterval:(_,ms)=>{interval=ms;}});
    await new Promise(resolve=>setImmediate(resolve));assert.equal(interval,30000);assert.equal(elements.notificationButton.textContent,"Uyarılar 1");assert.equal(elements.notificationAlert.hidden,false);assert.ok(elements.notificationPanel.innerHTML.includes('&lt;script&gt;'));assert.ok(!elements.notificationPanel.innerHTML.includes('<script>evil'));
});

test("Fatal izleyici varsayılan Node kapanış davranışını bastıran handler eklemez", () => {
    const events=[];vm.runInNewContext(fs.readFileSync(require.resolve("../src/modules/platform/services/runtimeIzleme.js"),"utf8"),{Symbol,process:{on:name=>events.push(name)}});
    assert.deepEqual(events,["uncaughtExceptionMonitor"]);
});
