const test = require("node:test"), assert = require("node:assert/strict"), crypto = require("node:crypto");
process.env.JWT_SECRET ||= "b2b-local-security-test-secret-not-production";
const mongoose = require("mongoose"), bcrypt = require("bcryptjs");
const User = require("../src/models/Kullanici"), Customer = require("../src/models/Musteri"), Product = require("../src/models/Urun");
const Order = require("../src/models/Siparis"), Sale = require("../src/models/Satis"), Ledger = require("../src/models/CariHareket");
const Tenant = require("../src/modules/platform/models/Tenant"), Depot = require("../src/models/Depo"), Stock = require("../src/models/Stok");
const Group = require("../src/modules/b2b/models/BayiGrubu"), service = require("../src/modules/b2b/servis");
const { tokenOlustur } = require("../src/services/tokenServisi");
const ids = Array.from({ length: 9 }, (_, i) => String(i + 1).padStart(24, "0"));
const [tenantId, customerId, userId, productId, depotId, foreignId, groupId] = ids;
const q = value => { const query = { then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } }; for (const name of ["select", "sort", "limit", "skip", "lean", "populate", "session"]) query[name] = () => query; return query; };
test("B2B net pricing precedence and input validation", () => {
    const product = { _id: productId, bayiFiyati: 100, satisFiyati: 150 };
    assert.equal(service.netFiyat(product, {}, { iskonto: 10 }), 90);
    assert.equal(service.netFiyat(product, {}, { iskonto: 10, fiyatlar: [{ urunId: productId, fiyat: 80 }] }), 80);
    assert.equal(service.netFiyat(product, { b2b: { fiyatlar: [{ urunId: productId, fiyat: 0 }] } }, { iskonto: 10 }), 0);
    assert.throws(() => service.sayi(Infinity)); assert.throws(() => service.sayi("20")); assert.throws(() => service.oid({ $ne: null }));
    assert.notEqual(service.siparisNo(userId, "0123456789abcdef"), service.siparisNo(foreignId, "0123456789abcdef"));
});
test("B2B HTTP authentication, isolation and privacy", async t => {
    const hash = await bcrypt.hash("correct-test-password", 4);
    let enabled = true, userActive = true;
    const customer = { _id: customerId, tenantId, aktif: true, unvan: "Own company", bakiye: 25, b2b: { aktif: true, siparisYetkisi: true, depoId: depotId }, limit: 1000, riskLimiti: 2000, vadeGun: 30 };
    const user = { _id: userId, tenantId, musteriId: customerId, rol: "BAYI", adSoyad: "Dealer", email: "dealer@example.test", sifre: hash, aktif: true, favoriler: [], save: async () => {} };
    t.mock.method(User, "findOne", filter => q(userActive && (!filter._id || String(filter._id) === userId) && (!filter.tenantId || String(filter.tenantId) === tenantId) ? user : null));
    t.mock.method(Customer, "findOne", filter => q(enabled && String(filter._id) === customerId && String(filter.tenantId) === tenantId ? customer : null));
    t.mock.method(Tenant, "findById", () => q({ _id: tenantId, name: "Tenant", status: "active", toObject() { return { status: "active" }; } }));
    const app = require("../src/uygulama");
    const server = app.listen(0, "127.0.0.1"); await new Promise(r => server.once("listening", r)); t.after(() => new Promise(r => { server.closeAllConnections(); server.close(r); }));
    const base = "http://127.0.0.1:" + server.address().port;
    const token = tokenOlustur({ kullaniciId: userId, tenantId, rol: "BAYI" });
    const request = (path, body, extra = {}) => fetch(base + path, { method: body ? "POST" : "GET", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...extra }, body: body ? JSON.stringify(body) : undefined });
    await t.test("public company branding exposes only company name and requires active B2B", async tt => {
        tt.mock.method(Tenant, "findOne", filter => { assert.equal(filter.slug, "akn-motosiklet"); assert.ok(filter.$or); return q({ _id: tenantId, name: "AKN", firmaBilgileri: { unvan: "AKN Motosiklet", vergiNo: "private" } }); });
        let active = true;
        tt.mock.method(Customer, "exists", filter => { assert.equal(String(filter.tenantId), tenantId); assert.equal(filter["b2b.aktif"], true); return Promise.resolve(active); });
        const response = await request("/api/b2b/company/akn-motosiklet");
        assert.equal(response.status, 200); assert.deepEqual(await response.json(), { basarili: true, firma: { unvan: "AKN Motosiklet" } });
        active = false; assert.equal((await request("/api/b2b/company/akn-motosiklet")).status, 404);
    });
    await t.test("existing real password login issues a dealer session", async () => {
        const r = await request("/api/auth/login", { email: user.email, sifre: "correct-test-password" }); assert.equal(r.status, 200);
        const d = await r.json(); assert.equal(d.kullanici.rol, "BAYI"); assert.match(r.headers.get("set-cookie"), /HttpOnly/i); assert.ok(!JSON.stringify(d).includes(hash));
    });
    await t.test("anonymous cannot access catalog", async () => { assert.equal((await fetch(base + "/api/b2b/catalog")).status, 401); });
    await t.test("dealer cannot access general ERP or platform APIs", async () => {
        for (const path of ["/api/tenant/dashboard", "/api/tenant/musteriler", "/api/tenant/urunler", "/api/tenant/siparisler", "/api/tenant/b2b/", "/api/auth/verilerim", "/api/platform/notifications"]) assert.equal((await request(path)).status, 403, path);
    });
    await t.test("dealer and ERP cookies are independent", async () => {
        const staffToken = tokenOlustur({ kullaniciId: foreignId, tenantId, rol: "OWNER" });
        const headers = { Authorization: "", Cookie: 'bm_session=' + staffToken + '; bm_b2b_session=' + token + '; bm_csrf=staff; bm_b2b_csrf=dealer' };
        assert.equal((await request('/api/b2b/me', null, headers)).status, 200);
        assert.equal((await request('/api/b2b/me', null, { Authorization: '', Cookie: 'bm_session=' + staffToken })).status, 401);
        const out = await request('/api/b2b/auth/logout', {}, {...headers, 'X-CSRF-Token':'dealer'});
        assert.equal(out.status,200); assert.match(out.headers.get('set-cookie'), /bm_b2b_session=/); assert.ok(!out.headers.get('set-cookie').includes('bm_session='));
        const login = await request('/api/b2b/auth/login', {email:user.email,sifre:'correct-test-password'}, headers);
        assert.equal(login.status,200); assert.match(login.headers.get('set-cookie'),/bm_b2b_session=/); assert.ok(!login.headers.get('set-cookie').includes('bm_session='));
    });
    await t.test("forged tenant and account parameters are ignored", async () => {
        const r = await request(`/api/b2b/me?tenantId=${foreignId}&customerId=${foreignId}&userId=${foreignId}`); assert.equal(r.status, 200);
        const d = await r.json(); assert.equal(d.cari.unvan, "Own company"); assert.ok(!JSON.stringify(d).includes("fiyatlar"));
    });
    await t.test("another tenant in signed claim fails current-user check", async () => { const wrong = tokenOlustur({ kullaniciId: userId, tenantId: foreignId, rol: "BAYI" }); assert.equal((await request("/api/b2b/me", null, { Authorization: "Bearer " + wrong })).status, 403); });
    await t.test("suspending customer or user immediately revokes portal access", async () => {
        enabled = false; assert.equal((await request("/api/b2b/me")).status, 403); enabled = true;
        userActive = false; assert.equal((await request("/api/b2b/me")).status, 403); userActive = true;
    });
    await t.test("cookie CSRF cannot be bypassed by adding a bearer header", async () => {
        assert.equal((await request("/api/b2b/quote", { kalemler: [] }, { Cookie: `bm_b2b_session=${token}; bm_b2b_csrf=expected` })).status, 403);
    });
    await t.test("foreign order and sale IDs are always customer and tenant scoped", async tt => {
        for (const [Model, path] of [[Order, "orders"], [Sale, "documents"]]) {
            tt.mock.method(Model, "findOne", filter => { assert.equal(String(filter.tenantId), tenantId); assert.equal(String(filter.musteriId), customerId); assert.equal(filter._id, foreignId); return q(null); });
            assert.equal((await request(`/api/b2b/${path}/${foreignId}`)).status, 404);
        }
    });
    await t.test("ledger and payments query only this customer's ledger", async tt => {
        tt.mock.method(Ledger, "find", filter => { assert.equal(String(filter.tenantId), tenantId); assert.equal(String(filter.tarafId), customerId); assert.equal(filter.tarafTipi, "MUSTERI"); return q([]); });
        tt.mock.method(require("../src/models/Banka"), "find", () => q([{ bankaAdi: "Bank", iban: "TR00" }]));
        assert.equal((await request("/api/b2b/ledger?customerId=" + foreignId)).status, 200);
        const d = await (await request("/api/b2b/payments")).json(); assert.ok(!JSON.stringify(d.hesaplar).includes("bakiye"));
    });
    await t.test("catalog projects only dealer net price and scoped warehouse stock", async tt => {
        tt.mock.method(Product, "find", filter => { assert.equal(String(filter.tenantId), tenantId); return q([{ _id: productId, ad: "Product", kod: "P1", satisFiyati: 150, bayiFiyati: 100, alisFiyati: 40, paraBirimi: "TRY", kdv: 20 }]); });
        tt.mock.method(Product, "countDocuments", async () => 1); tt.mock.method(Product, "distinct", async () => []);
        tt.mock.method(Depot, "findOne", filter => { assert.equal(String(filter.tenantId), tenantId); assert.equal(String(filter._id), depotId); return q({ _id: depotId, ad: "Main" }); });
        tt.mock.method(Stock, "find", filter => { assert.equal(String(filter.tenantId), tenantId); assert.equal(String(filter.depoId), depotId); return q([{ urunId: productId, miktar: -3 }]); });
        customer.b2b.gorunum = { stok: true, katalogFiyati: true, barkod: true, gorsel: true, depo: true };
        const d = await (await request("/api/b2b/catalog?tenantId=" + foreignId)).json();
        assert.equal(d.products[0].netFiyat, 100); assert.equal(d.products[0].stok, -3);
        customer.b2b.gorunum = {};
        const hidden = await (await request("/api/b2b/catalog?stok=true&katalogFiyati=true")).json();
        for (const field of ["stok", "netFiyat", "barkod", "gorsel"]) assert.ok(!(field in hidden.products[0]));
        assert.equal(hidden.depo, null);
        for (const field of ["alisFiyati", "satisFiyati", "bayiFiyati", "fiyatlar", "tenantId"]) assert.ok(!(field in d.products[0]));
    });
    await t.test("admin group writes use the authenticated tenant and reject foreign references", async tt => {
        user.rol = "OWNER";
        try {
            const owner = tokenOlustur({ kullaniciId: userId, tenantId, rol: "OWNER" });
            tt.mock.method(Group, "create", async fields => { assert.equal(String(fields.tenantId), tenantId); return { _id: groupId, ...fields }; });
            const created = await request("/api/tenant/b2b/groups", { tenantId: foreignId, ad: "Bayi A", iskonto: 10, fiyatlar: [] }, { Authorization: "Bearer " + owner });
            assert.equal(created.status, 200);
            tt.mock.method(Group, "exists", async () => null);
            const foreign = await fetch(base + "/api/tenant/b2b/customers/" + customerId, { method: "PATCH", headers: { Authorization: "Bearer " + owner, "Content-Type": "application/json" }, body: JSON.stringify({ aktif: true, siparisYetkisi: true, negatifStok: true, limit: 0, riskLimiti: 0, vadeGun: 0, minimumSiparis: 0, grupId: foreignId, depoId: depotId }) });
            assert.equal(foreign.status, 400);
            assert.equal((await request("/api/b2b/me", null, { Authorization: "Bearer " + owner })).status, 403);
        } finally { user.rol = "BAYI"; }
    });
    await t.test("dealer creation explains duplicate email, preserves existing accounts and accepts a new email", async tt => {
        user.rol = "OWNER";
        try {
            const owner = tokenOlustur({ kullaniciId: userId, tenantId, rol: "OWNER" });
            const headers = { Authorization: "Bearer " + owner };
            let duplicate = true, creates = 0, race = false;
            tt.mock.method(Customer, "exists", async filter => { assert.equal(filter.aktif, true); assert.equal(String(filter.tenantId), tenantId); assert.equal(filter["b2b.aktif"], true); return { _id: customerId }; });
            tt.mock.method(User, "exists", async () => duplicate ? { _id: foreignId } : null);
            tt.mock.method(User, "countDocuments", async () => 0);
            tt.mock.method(User, "create", async fields => {
                if (race) throw Object.assign(new Error("Duplicate"), { code: 11000, keyPattern: { email: 1 } });
                assert.equal(fields.telefonNormalize, "905051234567");
                creates++; assert.equal(fields.rol, "BAYI"); assert.equal(String(fields.musteriId), customerId); assert.equal(String(fields.tenantId), tenantId);
                assert.equal(await bcrypt.compare(" exact-test-password ", fields.sifre), true);
                return { _id: foreignId, email: fields.email };
            });
            const body = { adSoyad: "Dealer User", email: "dealer-new@example.test", telefon: "0505 123 45 67", sifre: " exact-test-password " };
            const conflict = await request(`/api/tenant/b2b/customers/${customerId}/users`, body, headers);
            assert.equal(conflict.status, 409); assert.equal((await conflict.json()).kod, "B2B_EMAIL_IN_USE"); assert.equal(creates, 0); assert.equal(user.rol, "OWNER");
            duplicate = false;
            const created = await request(`/api/tenant/b2b/customers/${customerId}/users`, body, headers);
            assert.equal(created.status, 201); assert.equal(creates, 1); assert.equal((await created.json()).kullanici.email, body.email);
            const invalidPhone = await request(`/api/tenant/b2b/customers/${customerId}/users`, { ...body, telefon: "123" }, headers);
            assert.equal(invalidPhone.status, 400);
            race = true;
            const raced = await request(`/api/tenant/b2b/customers/${customerId}/users`, body, headers);
            assert.equal(raced.status, 409); assert.equal((await raced.json()).kod, "B2B_EMAIL_IN_USE");
        } finally { user.rol = "BAYI"; }
    });
});
test("B2B quote and order reuse ERP models and persisted totals", async t => {
    const customer = { _id: new mongoose.Types.ObjectId(customerId), tenantId: new mongoose.Types.ObjectId(tenantId), b2b: { aktif: true, depoId: depotId, negatifStok: true, siparisYetkisi: true, minimumSiparis: 0 }, bakiye: 10, limit: 500, riskLimiti: 500, vadeGun: 30 };
    const product = { _id: new mongoose.Types.ObjectId(productId), ad: "Product", kod: "P1", paraBirimi: "TRY", bayiFiyati: 100, satisFiyati: 150, kdv: 20 };
    t.mock.method(Depot, "findOne", () => q({ _id: depotId })); t.mock.method(Group, "findOne", () => q(null));
    t.mock.method(Product, "find", filter => { assert.equal(String(filter.tenantId), tenantId); return q([product]); });
    t.mock.method(Stock, "find", () => q([{ urunId: productId, miktar: 1 }]));
    const items = [{ urunId: productId, miktar: 2, birimFiyat: 0, kdv: 0 }];
    const quote = await service.teklif(tenantId, customer, items);
    assert.equal(quote.araToplam, 200); assert.equal(quote.toplamKdv, 40); assert.equal(quote.genelToplam, 240); assert.equal(quote.kalemler[0].birimFiyat, 100);
    t.mock.method(Order, "aggregate", () => q([]));
    await assert.rejects(service.teklif(tenantId, { ...customer, b2b: { ...customer.b2b, negatifStok: false } }, items), /yeterli stok/);
    await assert.rejects(service.teklif(tenantId, customer, [{ urunId: productId, miktar: NaN }]), /geçersiz/);
    const session = { withTransaction: async fn => fn(), endSession: async () => {} };
    t.mock.method(mongoose, "startSession", async () => session);
    let saved, writes = 0;
    t.mock.method(Customer, "findOneAndUpdate", filter => { assert.equal(String(filter._id), customerId); assert.equal(filter["b2b.siparisYetkisi"], true); return q(customer); });
    t.mock.method(Order, "findOne", () => q(saved || null)); t.mock.method(Order, "aggregate", () => q([{ tutar: 0 }]));
    t.mock.method(Order, "create", async (docs, opts) => { assert.equal(opts.session, session); writes++; saved = { ...docs[0], _id: foreignId }; return [{ toObject: () => saved }]; });
    const req = { tenantId, bayi: customer, currentUser: { _id: userId }, body: { kalemler: items, transactionId: crypto.randomUUID(), fiyatOnayi: quote.fiyatOnayi, tenantId: foreignId, musteriId: foreignId, durum: "TAMAMLANDI", genelToplam: 0 } };
    const order = await service.siparisOlustur(req);
    assert.equal(String(order.musteriId), customerId); assert.equal(String(order.tenantId), tenantId); assert.equal(order.durum, "TASLAK"); assert.equal(order.kaynakKanal, "B2B"); assert.equal(order.genelToplam, 240);
    assert.equal((await service.siparisOlustur(req))._id, order._id); assert.equal(writes, 1);
    saved = null; customer.riskLimiti = 100;
    await assert.rejects(service.siparisOlustur(req), /limiti/); assert.equal(writes, 1);
    customer.riskLimiti = 500; req.body.fiyatOnayi = "stale";
    await assert.rejects(service.siparisOlustur(req), /Fiyatlar değişti/); assert.equal(writes, 1);
});
test("B2B sale conversion uses existing transaction and posts stock/customer once", async t => {
    const sid = new mongoose.Types.ObjectId(foreignId), cid = new mongoose.Types.ObjectId(customerId);
    const order = { _id: ids[7], tenantId, musteriId: cid, depoId: depotId, kaynakKanal: "B2B", durum: "SEVK_EDILDI", siparisNo: "B2B-TEST", kalemler: [{ urunId: productId, miktar: 2, birimFiyat: 100, kdv: 20, iskonto: 0, araToplam: 200, kdvTutari: 40, toplam: 240 }], araToplam: 200, toplamKdv: 40, genelToplam: 240, save: async () => {} };
    const session = { withTransaction: async fn => fn(), endSession: async () => {} };
    t.mock.method(mongoose, "startSession", async () => session);
    t.mock.method(Order, "findOne", filter => { if (filter.durum) assert.deepEqual(filter.durum.$in, ["SEVK_EDILDI"]); return q(order); });
    t.mock.method(Customer, "findOne", () => q({ _id: cid })); t.mock.method(Depot, "findOne", () => q({ _id: depotId }));
    t.mock.method(Stock, "findOne", () => q({ _id: ids[8], urunId: productId, miktar: 1 }));
    t.mock.method(Sale, "findOne", () => q(null));
    let saleWrites = 0, stockWrites = 0, ledgerWrites = 0;
    t.mock.method(Sale, "create", async (docs, opts) => { assert.equal(opts.session, session); saleWrites++; return [{ ...docs[0], _id: sid }]; });
    t.mock.method(Stock, "findOneAndUpdate", async (filter, update, opts) => { assert.equal(String(filter.tenantId), tenantId); assert.equal(String(filter.depoId), depotId); assert.equal(update.$inc.miktar, -2); assert.equal(opts.session, session); stockWrites++; return { urunId: productId, miktar: -1 }; });
    t.mock.method(require("../src/models/StokHareket"), "create", async (docs, opts) => { assert.equal(docs[0].miktar, 2); assert.equal(opts.session, session); return docs; });
    t.mock.method(Customer, "findOneAndUpdate", async (filter, update, opts) => { assert.equal(update.$inc.bakiye, 240); assert.equal(opts.session, session); return { bakiye: 10 }; });
    t.mock.method(Ledger, "create", async (docs, opts) => { assert.equal(docs[0].sonrakiBakiye, 250); assert.equal(opts.session, session); ledgerWrites++; return docs; });
    const req = { tenantId, params: { id: order._id }, currentUser: { _id: userId, rol: "ADMIN" }, body: {} };
    let status, response; const res = { status(n) { status = n; return this; }, json(x) { response = x; } };
    const convert = require("../src/controllers/siparisController").satisdonustur;
    await convert(req, res, e => { throw e; }); assert.equal(status, 201); assert.equal(response.musteriBakiye, 250); assert.equal(order.durum, "TAMAMLANDI");
    await convert(req, res, e => { throw e; }); assert.equal(status, 409);
    assert.deepEqual([saleWrites, stockWrites, ledgerWrites], [1, 1, 1]);
});
