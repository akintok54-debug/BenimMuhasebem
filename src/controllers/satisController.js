const mongoose = require("mongoose");

const Satis = require("../models/Satis");
const Urun = require("../models/Urun");
const Depo = require("../models/Depo");
const Stok = require("../models/Stok");
const StokHareket = require("../models/StokHareket");
const Musteri = require("../models/Musteri");
const Kasa = require("../models/Kasa");
const Banka = require("../models/Banka");
const ParaHareket = require("../models/ParaHareket");
const CariHareket = require("../models/CariHareket");
const SatisIade = require("../models/SatisIade");

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
        const satislar = await Satis.find({
            tenantId: tenantObjectId(req)
        })
            .populate("musteriId", "kod unvan adSoyad")
            .populate("depoId", "kod ad")
            .populate("kalemler.urunId", "kod ad birim")
            .sort({ tarih: -1, createdAt: -1 })
            .lean();

        res.json({
            basarili: true,
            toplam: satislar.length,
            satislar
        });
    } catch (error) {
        next(error);
    }
}

async function iadeleriListele(req, res, next) {
    try {
        const iadeler = await SatisIade.find({ tenantId: tenantObjectId(req) })
            .populate("musteriId", "kod unvan adSoyad email telefon whatsapp")
            .populate("depoId", "kod ad")
            .populate("kalemler.urunId", "kod ad birim")
            .sort({ tarih: -1, createdAt: -1 }).lean();
        res.json({ basarili: true, toplam: iadeler.length, iadeler });
    } catch (error) { next(error); }
}

async function detay(req, res, next) {
    try {
        const satis = await Satis.findOne({
            _id: req.params.id,
            tenantId: tenantObjectId(req)
        })
            .populate("musteriId")
            .populate("depoId")
            .populate("kalemler.urunId")
            .lean();

        if (!satis) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Satış kaydı bulunamadı."
            });
        }

        res.json({
            basarili: true,
            satis
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

        if (!body.musteriId || !body.depoId) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Müşteri ve depo zorunludur."
            });
        }

        if (!Array.isArray(body.kalemler) || body.kalemler.length === 0) {
            return res.status(400).json({
                basarili: false,
                mesaj: "En az bir satış kalemi bulunmalıdır."
            });
        }

        const musteri = await Musteri.findOne({
            _id: body.musteriId,
            tenantId
        });

        if (!musteri) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Müşteri bulunamadı."
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

        const belgeNo = String(body.belgeNo)
            .trim()
            .toUpperCase();

        const mevcut = await Satis.findOne({
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

        // Önce bütün stokları doğrula.
        const stokKontrolleri = [];

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

            const stok = await Stok.findOne({
                tenantId,
                urunId: urun._id,
                depoId: depo._id
            });

            const miktar = Number(item.miktar || 0);

            if (!stok || stok.miktar < miktar) {
                return res.status(409).json({
                    basarili: false,
                    mesaj: `Yetersiz stok: ${urun.kod}`
                });
            }

            const kalem = hesaplaKalem({
                urunId: urun._id,
                miktar,
                birimFiyat:
                    item.birimFiyat ??
                    urun.satisFiyati ??
                    0,
                kdv: item.kdv ?? urun.kdv ?? 20,
                iskonto: item.iskonto || 0
            });

            kalemler.push(kalem);
            stokKontrolleri.push({
                stok,
                miktar
            });

            araToplam += kalem.araToplam;
            toplamKdv += kalem.kdvTutari;
            genelToplam += kalem.toplam;
        }

        const odemeTipi =
            body.odemeTipi || "ACIK_HESAP";

        let odemeDurumu =
            body.odemeDurumu || "ACIK";

        let odenenTutar =
            Number(body.odenenTutar || 0);

        if (odemeDurumu === "ACIK") {
            odenenTutar = 0;
        }

        if (odemeDurumu === "ODENDI") {
            odenenTutar = genelToplam;
        }

        if (
            odenenTutar < 0 ||
            odenenTutar > genelToplam
        ) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Ödenen tutar satış toplamını aşamaz."
            });
        }

        if (
            odemeDurumu === "KISMI" &&
            (
                odenenTutar <= 0 ||
                odenenTutar >= genelToplam
            )
        ) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Kısmi ödemede ödenen tutar toplamdan küçük olmalıdır."
            });
        }

        if (
            odemeDurumu === "ODENDI" &&
            odenenTutar !== genelToplam
        ) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Ödenmiş satışta ödeme tutarı toplamla aynı olmalıdır."
            });
        }

        const kalanTutar =
            genelToplam - odenenTutar;

        let hesapTipi =
            body.hesapTipi || null;

        let hesapId =
            body.hesapId || null;

        const finansOdemeTipleri = [
            "NAKIT",
            "KART",
            "BANKA"
        ];

        if (
            odenenTutar > 0 &&
            finansOdemeTipleri.includes(odemeTipi) &&
            !hesapId
        ) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Ödeme hesabı seçilmelidir."
            });
        }

        if (
            odemeTipi === "NAKIT" &&
            hesapTipi !== "KASA"
        ) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Nakit satış için kasa hesabı seçilmelidir."
            });
        }

        if (
            ["KART", "BANKA"].includes(odemeTipi) &&
            hesapTipi !== "BANKA"
        ) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Kart veya banka ödemesi için banka hesabı seçilmelidir."
            });
        }

        let finansHesabi = null;

        if (
            odenenTutar > 0 &&
            hesapId &&
            hesapTipi
        ) {

            if (hesapTipi === "KASA") {

                finansHesabi =
                    await Kasa.findOne({
                        _id: hesapId,
                        tenantId
                    });

            } else {

                finansHesabi =
                    await Banka.findOne({
                        _id: hesapId,
                        tenantId
                    });
            }

            if (!finansHesabi) {
                return res.status(404).json({
                    basarili: false,
                    mesaj: "Ödeme hesabı bulunamadı."
                });
            }
        }

        const satis = await Satis.create({
            tenantId,
            belgeNo,
            tarih: body.tarih || new Date(),
            musteriId: musteri._id,
            depoId: depo._id,
            kalemler,
            araToplam,
            toplamKdv,
            genelToplam,
            odemeDurumu,
            odemeTipi,
            odenenTutar,
            kalanTutar,
            hesapTipi,
            hesapId,
            notlar: body.notlar || "",
            kullaniciId:
                req.kullanici?._id ||
                req.user?._id ||
                null
        });

        // SATIŞ -> STOK ÇIKIŞI
        for (const item of stokKontrolleri) {

            item.stok.miktar -= item.miktar;
            item.stok.sonHareketTarihi = new Date();

            await item.stok.save();

            const kalem =
                kalemler.find(
                    x => String(x.urunId) === String(item.stok.urunId)
                );

            await StokHareket.create({
                tenantId,
                urunId: item.stok.urunId,
                depoId: depo._id,
                tip: "CIKIS",
                miktar: item.miktar,
                birimMaliyet: item.stok.maliyet || 0,
                kaynak: "SATIS",
                kaynakId: satis._id,
                aciklama: `Satış ${belgeNo}`,
                kullaniciId:
                    req.kullanici?._id ||
                    req.user?._id ||
                    null
            });
        }

        // ==================================================
        // SATIŞ ÖDEME BALANTISI
        // ==================================================

        if (kalanTutar > 0) {

            musteri.bakiye += kalanTutar;

            await musteri.save();

            await CariHareket.create({
                tenantId,
                tarafTipi: "MUSTERI",
                tarafId: musteri._id,
                tip: "BORC",
                tutar: kalanTutar,
                aciklama: `Satış ${belgeNo}`,
                kaynak: "SATIS",
                kaynakId: satis._id,
                tarih: body.tarih || new Date(),
                kullaniciId: req.kullanici?._id || req.user?._id || null
            });
        }

        if (
            odenenTutar > 0 &&
            finansHesabi
        ) {

            finansHesabi.bakiye +=
                odenenTutar;

            await finansHesabi.save();

            await ParaHareket.create({

                tenantId,

                hesapTipi,

                hesapId:
                    finansHesabi._id,

                tip:
                    "GIRIS",

                tutar:
                    odenenTutar,

                aciklama:
                    `Satış ${belgeNo}`,

                kaynak:
                    "SATIS",

                kaynakId:
                    satis._id,

                tarih:
                    body.tarih || new Date(),

                kullaniciId:
                    req.kullanici?._id ||
                    req.user?._id ||
                    null
            });
        }

        res.status(201).json({
            basarili: true,
            mesaj: "Satış kaydedildi. Stok güncellendi.",
            satis,
            musteriBakiye: musteri.bakiye
        });
    } catch (error) {
        next(error);
    }
}

async function iadeAl(req, res, next) {
    try {
        const tenantId = tenantObjectId(req);
        const body = req.body || {};
        if (!body.belgeNo || !body.musteriId || !body.depoId) return res.status(400).json({ basarili: false, mesaj: "İade belge no, müşteri ve depo zorunludur." });
        if (!Array.isArray(body.kalemler) || !body.kalemler.length) return res.status(400).json({ basarili: false, mesaj: "En az bir iade kalemi gerekir." });
        const [musteri, depo] = await Promise.all([Musteri.findOne({ _id: body.musteriId, tenantId }), Depo.findOne({ _id: body.depoId, tenantId })]);
        if (!musteri || !depo) return res.status(404).json({ basarili: false, mesaj: "Müşteri veya depo bulunamadı." });
        const kalemler = []; let genelToplam = 0;
        for (const item of body.kalemler) {
            const urun = await Urun.findOne({ _id: item.urunId, tenantId });
            const miktar = Number(item.miktar || 0), birimFiyat = Number(item.birimFiyat ?? urun?.satisFiyati ?? 0), kdv = Number(item.kdv ?? urun?.kdv ?? 20), iskonto = Number(item.iskonto || 0);
            if (!urun || miktar <= 0 || birimFiyat < 0) return res.status(400).json({ basarili: false, mesaj: "İade kalemi geçersiz." });
            const ara = miktar * birimFiyat * (1 - iskonto / 100); const toplam = ara * (1 + kdv / 100);
            kalemler.push({ urunId: urun._id, miktar, birimFiyat, kdv, iskonto, toplam }); genelToplam += toplam;
        }
        const iade = await SatisIade.create({ tenantId, belgeNo: String(body.belgeNo).trim().toUpperCase(), tarih: body.tarih || new Date(), musteriId: musteri._id, depoId: depo._id, kalemler, genelToplam, aciklama: body.notlar || "Müşteri satış iadesi", kullaniciId: req.kullanici?._id || req.user?._id || null });
        for (const kalem of kalemler) {
            let stok = await Stok.findOne({ tenantId, urunId: kalem.urunId, depoId: depo._id });
            if (!stok) stok = new Stok({ tenantId, urunId: kalem.urunId, depoId: depo._id, miktar: 0, maliyet: 0 });
            stok.miktar += kalem.miktar; stok.sonHareketTarihi = new Date(); await stok.save();
            await StokHareket.create({ tenantId, urunId: kalem.urunId, depoId: depo._id, tip: "IADE_GIRIS", miktar: kalem.miktar, birimMaliyet: kalem.birimFiyat, kaynak: "SATIS_IADE", kaynakId: iade._id, aciklama: `Satış iadesi ${iade.belgeNo}`, kullaniciId: req.kullanici?._id || req.user?._id || null });
        }
        musteri.bakiye -= genelToplam; await musteri.save();
        const cariHareket = await CariHareket.create({ tenantId, tarafTipi: "MUSTERI", tarafId: musteri._id, tip: "IADE", tutar: genelToplam, aciklama: `Satış iadesi ${iade.belgeNo}`, kaynak: "SATIS_IADE", kaynakId: iade._id, tarih: body.tarih || new Date(), kullaniciId: req.kullanici?._id || req.user?._id || null });
        res.status(201).json({ basarili: true, iade, cariHareket, musteriBakiye: musteri.bakiye });
    } catch (error) { next(error); }
}

module.exports = {
    listele,
    detay,
    olustur,
    iadeAl,
    iadeleriListele
};

