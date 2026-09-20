const test=require('node:test'),assert=require('node:assert/strict');
const security=require('../src/services/oturumGuvenligi');
test('platform, ERP and B2B select independent authentication and CSRF cookies',()=>{
    for(const [path,name] of [['/platform/','bm_platform_session'],['/api/platform/tenants','bm_platform_session'],['/api/auth/platform/profil','bm_platform_session'],['/api/auth/profil','bm_session'],['/api/tenant/satis','bm_session'],['/api/b2b/me','bm_b2b_session']]) assert.equal(security.cookieAdlari({originalUrl:path}).auth,name);
    const cleared=[];security.oturumCookieSil({clearCookie:n=>cleared.push(n)},'PLATFORM');assert.deepEqual(cleared,['bm_platform_session','bm_platform_csrf']);
});
test('ERP CSRF token cannot authorize a platform mutation and valid platform CSRF can',()=>{
    const req={method:'POST',path:'/api/platform/support',headers:{cookie:'bm_session=erp; bm_csrf=erp-csrf; bm_platform_session=platform; bm_platform_csrf=platform-csrf'},get:()=> 'erp-csrf'};
    const res={locals:{},status(n){this.code=n;return this;},json(){}};let next=false;
    security.csrfKontrol(req,res,()=>next=true);assert.equal(res.code,403);assert.equal(next,false);
    req.get=()=> 'platform-csrf';security.csrfKontrol(req,res,()=>next=true);assert.equal(next,true);
});
test('signed portal scope rejects a copied cookie and 2FA challenge is not an authenticated session',async()=>{
    const jwt=require('jsonwebtoken'),old=process.env.JWT_SECRET;process.env.JWT_SECRET='isolated-cookie-test-secret-123456789';
    try{for(const claims of [{rol:'SUPER_ADMIN',oturumAlani:'PLATFORM'},{rol:'ADMIN',purpose:'2fa'}]){
        const token=jwt.sign(claims,process.env.JWT_SECRET);const req={originalUrl:'/api/tenant/satis',headers:{cookie:'bm_session='+token}};
        const res={status(n){this.code=n;return this;},json(){}};
        await require('../src/middleware/kimlikKontrol')(req,res,()=>assert.fail('Wrong portal accepted'));assert.equal(res.code,401);
    }}finally{if(old===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=old;}
});
