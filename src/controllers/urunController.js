const mongoose = require("mongoose");
const Urun = require("../models/Urun");
const UrunKategori = require("../models/UrunKategori");

const SAYISAL_ALANLAR = ["kdv", "alisFiyati", "satisFiyati", "bayiFiyati", "perakendeFiyati", "minimumStok", "kritikStok"];

function metin(value) {
    return String(value ?? "").trim();
}

function gorselDogrula(value) {
    if (!value) return "";
    if (typeof value !== "string" || !(/^(https?:\/\/)/i.test(value) || /^data:image\/(jpeg|png|webp);base64,/i.test(value))) {
        const error = new Error("Ürün görseli geçerli bir HTTPS adresi veya JPG, PNG, WebP görseli olmalıdır.");
        error.status = 400;
        throw error;
    }
    if (value.length > 2_800_000) {
        const error = new Error("Ürün görseli en fazla 2 MB olabilir.");
        error.status = 400;
        throw error;
    }
    return value;
}

async function kategorileriListele(req, res, next) {
    try {
        const tId = tenantId(req);
        const [kayitli, urunKategorileri] = await Promise.all([
            UrunKategori.find({ tenantId: tId, aktif: true }).sort({ ad: 1 }).lean(),
            Urun.distinct("kategori", { tenantId: tId, kategori: { $ne: "" } })
        ]);
        const adlar = [...new Set([...kayitli.map(x => x.ad), ...urunKategorileri].filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, "tr"));
        res.json({ basarili: true, kategoriler: adlar });
    } catch (error) { next(error); }
}

async function kategoriOlustur(req, res, next) {
    try {
        const ad = metin(req.body?.ad);
        if (!ad) return res.status(400).json({ basarili: false, mesaj: "Kategori adı zorunludur." });
        const kategori = await UrunKategori.create({ tenantId: tenantId(req), ad });
        res.status(201).json({ basarili: true, kategori });
    } catch (error) { next(error); }
}

async function benzersizAlanlariDogrula(tId, body, haricId = null) {
    const kosullar = [];
    const kod = metin(body.kod).toUpperCase();
    const barkod = metin(body.barkod);
    if (kod) kosullar.push({ kod });
    if (barkod) kosullar.push({ barkod });
    if (!kosullar.length) return;
    const filter = { tenantId: tId, $or: kosullar };
    if (haricId) filter._id = { $ne: haricId };
    const mevcut = await Urun.findOne(filter).select("kod barkod").lean();
    if (!mevcut) return;
    const error = new Error(mevcut.kod === kod ? "Bu ürün kodu zaten kullanılıyor." : "Bu barkod zaten kullanılıyor.");
    error.status = 409;
    throw error;
}

function sayilariDogrula(body) {
    for (const alan of SAYISAL_ALANLAR) {
        if (body[alan] === undefined) continue;
        const deger = Number(body[alan]);
        if (!Number.isFinite(deger) || deger < 0) {
            const error = new Error(`${alan} sıfır veya daha büyük bir sayı olmalıdır.`);
            error.status = 400;
            throw error;
        }
    }
}

function tenantId(req) {
    return new mongoose.Types.ObjectId(String(req.tenantId));
}

async function listele(req, res, next) {
    try {
        const filter = {
            tenantId: tenantId(req)
        };

        const arama = String(req.query.arama || "").trim();

        if (req.query.aktif === "true") filter.aktif = true;
        if (req.query.aktif === "false") filter.aktif = false;
        if (req.query.kategori) filter.kategori = String(req.query.kategori).trim();

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

        sayilariDogrula(body);
        await benzersizAlanlariDogrula(tId, body);

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
            bayiFiyati: Number(body.bayiFiyati || 0),
            perakendeFiyati: Number(body.perakendeFiyati ?? body.satisFiyati ?? 0),
            gorsel: gorselDogrula(body.gorsel),
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
            "bayiFiyati",
            "perakendeFiyati",
            "gorsel",
            "minimumStok",
            "kritikStok",
            "aktif",
            "notlar"
        ];

        sayilariDogrula(req.body || {});
        await benzersizAlanlariDogrula(tenantId(req), req.body || {}, urun._id);

        for (const alan of alanlar) {
            if (req.body[alan] !== undefined) {
                if (alan === "kod") urun[alan] = metin(req.body[alan]).toUpperCase();
                else if (alan === "gorsel") urun[alan] = gorselDogrula(req.body[alan]);
                else if (SAYISAL_ALANLAR.includes(alan)) urun[alan] = Number(req.body[alan]);
                else urun[alan] = req.body[alan];
            }
        }

        if (!metin(urun.kod) || !metin(urun.ad)) {
            return res.status(400).json({ basarili: false, mesaj: "Ürün kodu ve ürün adı zorunludur." });
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
    kategorileriListele,
    kategoriOlustur,
    listele,
    detay,
    olustur,
    guncelle
};
