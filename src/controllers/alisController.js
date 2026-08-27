const mongoose = require("mongoose");

const Alis = require("../models/Alis");
const Urun = require("../models/Urun");
const Depo = require("../models/Depo");
const Stok = require("../models/Stok");
const StokHareket = require("../models/StokHareket");
const Tedarikci = require("../models/Tedarikci");
const CariHareket = require("../models/CariHareket");
const Kasa = require("../models/Kasa");
const Banka = require("../models/Banka");
const ParaHareket = require("../models/ParaHareket");
const AlisIade = require("../models/AlisIade");
const SatinAlmaSiparis = require("../models/SatinAlmaSiparis");

function tenantObjectId(req) {
    return new mongoose.Types.ObjectId(String(req.tenantId));
}

function hesaplaKalem(kalem) {
    const miktar = Number(kalem.miktar || 0);
    const birimFiyat = Number(kalem.birimFiyat || 0);
    const kdv = Number(kalem.kdv ?? 20);
    const iskonto = Number(kalem.iskonto || 0);

    const brut = miktar * birimFiyat;
    const iskontoTutari = brut * (iskonto / 100);
    const araToplam = brut - iskontoTutari;
    const kdvTutari = araToplam * (kdv / 100);
    const toplam = araToplam + kdvTutari;

    return {
        ...kalem,
        miktar,
        birimFiyat,
        kdv,
        iskonto,
        araToplam,
        kdvTutari,
        toplam
    };
}

async function listele(req, res, next) {
    try {
        const tenantId = tenantObjectId(req);

        const filter = { tenantId };
        if (req.query.tedarikciId) filter.tedarikciId = req.query.tedarikciId;

        const alislar = await Alis.find(filter)
            .populate("tedarikciId", "kod unvan adSoyad")
            .populate("depoId", "kod ad")
            .sort({ tarih: -1, createdAt: -1 })
            .lean();

        return res.json({
            basarili: true,
            toplam: alislar.length,
            alislar
        });
    } catch (error) {
        next(error);
    }
}

async function detay(req, res, next) {
    try {
        const alis = await Alis.findOne({
            _id: req.params.id,
            tenantId: tenantObjectId(req)
        })
            .populate("tedarikciId")
            .populate("depoId")
            .populate("kalemler.urunId")
            .lean();

        if (!alis) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Alış kaydı bulunamadı."
            });
        }

        return res.json({
            basarili: true,
            alis
        });
    } catch (error) {
        next(error);
    }
}

async function olustur(req, res, next) {
    try {
        const tenantId = tenantObjectId(req);
        const body = req.body || {};

        if (!body.belgeNo) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Belge numarası zorunludur."
            });
        }

        if (!body.tedarikciId || !body.depoId) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Tedarikçi ve depo zorunludur."
            });
        }

        if (!Array.isArray(body.kalemler) || body.kalemler.length === 0) {
            return res.status(400).json({
                basarili: false,
                mesaj: "En az bir alış kalemi bulunmalıdır."
            });
        }

        const tedarikci = await Tedarikci.findOne({
            _id: body.tedarikciId,
            tenantId
        });

        if (!tedarikci) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Tedarikçi bulunamadı."
            });
        }

        const depo = await Depo.findOne({
            _id: body.depoId,
            tenantId
        });

        if (!depo) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Depo bulunamadı."
            });
        }

        const belgeNo = String(body.belgeNo).trim().toUpperCase();

        const mevcut = await Alis.findOne({
            tenantId,
            belgeNo
        });

        if (mevcut) {
            return res.status(409).json({
                basarili: false,
                mesaj: "Bu belge numarası zaten kullanılıyor."
            });
        }

        const kalemler = [];
        let araToplam = 0;
        let toplamKdv = 0;
        let genelToplam = 0;

        for (const item of body.kalemler) {
            const urun = await Urun.findOne({
                _id: item.urunId,
                tenantId
            });

            if (!urun) {
                return res.status(404).json({
                    basarili: false,
                    mesaj: `Ürün bulunamadı: ${item.urunId}`
                });
            }

            const kalem = hesaplaKalem({
                urunId: urun._id,
                miktar: item.miktar,
                birimFiyat: item.birimFiyat,
                kdv: item.kdv ?? urun.kdv ?? 20,
                iskonto: item.iskonto || 0
            });

            kalemler.push(kalem);

            araToplam += kalem.araToplam;
            toplamKdv += kalem.kdvTutari;
            genelToplam += kalem.toplam;
        }

        const odemeDurumu =
            body.odemeDurumu || "ACIK";

        const odemeTipi =
            body.odemeTipi || "NAKIT";

        let odenenTutar =
            Number(body.odenenTutar || 0);

        if (odemeDurumu === "ACIK") {
            odenenTutar = 0;
        }

        if (odemeDurumu === "ODENDI") {
            odenenTutar = genelToplam;
        }

        if (odemeDurumu === "KISMI") {
            if (
                odenenTutar <= 0 ||
                odenenTutar >= genelToplam
            ) {
                return res.status(400).json({
                    basarili: false,
                    mesaj: "Kısmi ödemede ödenen tutar, toplamdan küçük ve sıfırdan büyük olmalıdır."
                });
            }
        }

        if (odenenTutar < 0 || odenenTutar > genelToplam) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Ödenen tutar alış toplamını aşamaz."
            });
        }

        const kalanTutar =
            genelToplam - odenenTutar;

        let odemeHesabi = null;
        const hesapTipi = String(body.hesapTipi || "").toUpperCase();
        if (odenenTutar > 0) {
            if (!["KASA", "BANKA"].includes(hesapTipi) || !mongoose.Types.ObjectId.isValid(String(body.hesapId || ""))) {
                return res.status(400).json({ basarili: false, mesaj: "Ödenen alış için kasa veya banka hesabı zorunludur." });
            }
            const HesapModeli = hesapTipi === "KASA" ? Kasa : Banka;
            odemeHesabi = await HesapModeli.findOne({ _id: body.hesapId, tenantId, aktif: true });
            if (!odemeHesabi) return res.status(404).json({ basarili: false, mesaj: "Ödeme hesabı bulunamadı." });
            if (Number(odemeHesabi.bakiye || 0) < odenenTutar) return res.status(409).json({ basarili: false, mesaj: "Ödeme hesabında yeterli bakiye yok." });
        }

        const alis = await Alis.create({
            tenantId,
            belgeNo,
            tarih: body.tarih || new Date(),
            tedarikciId: tedarikci._id,
            depoId: depo._id,
            kalemler,
            araToplam,
            toplamKdv,
            genelToplam,
            odemeDurumu,
            odemeTipi,
            odenenTutar,
            kalanTutar,
            notlar: body.notlar || "",
            kullaniciId:
                req.kullanici?._id ||
                req.user?._id ||
                null
        });

        /*
         * ALIŞ -> STOK GRŞ
         */
        for (const kalem of kalemler) {
            const stok = await Stok.findOneAndUpdate(
                {
                    tenantId,
                    urunId: kalem.urunId,
                    depoId: depo._id
                },
                {
                    $inc: {
                        miktar: kalem.miktar
                    },
                    $set: {
                        maliyet: kalem.birimFiyat,
                        sonHareketTarihi: new Date()
                    }
                },
                {
                    new: true,
                    upsert: true,
                    setDefaultsOnInsert: true
                }
            );

            await StokHareket.create({
                tenantId,
                urunId: kalem.urunId,
                depoId: depo._id,
                tip: "GIRIS",
                miktar: kalem.miktar,
                birimMaliyet: kalem.birimFiyat,
                kaynak: "ALIS",
                kaynakId: alis._id,
                aciklama: `Alış ${belgeNo}`,
                kullaniciId:
                    req.kullanici?._id ||
                    req.user?._id ||
                    null
            });

            if (!stok) {
                throw new Error("Stok güncellenemedi.");
            }
        }

        /*
         * AÇIK / KISM ALIŞ -> TEDARKÇ BORCU
         */
        tedarikci.bakiye += kalanTutar;
        await tedarikci.save();

        await CariHareket.create({ tenantId, tarafTipi: "TEDARIKCI", tarafId: tedarikci._id, tip: "ALACAK", tutar: genelToplam, belgeNo, aciklama: `Alış ${belgeNo}`, kaynak: "ALIS", kaynakId: alis._id, tarih: body.tarih || new Date(), kullaniciId: req.kullanici?._id || req.user?._id || null });

        if (odenenTutar > 0) {
            odemeHesabi.bakiye -= odenenTutar;
            await odemeHesabi.save();
            const odemeCari = await CariHareket.create({ tenantId, tarafTipi: "TEDARIKCI", tarafId: tedarikci._id, tip: "ODEME", tutar: odenenTutar, belgeNo, aciklama: `Alış ödemesi ${belgeNo}`, kaynak: "ALIS_ODEME", kaynakId: alis._id, tarih: body.tarih || new Date(), kullaniciId: req.kullanici?._id || req.user?._id || null });
            await ParaHareket.create({ tenantId, hesapTipi, hesapId: odemeHesabi._id, tip: "CIKIS", tutar: odenenTutar, belgeNo, aciklama: `Alış ödemesi ${belgeNo}`, kaynak: "ALIS_ODEME", kaynakId: odemeCari._id, tarih: body.tarih || new Date(), kullaniciId: req.kullanici?._id || req.user?._id || null });
        }

        return res.status(201).json({
            basarili: true,
            mesaj: "Alış kaydedildi. Stok güncellendi.",
            alis,
            tedarikciBakiye: tedarikci.bakiye
        });
    } catch (error) {
        next(error);
    }
}

async function iadeleriListele(req, res, next) {
    try {
        const filter = { tenantId: tenantObjectId(req) };
        if (req.query.tedarikciId) filter.tedarikciId = req.query.tedarikciId;
        const iadeler = await AlisIade.find(filter).populate("tedarikciId", "kod unvan adSoyad").populate("depoId", "kod ad").populate("kalemler.urunId", "kod ad").sort({ tarih: -1 }).lean();
        res.json({ basarili: true, toplam: iadeler.length, iadeler });
    } catch (error) { next(error); }
}

async function iadeOlustur(req, res, next) {
    try {
        const tenantId = tenantObjectId(req), body = req.body || {};
        if (!body.belgeNo || !body.tedarikciId || !body.depoId || !Array.isArray(body.kalemler) || !body.kalemler.length) return res.status(400).json({ basarili: false, mesaj: "İade belge no, tedarikçi, depo ve kalem zorunludur." });
        const [tedarikci, depo] = await Promise.all([Tedarikci.findOne({ _id: body.tedarikciId, tenantId }), Depo.findOne({ _id: body.depoId, tenantId })]);
        if (!tedarikci || !depo) return res.status(404).json({ basarili: false, mesaj: "Tedarikçi veya depo bulunamadı." });
        const kalemler = []; let genelToplam = 0;
        for (const item of body.kalemler) {
            const urun = await Urun.findOne({ _id: item.urunId, tenantId });
            const stok = await Stok.findOne({ tenantId, urunId: item.urunId, depoId: depo._id });
            const kalem = hesaplaKalem({ urunId: item.urunId, miktar: item.miktar, birimFiyat: item.birimFiyat ?? urun?.alisFiyati, kdv: item.kdv ?? urun?.kdv, iskonto: item.iskonto });
            if (!urun || kalem.miktar <= 0 || Number(stok?.miktar || 0) < kalem.miktar) return res.status(409).json({ basarili: false, mesaj: "İade için ürün veya stok miktarı geçersiz." });
            kalemler.push({ urunId: urun._id, miktar: kalem.miktar, birimFiyat: kalem.birimFiyat, kdv: kalem.kdv, iskonto: kalem.iskonto, toplam: kalem.toplam }); genelToplam += kalem.toplam;
        }
        const belgeNo = String(body.belgeNo).trim().toUpperCase();
        const iade = await AlisIade.create({ tenantId, belgeNo, tarih: body.tarih || new Date(), tedarikciId: tedarikci._id, depoId: depo._id, kalemler, genelToplam, aciklama: body.aciklama || "Alış iadesi", kullaniciId: req.kullanici?._id || req.user?._id || null });
        for (const kalem of kalemler) {
            await Stok.updateOne({ tenantId, urunId: kalem.urunId, depoId: depo._id }, { $inc: { miktar: -kalem.miktar }, $set: { sonHareketTarihi: new Date() } });
            await StokHareket.create({ tenantId, urunId: kalem.urunId, depoId: depo._id, tip: "IADE_CIKIS", miktar: kalem.miktar, birimMaliyet: kalem.birimFiyat, kaynak: "ALIS_IADE", kaynakId: iade._id, aciklama: `Alış iadesi ${belgeNo}`, kullaniciId: req.kullanici?._id || req.user?._id || null });
        }
        tedarikci.bakiye -= genelToplam; await tedarikci.save();
        const cariHareket = await CariHareket.create({ tenantId, tarafTipi: "TEDARIKCI", tarafId: tedarikci._id, tip: "IADE", tutar: genelToplam, belgeNo, aciklama: `Alış iadesi ${belgeNo}`, kaynak: "ALIS_IADE", kaynakId: iade._id, tarih: body.tarih || new Date(), kullaniciId: req.kullanici?._id || req.user?._id || null });
        res.status(201).json({ basarili: true, iade, cariHareket, tedarikciBakiye: tedarikci.bakiye });
    } catch (error) { next(error); }
}

async function siparisleriListele(req, res, next) {
    try {
        const filter = { tenantId: tenantObjectId(req) };
        if (req.query.tedarikciId) filter.tedarikciId = req.query.tedarikciId;
        const siparisler = await SatinAlmaSiparis.find(filter).populate("tedarikciId", "kod unvan adSoyad").populate("kalemler.urunId", "kod ad").sort({ tarih: -1 }).lean();
        res.json({ basarili: true, toplam: siparisler.length, siparisler });
    } catch (error) { next(error); }
}

async function siparisOlustur(req, res, next) {
    try {
        const tenantId = tenantObjectId(req), body = req.body || {};
        if (!body.siparisNo || !body.tedarikciId || !Array.isArray(body.kalemler) || !body.kalemler.length) return res.status(400).json({ basarili: false, mesaj: "Sipariş no, tedarikçi ve kalem zorunludur." });
        const tedarikci = await Tedarikci.findOne({ _id: body.tedarikciId, tenantId }); if (!tedarikci) return res.status(404).json({ basarili: false, mesaj: "Tedarikçi bulunamadı." });
        const kalemler = []; let genelToplam = 0;
        for (const item of body.kalemler) { const urun = await Urun.findOne({ _id: item.urunId, tenantId }); if (!urun) return res.status(404).json({ basarili: false, mesaj: "Ürün bulunamadı." }); const k = hesaplaKalem({ urunId: urun._id, miktar: item.miktar, birimFiyat: item.birimFiyat ?? urun.alisFiyati, kdv: item.kdv ?? urun.kdv, iskonto: item.iskonto }); if (k.miktar <= 0) return res.status(400).json({ basarili: false, mesaj: "Miktar geçersiz." }); kalemler.push({ urunId: urun._id, miktar: k.miktar, birimFiyat: k.birimFiyat, kdv: k.kdv, iskonto: k.iskonto, toplam: k.toplam }); genelToplam += k.toplam; }
        const siparis = await SatinAlmaSiparis.create({ tenantId, siparisNo: String(body.siparisNo).trim().toUpperCase(), tarih: body.tarih || new Date(), tedarikciId: tedarikci._id, kalemler, genelToplam, notlar: body.notlar || "", kullaniciId: req.kullanici?._id || req.user?._id || null });
        res.status(201).json({ basarili: true, siparis });
    } catch (error) { next(error); }
}

module.exports = {
    listele,
    detay,
    olustur,
    iadeleriListele,
    iadeOlustur,
    siparisleriListele,
    siparisOlustur
};

