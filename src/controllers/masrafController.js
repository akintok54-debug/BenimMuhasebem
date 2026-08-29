const mongoose = require("mongoose");

const Masraf = require("../models/Masraf");
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

async function listele(req, res, next) {
    try {
        const filter = {
            tenantId: tenantId(req)
        };

        if (req.query.kategori) {
            filter.kategori = req.query.kategori;
        }

        if (req.query.hesapTipi) {
            filter.hesapTipi = req.query.hesapTipi;
        }

        const masraflar = await Masraf.find(filter)
            .sort({ tarih: -1, createdAt: -1 })
            .lean();

        res.json({
            basarili: true,
            toplam: masraflar.length,
            masraflar
        });
    } catch (error) {
        next(error);
    }
}

async function ozet(req, res, next) {
    try {
        const tId = tenantId(req);

        const masraflar = await Masraf.find({
            tenantId: tId,
            odemeDurumu: "ODENDI"
        })
            .select("kategori tutar")
            .lean();

        const toplam = masraflar.reduce(
            (toplam, item) =>
                toplam + Number(item.tutar || 0),
            0
        );

        const kategoriToplamlari = {};

        for (const item of masraflar) {
            kategoriToplamlari[item.kategori] =
                (kategoriToplamlari[item.kategori] || 0) +
                Number(item.tutar || 0);
        }

        res.json({
            basarili: true,
            toplam,
            kategoriToplamlari
        });
    } catch (error) {
        next(error);
    }
}

async function olustur(req, res, next) {
    try {
        const tId = tenantId(req);
        const body = req.body || {};

        const tutar = Number(body.tutar || 0);

        if (!body.aciklama || tutar <= 0) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Açıklama ve pozitif tutar zorunludur."
            });
        }

        if (!["KASA", "BANKA"].includes(body.hesapTipi)) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Hesap tipi KASA veya BANKA olmalıdır."
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
                mesaj: "Masraf hesabı bulunamadı."
            });
        }

        if (hesap.bakiye < tutar) {
            return res.status(409).json({
                basarili: false,
                mesaj: "Masraf için hesapta yeterli bakiye yok."
            });
        }

        // Para çıkışı
        hesap.bakiye -= tutar;
        await hesap.save();

        const paraHareket = await ParaHareket.create({
            tenantId: tId,
            hesapTipi: body.hesapTipi,
            hesapId: hesap._id,
            tip: "CIKIS",
            tutar,
            paraBirimi: hesap.paraBirimi || "TRY",
            aciklama: body.aciklama,
            kaynak: "MASRAF",
            tarih: body.tarih || new Date(),
            kullaniciId:
                req.kullanici?._id ||
                req.user?._id ||
                null
        });

        const masraf = await Masraf.create({
            tenantId: tId,
            tarih: body.tarih || new Date(),
            kategori: body.kategori || "DIGER",
            aciklama: body.aciklama,
            tutar,
            hesapTipi: body.hesapTipi,
            hesapId: hesap._id,
            odemeDurumu: "ODENDI",
            kaynak: "MANUEL",
            kullaniciId:
                req.kullanici?._id ||
                req.user?._id ||
                null,
            paraHareketId: paraHareket._id
        });

        res.status(201).json({
            basarili: true,
            mesaj: "Masraf kaydedildi.",
            masraf,
            hesap,
            paraHareket
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    listele,
    ozet,
    olustur
};
