require("dotenv").config();
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { RAPORLAR, hesaplamalariTamamla, tarihAraligi, oncekiAralik, karsilastirmaAraligi, depoKosuluOlustur } = require("./services/profesyonelRaporServisi");

async function istek(url, options) {
    const uygulama = require("./uygulama"), server = uygulama.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    try { const { port } = server.address(); return await fetch(`http://127.0.0.1:${port}${url}`, options); }
    finally { await new Promise(resolve => server.close(resolve)); }
}

test("Profesyonel rapor kataloğu istenen 30 benzersiz raporu içerir", () => {
    assert.equal(RAPORLAR.length, 30);
    assert.equal(new Set(RAPORLAR.map(([kod]) => kod)).size, 30);
    for (const ad of ["Dönem Başı Mal Mevcudu", "Satılan Malın Maliyeti", "Net Kâr / Zarar", "Gider Kategori Raporu"]) assert.ok(RAPORLAR.some(([, x]) => x === ad), ad);
});

test("Standart karşılaştırmalar bugün/dün, bu ay/geçen ay ve bu yıl/geçen yıl çalışır", () => {
    const simdi = new Date("2026-08-31T12:00:00+03:00");
    const buAy = tarihAraligi({ donem: "BU_AY" }, simdi), gecenAy = karsilastirmaAraligi({ donem: "BU_AY" }, buAy);
    const buYil = tarihAraligi({ donem: "BU_YIL" }, simdi), gecenYil = karsilastirmaAraligi({ donem: "BU_YIL" }, buYil);
    assert.equal(gecenAy.baslangicYazi, "2026-07-01"); assert.equal(gecenAy.bitisYazi, "2026-07-31");
    assert.equal(gecenYil.baslangicYazi, "2025-01-01"); assert.equal(gecenYil.bitisYazi, "2025-12-31");
});

test("Dönem, net alış, SMM, brüt kâr ve net sonuç formülleri doğru çalışır", () => {
    const sonuc = hesaplamalariTamamla({ donemBasiMalMevcudu: 1000, donemSonuMalMevcudu: 700, toplamAlis: 600, alisIadeleri: 100, toplamSatisGeliri: 1800, satisIadeleri: 200, digerGelirler: 100, toplamGiderler: 300 });
    assert.equal(sonuc.netAlis, 500);
    assert.equal(sonuc.satilanMalinMaliyeti, 800);
    assert.equal(sonuc.netSatislar, 1600);
    assert.equal(sonuc.brutKar, 800);
    assert.equal(sonuc.faaliyetKari, 600);
    assert.equal(sonuc.netKarZarar, 600);
});

test("Özel dönem ve önceki eş uzunluktaki dönem güvenli hesaplanır", () => {
    const secilen = tarihAraligi({ donem: "OZEL", baslangic: "2026-08-01", bitis: "2026-08-31" });
    const onceki = oncekiAralik(secilen);
    assert.equal(secilen.baslangicYazi, "2026-08-01");
    assert.equal(secilen.bitisYazi, "2026-08-31");
    assert.equal(onceki.bitis.getTime() + 1, secilen.baslangic.getTime());
    assert.equal(onceki.bitis.getTime() - onceki.baslangic.getTime(), secilen.bitis.getTime() - secilen.baslangic.getTime());
});

test("Yeni rapor endpointleri kimliksiz erişimi reddeder", async () => {
    for (const url of ["/api/tenant/raporlar/filtreler", "/api/tenant/raporlar/profesyonel?donem=BU_AY", "/api/tenant/raporlar/detay/netKarZarar?donem=BU_YIL"]) {
        const response = await istek(url); assert.equal(response.status, 401, url);
    }
});

test("Depo düzenleme endpointi kimliksiz erişimi reddeder", async () => {
    const response = await istek("/api/tenant/stok/depolar/507f1f77bcf86cd799439011", { method: "PATCH", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(response.status, 401);
});

test("Şube ve depo birlikte seçildiğinde yalnızca aynı şubedeki depo kabul edilir", () => {
    const merkez = "507f1f77bcf86cd799439011", diger = "507f1f77bcf86cd799439012";
    assert.deepEqual(depoKosuluOlustur(null, "Merkez", [merkez]), { $in: [merkez] });
    assert.equal(depoKosuluOlustur(merkez, "Merkez", [merkez]), merkez);
    assert.deepEqual(depoKosuluOlustur(diger, "Merkez", [merkez]), { $in: [] });
    assert.equal(depoKosuluOlustur(merkez, "", []), merkez);
});

test("Rapor servisi tenant zorunluluğu ve gerçek ERP modelleriyle çalışır", () => {
    const kaynak = fs.readFileSync(path.join(__dirname, "services", "profesyonelRaporServisi.js"), "utf8");
    for (const model of ["Satis", "Alis", "Stok", "StokHareket", "CariHareket", "ParaHareket", "Masraf", "Kasa", "Banka", "CekSenetPortfoy"]) assert.match(kaynak, new RegExp(`${model}\\.find\\(\\{?`), model);
    assert.ok((kaynak.match(/tenantId/g) || []).length >= 25);
    assert.doesNotMatch(kaynak, /Math\.random|demo|tahmini/i);
});

test("Depo şube alanı ve rapor şube-depo bağlantısı tenant kapsamında tanımlıdır", () => {
    const model = fs.readFileSync(path.join(__dirname, "models", "Depo.js"), "utf8");
    const servis = fs.readFileSync(path.join(__dirname, "services", "profesyonelRaporServisi.js"), "utf8");
    assert.match(model, /sube:\s*\{/);
    assert.match(servis, /Depo\.find\(\{ tenantId, sube,/);
    assert.match(servis, /depoKosuluOlustur\(depoId, sube, subeDepoIds\)/);
});

test("Rapor ekranı filtre, karşılaştırma, grafik ve üç dışa aktarma işlemini sunar", () => {
    const js = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "erp.js"), "utf8");
    for (const metin of ["PROFESYONEL ERP RAPOR MERKEZİ", "Özel tarih aralığı", "Satış Temsilcisi", "Excel İndir", "PDF İndir", "Yazdır", "Dönem Kâr ve Stok Raporu", "raporGrafikleri"]) assert.ok(js.includes(metin), metin);
});
