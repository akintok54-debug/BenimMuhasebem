const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
function handler(connect,readyState=0){
 const mongoose={connection:{readyState}};let calls=0,security=0;
 const module={exports:{}};
 const imports={"../src/modules/platform/services/runtimeIzleme":{},"../src/uygulama":(req,res)=>{calls++;res.status(200).json({ok:true});},"mongoose":mongoose,"../src/database/veritabani":connect,"../src/services/productionGuvenlikServisi":{productionGuvenlikDogrula:()=>{security++;}}};
 vm.runInNewContext(fs.readFileSync(require.resolve("../api/index"),"utf8"),{module,require:name=>imports[name],console:{error:()=>{}}});
 return {run:module.exports,mongoose,calls:()=>calls,security:()=>security};
}
function response(){return {code:200,status(n){this.code=n;return this;},json(body){this.body=body;return this;}};}
test("serverless cold starts share one connection and retry after disconnect",async()=>{
 let connections=0,release;
 const h=handler(()=>{connections++;return new Promise(r=>{release=r;});});
 const a=response(),b=response(),one=h.run({url:"/api/saglik"},a),two=h.run({url:"/api/saglik"},b);
 await Promise.resolve();assert.equal(connections,1);release();await Promise.all([one,two]);
 assert.equal(h.calls(),2);assert.equal(h.security(),1);
 const three=h.run({url:"/api/saglik"},response());await Promise.resolve();assert.equal(connections,2);release();await three;
});
test("database errors fail closed without exposing connection secrets and can retry",async()=>{
 let count=0;const h=handler(async()=>{if(++count===1)throw Error("mongodb://secret@example.test");});
 const a=response();await h.run({url:"/api/saglik"},a);assert.equal(a.code,503);assert(!JSON.stringify(a).includes("secret"));
 const b=response();await h.run({url:"/api/saglik"},b);assert.equal(b.code,200);
});
test("spreadsheet assets bypass database while business routes require it",async()=>{
 const h=handler(async()=>{throw Error("DB offline");});
 for(const url of ["/api/assets/xlsx.js","/api/assets/jszip.js"]){const r=response();await h.run({url},r);assert.equal(r.code,200);}
 const r=response();await h.run({url:"/api/integrations/akn/health"},r);assert.equal(r.code,503);
});
test("only Vercel-provided deployment hosts bypass canonical redirects",()=>{
 const fn=require("../src/middleware/guvenlikKatmani").kanonikAlanAdi;
 const keys=["NODE_ENV","BACKEND_API_ONLY","VERCEL_URL","VERCEL_PROJECT_PRODUCTION_URL","CANONICAL_HOST"],before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{NODE_ENV:"production",BACKEND_API_ONLY:"false",VERCEL_URL:"erp-build.example.vercel.app",VERCEL_PROJECT_PRODUCTION_URL:"erp.example.vercel.app",CANONICAL_HOST:"erp.example.vercel.app"});
 try{
  for(const host of ["erp-build.example.vercel.app","erp.example.vercel.app"]){let passed=false;fn({path:"/api/saglik",get:()=>host},{redirect:()=>assert.fail()},()=>passed=true);assert(passed);}
  let target;fn({path:"/api/saglik",originalUrl:"/api/saglik",get:()=>"attacker.vercel.app"},{redirect:(_,url)=>target=url},()=>assert.fail());assert.equal(target,"https://erp.example.vercel.app/api/saglik");
 }finally{for(const [k,v] of Object.entries(before))v===undefined?delete process.env[k]:process.env[k]=v;}
});
test("release configuration targets the serverless handler without duplicate scheduled jobs",()=>{
 const config=require("../vercel.json");assert.equal(config.git.deploymentEnabled,false);assert.deepEqual(config.crons,[]);assert(config.functions["api/index.js"]);assert(config.routes.some(r=>r.src==="/api(?:/.*)?"&&r.dest==="/api"));assert.equal(config.buildCommand,"npm run check");
});
