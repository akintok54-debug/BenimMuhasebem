const mongoose = require("mongoose");

const Musteri = require("../models/Musteri");
const Tedarikci = require("../models/Tedarikci");
const CariHareket = require("../models/CariHareket");
const Kasa = require("../models/Kasa");
const Banka = require("../models/Banka");
const ParaHareket = require("../models/ParaHareket");

function tenantId(req) {
    return new mongoose.Types.ObjectId(String(req.tenantId));
}

async function hesapBul(req, hesapTipi, hesapId) {
    const tId = tenantId(req);

    if (!["KASA", "BANKA"].includes(hesapTipi)) {
        return null;
    }

    if (!mongoose.Types.ObjectId.isValid(String(hesapId))) {
        return null;
    }

    if (hesapTipi === "KASA") {
        return Kasa.findOne({
            _id: hesapId,
            tenantId: tId,
            aktif: true
        });
    }

    return Banka.findOne({
        _id: hesapId,
        tenantId: tId,
        aktif: true
    });
}

async function ozet(req, res, next) {
    try {
        const tId = tenantId(req);

        const [musteriler, tedarikciler] = await Promise.all([
            Musteri.find({
                tenantId: tId
            })
                .select("kod unvan adSoyad bakiye")
                .lean(),

            Tedarikci.find({
                tenantId: tId
            })
                .select("kod unvan adSoyad bakiye")
                .lean()
        ]);

        const musteriAlacak = musteriler.reduce(
            (toplam, item) => toplam + Number(item.bakiye || 0),
            0
        );

        const tedarikciBorc = tedarikciler.reduce(
            (toplam, item) => toplam + Number(item.bakiye || 0),
            0
        );

        return res.json({
            basarili: true,
            musteriAlacak,
            tedarikciBorc,
            netCari: musteriAlacak - tedarikciBorc
        });
    } catch (error) {
        next(error);
    }
}

async function hareketler(req, res, next) {
    try {
        const filter = {
            tenantId: tenantId(req)
        };

        if (req.query.tarafTipi) {
            filter.tarafTipi = req.query.tarafTipi;
        }

        if (req.query.tarafId) {
            filter.tarafId = req.query.tarafId;
        }

        const hareketler = await CariHareket.find(filter)
            .sort({
                tarih: -1,
                createdAt: -1
            })
            .lean();

        return res.json({
            basarili: true,
            toplam: hareketler.length,
            hareketler
        });
    } catch (error) {
        next(error);
    }
}

async function musteriTahsilat(req, res, next) {
    try {
        const tId = tenantId(req);
        const body = req.body || {};
        const tutar = Number(body.tutar || 0);

        if (!body.musteriId || tutar <= 0) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Müşteri ve pozitif tutar zorunludur."
            });
        }

        if (!["KASA", "BANKA"].includes(body.hesapTipi)) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Tahsilat hesabı KASA veya BANKA olmalıdır."
            });
        }

        const musteri = await Musteri.findOne({
            _id: body.musteriId,
            tenantId: tId
        });

        if (!musteri) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Müşteri bulunamadı."
            });
        }

        if (musteri.bakiye < tutar) {
            return res.status(409).json({
                basarili: false,
                mesaj: "Tahsilat müşteri bakiyesini aşamaz."
            });
        }

        const hesap = await hesapBul(
            req,
            body.hesapTipi,
            body.hesapId
        );

        if (!hesap) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Tahsilat hesabı bulunamadı."
            });
        }

        musteri.bakiye -= tutar;
        hesap.bakiye += tutar;

        await musteri.save();
        await hesap.save();

        const cariHareket = await CariHareket.create({
            tenantId: tId,
            tarafTipi: "MUSTERI",
            tarafId: musteri._id,
            tip: "TAHSILAT",
            tutar,
            aciklama: body.aciklama || "Müşteri tahsilatı",
            kaynak: "TAHSILAT",
            tarih: body.tarih || new Date(),
            kullaniciId:
                req.kullanici?._id ||
                req.user?._id ||
                null
        });

        const paraHareket = await ParaHareket.create({
            tenantId: tId,
            hesapTipi: body.hesapTipi,
            hesapId: hesap._id,
            tip: "GIRIS",
            tutar,
            aciklama: body.aciklama || "Müşteri tahsilatı",
            kaynak: "TAHSILAT",
            kaynakId: cariHareket._id,
            kullaniciId:
                req.kullanici?._id ||
                req.user?._id ||
                null
        });

        return res.status(201).json({
            basarili: true,
            mesaj: "Tahsilat kaydedildi.",
            musteriBakiye: musteri.bakiye,
            hesap,
            cariHareket,
            paraHareket
        });
    } catch (error) {
        next(error);
    }
}

async function tedarikciOdeme(req, res, next) {
    try {
        const tId = tenantId(req);
        const body = req.body || {};
        const tutar = Number(body.tutar || 0);

        if (!body.tedarikciId || tutar <= 0) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Tedarikçi ve pozitif tutar zorunludur."
            });
        }

        if (!["KASA", "BANKA"].includes(body.hesapTipi)) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Ödeme hesabı KASA veya BANKA olmalıdır."
            });
        }

        const tedarikci = await Tedarikci.findOne({
            _id: body.tedarikciId,
            tenantId: tId
        });

        if (!tedarikci) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Tedarikçi bulunamadı."
            });
        }

        if (tedarikci.bakiye < tutar) {
            return res.status(409).json({
                basarili: false,
                mesaj: "Ödeme tedarikçi bakiyesini aşamaz."
            });
        }

        const hesap = await hesapBul(
            req,
            body.hesapTipi,
            body.hesapId
        );

        if (!hesap) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Ödeme hesabı bulunamadı."
            });
        }

        if (hesap.bakiye < tutar) {
            return res.status(409).json({
                basarili: false,
                mesaj: "Ödeme hesabında yeterli bakiye yok."
            });
        }

        tedarikci.bakiye -= tutar;
        hesap.bakiye -= tutar;

        await tedarikci.save();
        await hesap.save();

        const cariHareket = await CariHareket.create({
            tenantId: tId,
            tarafTipi: "TEDARIKCI",
            tarafId: tedarikci._id,
            tip: "ODEME",
            tutar,
            aciklama: body.aciklama || "Tedarikçi ödemesi",
            kaynak: "ODEME",
            belgeNo: body.belgeNo || "",
            tarih: body.tarih || new Date(),
            kullaniciId:
                req.kullanici?._id ||
                req.user?._id ||
                null
        });

        const paraHareket = await ParaHareket.create({
            tenantId: tId,
            hesapTipi: body.hesapTipi,
            hesapId: hesap._id,
            tip: "CIKIS",
            tutar,
            aciklama: body.aciklama || "Tedarikçi ödemesi",
            kaynak: "ODEME",
            kaynakId: cariHareket._id,
            belgeNo: body.belgeNo || "",
            tarih: body.tarih || new Date(),
            kullaniciId:
                req.kullanici?._id ||
                req.user?._id ||
                null
        });

        return res.status(201).json({
            basarili: true,
            mesaj: "Ödeme kaydedildi.",
            tedarikciBakiye: tedarikci.bakiye,
            hesap,
            cariHareket,
            paraHareket
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    ozet,
    hareketler,
    musteriTahsilat,
    tedarikciOdeme
};
