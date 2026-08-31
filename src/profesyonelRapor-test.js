require("dotenv").config();
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { RAPORLAR, hesaplamalariTamamla, stokMaliyetAnalizi, tarihAraligi, oncekiAralik, karsilastirmaAraligi, depoKosuluOlustur } = require("./services/profesyonelRaporServisi");

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

test("Net satış sıfırken dönem içi stok artışı negatif SMM ve sahte pozitif kâr üretmez", () => {
    const baslangic = new Date("2026-08-01T00:00:00Z"), bitis = new Date("2026-08-31T23:59:59Z");
    const analiz = stokMaliyetAnalizi([{ urunId: "u1", depoId: "d1", miktar: 10 }], [{ urunId: "u1", depoId: "d1", tip: "SAYIM_ARTI", kaynak: "URUN_EXCEL", miktar: 10, birimMaliyet: 100, createdAt: new Date("2026-08-10T10:00:00Z") }], [], baslangic, bitis);
    assert.equal(analiz.satilanMalinMaliyeti, 0);
    assert.equal(analiz.digerStokEtkisi, 1000);
    const sonuc = hesaplamalariTamamla({ donemBasiMalMevcudu: analiz.donemBasiMalMevcudu, donemSonuMalMevcudu: analiz.donemSonuMalMevcudu, toplamAlis: 0, alisIadeleri: 0, toplamSatisGeliri: 0, satisIadeleri: 0, digerGelirler: 0, toplamGiderler: 0, satilanMalinMaliyeti: analiz.satilanMalinMaliyeti, maliyetGuvenilir: analiz.guvenilir });
    assert.equal(sonuc.satilanMalinMaliyeti, 0);
    assert.equal(sonuc.brutKar, 0);
    assert.equal(sonuc.netKarZarar, 0);
});

test("Satış çıkış maliyeti eksikse SMM, brüt kâr ve net kâr hesaplanamaz", () => {
    const baslangic = new Date("2026-08-01T00:00:00Z"), bitis = new Date("2026-08-31T23:59:59Z");
    const hareketler = [{ urunId: "u1", depoId: "d1", tip: "GIRIS", kaynak: "DEVIR", miktar: 10, birimMaliyet: 100, createdAt: new Date("2026-07-01T10:00:00Z") }, { urunId: "u1", depoId: "d1", tip: "CIKIS", kaynak: "SATIS", kaynakId: "s1", miktar: 1, birimMaliyet: 0, createdAt: new Date("2026-08-10T10:00:00Z") }];
    const analiz = stokMaliyetAnalizi([{ urunId: "u1", depoId: "d1", miktar: 9 }], hareketler, [], baslangic, bitis);
    assert.equal(analiz.guvenilir, false);
    assert.equal(analiz.satilanMalinMaliyeti, null);
    const sonuc = hesaplamalariTamamla({ donemBasiMalMevcudu: null, donemSonuMalMevcudu: null, toplamAlis: 0, alisIadeleri: 0, toplamSatisGeliri: 500, satisIadeleri: 0, digerGelirler: 0, toplamGiderler: 0, satilanMalinMaliyeti: null, maliyetGuvenilir: false });
    assert.equal(sonuc.brutKar, null);
    assert.equal(sonuc.netKarZarar, null);
});

test("Negatif satış maliyeti kâr olarak gösterilmez", () => {
    const baslangic = new Date("2026-08-01T00:00:00Z"), bitis = new Date("2026-08-31T23:59:59Z");
    const hareketler = [{ urunId: "u1", depoId: "d1", tip: "GIRIS", kaynak: "ALIS", miktar: 2, birimMaliyet: 100, createdAt: new Date("2026-07-01T10:00:00Z") }, { urunId: "u1", depoId: "d1", tip: "CIKIS", kaynak: "SATIS", kaynakId: "s1", miktar: 1, birimMaliyet: 100, createdAt: new Date("2026-07-10T10:00:00Z") }, { urunId: "u1", depoId: "d1", tip: "IADE_GIRIS", kaynak: "SATIS_IADE", kaynakId: "i1", miktar: 1, birimMaliyet: 999, createdAt: new Date("2026-08-10T10:00:00Z") }];
    const analiz = stokMaliyetAnalizi([{ urunId: "u1", depoId: "d1", miktar: 2 }], hareketler, [{ _id: "i1", orijinalSatisId: "s1" }], baslangic, bitis);
    assert.equal(analiz.guvenilir, false);
    assert.equal(analiz.satilanMalinMaliyeti, null);
    assert.ok(analiz.nedenler.some(x => x.includes("negatif")));
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

test("Stok hareketleri işlem tarihi ve doğrulanmış maliyet kaynağını saklar", () => {
    const model = fs.readFileSync(path.join(__dirname, "models", "StokHareket.js"), "utf8");
    const satis = fs.readFileSync(path.join(__dirname, "controllers", "satisController.js"), "utf8");
    const alis = fs.readFileSync(path.join(__dirname, "controllers", "alisController.js"), "utf8");
    for (const metin of ["tarih:", "maliyetDogrulandi", "maliyetKaynagi", "DEVIR_GIRIS", "DEVIR_CIKIS"]) assert.ok(model.includes(metin), metin);
    assert.match(satis, /maliyetKaynagi:[^\n]*"ORIJINAL_SATIS"/);
    assert.match(alis, /maliyetKaynagi:\s*"ALIS_BELGESI"/);
});

test("Rapor ekranı filtre, karşılaştırma, grafik ve üç dışa aktarma işlemini sunar", () => {
    const js = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "erp.js"), "utf8");
    for (const metin of ["ERP RAPORLARI", "Özel Tarih", "Satış Temsilcisi", ">Excel<", ">PDF<", ">Yazdır<", "Dönem Kâr ve Stok Raporu", "raporGrafikleri"]) assert.ok(js.includes(metin), metin);
});

test("Rapor modalı teknik alan ve işlem kodlarını kullanıcı dostu Türkçe metne çevirir", () => {
    const js = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "erp.js"), "utf8");
    for (const metin of ["RAPOR_ALAN_ETIKETLERI", "RAPOR_KOD_ETIKETLERI", "Belge İçeriği", "Kredi Kartı", "İade Girişi", "raporDegeriHazirla"]) assert.ok(js.includes(metin), metin);
    assert.match(js, /key === "tenantId"/);
    assert.match(js, /Array\.isArray\(value\).*kalem/);
});

test("Rapor ana ekranı sade dönem düğmeleri, yönetici kartları ve dört rapor kategorisi sunar", () => {
    const js = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "erp.js"), "utf8");
    for (const metin of ["Bugün", "Bu Hafta", "Bu Ay", "Bu Yıl", "Özel Tarih", "SATIŞ RAPORLARI", "STOK RAPORLARI", "FİNANS RAPORLARI", "DÖNEM RAPORLARI", "Gelişmiş Filtreler", "Hesaplanamadı"]) assert.ok(js.includes(metin), metin);
    assert.match(js, /id="raporDetayKabuk"[^>]*hidden/);
});
