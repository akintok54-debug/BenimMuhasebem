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

function odemeBilgisi(body) {
    const yontem = String(body.odemeYontemi || (body.hesapTipi === "BANKA" ? "KREDI_KARTI" : "NAKIT")).toUpperCase();
    if (!["NAKIT", "KREDI_KARTI", "SENET", "CEK"].includes(yontem)) return null;
    if (yontem === "NAKIT") return { yontem, hesapTipi: "KASA" };
    if (yontem === "KREDI_KARTI") return { yontem, hesapTipi: "BANKA" };
    return { yontem, hesapTipi: null };
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

        const odeme = odemeBilgisi(body);
        if (!odeme) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Ödeme yöntemi nakit, kredi kartı, senet veya çek olmalıdır."
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

        const hesap = odeme.hesapTipi ? await hesapBul(req, odeme.hesapTipi, body.hesapId) : null;

        if (odeme.hesapTipi && !hesap) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Tahsilat hesabı bulunamadı."
            });
        }

        musteri.bakiye -= tutar;
        if (hesap) hesap.bakiye += tutar;

        await musteri.save();
        if (hesap) await hesap.save();

        const cariHareket = await CariHareket.create({
            tenantId: tId,
            tarafTipi: "MUSTERI",
            tarafId: musteri._id,
            tip: "TAHSILAT",
            tutar,
            aciklama: body.aciklama || "Müşteri tahsilatı",
            kaynak: "TAHSILAT",
            belgeNo: String(body.belgeNo || "").trim(),
            odemeYontemi: odeme.yontem,
            oncekiBakiye: Number(musteri.bakiye) + tutar,
            sonrakiBakiye: Number(musteri.bakiye),
            bakiyeDegisimi: -tutar,
            tarih: body.tarih || new Date(),
            kullaniciId:
                req.kullanici?._id ||
                req.user?._id ||
                null
        });

        const paraHareket = hesap ? await ParaHareket.create({
            tenantId: tId,
            hesapTipi: odeme.hesapTipi,
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
        }) : null;

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

async function musteriOdeme(req, res, next) {
    try {
        const tId = tenantId(req), body = req.body || {}, tutar = Number(body.tutar || 0);
        const odeme = odemeBilgisi(body);
        if (!mongoose.Types.ObjectId.isValid(String(body.musteriId || "")) || !Number.isFinite(tutar) || tutar <= 0 || !odeme) {
            return res.status(400).json({ basarili: false, mesaj: "Müşteri, pozitif tutar ve geçerli ödeme yöntemi zorunludur." });
        }
        const musteri = await Musteri.findOne({ _id: body.musteriId, tenantId: tId });
        if (!musteri) return res.status(404).json({ basarili: false, mesaj: "Müşteri bulunamadı." });
        const hesap = odeme.hesapTipi ? await hesapBul(req, odeme.hesapTipi, body.hesapId) : null;
        if (odeme.hesapTipi && !hesap) return res.status(404).json({ basarili: false, mesaj: "Ödeme hesabı bulunamadı." });
        if (hesap && Number(hesap.bakiye || 0) < tutar) return res.status(409).json({ basarili: false, mesaj: "Ödeme hesabında yeterli bakiye yok." });

        const oncekiBakiye = Number(musteri.bakiye || 0);
        musteri.bakiye = oncekiBakiye + tutar;
        if (hesap) hesap.bakiye -= tutar;
        await musteri.save();
        if (hesap) await hesap.save();

        try {
            const cariHareket = await CariHareket.create({
                tenantId: tId, tarafTipi: "MUSTERI", tarafId: musteri._id, tip: "ODEME", tutar,
                aciklama: String(body.aciklama || "Müşteriye ödeme").trim(), kaynak: "MUSTERI_ODEME",
                belgeNo: String(body.belgeNo || "").trim(), odemeYontemi: odeme.yontem,
                oncekiBakiye, sonrakiBakiye: musteri.bakiye, bakiyeDegisimi: tutar,
                tarih: body.tarih || new Date(), kullaniciId: req.kullanici?._id || req.user?._id || null
            });
            const paraHareket = hesap ? await ParaHareket.create({
                tenantId: tId, hesapTipi: odeme.hesapTipi, hesapId: hesap._id, tip: "CIKIS", tutar,
                aciklama: String(body.aciklama || "Müşteriye ödeme").trim(), kaynak: "MUSTERI_ODEME",
                kaynakId: cariHareket._id, belgeNo: String(body.belgeNo || "").trim(), tarih: body.tarih || new Date(),
                kullaniciId: req.kullanici?._id || req.user?._id || null
            }) : null;
            return res.status(201).json({ basarili: true, mesaj: "Müşteri ödemesi kaydedildi.", musteriBakiye: musteri.bakiye, cariHareket, paraHareket });
        } catch (error) {
            musteri.bakiye = oncekiBakiye; await musteri.save();
            if (hesap) { hesap.bakiye += tutar; await hesap.save(); }
            throw error;
        }
    } catch (error) { next(error); }
}

async function musteriBakiyeDuzelt(req, res, next) {
    try {
        const tId = tenantId(req), body = req.body || {}, yeniBakiye = Number(body.yeniBakiye);
        if (!mongoose.Types.ObjectId.isValid(String(req.params.musteriId || "")) || !Number.isFinite(yeniBakiye)) {
            return res.status(400).json({ basarili: false, mesaj: "Geçerli müşteri ve yeni bakiye zorunludur." });
        }
        const musteri = await Musteri.findOne({ _id: req.params.musteriId, tenantId: tId });
        if (!musteri) return res.status(404).json({ basarili: false, mesaj: "Müşteri bulunamadı." });
        const oncekiBakiye = Number(musteri.bakiye || 0), fark = yeniBakiye - oncekiBakiye;
        if (Math.abs(fark) < 0.000001) return res.status(409).json({ basarili: false, mesaj: "Yeni bakiye mevcut bakiyeyle aynı." });
        musteri.bakiye = yeniBakiye; await musteri.save();
        try {
            const hareket = await CariHareket.create({
                tenantId: tId, tarafTipi: "MUSTERI", tarafId: musteri._id, tip: "DUZELTME", tutar: Math.abs(fark),
                aciklama: String(body.aciklama || "Yetkili cari bakiye düzeltmesi").trim(), kaynak: "BAKIYE_DUZELTME",
                belgeNo: String(body.belgeNo || "").trim(), bakiyeDegisimi: fark, oncekiBakiye, sonrakiBakiye: yeniBakiye,
                tarih: body.tarih || new Date(), kullaniciId: req.kullanici?._id || req.user?._id || null
            });
            return res.json({ basarili: true, mesaj: "Cari bakiye düzeltildi.", oncekiBakiye, musteriBakiye: yeniBakiye, fark, hareket });
        } catch (error) { musteri.bakiye = oncekiBakiye; await musteri.save(); throw error; }
    } catch (error) { next(error); }
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

        const odeme = odemeBilgisi(body);
        if (!odeme) return res.status(400).json({ basarili: false, mesaj: "Ödeme yöntemi nakit, kredi kartı, senet veya çek olmalıdır." });

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

        const hesap = odeme.hesapTipi ? await hesapBul(req, odeme.hesapTipi, body.hesapId) : null;

        if (odeme.hesapTipi && !hesap) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Ödeme hesabı bulunamadı."
            });
        }

        if (hesap && hesap.bakiye < tutar) {
            return res.status(409).json({
                basarili: false,
                mesaj: "Ödeme hesabında yeterli bakiye yok."
            });
        }

        tedarikci.bakiye -= tutar;
        if (hesap) hesap.bakiye -= tutar;

        await tedarikci.save();
        if (hesap) await hesap.save();

        const cariHareket = await CariHareket.create({
            tenantId: tId,
            tarafTipi: "TEDARIKCI",
            tarafId: tedarikci._id,
            tip: "ODEME",
            tutar,
            aciklama: body.aciklama || "Tedarikçi ödemesi",
            kaynak: "ODEME",
            belgeNo: body.belgeNo || "",
            odemeYontemi: odeme.yontem,
            tarih: body.tarih || new Date(),
            kullaniciId:
                req.kullanici?._id ||
                req.user?._id ||
                null
        });

        const paraHareket = hesap ? await ParaHareket.create({
            tenantId: tId,
            hesapTipi: odeme.hesapTipi,
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
        }) : null;

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

async function tedarikciManuelHareket(req, res, next) {
    try {
        const tId = tenantId(req), body = req.body || {}, tutar = Number(body.tutar || 0), tip = String(body.tip || "").toUpperCase();
        if (!mongoose.Types.ObjectId.isValid(String(body.tedarikciId || "")) || !["BORC", "ALACAK", "MASRAF"].includes(tip) || !Number.isFinite(tutar) || tutar <= 0) return res.status(400).json({ basarili: false, mesaj: "Tedarikçi, işlem türü ve pozitif tutar zorunludur." });
        const hareketTipi = tip === "MASRAF" ? "ALACAK" : tip, degisim = hareketTipi === "ALACAK" ? tutar : -tutar;
        const tedarikci = await Tedarikci.findOneAndUpdate({ _id: body.tedarikciId, tenantId: tId }, { $inc: { bakiye: degisim } }, { new: true });
        if (!tedarikci) return res.status(404).json({ basarili: false, mesaj: "Tedarikçi bulunamadı." });
        try {
            const hareket = await CariHareket.create({ tenantId: tId, tarafTipi: "TEDARIKCI", tarafId: tedarikci._id, tip: hareketTipi, tutar, bakiyeDegisimi: degisim, sonrakiBakiye: tedarikci.bakiye, oncekiBakiye: Number(tedarikci.bakiye) - degisim, aciklama: String(body.aciklama || "Manuel tedarikçi cari işlemi").trim(), kaynak: tip === "MASRAF" ? "MASRAF" : "MANUEL", belgeNo: String(body.belgeNo || "").trim(), tarih: body.tarih || new Date(), kullaniciId: req.kullanici?._id || req.user?._id || null });
            return res.status(201).json({ basarili: true, mesaj: "Tedarikçi cari hareketi kaydedildi.", tedarikciBakiye: tedarikci.bakiye, hareket });
        } catch (error) { await Tedarikci.updateOne({ _id: tedarikci._id, tenantId: tId }, { $inc: { bakiye: -degisim } }); throw error; }
    } catch (error) { next(error); }
}

async function tedarikciBakiyeDuzelt(req, res, next) {
    try {
        const tId = tenantId(req), body = req.body || {}, yeniBakiye = Number(body.yeniBakiye);
        if (!mongoose.Types.ObjectId.isValid(String(req.params.tedarikciId || "")) || !Number.isFinite(yeniBakiye)) return res.status(400).json({ basarili: false, mesaj: "Geçerli tedarikçi ve yeni bakiye zorunludur." });
        const tedarikci = await Tedarikci.findOne({ _id: req.params.tedarikciId, tenantId: tId });
        if (!tedarikci) return res.status(404).json({ basarili: false, mesaj: "Tedarikçi bulunamadı." });
        const oncekiBakiye = Number(tedarikci.bakiye || 0), fark = yeniBakiye - oncekiBakiye;
        if (Math.abs(fark) < 0.000001) return res.status(409).json({ basarili: false, mesaj: "Yeni bakiye mevcut bakiyeyle aynı." });
        tedarikci.bakiye = yeniBakiye; await tedarikci.save();
        try { const hareket = await CariHareket.create({ tenantId: tId, tarafTipi: "TEDARIKCI", tarafId: tedarikci._id, tip: "DUZELTME", tutar: Math.abs(fark), bakiyeDegisimi: fark, oncekiBakiye, sonrakiBakiye: yeniBakiye, aciklama: String(body.aciklama || "Yetkili tedarikçi bakiye düzeltmesi").trim(), kaynak: "BAKIYE_DUZELTME", belgeNo: String(body.belgeNo || "").trim(), tarih: body.tarih || new Date(), kullaniciId: req.kullanici?._id || req.user?._id || null }); return res.json({ basarili: true, mesaj: "Tedarikçi bakiyesi düzeltildi.", tedarikciBakiye: yeniBakiye, hareket }); }
        catch (error) { tedarikci.bakiye = oncekiBakiye; await tedarikci.save(); throw error; }
    } catch (error) { next(error); }
}

async function tedarikciTahsilat(req, res, next) {
    try {
        const tId = tenantId(req), body = req.body || {}, tutar = Number(body.tutar || 0), odeme = odemeBilgisi(body);
        if (!mongoose.Types.ObjectId.isValid(String(body.tedarikciId || "")) || !Number.isFinite(tutar) || tutar <= 0 || !odeme) return res.status(400).json({ basarili: false, mesaj: "Tedarikçi, pozitif tutar ve geçerli ödeme yöntemi zorunludur." });
        const tedarikci = await Tedarikci.findOne({ _id: body.tedarikciId, tenantId: tId }); if (!tedarikci) return res.status(404).json({ basarili: false, mesaj: "Tedarikçi bulunamadı." });
        const hesap = odeme.hesapTipi ? await hesapBul(req, odeme.hesapTipi, body.hesapId) : null; if (odeme.hesapTipi && !hesap) return res.status(404).json({ basarili: false, mesaj: "Tahsilat hesabı bulunamadı." });
        const oncekiBakiye = Number(tedarikci.bakiye || 0); tedarikci.bakiye = oncekiBakiye + tutar; if (hesap) hesap.bakiye += tutar; await tedarikci.save(); if (hesap) await hesap.save();
        try { const cariHareket = await CariHareket.create({ tenantId: tId, tarafTipi: "TEDARIKCI", tarafId: tedarikci._id, tip: "TAHSILAT", tutar, bakiyeDegisimi: tutar, oncekiBakiye, sonrakiBakiye: tedarikci.bakiye, odemeYontemi: odeme.yontem, aciklama: String(body.aciklama || "Tedarikçiden tahsilat").trim(), kaynak: "TEDARIKCI_TAHSILAT", belgeNo: String(body.belgeNo || "").trim(), tarih: body.tarih || new Date(), kullaniciId: req.kullanici?._id || req.user?._id || null }); const paraHareket = hesap ? await ParaHareket.create({ tenantId: tId, hesapTipi: odeme.hesapTipi, hesapId: hesap._id, tip: "GIRIS", tutar, aciklama: String(body.aciklama || "Tedarikçiden tahsilat").trim(), kaynak: "TEDARIKCI_TAHSILAT", kaynakId: cariHareket._id, belgeNo: String(body.belgeNo || "").trim(), tarih: body.tarih || new Date(), kullaniciId: req.kullanici?._id || req.user?._id || null }) : null; return res.status(201).json({ basarili: true, mesaj: "Tedarikçi tahsilatı kaydedildi.", tedarikciBakiye: tedarikci.bakiye, cariHareket, paraHareket }); }
        catch (error) { tedarikci.bakiye = oncekiBakiye; await tedarikci.save(); if (hesap) { hesap.bakiye -= tutar; await hesap.save(); } throw error; }
    } catch (error) { next(error); }
}

module.exports = {
    ozet,
    hareketler,
    musteriTahsilat,
    musteriOdeme,
    musteriBakiyeDuzelt,
    tedarikciOdeme,
    tedarikciTahsilat,
    tedarikciManuelHareket,
    tedarikciBakiyeDuzelt,
    musteriManuelHareket,
    ekstrePaylas,
    paylasilanEkstre
};
