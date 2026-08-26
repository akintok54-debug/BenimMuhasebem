const mongoose = require("mongoose");
const Musteri = require("../models/Musteri");

function tenantObjectId(req) {
    return new mongoose.Types.ObjectId(String(req.tenantId));
}

async function listele(req, res, next) {
    try {
        const tenantId = tenantObjectId(req);
        const arama = String(req.query.arama || "").trim();

        const filter = {
            tenantId
        };

        if (arama) {
            filter.$or = [
                { kod: { $regex: arama, $options: "i" } },
                { adSoyad: { $regex: arama, $options: "i" } },
                { unvan: { $regex: arama, $options: "i" } },
                { yetkili: { $regex: arama, $options: "i" } },
                { telefon: { $regex: arama, $options: "i" } },
                { whatsapp: { $regex: arama, $options: "i" } }
            ];
        }

        const musteriler = await Musteri.find(filter)
            .sort({ createdAt: -1 })
            .lean();

        return res.json({
            basarili: true,
            toplam: musteriler.length,
            musteriler
        });
    } catch (error) {
        next(error);
    }
}

async function detay(req, res, next) {
    try {
        const tenantId = tenantObjectId(req);

        const musteri = await Musteri.findOne({
            _id: req.params.id,
            tenantId
        }).lean();

        if (!musteri) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Müşteri bulunamadı."
            });
        }

        return res.json({
            basarili: true,
            musteri
        });
    } catch (error) {
        next(error);
    }
}

async function olustur(req, res, next) {
    try {
        const tenantId = tenantObjectId(req);
        const body = req.body || {};

        if (!body.kod) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Müşteri kodu zorunludur."
            });
        }

        if (!body.unvan && !body.adSoyad) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Ünvan veya ad soyad zorunludur."
            });
        }

        const mevcut = await Musteri.findOne({
            tenantId,
            kod: String(body.kod).trim().toUpperCase()
        });

        if (mevcut) {
            return res.status(409).json({
                basarili: false,
                mesaj: "Bu müşteri kodu zaten kullanılıyor. Lütfen farklı bir müşteri kodu girin."
            });
        }

        const musteri = await Musteri.create({
            tenantId,
            kod: String(body.kod).trim().toUpperCase(),
            adSoyad: body.adSoyad || "",
            unvan: body.unvan || "",
            yetkili: body.yetkili || "",
            telefon: body.telefon || "",
            whatsapp: body.whatsapp || "",
            email: body.email || "",
            vergiDairesi: body.vergiDairesi || "",
            vergiNo: body.vergiNo || "",
            adres: body.adres || "",
            il: body.il || "",
            ilce: body.ilce || "",
            postaKodu: body.postaKodu || "",
            vadeGun: Number(body.vadeGun || 0),
            limit: Number(body.limit || 0),
            riskLimiti: Number(body.riskLimiti || 0),
            bakiye: 0,
            notlar: body.notlar || "",
            aktif: body.aktif !== false
        });

        return res.status(201).json({
            basarili: true,
            musteri
        });
    } catch (error) {
        next(error);
    }
}

async function guncelle(req, res, next) {
    try {
        const tenantId = tenantObjectId(req);
        const body = req.body || {};

        const musteri = await Musteri.findOne({
            _id: req.params.id,
            tenantId
        });

        if (!musteri) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Müşteri bulunamadı."
            });
        }

        const alanlar = [
            "kod",
            "adSoyad",
            "unvan",
            "yetkili",
            "telefon",
            "whatsapp",
            "email",
            "vergiDairesi",
            "vergiNo",
            "adres",
            "il",
            "ilce",
            "postaKodu",
            "vadeGun",
            "limit",
            "riskLimiti",
            "notlar",
            "aktif"
        ];

        for (const alan of alanlar) {
            if (body[alan] !== undefined) {
                musteri[alan] =
                    alan === "kod"
                        ? String(body[alan]).trim().toUpperCase()
                        : body[alan];
            }
        }

        await musteri.save();

        return res.json({
            basarili: true,
            musteri
        });
    } catch (error) {
        next(error);
    }
}

async function durumDegistir(req, res, next) {
    try {
        const tenantId = tenantObjectId(req);

        const musteri = await Musteri.findOneAndUpdate(
            {
                _id: req.params.id,
                tenantId
            },
            {
                aktif: Boolean(req.body?.aktif)
            },
            {
                new: true
            }
        ).lean();

        if (!musteri) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Müşteri bulunamadı."
            });
        }

        return res.json({
            basarili: true,
            musteri
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    listele,
    detay,
    olustur,
    guncelle,
    durumDegistir
};

