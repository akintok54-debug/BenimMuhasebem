require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const satis = require("./controllers/satisController");
const alis = require("./controllers/alisController");
const { ekstreOzetle } = require("./controllers/finansController");
const { hesaplamalariTamamla } = require("./services/profesyonelRaporServisi");

test("satış ve alış aynı iskonto/KDV matematiğini kullanır", () => {
    const girdi = { miktar: 2, birimFiyat: 100, iskonto: 10, kdv: 20 };
    for (const hesapla of [satis.hesaplaKalem, alis.hesaplaKalem]) {
        const kalem = hesapla(girdi);
        assert.equal(kalem.araToplam, 180);
        assert.equal(kalem.kdvTutari, 36);
        assert.equal(kalem.toplam, 216);
    }
});

test("negatif miktar, fiyat, KDV ve iskonto belgeye giremez", () => {
    const gecersizler = [
        { miktar: -1, birimFiyat: 100, kdv: 20, iskonto: 0 },
        { miktar: 1, birimFiyat: -1, kdv: 20, iskonto: 0 },
        { miktar: 1, birimFiyat: 100, kdv: 101, iskonto: 0 },
        { miktar: 1, birimFiyat: 100, kdv: 20, iskonto: 101 }
    ];
    for (const kalem of gecersizler) {
        assert.equal(satis.kalemGecerliMi(kalem), false);
        assert.equal(alis.kalemGecerliMi(kalem), false);
    }
});

test("gerçekçi satış-tahsilat-gider senaryosu kasa ve kârı doğru kapatır", () => {
    const satisKalemi = satis.hesaplaKalem({ miktar: 5, birimFiyat: 120, iskonto: 0, kdv: 20 });
    assert.equal(satisKalemi.toplam, 720);
    const kasa = ekstreOzetle([
        { tip: "GIRIS", tutar: 720, kaynak: "SATIS" },
        { tip: "CIKIS", tutar: 120, kaynak: "MASRAF" },
        { tip: "CIKIS", tutar: 240, kaynak: "SATIS_IADE" }
    ], 1000);
    assert.equal(kasa.kapanisBakiyesi, 1360);
    const sonuc = hesaplamalariTamamla({
        donemBasiMalMevcudu: 1000, donemSonuMalMevcudu: 700,
        toplamAlis: 400, alisIadeleri: 0, toplamSatisGeliri: 600,
        satisIadeleri: 200, digerGelirler: 0, toplamGiderler: 120,
        satilanMalinMaliyeti: 300, maliyetGuvenilir: true
    });
    assert.equal(sonuc.netSatislar, 400);
    assert.equal(sonuc.brutKar, 100);
    assert.equal(sonuc.netKarZarar, -20);
});

test("satış stok ihtiyacını ürün bazında toplar; alış ve iade başarısızlığında stok geri alınır", () => {
    const satisKaynak = fs.readFileSync(path.join(__dirname, "controllers", "satisController.js"), "utf8");
    const alisKaynak = fs.readFileSync(path.join(__dirname, "controllers", "alisController.js"), "utf8");
    assert.match(satisKaynak, /stokKontrolleri\s*=\s*new Map/);
    assert.match(satisKaynak, /toplamIhtiyac/);
    assert.match(satisKaynak, /findOneAndUpdate\([\s\S]+miktar:\s*\{\s*\$gte:\s*item\.miktar/);
    assert.match(satisKaynak, /Aynı ürün iade belgesinde yalnızca bir satırda/);
    assert.match(alisKaynak, /kaynak:\s*"ALIS"[\s\S]+\$inc:\s*\{\s*miktar:\s*-stok\.miktar/);
    assert.match(alisKaynak, /kaynak:\s*"ALIS_IADE"[\s\S]+\$inc:\s*\{\s*miktar:\s*stok\.miktar/);
});
