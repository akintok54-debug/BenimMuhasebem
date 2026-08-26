const mongoose = require("mongoose");

const Urun = require("../models/Urun");
const Depo = require("../models/Depo");
const Stok = require("../models/Stok");
const StokHareket = require("../models/StokHareket");

function tenantId(req) {
    return new mongoose.Types.ObjectId(String(req.tenantId));
}

async function depolar(req, res, next) {
    try {
        const list = await Depo.find({
            tenantId: tenantId(req),
            aktif: true
        })
        .sort({ ad: 1 })
        .lean();

        res.json({
            basarili: true,
            depolar: list
        });
    } catch (error) {
        next(error);
    }
}

async function depoOlustur(req, res, next) {
    try {
        const body = req.body || {};

        if (!body.kod || !body.ad) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Depo kodu ve depo adı zorunludur."
            });
        }

        const depo = await Depo.create({
            tenantId: tenantId(req),
            kod: String(body.kod).trim().toUpperCase(),
            ad: String(body.ad).trim(),
            adres: body.adres || "",
            aktif: body.aktif !== false
        });

        res.status(201).json({
            basarili: true,
            depo
        });
    } catch (error) {
        next(error);
    }
}

async function listele(req, res, next) {
    try {
        const filter = {
            tenantId: tenantId(req)
        };

        if (req.query.depoId) {
            filter.depoId = req.query.depoId;
        }

        if (req.query.urunId) {
            filter.urunId = req.query.urunId;
        }

        const stoklar = await Stok.find(filter)
            .populate("urunId", "kod barkod ad birim alisFiyati satisFiyati minimumStok kritikStok")
            .populate("depoId", "kod ad")
            .sort({ updatedAt: -1 })
            .lean();

        res.json({
            basarili: true,
            toplam: stoklar.length,
            stoklar
        });
    } catch (error) {
        next(error);
    }
}

async function hareket(req, res, next) {
    try {
        const tId = tenantId(req);
        const body = req.body || {};

        if (!body.urunId || !body.depoId || !body.tip) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Ürün, depo ve hareket tipi zorunludur."
            });
        }

        const miktar = Number(body.miktar || 0);

        if (miktar <= 0) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Miktar sıfırdan büyük olmalıdır."
            });
        }

        const urun = await Urun.findOne({
            _id: body.urunId,
            tenantId: tId
        });

        if (!urun) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Ürün bulunamadı."
            });
        }

        const depo = await Depo.findOne({
            _id: body.depoId,
            tenantId: tId
        });

        if (!depo) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Depo bulunamadı."
            });
        }

        let stok = await Stok.findOne({
            tenantId: tId,
            urunId: urun._id,
            depoId: depo._id
        });

        if (!stok) {
            stok = await Stok.create({
                tenantId: tId,
                urunId: urun._id,
                depoId: depo._id,
                miktar: 0,
                maliyet: 0
            });
        }

        const girisTipleri = [
            "GIRIS",
            "SAYIM_ARTI",
            "IADE_GIRIS",
            "TRANSFER_GIRIS"
        ];

        const cikisTipleri = [
            "CIKIS",
            "SAYIM_EKSI",
            "IADE_CIKIS",
            "TRANSFER_CIKIS"
        ];

        if (girisTipleri.includes(body.tip)) {
            stok.miktar += miktar;
        }
        else if (cikisTipleri.includes(body.tip)) {
            if (stok.miktar < miktar) {
                return res.status(409).json({
                    basarili: false,
                    mesaj: "Yetersiz stok."
                });
            }

            stok.miktar -= miktar;
        }
        else {
            return res.status(400).json({
                basarili: false,
                mesaj: "Geçersiz stok hareketi."
            });
        }

        if (body.birimMaliyet !== undefined) {
            stok.maliyet = Number(body.birimMaliyet || 0);
        }

        stok.sonHareketTarihi = new Date();

        await stok.save();

        const stokHareket = await StokHareket.create({
            tenantId: tId,
            urunId: urun._id,
            depoId: depo._id,
            tip: body.tip,
            miktar,
            birimMaliyet: Number(body.birimMaliyet || 0),
            kaynak: body.kaynak || "MANUEL",
            kaynakId: body.kaynakId || null,
            aciklama: body.aciklama || "",
            kullaniciId: req.kullanici?._id || req.user?._id || null
        });

        res.status(201).json({
            basarili: true,
            stok,
            hareket: stokHareket
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

        if (req.query.urunId) {
            filter.urunId = req.query.urunId;
        }

        if (req.query.depoId) {
            filter.depoId = req.query.depoId;
        }

        const list = await StokHareket.find(filter)
            .populate("urunId", "kod barkod ad")
            .populate("depoId", "kod ad")
            .sort({ createdAt: -1 })
            .lean();

        res.json({
            basarili: true,
            toplam: list.length,
            hareketler: list
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    depolar,
    depoOlustur,
    listele,
    hareket,
    hareketler
};
