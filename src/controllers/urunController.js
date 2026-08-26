const mongoose = require("mongoose");
const Urun = require("../models/Urun");

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
                { barkod: { $regex: arama, $options: "i" } },
                { ad: { $regex: arama, $options: "i" } },
                { marka: { $regex: arama, $options: "i" } },
                { model: { $regex: arama, $options: "i" } }
            ];
        }

        const urunler = await Urun.find(filter)
            .sort({ createdAt: -1 })
            .lean();

        res.json({
            basarili: true,
            toplam: urunler.length,
            urunler
        });
    } catch (error) {
        next(error);
    }
}

async function detay(req, res, next) {
    try {
        const urun = await Urun.findOne({
            _id: req.params.id,
            tenantId: tenantId(req)
        }).lean();

        if (!urun) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Ürün bulunamadı."
            });
        }

        res.json({
            basarili: true,
            urun
        });
    } catch (error) {
        next(error);
    }
}

async function olustur(req, res, next) {
    try {
        const body = req.body || {};
        const tId = tenantId(req);

        if (!body.kod || !body.ad) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Ürün kodu ve ürün adı zorunludur."
            });
        }

        const urun = await Urun.create({
            tenantId: tId,
            kod: String(body.kod).trim().toUpperCase(),
            barkod: body.barkod || "",
            ad: String(body.ad).trim(),
            kategori: body.kategori || "",
            marka: body.marka || "",
            model: body.model || "",
            uyumluluk: Array.isArray(body.uyumluluk)
                ? body.uyumluluk
                : [],
            birim: body.birim || "ADET",
            kdv: Number(body.kdv ?? 20),
            alisFiyati: Number(body.alisFiyati || 0),
            satisFiyati: Number(body.satisFiyati || 0),
            minimumStok: Number(body.minimumStok || 0),
            kritikStok: Number(body.kritikStok || 0),
            aktif: body.aktif !== false,
            notlar: body.notlar || ""
        });

        res.status(201).json({
            basarili: true,
            urun
        });
    } catch (error) {
        next(error);
    }
}

async function guncelle(req, res, next) {
    try {
        const urun = await Urun.findOne({
            _id: req.params.id,
            tenantId: tenantId(req)
        });

        if (!urun) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Ürün bulunamadı."
            });
        }

        const alanlar = [
            "kod",
            "barkod",
            "ad",
            "kategori",
            "marka",
            "model",
            "uyumluluk",
            "birim",
            "kdv",
            "alisFiyati",
            "satisFiyati",
            "minimumStok",
            "kritikStok",
            "aktif",
            "notlar"
        ];

        for (const alan of alanlar) {
            if (req.body[alan] !== undefined) {
                urun[alan] =
                    alan === "kod"
                        ? String(req.body[alan]).trim().toUpperCase()
                        : req.body[alan];
            }
        }

        await urun.save();

        res.json({
            basarili: true,
            urun
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
