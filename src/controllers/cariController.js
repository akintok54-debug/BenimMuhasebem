const mongoose = require("mongoose");

const Musteri = require("../models/Musteri");
const Tedarikci = require("../models/Tedarikci");
const CariHareket = require("../models/CariHareket");
const Kasa = require("../models/Kasa");
const Banka = require("../models/Banka");
const ParaHareket = require("../models/ParaHareket");
const CariEkstrePaylasim = require("../models/CariEkstrePaylasim");
const crypto = require("crypto");

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

async function musteriManuelHareket(req, res, next) {
    try {
        const tId = tenantId(req);
        const body = req.body || {};
        const tutar = Number(body.tutar || 0);
        const tip = String(body.tip || "").toUpperCase();
        const kaynak = tip === "MASRAF" ? "MASRAF" : "MANUEL";
        const hareketTipi = tip === "MASRAF" ? "BORC" : tip;

        if (!mongoose.Types.ObjectId.isValid(String(body.musteriId || "")) || !["BORC", "ALACAK", "MASRAF"].includes(tip) || !Number.isFinite(tutar) || tutar <= 0) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Müşteri, işlem türü ve pozitif tutar zorunludur."
            });
        }

        const bakiyeDegisimi = hareketTipi === "BORC" ? tutar : -tutar;
        const musteri = await Musteri.findOneAndUpdate(
            { _id: body.musteriId, tenantId: tId },
            { $inc: { bakiye: bakiyeDegisimi } },
            { new: true }
        );

        if (!musteri) {
            return res.status(404).json({ basarili: false, mesaj: "Müşteri bulunamadı." });
        }

        try {
            const hareket = await CariHareket.create({
                tenantId: tId,
                tarafTipi: "MUSTERI",
                tarafId: musteri._id,
                tip: hareketTipi,
                tutar,
                aciklama: String(body.aciklama || (tip === "MASRAF" ? "Müşteri masrafı" : `Manuel ${tip.toLocaleLowerCase("tr-TR")}`)).trim(),
                kaynak,
                belgeNo: String(body.belgeNo || "").trim(),
                tarih: body.tarih || new Date(),
                kullaniciId: req.kullanici?._id || req.user?._id || null
            });

            return res.status(201).json({
                basarili: true,
                mesaj: tip === "MASRAF" ? "Masraf müşteri hesabına eklendi." : "Cari hareket kaydedildi.",
                musteriBakiye: musteri.bakiye,
                hareket
            });
        } catch (error) {
            await Musteri.updateOne({ _id: musteri._id, tenantId: tId }, { $inc: { bakiye: -bakiyeDegisimi } });
            throw error;
        }
    } catch (error) {
        next(error);
    }
}

async function ekstrePaylas(req, res, next) {
    try {
        const tId = tenantId(req);
        if (!mongoose.Types.ObjectId.isValid(String(req.params.musteriId || ""))) {
            return res.status(400).json({ basarili: false, mesaj: "Geçersiz müşteri bilgisi." });
        }
        const musteri = await Musteri.findOne({ _id: req.params.musteriId, tenantId: tId }).select("_id").lean();
        if (!musteri) return res.status(404).json({ basarili: false, mesaj: "Müşteri bulunamadı." });

        const token = crypto.randomBytes(32).toString("hex");
        const sonGecerlilik = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await CariEkstrePaylasim.create({
            tenantId: tId,
            musteriId: musteri._id,
            token,
            sonGecerlilik,
            olusturanKullaniciId: req.kullanici?._id || req.user?._id || null
        });

        const protokol = String(req.get("x-forwarded-proto") || req.protocol).split(",")[0].trim();
        const link = `${protokol}://${req.get("host")}/erp/cari-ekstre.html?token=${token}`;
        return res.status(201).json({ basarili: true, link, sonGecerlilik });
    } catch (error) {
        next(error);
    }
}

async function paylasilanEkstre(req, res, next) {
    try {
        res.set("Cache-Control", "no-store");
        const paylasim = await CariEkstrePaylasim.findOne({
            token: String(req.params.token || ""),
            sonGecerlilik: { $gt: new Date() }
        }).lean();
        if (!paylasim) return res.status(404).json({ basarili: false, mesaj: "Ekstre bağlantısı geçersiz veya süresi dolmuş." });

        const [musteri, hareketler] = await Promise.all([
            Musteri.findOne({ _id: paylasim.musteriId, tenantId: paylasim.tenantId }).select("kod unvan adSoyad bakiye").lean(),
            CariHareket.find({ tenantId: paylasim.tenantId, tarafTipi: "MUSTERI", tarafId: paylasim.musteriId }).sort({ tarih: 1, createdAt: 1 }).select("tip tutar aciklama kaynak belgeNo tarih").lean()
        ]);
        if (!musteri) return res.status(404).json({ basarili: false, mesaj: "Müşteri bulunamadı." });

        return res.json({ basarili: true, musteri, hareketler, olusturmaTarihi: paylasim.createdAt });
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
    tedarikciOdeme,
    musteriManuelHareket,
    ekstrePaylas,
    paylasilanEkstre
};
