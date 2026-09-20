const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const shop = require("../src/modules/b2b/magazaServisi");
const pricing = require("../src/modules/b2b/servis");
const payments = require("../src/modules/b2b/magazaOdemeServisi");
const Settings = require("../src/modules/b2b/models/MagazaAyar");
const Payment = require("../src/modules/b2b/models/MagazaOdeme");
const Tenant = require("../src/modules/platform/models/Tenant");
const User = require("../src/models/Kullanici");
const Customer = require("../src/models/Musteri");
const Depot = require("../src/models/Depo");
const Bank = require("../src/models/Banka");
const Order = require("../src/models/Siparis");
const ids = Array.from({length: 8}, (_, i) => String(i+1).padStart(24,"0"));
const [tenantId, depotId, customerId, userId, productId, orderId, bankId] = ids;
const q = value => { const result = { then(a,b) { return Promise.resolve(value).then(a,b); } }; for (const k of ["select","lean","session","sort","limit","populate"]) result[k]=()=>result; return result; };
function registerMocks(t) {
    const state = { committed: false, ended: false };
    const session = { async withTransaction(fn) { await fn(); state.committed = true; }, async endSession() { state.ended = true; } };
    t.mock.method(mongoose,"startSession",async()=>session);
    t.mock.method(Tenant,"findOne",filter=>{ assert.equal(filter.slug,"test-shop"); return q({_id:tenantId,slug:"test-shop",name:"Shop",status:"active"}); });
    t.mock.method(Settings,"findById",()=>q({_id:tenantId,aktif:true,depoId:depotId}));
    t.mock.method(Depot,"exists",async()=>true);
    t.mock.method(User,"exists",async()=>false);
    t.mock.method(Customer,"create",async(docs,options)=>{assert.equal(options.session,session);state.customer=docs[0];return[{_id:customerId,...docs[0]}];});
    t.mock.method(User,"create",async(docs,options)=>{assert.equal(options.session,session);state.user=docs[0];return docs;});
    return state;
}
const registration = () => ({firma:"test-shop",adSoyad:"Yeni Müşteri",email:"new@example.test",telefon:"05551234567",sifre:"strong-test-password",adres:"Test Mahallesi No 12",il:"İstanbul",ilce:"Kadıköy"});
test('Bayi ve perakende KDV gösterimi ayrı kaydedilir ve eski ayarlar korunur',async t=>{
 const defaults=new Settings({_id:tenantId});assert.equal(defaults.bayiKdvDahil,false);assert.equal(defaults.perakendeKdvDahil,true);
 let saved;t.mock.method(Settings,'findOneAndUpdate',async(filter,update)=>{assert.deepEqual(filter,{_id:tenantId});saved=update.$set;});
 const body={aktif:false,havale:false,kapida:false,kart:false,paytrTest:false};
 await shop.ayarKaydet(tenantId,{...body,bayiKdvDahil:true,perakendeKdvDahil:false});
 assert.equal(saved.bayiKdvDahil,true);assert.equal(saved.perakendeKdvDahil,false);
 await shop.ayarKaydet(tenantId,body);assert.ok(!Object.hasOwn(saved,'bayiKdvDahil'));assert.ok(!Object.hasOwn(saved,'perakendeKdvDahil'));
 await assert.rejects(shop.ayarKaydet(tenantId,{...body,bayiKdvDahil:'false'}),/KDV/);
});
test("mağaza eski deneme hesaplarında ERP erişim kuralını kullanır, süresi dolmuş hesabı reddeder", async t => {
    registerMocks(t);
    let company = { _id: tenantId, slug: "test-shop", status: "trial" };
    t.mock.method(Tenant, "findOne", () => q(company));
    assert.equal((await shop.magazaBul("test-shop")).company._id, tenantId);
    company = { ...company, trialEndsAt: new Date(0) };
    await assert.rejects(shop.magazaBul("test-shop"), /erişimi aktif değil/);
    company.status = "suspended";
    await assert.rejects(shop.magazaBul("test-shop"), /erişimi aktif değil/);
});
test("perakende fiyatı bayi/grup/özel fiyat ve iskonto alanlarından etkilenmez",()=>{
    const product={_id:productId,bayiFiyati:20,satisFiyati:120,perakendeFiyati:150};
    const customer={b2b:{musteriTipi:"PERAKENDE",fiyatlar:[{urunId:productId,fiyat:1}]}};
    assert.equal(pricing.netFiyat(product,customer,{iskonto:99,fiyatlar:[{urunId:productId,fiyat:2}]}),150);
    assert.equal(pricing.netFiyat({...product,perakendeFiyati:0},customer,null),120);
    assert.deepEqual(shop.visibility(customer),{katalogFiyati:true,gorsel:true,stok:false,barkod:false,depo:false});
});
test("kayıt isteği rol, tenant, bakiye veya bayi fiyatı enjekte edemez",async t=>{
    const state=registerMocks(t);
    await shop.kaydol({...registration(),rol:"OWNER",tenantId:ids[7],musteriId:ids[7],bakiye:999,b2b:{musteriTipi:"BAYI",fiyatlar:[{fiyat:1}]}});
    assert.equal(state.customer.tenantId,tenantId);assert.equal(state.customer.bakiye,0);
    assert.equal(state.customer.b2b.musteriTipi,"PERAKENDE");assert.equal(state.customer.b2b.negatifStok,false);
    assert.equal(state.user.rol,"BAYI");assert.equal(state.user.musteriId,customerId);assert.deepEqual(state.user.ozelYetkiler,[]);
    assert.ok(await bcrypt.compare(registration().sifre,state.user.sifre));assert.equal(state.committed,true);assert.equal(state.ended,true);
});
test("ticari başvuru otomatik bayi onayı veya fiyatı sağlamaz",async t=>{
    const state=registerMocks(t);
    await shop.kaydol({...registration(),ticariBasvuru:true,unvan:"Test Ticaret",vergiNo:"1234567890",vergiDairesi:"Test"});
    assert.equal(state.customer.b2b.ticariBasvuru,true);assert.equal(state.customer.b2b.musteriTipi,"PERAKENDE");
});
test("kullanıcı kaydı başarısızsa transaction commit edilmez",async t=>{
    const state=registerMocks(t);t.mock.method(User,"create",async()=>{throw Object.assign(new Error("duplicate"),{code:11000});});
    await assert.rejects(shop.kaydol(registration()),/hesap var/);assert.equal(state.committed,false);assert.equal(state.ended,true);
});
test("mevcut kullanıcıya email veya telefonla müşteri hesabı bağlanmaz",async t=>{
    const state=registerMocks(t);t.mock.method(User,"exists",async()=>true);
    await assert.rejects(shop.kaydol(registration()),/hesap var/);assert.equal(state.customer,undefined);
});
test("kapalı veya test modundaki ödeme yöntemi müşteriye açılmaz",async t=>{
    let iban="TR330006100519786457841326";
    t.mock.method(Bank,"findOne",()=>q({bankaAdi:"Bank",iban}));
    const settings={havale:true,kapida:true,kart:true,bankaId:bankId,paytrMerchantId:"123",paytrSecret:"encrypted",paytrTest:true};
    assert.deepEqual((await shop.odemeSecenekleri(settings,tenantId)).map(x=>x.kod),["HAVALE","KAPIDA"]);
    assert.deepEqual((await shop.odemeSecenekleri({...settings,paytrTest:false},tenantId)).map(x=>x.kod),["HAVALE","KAPIDA","KART"]);
    assert.deepEqual(await shop.odemeSecenekleri({...settings,havale:false,kapida:false,kart:false},tenantId),[]);
    iban="TR123";
    assert.deepEqual((await shop.odemeSecenekleri(settings,tenantId)).map(x=>x.kod),["KAPIDA"]);
});
test("kart bildirimi HMAC doğrular; tutar veya durum değişirse reddeder",()=>{
    const secret={key:"unit-test-key",salt:"unit-test-salt"};
    const body={merchant_oid:orderId,status:"success",total_amount:"15000"};
    body.hash=crypto.createHmac("sha256",secret.key).update(orderId+secret.salt+body.status+body.total_amount).digest("base64");
    assert.equal(payments.hashDogrula(body,secret),true);
    assert.equal(payments.hashDogrula({...body,total_amount:"1"},secret),false);
    assert.equal(payments.hashDogrula({...body,status:"failed"},secret),false);
    assert.equal(payments.hashDogrula({...body,hash:"invalid"},secret),false);
});
test("tamamlanmış kart bildirimi yeniden gelirse sipariş veya tahsilat yazılmaz",async t=>{
    process.env.ENCRYPTION_KEY ||= "test-encryption-key-for-retail-payments-only";
    const secret={key:"unit-test-key",salt:"unit-test-salt"};
    const encrypted=require("../src/services/sifrelemeServisi").sifrele(JSON.stringify(secret));
    const body={merchant_oid:orderId,status:"success",total_amount:"15000",test_mode:"0"};
    body.hash=crypto.createHmac("sha256",secret.key).update(orderId+secret.salt+body.status+body.total_amount).digest("base64");
    t.mock.method(Payment,"findById",()=>q({_id:orderId,secret:encrypted,test:false,tutarKurus:15000,durum:"ODENDI"}));
    t.mock.method(mongoose,"startSession",async()=>({withTransaction:async fn=>fn(),endSession:async()=>{}}));
    t.mock.method(Order,"findOne",()=>assert.fail("Completed callback must not rewrite order"));
    await payments.callback(body);
    await assert.rejects(payments.callback({...body,total_amount:"1"}),/doğrulanamadı/);
});

function paymentMocks(t, { method = "KART", testMode = false, failMoney = false } = {}) {
    process.env.ENCRYPTION_KEY ||= "test-encryption-key-for-retail-payments-only";
    const secret = { key: "unit-key", salt: "unit-salt" };
    const encrypted = require("../src/services/sifrelemeServisi").sifrele(JSON.stringify(secret));
    const state = { commits: 0, ledgers: [], money: [], ended: 0 };
    const session = { async withTransaction(fn) { await fn(); state.commits++; }, async endSession() { state.ended++; } };
    const save = async options => assert.equal(options.session, session);
    const order = { _id: orderId, tenantId, musteriId: customerId, musteriTipi: "PERAKENDE", magazaOdemeYontemi: method, magazaOdemeDurumu: "BEKLIYOR", genelToplam: 150, siparisNo: "TEST-ORDER", durum: "TASLAK", save };
    const payment = { _id: orderId, tenantId, musteriId: customerId, bankaId: bankId, tutarKurus: 15000, secret: encrypted, test: testMode, durum: "BEKLIYOR", save };
    const customer = { _id: customerId, bakiye: 0, save };
    const account = { _id: bankId, bakiye: 100, paraBirimi: "TRY", constructor: { modelName: method === "KAPIDA" ? "Kasa" : "Banka" }, save };
    t.mock.method(mongoose, "startSession", async () => session);
    t.mock.method(Payment, "findById", () => q(payment));
    t.mock.method(Order, "findOne", filter => { assert.equal(String(filter.tenantId), tenantId); return q(order); });
    t.mock.method(Customer, "findOne", filter => { assert.equal(String(filter.tenantId), tenantId); return q(customer); });
    t.mock.method(Bank, "findOne", () => q(account));
    t.mock.method(require("../src/models/Kasa"), "findOne", () => q(account));
    t.mock.method(Settings, "findById", () => q({ bankaId: bankId, kasaId: bankId }));
    t.mock.method(require("../src/models/CariHareket"), "create", async (rows, options) => { assert.equal(options.session, session); state.ledgers.push(...rows); return [{ _id: ids[7], ...rows[0] }]; });
    t.mock.method(require("../src/models/ParaHareket"), "create", async (rows, options) => { assert.equal(options.session, session); if (failMoney) throw new Error("money-write-failed"); state.money.push(...rows); return rows; });
    const body = { merchant_oid: orderId, status: "success", total_amount: "15000", test_mode: testMode ? "1" : "0" };
    body.hash = crypto.createHmac("sha256", secret.key).update(orderId + secret.salt + body.status + body.total_amount).digest("base64");
    return { state, body, order, payment, customer, account };
}
test("başarılı kart bildirimi tek transaction içinde cari alacak ve banka girişi yazar", async t => {
    const { state, body, order, payment, customer, account } = paymentMocks(t);
    await payments.callback(body); await payments.callback(body);
    assert.equal(state.ledgers.length, 1); assert.equal(state.money.length, 1);
    assert.equal(customer.bakiye, -150); assert.equal(account.bakiye, 250);
    assert.equal(state.ledgers[0].bakiyeDegisimi, -150); assert.equal(state.money[0].tip, "GIRIS");
    assert.equal(order.magazaOdemeDurumu, "ODENDI"); assert.equal(payment.durum, "ODENDI");
});
test("tahsilat yazma hatasında transaction commit edilmez ve sipariş ödendi olmaz", async t => {
    const { state, body, order, payment } = paymentMocks(t, { failMoney: true });
    await assert.rejects(payments.callback(body), /money-write-failed/);
    assert.equal(state.commits, 0); assert.equal(state.ended, 1);
    assert.equal(order.magazaOdemeDurumu, "BEKLIYOR"); assert.equal(payment.durum, "BEKLIYOR");
});
test("PayTR test bildirimi gerçek para veya cari hareket oluşturmaz", async t => {
    const { state, body, order, payment } = paymentMocks(t, { testMode: true });
    await payments.callback(body);
    assert.equal(state.ledgers.length, 0); assert.equal(state.money.length, 0);
    assert.equal(payment.durum, "TEST"); assert.equal(order.durum, "IPTAL");
});
for (const method of ["HAVALE", "KAPIDA"]) test(method + " onayı gerçek tahsilat teyidi gerektirir ve tekrarında çift kayıt olmaz", async t => {
    const { state, order, account } = paymentMocks(t, { method });
    const req = { tenantId, currentUser: { _id: userId }, body: {} };
    await assert.rejects(payments.manuelOnay(req, orderId), /onaylayın/);
    req.body.onay = true;
    await payments.manuelOnay(req, orderId); await payments.manuelOnay(req, orderId);
    assert.equal(state.ledgers.length, 1); assert.equal(state.money.length, 1);
    assert.equal(account.bakiye, 250); assert.equal(order.magazaOdemeDurumu, "ODENDI");
    assert.equal(state.money[0].hesapTipi, method === "KAPIDA" ? "KASA" : "BANKA");
});
test("perakende satış dönüşümü önce tahsilat ister, ödenmiş satışta tekrar para girişi yazmaz", async t => {
    const session = { withTransaction: async fn => fn(), endSession: async () => {} };
    t.mock.method(mongoose, "startSession", async () => session);
    const order = { _id: orderId, tenantId, musteriId: customerId, depoId: depotId, kaynakKanal: "B2B", musteriTipi: "PERAKENDE", magazaOdemeYontemi: "HAVALE", magazaOdemeDurumu: "BEKLIYOR", durum: "SEVK_EDILDI", siparisNo: "LOCAL-RETAIL", kalemler: [{ urunId: productId, miktar: 1 }], araToplam: 125, toplamKdv: 25, genelToplam: 150, save: async opts => assert.equal(opts.session, session) };
    t.mock.method(Order, "findOne", () => q(order));
    t.mock.method(Customer, "findOne", () => q({ _id: customerId }));
    t.mock.method(Depot, "findOne", () => q({ _id: depotId }));
    const Stock = require("../src/models/Stok"), Sale = require("../src/models/Satis");
    t.mock.method(Stock, "findOne", () => q({ _id: ids[7], urunId: productId, miktar: 10 }));
    t.mock.method(Sale, "findOne", () => q(null));
    const convert = require("../src/controllers/siparisController").satisdonustur;
    const req = { tenantId, params: { id: orderId }, currentUser: { _id: userId, rol: "ADMIN" }, body: {} };
    let status, response, sales = 0, ledgers = 0;
    const res = { status(n) { status = n; return this; }, json(x) { response = x; } };
    t.mock.method(Sale, "create", async (rows, opts) => { sales++; assert.equal(opts.session, session); assert.equal(rows[0].odemeDurumu, "ODENDI"); assert.equal(rows[0].odenenTutar, 150); assert.equal(rows[0].kalanTutar, 0); return [{ _id: ids[7], ...rows[0] }]; });
    await assert.rejects(convert(req, res, e => { throw e; }), /tahsilatı doğrulanmadan/); assert.equal(sales, 0);
    order.magazaOdemeDurumu = "ODENDI"; order.magazaTahsilatId = ids[7];
    t.mock.method(Stock, "findOneAndUpdate", async (_, update, opts) => { assert.equal(update.$inc.miktar, -1); assert.equal(opts.session, session); return { urunId: productId, miktar: 9 }; });
    t.mock.method(require("../src/models/StokHareket"), "create", async rows => rows);
    t.mock.method(Customer, "findOneAndUpdate", async (_, update) => { assert.equal(update.$inc.bakiye, 150); return { bakiye: -150 }; });
    t.mock.method(require("../src/models/CariHareket"), "create", async rows => { ledgers++; assert.equal(rows[0].tip, "BORC"); assert.equal(rows[0].sonrakiBakiye, 0); return rows; });
    t.mock.method(require("../src/models/ParaHareket"), "create", () => assert.fail("Payment must not be posted a second time"));
    await convert(req, res, e => { throw e; }); assert.equal(status, 201); assert.equal(response.musteriBakiye, 0);
    await convert(req, res, e => { throw e; }); assert.equal(status, 409);
    assert.equal(sales, 1); assert.equal(ledgers, 1);
});
test("PayTR başlangıcı kayıtlı tutarı ve satıcı bilgisini imzalar, geçersiz dönüş adresini kullanmaz", async t => {
    process.env.ENCRYPTION_KEY ||= "test-encryption-key-for-retail-payments-only";
    const previousOrigin = process.env.PUBLIC_APP_URL; process.env.PUBLIC_APP_URL = "invalid-config";
    t.after(() => { if (previousOrigin === undefined) delete process.env.PUBLIC_APP_URL; else process.env.PUBLIC_APP_URL = previousOrigin; });
    const secret = { key: "unit-key", salt: "unit-salt" };
    const encrypted = require("../src/services/sifrelemeServisi").sifrele(JSON.stringify(secret));
    t.mock.method(Order, "findOne", filter => { assert.equal(filter.musteriTipi, "PERAKENDE"); assert.equal(filter.musteriId, customerId); return q({ _id: orderId, genelToplam: 150, siparisNo: "TEST-ORDER", sevkAdresi: "Local test street No 12" }); });
    t.mock.method(Settings, "findById", () => q({ aktif: true, kart: true, bankaId: bankId, paytrMerchantId: "999", paytrSecret: encrypted, paytrTest: false }));
    t.mock.method(Bank, "findOne", () => q({ _id: bankId }));
    t.mock.method(Payment, "findById", () => q({ _id: orderId, tutarKurus: 15000, merchantId: "123", secret: encrypted, test: false, durum: "BEKLIYOR" }));
    t.mock.method(Customer, "findOne", () => q({ adSoyad: "Local Shopper", telefon: "905551234567" }));
    t.mock.method(Payment, "updateOne", async (_, update) => assert.equal(update.$set.iframeToken, "local-token"));
    t.mock.method(globalThis, "fetch", async (url, options) => {
        assert.equal(url, "https://www.paytr.com/odeme/api/get-token");
        const f = Object.fromEntries(options.body);
        assert.equal(f.merchant_id, "123"); assert.equal(f.payment_amount, "15000"); assert.equal(f.test_mode, "0");
        assert.equal(f.merchant_ok_url, "https://www.benimmuhasebe.com/b2b/?odeme=sonuc");
        const expected = crypto.createHmac("sha256", secret.key).update(f.merchant_id + f.user_ip + f.merchant_oid + f.email + f.payment_amount + f.user_basket + f.no_installment + f.max_installment + f.currency + f.test_mode + secret.salt).digest("base64");
        assert.equal(f.paytr_token, expected);
        return { ok: true, json: async () => ({ status: "success", token: "local-token" }) };
    });
    const result = await payments.baslat({ tenantId, bayi: { _id: customerId }, currentUser: { email: "local@example.test" }, ip: "127.0.0.1" }, orderId);
    assert.equal(result.iframeUrl, "https://www.paytr.com/odeme/guvenli/local-token");
});
