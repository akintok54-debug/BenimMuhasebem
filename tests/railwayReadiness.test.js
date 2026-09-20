const test=require('node:test'),assert=require('node:assert/strict'),mongoose=require('mongoose');
const ready=require('../src/routes/hazirlikRotasi');
function response(){return {code:200,set(){return this;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};}
test('Readiness fails closed when database is unavailable',async()=>{const res=response();await ready({},res);assert.equal(res.code,503);assert.equal(res.body.ready,false);});
test('Railway API proxy does not redirect API requests, public pages keep canonical redirect',()=>{
 const fn=require('../src/middleware/guvenlikKatmani').kanonikAlanAdi;
 const before={NODE_ENV:process.env.NODE_ENV,BACKEND_API_ONLY:process.env.BACKEND_API_ONLY};
 process.env.NODE_ENV='production';process.env.BACKEND_API_ONLY='true';
 try {let passed=false,redirect;const res={redirect:(status,url)=>{redirect={status,url};}};fn({path:'/api/auth/profil'},res,()=>passed=true);assert.equal(passed,true);fn({path:'/erp/',originalUrl:'/erp/',get:()=> 'backend.up.railway.app'},res,()=>{});assert.equal(redirect.status,308);}
 finally{for(const [k,v]of Object.entries(before))v===undefined?delete process.env[k]:process.env[k]=v;}
});
