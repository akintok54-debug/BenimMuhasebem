require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const mongoose = require("mongoose");

const IslemKaydi = require("./models/IslemKaydi");
const CariHareket = require("./models/CariHareket");
const ParaHareket = require("./models/ParaHareket");
const StokHareket = require("./models/StokHareket");
const tekIslemKontrol = require("./middleware/tekIslemKontrol");

function response() {
    const res = new EventEmitter();
    res.locals = {};
    res.statusCode = 200;
    res.status = function (value) { this.statusCode = value; return this; };
    res.json = function (value) { this.body = value; return this; };
    return res;
}

test("finans, cari ve stok hareketleri ortak transactionId alanını taşır", () => {
    for (const Model of [CariHareket, ParaHareket, StokHareket]) {
        assert.ok(Model.schema.path("transactionId"), Model.modelName);
    }
    const index = IslemKaydi.schema.indexes().find(([keys]) => keys.tenantId === 1 && keys.transactionId === 1);
    assert.equal(index?.[1]?.unique, true);
});

test("ilk işlem transactionId bağlamını bağlı kayda ve yanıta aktarır", async () => {
    const originals = { create: IslemKaydi.create, updateOne: IslemKaydi.updateOne };
    let tamamlanan = null;
    IslemKaydi.create = async value => ({ _id: new mongoose.Types.ObjectId(), ...value });
    IslemKaydi.updateOne = async (filter, update) => { tamamlanan = { filter, update }; return { modifiedCount: 1 }; };
    try {
        const req = { tenantId: new mongoose.Types.ObjectId(), body: {}, get: name => name === "Idempotency-Key" ? "tx-test-001" : "" };
        const res = response();
        await tekIslemKontrol("TEST")(req, res, async () => {
            const hareket = new CariHareket({
                tenantId: req.tenantId, tarafTipi: "MUSTERI", tarafId: new mongoose.Types.ObjectId(),
                tip: "BORC", tutar: 10
            });
            await hareket.validate();
            assert.equal(hareket.transactionId, "tx-test-001");
            assert.match(hareket.islemAnahtari, /^TX:tx-test-001:CARI:/);
            res.status(201).json({ basarili: true });
            res.emit("finish");
        });
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(res.body.transactionId, "tx-test-001");
        assert.equal(tamamlanan.update.$set.durum, "TAMAMLANDI");
    } finally {
        IslemKaydi.create = originals.create;
        IslemKaydi.updateOne = originals.updateOne;
    }
});

test("aynı transactionId ile ikinci istek tamamlanmış yanıtı tekrarlar ve controllerı çalıştırmaz", async () => {
    const originals = { create: IslemKaydi.create, findOne: IslemKaydi.findOne };
    IslemKaydi.create = async () => { const error = new Error("duplicate"); error.code = 11000; throw error; };
    IslemKaydi.findOne = () => ({ lean: async () => ({ durum: "TAMAMLANDI", httpStatus: 201, yanit: { basarili: true, kayitId: "abc" } }) });
    try {
        const req = { tenantId: new mongoose.Types.ObjectId(), body: {}, get: () => "tx-ayni" };
        const res = response();
        let controllerCalisti = false;
        await tekIslemKontrol("TEST")(req, res, () => { controllerCalisti = true; });
        assert.equal(controllerCalisti, false);
        assert.equal(res.statusCode, 201);
        assert.equal(res.body.tekrar, true);
        assert.equal(res.body.transactionId, "tx-ayni");
    } finally {
        IslemKaydi.create = originals.create;
        IslemKaydi.findOne = originals.findOne;
    }
});

test("kritik finans ve stok POST rotaları merkezi işlem kilidini kullanır", () => {
    const fs = require("node:fs"), path = require("node:path");
    const files = ["satisRotasi.js", "alisRotasi.js", "cariRotasi.js", "finansRotasi.js", "masrafRotasi.js", "stokRotasi.js", "sahaRotasi.js", "personelRotasi.js"];
    for (const file of files) {
        const source = fs.readFileSync(path.join(__dirname, "routes", file), "utf8");
        assert.match(source, /tekIslemKontrol/, file);
    }
    const frontend = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "erp.js"), "utf8");
    assert.match(frontend, /devamEdenMutasyonlar/);
    assert.match(frontend, /Idempotency-Key/);
});

test("satış düzeltmesi ve tahsilat iptali tekrar çalıştırmaya karşı korunur", () => {
    const fs = require("node:fs"), path = require("node:path");
    const satisRotasi = fs.readFileSync(path.join(__dirname, "routes", "satisRotasi.js"), "utf8");
    const satisController = fs.readFileSync(path.join(__dirname, "controllers", "satisController.js"), "utf8");
    const cariController = fs.readFileSync(path.join(__dirname, "controllers", "cariController.js"), "utf8");

    assert.match(satisRotasi, /SATIS_GUNCELLEME/);
    assert.match(satisRotasi, /SATIS_IPTAL/);
    assert.match(satisController, /Math\.abs\(fark\)\s*<\s*0\.000001/);
    assert.ok(CariHareket.schema.path("durum").enumValues.includes("IPTAL_ISLENIYOR"));
    assert.match(cariController, /durum:\s*"IPTAL_ISLENIYOR"/);
    assert.match(cariController, /modifiedCount/);
});
