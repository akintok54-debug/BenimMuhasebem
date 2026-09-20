const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Urun = require("../src/models/Urun");
const Depo = require("../src/models/Depo");
const Stok = require("../src/models/Stok");
const StokHareket = require("../src/models/StokHareket");
const { hareket } = require("../src/controllers/stokController");

function ortam(t, { ledgerError = false, insufficient = false } = {}) {
    const state = { committed: false, ended: false, ledger: [], updates: [] };
    const session = {
        async withTransaction(fn) { await fn(); state.committed = true; },
        async endSession() { state.ended = true; }
    };
    t.mock.method(mongoose, "startSession", async () => session);
    t.mock.method(Urun, "findOne", async () => ({ _id: "507f1f77bcf86cd799439012" }));
    t.mock.method(Depo, "findOne", async () => ({ _id: "507f1f77bcf86cd799439013" }));
    t.mock.method(Stok, "findOneAndUpdate", async (filter, update, options) => {
        assert.equal(options.session, session);
        state.updates.push({ filter, update, options });
        return insufficient ? null : { miktar: 15, maliyet: 20 };
    });
    t.mock.method(StokHareket, "create", async (docs, options) => {
        assert.equal(options.session, session);
        assert.ok(Array.isArray(docs));
        if (ledgerError) throw new Error("Hareket kaydı yazılamadı");
        state.ledger.push(...docs);
        return docs;
    });
    const req = {
        tenantId: "507f1f77bcf86cd799439011",
        transactionId: "giris-1",
        body: { urunId: "507f1f77bcf86cd799439012", depoId: "507f1f77bcf86cd799439013", tip: "GIRIS", miktar: 5 }
    };
    const res = { status(code) { state.status = code; return this; }, json(body) { state.response = body; } };
    const next = error => { state.error = error; };
    return { state, req, res, next };
}

test("manuel giriş miktarı ve hareketi aynı transaction içinde, ayrı işlem anahtarlarıyla yazılır", async t => {
    const { state, req, res, next } = ortam(t);
    await hareket(req, res, next);
    assert.equal(state.error, undefined);
    assert.equal(state.status, 201);
    assert.equal(state.committed, true);
    assert.equal(state.ended, true);
    assert.equal(state.response.hareket.miktar, 5);
    assert.equal(state.ledger[0].birimMaliyet, 20);
    assert.equal(state.updates[0].update.$inc.miktar, 5);
    assert.equal(state.updates[0].options.upsert, true);
    req.transactionId = "giris-2";
    await hareket(req, res, next);
    assert.equal(state.ledger.length, 2);
    assert.notEqual(state.ledger[0].islemAnahtari, state.ledger[1].islemAnahtari);
});

test("hareket yazma hatası transaction dışına taşınır ve başarı yanıtı verilmez", async t => {
    const { state, req, res, next } = ortam(t, { ledgerError: true });
    await hareket(req, res, next);
    assert.match(state.error.message, /yazılamadı/);
    assert.equal(state.committed, false);
    assert.equal(state.response, undefined);
    assert.equal(state.ended, true);
});

test("yetersiz stok çıkışı atomik miktar koşuluyla reddedilir, hareket oluşmaz", async t => {
    const { state, req, res, next } = ortam(t, { insufficient: true });
    req.body.tip = "CIKIS";
    await hareket(req, res, next);
    assert.equal(state.error.status, 409);
    assert.deepEqual(state.updates[0].filter.miktar, { $gte: 5 });
    assert.equal(state.updates[0].update.$inc.miktar, -5);
    assert.equal(state.updates[0].options.upsert, false);
    assert.equal(state.ledger.length, 0);
    assert.equal(state.committed, false);
});
