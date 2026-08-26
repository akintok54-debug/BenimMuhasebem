const mongoose = require("mongoose");
const Personel = require("../models/Personel");

function tenantId(req) {
    return new mongoose.Types.ObjectId(String(req.tenantId));
}

async function listele(req, res, next) {
    try {
        const filter = {
            tenantId: tenantId(req)
        };

        const arama = String(req.query.arama || "").trim();

        if (arama) {
            filter.$or = [
                { kod: { $regex: arama, $options: "i" } },
                { adSoyad: { $regex: arama, $options: "i" } },
                { telefon: { $regex: arama, $options: "i" } },
                { gorev: { $regex: arama, $options: "i" } },
                { departman: { $regex: arama, $options: "i" } }
            ];
        }

        const personeller = await Personel.find(filter)
            .sort({ createdAt: -1 })
            .lean();

        res.json({
            basarili: true,
            toplam: personeller.length,
            personeller
        });
    } catch (error) {
        next(error);
    }
}

async function detay(req, res, next) {
    try {
        const personel = await Personel.findOne({
            _id: req.params.id,
            tenantId: tenantId(req)
        }).lean();

        if (!personel) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Personel bulunamadı."
            });
        }

        res.json({
            basarili: true,
            personel
        });
    } catch (error) {
        next(error);
    }
}

async function olustur(req, res, next) {
    try {
        const body = req.body || {};
        const tId = tenantId(req);

        if (!body.kod || !body.adSoyad) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Personel kodu ve ad soyad zorunludur."
            });
        }

        const mevcut = await Personel.findOne({
            tenantId: tId,
            kod: String(body.kod).trim().toUpperCase()
        });

        if (mevcut) {
            return res.status(409).json({
                basarili: false,
                mesaj: "Bu personel kodu zaten kullanılıyor."
            });
        }

        const personel = await Personel.create({
            tenantId: tId,
            kod: String(body.kod).trim().toUpperCase(),
            adSoyad: String(body.adSoyad).trim(),
            telefon: body.telefon || "",
            email: body.email || "",
            gorev: body.gorev || "",
            departman: body.departman || "",
            iseGirisTarihi: body.iseGirisTarihi || null,
            maas: Number(body.maas || 0),
            aktif: body.aktif !== false,
            notlar: body.notlar || ""
        });

        res.status(201).json({
            basarili: true,
            personel
        });
    } catch (error) {
        next(error);
    }
}

async function guncelle(req, res, next) {
    try {
        const personel = await Personel.findOne({
            _id: req.params.id,
            tenantId: tenantId(req)
        });

        if (!personel) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Personel bulunamadı."
            });
        }

        const alanlar = [
            "kod",
            "adSoyad",
            "telefon",
            "email",
            "gorev",
            "departman",
            "iseGirisTarihi",
            "maas",
            "aktif",
            "notlar"
        ];

        for (const alan of alanlar) {
            if (req.body[alan] !== undefined) {
                personel[alan] =
                    alan === "kod"
                        ? String(req.body[alan]).trim().toUpperCase()
                        : req.body[alan];
            }
        }

        await personel.save();

        res.json({
            basarili: true,
            personel
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    listele,
    detay,
    olustur,
    guncelle
};
