const mongoose = require("mongoose");
const Musteri = require("../models/Musteri");
const CariHareket = require("../models/CariHareket");

function tenantObjectId(req) {
    return new mongoose.Types.ObjectId(String(req.tenantId));
}

function aktorId(req) {
    return req.currentUser?._id || req.kullanici?._id || req.kullanici?.kullaniciId || req.user?._id || req.user?.kullaniciId;
}

function yonetici(req) {
    return ["OWNER", "ADMIN"].includes(String(req.currentUser?.rol || req.kullanici?.rol || req.user?.rol || "").toUpperCase());
}

function sahiplik(req) {
    const id = aktorId(req);
    return yonetici(req) ? {} : { $or: [{ temsilciId: id }, { olusturanKullaniciId: id }] };
}

function konum(body) {
    if (body?.konum === undefined) return undefined;
    const enlem = Number(body.konum?.enlem), boylam = Number(body.konum?.boylam), hassasiyet = Number(body.konum?.hassasiyet || 0);
    if (!Number.isFinite(enlem) || enlem < -90 || enlem > 90 || !Number.isFinite(boylam) || boylam < -180 || boylam > 180) throw Object.assign(new Error("GPS konumu geçersizdir."), { status: 400 });
    return { enlem, boylam, hassasiyet: Math.max(0, hassasiyet), kayitTarihi: new Date() };
}

async function listele(req, res, next) {
    try {
        const tenantId = tenantObjectId(req);
        const arama = String(req.query.arama || "").trim();

        const filter = { tenantId, ...sahiplik(req) };

        if (arama) {
            const aramaFiltresi = [
                { kod: { $regex: arama, $options: "i" } },
                { adSoyad: { $regex: arama, $options: "i" } },
                { unvan: { $regex: arama, $options: "i" } },
                { yetkili: { $regex: arama, $options: "i" } },
                { telefon: { $regex: arama, $options: "i" } },
                { whatsapp: { $regex: arama, $options: "i" } }
            ];
            if (filter.$or) { filter.$and = [{ $or: filter.$or }, { $or: aramaFiltresi }]; delete filter.$or; }
            else filter.$or = aramaFiltresi;
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
            tenantId,
            ...sahiplik(req)
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
            grup: body.grup || "Genel",
            fotograf: body.fotograf || "",
            aktif: body.aktif !== false
            , temsilciId: yonetici(req) && mongoose.Types.ObjectId.isValid(String(body.temsilciId || "")) ? body.temsilciId : aktorId(req)
            , olusturanKullaniciId: aktorId(req)
            , konum: konum(body)
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
            tenantId,
            ...sahiplik(req)
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
            "grup",
            "fotograf",
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
        if (body.konum !== undefined) musteri.konum = konum(body);
        if (yonetici(req) && mongoose.Types.ObjectId.isValid(String(body.temsilciId || ""))) musteri.temsilciId = body.temsilciId;

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
                tenantId,
                ...sahiplik(req)
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

async function sil(req, res, next) {
    try {
        const tenantId = tenantObjectId(req);
        const musteri = await Musteri.findOne({ _id: req.params.id, tenantId, ...sahiplik(req) });
        if (!musteri) return res.status(404).json({ basarili: false, mesaj: "Müşteri bulunamadı." });

        const hareketVar = await CariHareket.exists({ tenantId, tarafTipi: "MUSTERI", tarafId: musteri._id });
        if (Math.abs(Number(musteri.bakiye || 0)) > 0.000001 || hareketVar) {
            return res.status(409).json({
                basarili: false,
                mesaj: "Bakiyesi veya muhasebe hareketi olan cari silinemez. Muhasebe geçmişini korumak için müşteriyi pasife alın."
            });
        }

        await Musteri.deleteOne({ _id: musteri._id, tenantId });
        return res.json({ basarili: true, mesaj: "Cari kaydı silindi." });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    listele,
    detay,
    olustur,
    guncelle,
    durumDegistir,
    sil
};

