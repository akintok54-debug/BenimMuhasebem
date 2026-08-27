const mongoose = require("mongoose");
const Urun = require("../models/Urun");
const UrunKategori = require("../models/UrunKategori");
const OzelFiyat = require("../models/OzelFiyat");

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
        const kullanimlar = await Urun.aggregate([
            { $match: { tenantId: tId, kategori: { $ne: "" } } },
            { $group: { _id: "$kategori", toplam: { $sum: 1 } } }
        ]);
        const kullanimMap = Object.fromEntries(kullanimlar.map(x => [x._id, x.toplam]));
        const kayitMap = Object.fromEntries(kayitli.map(x => [x.ad, x]));
        res.json({
            basarili: true,
            kategoriler: adlar,
            kategoriKayitlari: adlar.map(ad => ({
                _id: kayitMap[ad]?._id || null,
                ad,
                kullanim: kullanimMap[ad] || 0
            }))
        });
    } catch (error) { next(error); }
}

async function kategoriOlustur(req, res, next) {
    try {
        const ad = metin(req.body?.ad);
        if (!ad) return res.status(400).json({ basarili: false, mesaj: "Kategori adı zorunludur." });
        const mevcut = await UrunKategori.findOne({ tenantId: tenantId(req), ad });
        if (mevcut) return res.status(409).json({ basarili: false, mesaj: "Bu kategori zaten kayıtlı." });
        const kategori = await UrunKategori.create({ tenantId: tenantId(req), ad });
        res.status(201).json({ basarili: true, kategori });
    } catch (error) { next(error); }
}

async function kategoriSil(req, res, next) {
    try {
        const tId = tenantId(req);
        const ad = metin(req.query.ad);
        const id = metin(req.params.id);
        if (!ad && !id) {
            return res.status(400).json({ basarili: false, mesaj: "Silinecek kategori seçilmelidir." });
        }
        if (id && !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ basarili: false, mesaj: "Geçersiz kategori kimliği." });
        }
        const kategori = ad
            ? await UrunKategori.findOne({ tenantId: tId, ad })
            : await UrunKategori.findOne({ _id: id, tenantId: tId });
        const kategoriAdi = kategori?.ad || ad;
        if (!kategoriAdi) return res.status(404).json({ basarili: false, mesaj: "Kategori bulunamadı." });
        const kullanim = await Urun.countDocuments({ tenantId: tId, kategori: kategoriAdi });
        if (kullanim > 0) {
            return res.status(409).json({
                basarili: false,
                mesaj: `Bu kategori ${kullanim} üründe kullanılıyor. Önce ürünlerin kategorisini değiştirin.`
            });
        }
        if (kategori) await UrunKategori.deleteOne({ _id: kategori._id, tenantId: tId });
        res.json({ basarili: true, mesaj: "Kategori silindi." });
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

function fiyatDogrula(value) {
    const fiyat = Number(value);
    if (!Number.isFinite(fiyat) || fiyat < 0) {
        const error = new Error("Özel fiyat sıfır veya daha büyük bir sayı olmalıdır.");
        error.status = 400;
        throw error;
    }
    return fiyat;
}

async function ozelFiyatlariListele(req, res, next) {
    try {
        const fiyatlar = await OzelFiyat.find({ tenantId: tenantId(req) })
            .populate("urunId", "kod barkod ad kategori birim satisFiyati aktif")
            .sort({ updatedAt: -1 }).lean();
        res.json({ basarili: true, toplam: fiyatlar.length, fiyatlar: fiyatlar.filter(x => x.urunId) });
    } catch (error) { next(error); }
}

async function ozelFiyatOlustur(req, res, next) {
    try {
        const tId = tenantId(req);
        const urunId = metin(req.body?.urunId);
        if (!mongoose.Types.ObjectId.isValid(urunId)) return res.status(400).json({ basarili: false, mesaj: "Geçerli bir ürün seçilmelidir." });
        const urun = await Urun.findOne({ _id: urunId, tenantId: tId }).select("_id").lean();
        if (!urun) return res.status(404).json({ basarili: false, mesaj: "Ürün bulunamadı." });
        const fiyat = fiyatDogrula(req.body?.fiyat);
        if (await OzelFiyat.exists({ tenantId: tId, urunId })) return res.status(409).json({ basarili: false, mesaj: "Bu ürün özel fiyat listesinde zaten var. Fiyatı Güncelle düğmesini kullanın." });
        const ozelFiyat = await OzelFiyat.create({ tenantId: tId, urunId, fiyat, aciklama: metin(req.body?.aciklama) });
        await ozelFiyat.populate("urunId", "kod barkod ad kategori birim satisFiyati aktif");
        res.status(201).json({ basarili: true, ozelFiyat });
    } catch (error) { next(error); }
}

async function ozelFiyatGuncelle(req, res, next) {
    try {
        const ozelFiyat = await OzelFiyat.findOne({ _id: req.params.id, tenantId: tenantId(req) });
        if (!ozelFiyat) return res.status(404).json({ basarili: false, mesaj: "Özel fiyat kaydı bulunamadı." });
        ozelFiyat.fiyat = fiyatDogrula(req.body?.fiyat);
        if (req.body?.aciklama !== undefined) ozelFiyat.aciklama = metin(req.body.aciklama);
        await ozelFiyat.save();
        await ozelFiyat.populate("urunId", "kod barkod ad kategori birim satisFiyati aktif");
        res.json({ basarili: true, ozelFiyat });
    } catch (error) { next(error); }
}

async function ozelFiyatSil(req, res, next) {
    try {
        const sonuc = await OzelFiyat.deleteOne({ _id: req.params.id, tenantId: tenantId(req) });
        if (!sonuc.deletedCount) return res.status(404).json({ basarili: false, mesaj: "Özel fiyat kaydı bulunamadı." });
        res.json({ basarili: true, mesaj: "Ürün yalnızca özel fiyat listesinden kaldırıldı." });
    } catch (error) { next(error); }
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
    kategoriSil,
    listele,
    detay,
    olustur,
    guncelle,
    ozelFiyatlariListele,
    ozelFiyatOlustur,
    ozelFiyatGuncelle,
    ozelFiyatSil
};
