const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const Stok = require("../src/models/Stok");
const { satisStokDus } = require("../src/services/satisStokServisi");

test("ürün araması Türkçe/ascii harfleri eşler, kapalı listeyi açar ve eski kaydırmayı sıfırlar", () => {
    const source = fs.readFileSync(require.resolve("../public/erp/erp.js"), "utf8");
    const start = source.indexOf("    function urunAramaMetni(");
    const end = source.indexOf("    async function satisPaneliYukle(", start);
    const ctx = {}; vm.createContext(ctx); vm.runInContext(source.slice(start, end), ctx);
    const events = {}, input = { value: "DEBRIYAJ", addEventListener(k, fn) { events[k] = fn; }, focus() {} };
    const cards = [{ dataset: { salesSearch: "U01 Debriyaj Balatası" } }, { dataset: { salesSearch: "U02 Yağ Filtresi" } }];
    const grid = { scrollTop: 800 }, count = {}, empty = {}, detail = { open: false, addEventListener() {} };
    const nodes = { "#salesProductSearch": input, ".sales-product-grid": grid, "#salesProductResultCount": count, "#salesProductEmpty": empty };
    ctx.satisUrunAramasiniBagla({ querySelector: s => nodes[s], querySelectorAll: () => cards }, detail);
    events.input(); assert.equal(cards[0].hidden, false); assert.equal(cards[1].hidden, true); assert.equal(detail.open, true); assert.equal(grid.scrollTop, 0);
    input.value = "balatasi debriyaj"; events.input(); assert.equal(cards[0].hidden, false);
    input.value = "YAG"; events.input(); assert.equal(cards[1].hidden, false);
    input.value = "bulunmayan"; events.input(); assert.equal(empty.hidden, false);
    input.value = ""; events.search(); assert.ok(cards.every(x => !x.hidden)); assert.equal(empty.hidden, true);
});

test("stok bulunmasa da satış aynı tenant/depo anahtarında atomik eksi stok oluşturur", async t => {
    const calls = [];
    t.mock.method(Stok, "findOneAndUpdate", async (filter, update, options) => { calls.push({ filter, update, options }); return { miktar: update.$inc.miktar }; });
    const session = {}, result = await satisStokDus({ tenantId: "t1", urunId: "u1", depoId: "d1", miktar: 7, session });
    assert.equal(result.miktar, -7); assert.deepEqual(calls[0].filter, { tenantId: "t1", urunId: "u1", depoId: "d1" });
    assert.equal(calls[0].options.upsert, true); assert.equal(calls[0].options.session, session);
    await assert.rejects(satisStokDus({ miktar: -1 }), /geçersiz/);
    await assert.rejects(satisStokDus({ miktar: NaN }), /geçersiz/);
});

test("stok şeması negatif bakiyeyi kabul eder; negatif satış miktarı kabul edilmez", async () => {
    const stok = new Stok({ tenantId: "507f1f77bcf86cd799439011", urunId: "507f1f77bcf86cd799439012", depoId: "507f1f77bcf86cd799439013", miktar: -3 });
    await stok.validate();
    await assert.rejects(satisStokDus({ miktar: 0 }), /geçersiz/);
});
