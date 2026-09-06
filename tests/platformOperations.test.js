const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const express = require("express");
const User = require("../src/models/Kullanici");
const Tenant = require("../src/modules/platform/models/Tenant");
const Subscription = require("../src/modules/platform/models/TenantSubscription");
const Plan = require("../src/modules/platform/models/Plan");
const Audit = require("../src/modules/platform/models/PlatformAuditLog");
const Support = require("../src/modules/platform/models/PlatformSupportSession");
const Depo = require("../src/models/Depo");
const Connection = require("../src/models/IntegrationConnection");
const Job = require("../src/models/IntegrationSyncJob");
const Mapping = require("../src/models/MarketplaceProductMapping");
const IntegrationError = require("../src/models/IntegrationError");
const controller = require("../src/modules/platform/controllers/operationsController");
const guard = require("../src/modules/platform/middleware/superAdmin");
const { kimlik, maskele, onayKontrol } = require("../src/modules/platform/services/platformGuvenligi");
const id = "507f1f77bcf86cd799439011", tenantId = "507f1f77bcf86cd799439012", otherId = "507f1f77bcf86cd799439013";
function query(value) { const q = { lean: async () => value, then: (a,b) => Promise.resolve(value).then(a,b) }; for (const name of ["select", "populate", "sort", "session", "limit"]) q[name] = () => q; return q; }
function res() { return { code: 200, set() {}, status(code) { this.code=code; return this; }, json(data) { this.data=data; return this; } }; }
function req(body = {}, params = {}) { return { body, params, query: {}, currentUser: { _id:id }, user: { kullaniciId:id, rol:"SUPER_ADMIN" }, method:"POST", originalUrl:"/api/platform/test", ip:"127.0.0.1", id:"test-request", headers:{} }; }
const next = error => { if (error) throw error; };

test("Platform role gate checks active persisted SUPER_ADMIN, rejects stale/deleted roles", async t => {
    for (const current of [null, { _id:id, hesapDurumu:"suspended" }, { _id:id, hesapDurumu:"active" }]) {
        const stub=t.mock.method(User,"findOne", filter => { assert.deepEqual(filter,{_id:id,rol:"SUPER_ADMIN",aktif:true,silinmeTarihi:null}); return query(current); });
        const response=res(); let called=false;
        await guard(req(),response,()=>{called=true;});
        assert.equal(called, current?.hesapDurumu === "active");
        if(!called)assert.equal(response.code,403);
        stub.mock.restore();
    }
});

test("Tenant role cannot reach any platform handler or gain support context", async () => {
    const request=req();request.user.rol="OWNER";
    const response=res();await guard(request,response,()=>assert.fail("tenant escaped guard"));assert.equal(response.code,403);
});

test("Critical operations require explicit confirmation and IDs cannot contain operators", () => {
    for(const bad of ["",{$ne:null},"123",otherId+"?admin=true"])assert.throws(()=>kimlik(bad));
    assert.equal(String(kimlik(id)),id);
    const response=res();onayKontrol(req(),response,()=>assert.fail());assert.equal(response.code,400);
    let called=false;onayKontrol(req({onay:"ONAYLIYORUM"}),res(),()=>{called=true;});assert.ok(called);
});

test("Secrets are masked recursively in audit values and embedded authorization", () => {
    const masked=maskele({before:{apiKey:"TOP_SECRET",password:"PASSWORD",token:"TOKEN"},after:{status:"active"},message:"Bearer abc123 token=xyz&ok=1"});
    const output=JSON.stringify(masked);for(const x of ["TOP_SECRET","PASSWORD","TOKEN","abc123","xyz"])assert.ok(!output.includes(x));assert.equal(masked.after.status,"active");
});

test("Immutable audit rejects updates, replacements and query deletions before DB access", async () => {
    for(const op of ["updateOne","updateMany","replaceOne","findOneAndReplace","deleteOne","deleteMany","findOneAndDelete"]){
        const promise=op.includes("Delete")||op.startsWith("delete")?Audit[op]({_id:id}):Audit[op]({_id:id},{action:"tampered"});
        await assert.rejects(promise,/Audit/);
    }
    const doc = new Audit({ action: "ORIGINAL", resource: "test" });
    await assert.rejects(doc.deleteOne(), /Audit/);
    await assert.rejects(Audit.bulkWrite([{ deleteOne: { filter: { _id: id } } }]), /Audit/);
});

test("Support access uses owner-bound unexpired session tenant, ignores caller-supplied tenant", async t => {
    t.mock.method(Support,"findOne", filter=>{assert.equal(String(filter._id),id);assert.equal(filter.actorId,id);assert.equal(filter.closedAt,null);assert.ok(filter.expiresAt.$gt instanceof Date);return query({_id:id,tenantId,expiresAt:new Date(Date.now()+60000)});});
    t.mock.method(Tenant,"findById", value=>{assert.equal(String(value),tenantId);return query({_id:tenantId,name:"Test-only fixture"});});
    t.mock.method(Subscription,"findOne", filter=>{assert.equal(String(filter.tenantId),tenantId);return query(null);});
    for(const model of [User,Depo,require("../src/modules/platform/models/PlatformSession")])t.mock.method(model,"find", filter=>{assert.equal(String(filter.tenantId),tenantId);return query([]);});
    const request=req({}, {id});request.query.tenantId=otherId;
    const response=res();await controller.supportRead(request,response,next);
    assert.equal(response.data.tenant._id,tenantId);assert.equal(request.user.rol,"SUPER_ADMIN");assert.equal(request.tenantId,undefined);
});

test("Expired, closed and another admin's support session are denied before any tenant query", async t => {
    t.mock.method(Support,"findOne",()=>query(null));
    t.mock.method(Tenant,"findById",()=>assert.fail("tenant data accessed"));
    const response=res();await controller.supportRead(req({}, {id}),response,next);assert.equal(response.code,403);
});

test("Subscription update saves tenant access and subscription with an audit in one transaction", async t => {
    const tenant=new Tenant({_id:tenantId,name:"Fixture",slug:"fixture",status:"trial"});
    const plan=new Plan({_id:otherId,name:"Professional",code:"PROFESSIONAL",limits:{users:20,branches:3,warehouses:5},modules:["sales"]});
    const sub=new Subscription({_id:id,tenantId,planId:otherId,status:"trial",expiresAt:new Date(Date.now()+86400000)});
    const session={test:true};let saves=0,audits=0;
    t.mock.method(mongoose.connection,"transaction", async callback=>callback(session));
    t.mock.method(Tenant,"findById",()=>query(tenant));t.mock.method(Plan,"findOne",()=>query(plan));t.mock.method(Subscription,"findOne",()=>query(sub));
    t.mock.method(tenant,"save",async options=>{assert.equal(options.session,session);saves++;});t.mock.method(sub,"save",async options=>{assert.equal(options.session,session);saves++;});
    t.mock.method(Audit,"create",async (docs,options)=>{assert.equal(options.session,session);assert.equal(String(docs[0].tenantId),tenantId);assert.equal(docs[0].details.before.status,"trial");audits++;});
    const response=res();await controller.subscriptionUpdate(req({planId:otherId,status:"active",period:"yearly",paymentStatus:"paid",days:30},{id:tenantId}),response,next);
    assert.equal(response.code,200);assert.equal(saves,2);assert.equal(audits,1);assert.equal(tenant.status,"active");assert.equal(tenant.plan,"professional");assert.equal(sub.period,"yearly");assert.equal(tenant.limits.warehouses,5);
});

test("Invalid subscription changes fail before writes", async t => {
    t.mock.method(mongoose.connection,"transaction",()=>assert.fail("write attempted"));
    for(const days of [-1,1.5,4000,"30"]){const response=res();await controller.subscriptionUpdate(req({days},{id:tenantId}),response,next);assert.equal(response.code,400);}
});

test("Integration diagnostics constrain all dependent counts to connection AND tenant and never fetch credentials", async t => {
    t.mock.method(Connection,"find", filter=>{assert.equal(String(filter.tenantId),tenantId);const q=query([{_id:id,tenantId:{_id:tenantId,name:"Fixture"},provider:"IDEASOFT",active:true,lastSuccessfulSyncAt:new Date()}]);q.select=fields=>{assert.ok(!fields.includes("encryptedCredentials"));return q;};return q;});
    for(const model of [Job,Mapping])t.mock.method(model,"countDocuments",filter=>{assert.equal(filter.tenantId,tenantId);return 3;});
    t.mock.method(IntegrationError,"findOne",filter=>{assert.equal(filter.tenantId,tenantId);assert.equal(filter.connectionId,id);return query(null);});
    const request=req();request.query.tenantId=tenantId;const response=res();await controller.integrations(request,response,next);
    assert.equal(response.data.items[0].pending,3);assert.equal(response.data.items[0].status,"BAGLI");assert.equal(response.data.items[0].tokenStatus,"CANLI_DOGRULAMA_YOK");
});

test("Health reports unavailable DB as failed and absent telemetry as unverified", async () => {
    const response=res();await controller.health(req(),response,next);assert.equal(response.data.services.MongoDB.status,"HATALI");assert.equal(response.data.services.Cron.status,"DOGRULANMADI");assert.equal(response.data.services.Backup.lastAt,null);
});

test("Password reset cannot target SUPER_ADMIN or a user outside selected tenant", async t => {
    t.mock.method(User,"findOne", filter=>{assert.equal(String(filter._id),id);assert.equal(String(filter.tenantId),tenantId);assert.deepEqual(filter.rol,{$ne:"SUPER_ADMIN"});return query(null);});
    const response=res();await controller.passwordReset(req({}, {id:tenantId,userId:id}),response,next);assert.equal(response.code,404);
});

test("SUPER_ADMIN password login retains platform identity and no tenant context", async t => {
    const oldSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "platform-tests-only-not-a-production-key-123456789";
    t.after(() => { if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret; });
    const user = { _id:id, email:"admin@example.invalid", adSoyad:"Test Admin", rol:"SUPER_ADMIN", tenantId:null, aktif:true,
        sifre: require("bcryptjs").hashSync("Test-only-Password123!", 4), save:async()=>{} };
    t.mock.method(User,"findOne",()=>query(user));
    const response=res();response.cookie=()=>response;
    const request=req({email:user.email,sifre:"Test-only-Password123!"});
    await require("../src/modules/auth/controllers/authController").login(request,response);
    assert.equal(response.code,200);assert.equal(response.data.basarili,true);
    assert.equal(response.data.kullanici.rol,"SUPER_ADMIN");assert.equal(response.data.kullanici.tenantId,null);
    assert.ok(user.sonGirisTarihi instanceof Date);
});

test("Session telemetry stores a one-way fingerprint, not an authentication token", () => {
    const { fingerprint }=require("../src/modules/platform/services/sessionTelemetry");
    assert.equal(fingerprint("test-token").length,64);
    assert.notEqual(fingerprint("test-token"),fingerprint("another-token"));
    const model=require("../src/modules/platform/models/PlatformSession");
    assert.equal(model.schema.path("fingerprint").options.select,false);
    assert.equal(model.schema.path("token"),undefined);
});
