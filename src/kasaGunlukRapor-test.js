require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const ParaHareket = require("./models/ParaHareket");
const CariHareket = require("./models/CariHareket");
const { ekstreOzetle, hareketTuruBelirle, donemSinirlari } = require("./controllers/finansController");

async function istek(url) {
    const uygulama = require("./uygulama");
    const server = uygulama.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    try {
        const { port } = server.address();
        return await fetch(`http://127.0.0.1:${port}${url}`);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}

test("Günlük kasa raporu kimliksiz ve tenantsız erişimi reddeder", async () => {
    const response = await istek("/api/tenant/finans/kasalar/507f1f77bcf86cd799439011/rapor?tarih=2026-08-31&donem=GUNLUK");
    assert.equal(response.status, 401);
});

test("Örnek günlük kasa akışı devir ve kapanışı doğru hesaplar", () => {
    const sonuc = ekstreOzetle([
        { tip: "GIRIS", tutar: 8000 },
        { tip: "CIKIS", tutar: 4500 },
        { tip: "CIKIS", tutar: 1000 },
        { tip: "CIKIS", tutar: 5000 }
    ], 15000);
    assert.equal(sonuc.toplamGiris, 8000);
    assert.equal(sonuc.toplamCikis, 10500);
    assert.equal(sonuc.kapanisBakiyesi, 12500);
    assert.deepEqual(sonuc.satirlar.map(x => x.yuruyenBakiye), [23000, 18500, 17500, 12500]);
});

test("Günlük hareket kaynakları kullanıcıya anlaşılır işlem türlerine ayrılır", () => {
    const cases = [
        [{ kaynak: "TAHSILAT", tip: "GIRIS" }, "Müşteri Tahsilatı"],
        [{ kaynak: "ODEME", tip: "CIKIS" }, "Tedarikçi Ödemesi"],
        [{ kaynak: "MASRAF", tip: "CIKIS" }, "Masraf / Gider"],
        [{ kaynak: "SATIS", tip: "GIRIS" }, "Satış Tahsilatı"],
        [{ kaynak: "ALIS_ODEME", tip: "CIKIS" }, "Alış Ödemesi"],
        [{ kaynak: "PERSONEL", tip: "CIKIS" }, "Personel Avans / Maaş Ödemesi"],
        [{ kaynak: "TRANSFER", hesapTipi: "KASA", karsiHesapTipi: "KASA", tip: "CIKIS" }, "Kasalar Arası Transfer"],
        [{ kaynak: "TRANSFER", hesapTipi: "KASA", karsiHesapTipi: "BANKA", tip: "CIKIS" }, "Kasa → Banka Transferi"],
        [{ kaynak: "TRANSFER", hesapTipi: "KASA", karsiHesapTipi: "BANKA", tip: "GIRIS" }, "Banka → Kasa Transferi"],
        [{ kaynak: "MANUEL", tip: "GIRIS" }, "Diğer Para Girişi"],
        [{ kaynak: "MANUEL", tip: "CIKIS" }, "Diğer Para Çıkışı"],
        [{ kaynak: "ACILIS", tip: "GIRIS" }, "Devir / Düzeltme"]
    ];
    for (const [hareket, beklenen] of cases) assert.equal(hareketTuruBelirle(hareket), beklenen);
});

test("Günlük, haftalık ve aylık dönem sınırları İstanbul saatine göre hesaplanır", () => {
    const gunluk = donemSinirlari({ tarih: "2026-08-31", donem: "GUNLUK" });
    const haftalik = donemSinirlari({ tarih: "2026-09-02", donem: "HAFTALIK" });
    const aylik = donemSinirlari({ tarih: "2026-02-17", donem: "AYLIK" });
    assert.deepEqual([gunluk.baslangicGun, gunluk.bitisGun], ["2026-08-31", "2026-08-31"]);
    assert.deepEqual([haftalik.baslangicGun, haftalik.bitisGun], ["2026-08-31", "2026-09-06"]);
    assert.deepEqual([aylik.baslangicGun, aylik.bitisGun], ["2026-02-01", "2026-02-28"]);
    assert.equal(gunluk.baslangic.toISOString(), "2026-08-30T21:00:00.000Z");
    assert.equal(gunluk.bitis.toISOString(), "2026-08-31T20:59:59.999Z");
});

test("Otomatik para hareketi tenant bazlı tekilleştirme anahtarı üretir", async () => {
    const tenantId = new mongoose.Types.ObjectId(), hesapId = new mongoose.Types.ObjectId(), kaynakId = new mongoose.Types.ObjectId();
    const hareket = new ParaHareket({ tenantId, hesapTipi: "KASA", hesapId, tip: "GIRIS", tutar: 100, kaynak: "TAHSILAT", kaynakId });
    await hareket.validate();
    assert.equal(hareket.islemAnahtari, `KASA:${hesapId}:GIRIS:TAHSILAT:${kaynakId}`);
    const index = ParaHareket.schema.indexes().find(([keys]) => keys.tenantId === 1 && keys.islemAnahtari === 1);
    assert.equal(index?.[1]?.unique, true);
    assert.equal(index?.[1]?.sparse, true);
});

test("İptal kayıtları geçmişi silmeden ters hareket bağlantısını korur", () => {
    for (const alan of ["durum", "iptalTarihi", "iptalNedeni", "iptalEdenKullaniciId", "iptalParaHareketId"]) assert.ok(CariHareket.schema.path(alan), alan);
    for (const alan of ["islemAnahtari", "orijinalHareketId", "tersHareketId"]) assert.ok(ParaHareket.schema.path(alan), alan);
    const kaynak = fs.readFileSync(path.join(__dirname, "controllers", "cariController.js"), "utf8");
    assert.match(kaynak, /kaynak:\s*"TAHSILAT_IPTAL"/);
    assert.match(kaynak, /durum\s*=\s*"IPTAL"/);
    assert.doesNotMatch(kaynak, /ParaHareket\.deleteOne\([^\n]+paraHareket\._id/);
});

test("Günlük kasa ekranı gerekli alanları, rapor dönemlerini ve dışa aktarımı sunar", () => {
    const js = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "erp.js"), "utf8");
    for (const metin of ["Dünden / Dönemden Devir", "Toplam Giriş", "Toplam Çıkış", "Gün Sonu / Dönem Sonu", "İşlem Sonrası", "İşlemi Yapan", "GUNLUK", "HAFTALIK", "AYLIK"]) assert.match(js, new RegExp(metin));
    assert.match(js, /\/api\/tenant\/finans\/kasalar\/\$\{encodeURIComponent\(id\)\}\/rapor/);
    assert.match(js, /XLSX\.utils\.json_to_sheet/);
    assert.match(js, /gunlukKasaPdf/);
});
