const mongoose = require("mongoose");
const Tedarikci = require("../models/Tedarikci");
const CariHareket = require("../models/CariHareket");
const Alis = require("../models/Alis");
const AlisIade = require("../models/AlisIade");
const SatinAlmaSiparis = require("../models/SatinAlmaSiparis");

function tenantObjectId(req) {
    return new mongoose.Types.ObjectId(String(req.tenantId));
}

async function listele(req, res, next) {
    try {
        const tenantId = tenantObjectId(req);
        const arama = String(req.query.arama || "").trim();

        const filter = { tenantId };

        if (arama) {
            filter.$or = [
                { kod: { $regex: arama, $options: "i" } },
                { adSoyad: { $regex: arama, $options: "i" } },
                { unvan: { $regex: arama, $options: "i" } },
                { yetkili: { $regex: arama, $options: "i" } },
                { telefon: { $regex: arama, $options: "i" } },
                { whatsapp: { $regex: arama, $options: "i" } },
                { vergiNo: { $regex: arama, $options: "i" } }
            ];
        }

        const tedarikciler = await Tedarikci.find(filter)
            .sort({ createdAt: -1 })
            .lean();

        return res.json({
            basarili: true,
            toplam: tedarikciler.length,
            tedarikciler
        });
    } catch (error) {
        next(error);
    }
}

async function detay(req, res, next) {
    try {
        const tenantId = tenantObjectId(req);

        const tedarikci = await Tedarikci.findOne({
            _id: req.params.id,
            tenantId
        }).lean();

        if (!tedarikci) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Tedarikçi bulunamadı."
            });
        }

        return res.json({
            basarili: true,
            tedarikci
        });
    } catch (error) {
        next(error);
    }
}

async function merkez(req, res, next) {
    try {
        const tenantId = tenantObjectId(req);
        if (!mongoose.Types.ObjectId.isValid(String(req.params.id || ""))) {
            return res.status(400).json({ basarili: false, mesaj: "Geçersiz tedarikçi bilgisi." });
        }

        const tedarikci = await Tedarikci.findOne({ _id: req.params.id, tenantId }).lean();
        if (!tedarikci) return res.status(404).json({ basarili: false, mesaj: "Tedarikçi bulunamadı." });

        const [alislar, iadeler, hareketler, siparisler] = await Promise.all([
            Alis.find({ tenantId, tedarikciId: tedarikci._id })
                .populate("depoId", "kod ad")
                .sort({ tarih: -1, createdAt: -1 })
                .lean(),
            AlisIade.find({ tenantId, tedarikciId: tedarikci._id })
                .populate("depoId", "kod ad")
                .sort({ tarih: -1, createdAt: -1 })
                .lean(),
            CariHareket.find({ tenantId, tarafTipi: "TEDARIKCI", tarafId: tedarikci._id })
                .sort({ tarih: -1, createdAt: -1 })
                .lean(),
            SatinAlmaSiparis.find({ tenantId, tedarikciId: tedarikci._id })
                .sort({ tarih: -1, createdAt: -1 })
                .lean()
        ]);

        const vadeGun = Number(tedarikci.vadeGun || 0);
        const vadeler = alislar
            .filter(item => Number(item.kalanTutar || 0) > 0)
            .map(item => ({
                alisId: item._id,
                belgeNo: item.belgeNo,
                tarih: item.tarih,
                vadeTarihi: new Date(new Date(item.tarih).getTime() + vadeGun * 86400000),
                kalanTutar: Number(item.kalanTutar || 0)
            }))
            .sort((a, b) => a.vadeTarihi - b.vadeTarihi);

        const odemeler = hareketler.filter(item => item.tip === "ODEME" && item.durum !== "IPTAL");
        const avanslar = odemeler
            .filter(item => Number(item.sonrakiBakiye) < 0)
            .map(item => ({ ...item, avansTutari: Math.min(Number(item.tutar || 0), Math.abs(Number(item.sonrakiBakiye || 0))) }));
        const toplamAlis = alislar.reduce((sum, item) => sum + Number(item.genelToplam || 0), 0);
        const toplamOdeme = odemeler.reduce((sum, item) => sum + Number(item.tutar || 0), 0);
        const toplamIade = iadeler.reduce((sum, item) => sum + Number(item.genelToplam || 0), 0);

        return res.json({
            basarili: true,
            tedarikci,
            bakiye: {
                tutar: Number(tedarikci.bakiye || 0),
                durum: Number(tedarikci.bakiye || 0) > 0 ? "BORC" : Number(tedarikci.bakiye || 0) < 0 ? "AVANS_ALACAK" : "KAPALI"
            },
            alislar,
            odemeler,
            avanslar,
            iadeler,
            siparisler,
            cariHareketler: hareketler,
            ekstre: hareketler,
            vadeler,
            sonIslemler: hareketler.slice(0, 10),
            ozet: { toplamAlis, toplamOdeme, toplamIade, acikFatura: vadeler.reduce((sum, item) => sum + item.kalanTutar, 0) }
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
                mesaj: "Tedarikçi kodu zorunludur."
            });
        }

        if (!body.unvan && !body.adSoyad) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Ünvan veya ad soyad zorunludur."
            });
        }

        const kod = String(body.kod).trim().toUpperCase();

        const mevcut = await Tedarikci.findOne({
            tenantId,
            kod
        });

        if (mevcut) {
            return res.status(409).json({
                basarili: false,
                mesaj: "Bu tedarikçi kodu bu kiracıda zaten kullanılıyor."
            });
        }

        const tedarikci = await Tedarikci.create({
            tenantId,
            kod,
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
            iban: body.iban || "",
            banka: body.banka || "",
            grup: body.grup || "Genel",
            bakiye: 0,
            notlar: body.notlar || "",
            aktif: body.aktif !== false
        });

        return res.status(201).json({
            basarili: true,
            tedarikci
        });
    } catch (error) {
        next(error);
    }
}

async function guncelle(req, res, next) {
    try {
        const tenantId = tenantObjectId(req);
        const body = req.body || {};

        const tedarikci = await Tedarikci.findOne({
            _id: req.params.id,
            tenantId
        });

        if (!tedarikci) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Tedarikçi bulunamadı."
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
            "iban",
            "banka",
            "grup",
            "notlar",
            "aktif"
        ];

        for (const alan of alanlar) {
            if (body[alan] !== undefined) {
                tedarikci[alan] =
                    alan === "kod"
                        ? String(body[alan]).trim().toUpperCase()
                        : body[alan];
            }
        }

        await tedarikci.save();

        return res.json({
            basarili: true,
            tedarikci
        });
    } catch (error) {
        next(error);
    }
}

async function durumDegistir(req, res, next) {
    try {
        const tenantId = tenantObjectId(req);

        const tedarikci = await Tedarikci.findOneAndUpdate(
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

        if (!tedarikci) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Tedarikçi bulunamadı."
            });
        }

        return res.json({
            basarili: true,
            tedarikci
        });
    } catch (error) {
        next(error);
    }
}

async function sil(req, res, next) {
    try {
        const tenantId = tenantObjectId(req);
        const tedarikci = await Tedarikci.findOne({ _id: req.params.id, tenantId });
        if (!tedarikci) return res.status(404).json({ basarili: false, mesaj: "Tedarikçi bulunamadı." });
        const hareketVar = await CariHareket.exists({ tenantId, tarafTipi: "TEDARIKCI", tarafId: tedarikci._id });
        if (Math.abs(Number(tedarikci.bakiye || 0)) > 0.000001 || hareketVar) {
            return res.status(409).json({ basarili: false, mesaj: "Bakiyesi veya muhasebe hareketi olan tedarikçi silinemez. Muhasebe geçmişini korumak için pasife alın." });
        }
        await Tedarikci.deleteOne({ _id: tedarikci._id, tenantId });
        return res.json({ basarili: true, mesaj: "Tedarikçi cari kaydı silindi." });
    } catch (error) { next(error); }
}

module.exports = {
    listele,
    detay,
    merkez,
    olustur,
    guncelle,
    durumDegistir,
    sil
};
