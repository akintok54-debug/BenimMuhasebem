const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Urun = require("./models/Urun");

const kok = path.join(__dirname, "..");

test("Ürün kartı yüzde 0-100 varsayılan iskonto alanını destekler", () => {
    const alan = Urun.schema.path("iskonto");
    assert.ok(alan);
    assert.equal(alan.defaultValue, 0);
    assert.equal(alan.options.min, 0);
    assert.equal(alan.options.max, 100);
});

test("Toplu stok aktarımı aktif depoyu açıkça eşler ve belirsiz depoyu reddeder", () => {
    const {aktarimPlani}=require('./services/urunTopluServisi');
    const depolar=[{_id:'000000000000000000000001',kod:'ANA'},{_id:'000000000000000000000002',kod:'SUBE'}];
    const row={kod:'NEW',ad:'Parça',stokMiktari:5,depoKodu:'SUBE'};
    const plan=aktarimPlani([row],[],depolar);
    assert.equal(plan.hatalar.length,0);assert.equal(plan.satirlar[0].stok.depoId,depolar[1]._id);
    assert.equal(plan.satirlar[0].stok.miktar,5);
    assert.equal(aktarimPlani([{...row,depoKodu:''}],[],depolar).hatalar.length,1);
});

test("Ürün Excel ekranı pazar yeri görsellerini, stokları ve iskontoyu tanır", () => {
    const js = fs.readFileSync(path.join(kok, "public", "erp", "erp.js"), "utf8");
    assert.match(js, /urun gorseli 1/);
    assert.match(js, /image url 1/);
    assert.match(js, /stokMiktari/);
    assert.match(js, /Depo Kodu/);
    assert.match(js, /Varsayılan İskonto %/);
    assert.match(js, /urunExcelSablonuIndir/);
});

test("Tedarikçi alış ekranı kalemi anında gösterir ve Excel alış şablonu sunar", () => {
    const js = fs.readFileSync(path.join(kok, "public", "erp", "erp.js"), "utf8");
    assert.match(js, /tedarikciAlisSablonuIndir/);
    assert.match(js, /tedarikciAlisExcelOku/);
    assert.match(js, /benimmuhasebe-toplu-alis-sablonu\.xlsx/);
    assert.match(js, /kaydirmaAlani\.scrollTop = kaydirmaAlani\.scrollHeight/);
    assert.match(js, /yeniSatir\.scrollIntoView/);
});

test("Alış ve satış servisleri ürün kartındaki varsayılan iskontoyu kullanır", () => {
    const alis = fs.readFileSync(path.join(__dirname, "controllers", "alisController.js"), "utf8");
    const satis = fs.readFileSync(path.join(__dirname, "controllers", "satisController.js"), "utf8");
    assert.match(alis, /item\.iskonto \?\? urun\.iskonto \?\? 0/);
    assert.match(satis, /item\.iskonto \?\? urun\.iskonto \?\? 0/);
});
