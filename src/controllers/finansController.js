const mongoose = require("mongoose");

const Kasa = require("../models/Kasa");
const Banka = require("../models/Banka");
const ParaHareket = require("../models/ParaHareket");

function tenantId(req) {
    return new mongoose.Types.ObjectId(String(req.tenantId));
}

async function kasaListele(req, res, next) {
    try {
        const kasalar = await Kasa.find({
            tenantId: tenantId(req)
        })
            .sort({ ad: 1 })
            .lean();

        res.json({
            basarili: true,
            toplam: kasalar.length,
            kasalar
        });
    } catch (error) {
        next(error);
    }
}

async function kasaOlustur(req, res, next) {
    try {
        const body = req.body || {};

        if (!body.kod || !body.ad) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Kasa kodu ve kasa adı zorunludur."
            });
        }

        const kasa = await Kasa.create({
            tenantId: tenantId(req),
            kod: String(body.kod).trim().toUpperCase(),
            ad: String(body.ad).trim(),
            bakiye: Number(body.bakiye || 0),
            aktif: body.aktif !== false,
            aciklama: body.aciklama || ""
        });

        res.status(201).json({
            basarili: true,
            kasa
        });
    } catch (error) {
        next(error);
    }
}

async function bankaListele(req, res, next) {
    try {
        const bankalar = await Banka.find({
            tenantId: tenantId(req)
        })
            .sort({ bankaAdi: 1 })
            .lean();

        res.json({
            basarili: true,
            toplam: bankalar.length,
            bankalar
        });
    } catch (error) {
        next(error);
    }
}

async function bankaOlustur(req, res, next) {
    try {
        const body = req.body || {};

        if (!body.kod || !body.bankaAdi) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Banka kodu ve banka adı zorunludur."
            });
        }

        const banka = await Banka.create({
            tenantId: tenantId(req),
            kod: String(body.kod).trim().toUpperCase(),
            bankaAdi: String(body.bankaAdi).trim(),
            sube: body.sube || "",
            iban: body.iban || "",
            hesapNo: body.hesapNo || "",
            bakiye: Number(body.bakiye || 0),
            aktif: body.aktif !== false,
            aciklama: body.aciklama || ""
        });

        res.status(201).json({
            basarili: true,
            banka
        });
    } catch (error) {
        next(error);
    }
}

async function paraHareketleri(req, res, next) {
    try {
        const filter = {
            tenantId: tenantId(req)
        };

        if (req.query.hesapTipi) {
            filter.hesapTipi = req.query.hesapTipi;
        }

        if (req.query.hesapId) {
            filter.hesapId = req.query.hesapId;
        }

        const hareketler = await ParaHareket.find(filter)
            .sort({ tarih: -1, createdAt: -1 })
            .lean();

        res.json({
            basarili: true,
            toplam: hareketler.length,
            hareketler
        });
    } catch (error) {
        next(error);
    }
}

async function hesapHareketi(req, res, next) {
    try {
        const tId = tenantId(req);
        const body = req.body || {};

        const hesapTipi = body.hesapTipi;
        const hesapId = body.hesapId;
        const tip = body.tip;
        const tutar = Number(body.tutar || 0);

        if (!["KASA", "BANKA"].includes(hesapTipi)) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Hesap tipi KASA veya BANKA olmalıdır."
            });
        }

        if (!mongoose.Types.ObjectId.isValid(String(hesapId))) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Geçersiz hesap."
            });
        }

        if (!["GIRIS", "CIKIS"].includes(tip)) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Para hareketi GIRIS veya CIKIS olmalıdır."
            });
        }

        if (tutar <= 0) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Tutar sıfırdan büyük olmalıdır."
            });
        }

        let hesap;

        if (hesapTipi === "KASA") {
            hesap = await Kasa.findOne({
                _id: hesapId,
                tenantId: tId
            });
        } else {
            hesap = await Banka.findOne({
                _id: hesapId,
                tenantId: tId
            });
        }

        if (!hesap) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Hesap bulunamadı."
            });
        }

        if (tip === "CIKIS" && hesap.bakiye < tutar) {
            return res.status(409).json({
                basarili: false,
                mesaj: "Yetersiz hesap bakiyesi."
            });
        }

        hesap.bakiye =
            tip === "GIRIS"
                ? hesap.bakiye + tutar
                : hesap.bakiye - tutar;

        await hesap.save();

        const hareket = await ParaHareket.create({
            tenantId: tId,
            hesapTipi,
            hesapId: hesap._id,
            tip,
            tutar,
            aciklama: body.aciklama || "",
            kaynak: body.kaynak || "MANUEL",
            kaynakId: body.kaynakId || null,
            tarih: body.tarih || new Date(),
            kullaniciId:
                req.kullanici?._id ||
                req.user?._id ||
                null
        });

        res.status(201).json({
            basarili: true,
            hesap,
            hareket
        });
    } catch (error) {
        next(error);
    }
}

async function transfer(req, res, next) {
    try {
        const tId = tenantId(req);
        const body = req.body || {};
        const tutar = Number(body.tutar || 0);

        if (tutar <= 0) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Tutar sıfırdan büyük olmalıdır."
            });
        }

        if (!["KASA", "BANKA"].includes(body.kaynakHesapTipi)) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Kaynak hesap tipi hatalı."
            });
        }

        if (!["KASA", "BANKA"].includes(body.hedefHesapTipi)) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Hedef hesap tipi hatalı."
            });
        }

        const kaynakId = String(body.kaynakHesapId);
        const hedefId = String(body.hedefHesapId);

        let kaynak;
        let hedef;

        if (body.kaynakHesapTipi === "KASA") {
            kaynak = await Kasa.findOne({
                _id: kaynakId,
                tenantId: tId
            });
        } else {
            kaynak = await Banka.findOne({
                _id: kaynakId,
                tenantId: tId
            });
        }

        if (body.hedefHesapTipi === "KASA") {
            hedef = await Kasa.findOne({
                _id: hedefId,
                tenantId: tId
            });
        } else {
            hedef = await Banka.findOne({
                _id: hedefId,
                tenantId: tId
            });
        }

        if (!kaynak || !hedef) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Kaynak veya hedef hesap bulunamadı."
            });
        }

        if (kaynak.bakiye < tutar) {
            return res.status(409).json({
                basarili: false,
                mesaj: "Kaynak hesapta yeterli bakiye yok."
            });
        }

        kaynak.bakiye -= tutar;
        hedef.bakiye += tutar;

        await kaynak.save();
        await hedef.save();

        const ortak = {
            tenantId: tId,
            tutar,
            kaynak: "TRANSFER",
            aciklama: body.aciklama || "Hesaplar arası transfer",
            kullaniciId:
                req.kullanici?._id ||
                req.user?._id ||
                null
        };

        const cikis = await ParaHareket.create({
            ...ortak,
            hesapTipi: body.kaynakHesapTipi,
            hesapId: kaynak._id,
            tip: "CIKIS",
            karsiHesapTipi: body.hedefHesapTipi,
            karsiHesapId: hedef._id
        });

        const giris = await ParaHareket.create({
            ...ortak,
            hesapTipi: body.hedefHesapTipi,
            hesapId: hedef._id,
            tip: "GIRIS",
            karsiHesapTipi: body.kaynakHesapTipi,
            karsiHesapId: kaynak._id
        });

        res.status(201).json({
            basarili: true,
            kaynak,
            hedef,
            hareketler: [cikis, giris]
        });
    } catch (error) {
        next(error);
    }
}

async function ozet(req, res, next) {
    try {
        const tId = tenantId(req);

        const [kasalar, bankalar] = await Promise.all([
            Kasa.find({
                tenantId: tId,
                aktif: true
            }).lean(),

            Banka.find({
                tenantId: tId,
                aktif: true
            }).lean()
        ]);

        const kasaToplam = kasalar.reduce(
            (toplam, item) => toplam + Number(item.bakiye || 0),
            0
        );

        const bankaToplam = bankalar.reduce(
            (toplam, item) => toplam + Number(item.bakiye || 0),
            0
        );

        res.json({
            basarili: true,
            kasaToplam,
            bankaToplam,
            toplamNakit: kasaToplam + bankaToplam,
            kasalar,
            bankalar
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    kasaListele,
    kasaOlustur,
    bankaListele,
    bankaOlustur,
    paraHareketleri,
    hesapHareketi,
    transfer,
    ozet
};
