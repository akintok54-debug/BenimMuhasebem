const mongoose = require("mongoose");

const Teklif = require("../models/Teklif");
const Musteri = require("../models/Musteri");
const Urun = require("../models/Urun");
const Siparis = require("../models/Siparis");

function tenantId(req) {
    return new mongoose.Types.ObjectId(String(req.tenantId));
}

function hesapla(item) {
    const miktar = Number(item.miktar || 0);
    const birimFiyat = Number(item.birimFiyat || 0);
    const kdv = Number(item.kdv ?? 20);
    const iskonto = Number(item.iskonto || 0);

    const brut = miktar * birimFiyat;
    const iskontoTutari = brut * iskonto / 100;
    const araToplam = brut - iskontoTutari;
    const kdvTutari = araToplam * kdv / 100;

    return {
        miktar,
        birimFiyat,
        kdv,
        iskonto,
        araToplam,
        kdvTutari,
        toplam: araToplam + kdvTutari
    };
}

async function listele(req, res, next) {
    try {
        const teklifler = await Teklif.find({
            tenantId: tenantId(req)
        })
            .populate("musteriId", "kod unvan adSoyad")
            .sort({ tarih: -1 })
            .lean();

        res.json({
            basarili: true,
            toplam: teklifler.length,
            teklifler
        });
    } catch (error) {
        next(error);
    }
}

async function olustur(req, res, next) {
    try {
        const tId = tenantId(req);
        const body = req.body || {};

        if (!body.teklifNo || !body.musteriId) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Teklif no ve müşteri zorunludur."
            });
        }

        if (!Array.isArray(body.kalemler) || body.kalemler.length === 0) {
            return res.status(400).json({
                basarili: false,
                mesaj: "En az bir teklif kalemi gerekir."
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

        const kalemler = [];
        let araToplam = 0;
        let toplamKdv = 0;
        let genelToplam = 0;

        for (const item of body.kalemler) {
            const urun = await Urun.findOne({
                _id: item.urunId,
                tenantId: tId
            });

            if (!urun) {
                return res.status(404).json({
                    basarili: false,
                    mesaj: "Ürün bulunamadı."
                });
            }

            const hesap = hesapla({
                miktar: item.miktar,
                birimFiyat:
                    item.birimFiyat ??
                    urun.satisFiyati ??
                    0,
                kdv: item.kdv ?? urun.kdv ?? 20,
                iskonto: item.iskonto || 0
            });

            kalemler.push({
                urunId: urun._id,
                ...hesap
            });

            araToplam += hesap.araToplam;
            toplamKdv += hesap.kdvTutari;
            genelToplam += hesap.toplam;
        }

        const teklif = await Teklif.create({
            tenantId: tId,
            teklifNo: String(body.teklifNo).trim().toUpperCase(),
            tarih: body.tarih || new Date(),
            gecerlilikTarihi: body.gecerlilikTarihi || null,
            musteriId: musteri._id,
            kalemler,
            araToplam,
            toplamKdv,
            genelToplam,
            durum: body.durum || "TASLAK",
            notlar: body.notlar || "",
            kullaniciId: req.kullanici?._id || null
        });

        res.status(201).json({
            basarili: true,
            teklif
        });
    } catch (error) {
        next(error);
    }
}

async function onayla(req, res, next) {
    try {
        const teklif = await Teklif.findOne({
            _id: req.params.id,
            tenantId: tenantId(req)
        });

        if (!teklif) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Teklif bulunamadı."
            });
        }

        teklif.durum = "ONAYLANDI";
        await teklif.save();

        res.json({
            basarili: true,
            teklif
        });
    } catch (error) {
        next(error);
    }
}

async function sipariseDonustur(req, res, next) {
    try {
        const tId = tenantId(req);

        const teklif = await Teklif.findOne({
            _id: req.params.id,
            tenantId: tId
        });

        if (!teklif) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Teklif bulunamadı."
            });
        }

        if (teklif.durum !== "ONAYLANDI") {
            return res.status(409).json({
                basarili: false,
                mesaj: "Sadece onaylanmış teklif siparişe dönüştürülebilir."
            });
        }

        const depoId = req.body?.depoId;

        if (!depoId) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Sipariş için depo zorunludur."
            });
        }

        const siparisNo =
            String(req.body.siparisNo || "")
                .trim()
                .toUpperCase();

        if (!siparisNo) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Sipariş numarası zorunludur."
            });
        }

        const siparis = await Siparis.create({
            tenantId: tId,
            siparisNo,
            tarih: new Date(),
            musteriId: teklif.musteriId,
            teklifId: teklif._id,
            depoId,
            kalemler: teklif.kalemler,
            araToplam: teklif.araToplam,
            toplamKdv: teklif.toplamKdv,
            genelToplam: teklif.genelToplam,
            durum: "ONAYLANDI",
            notlar: teklif.notlar,
            kullaniciId: req.kullanici?._id || null
        });

        res.status(201).json({
            basarili: true,
            mesaj: "Teklif siparişe dönüştürüldü.",
            siparis
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    listele,
    olustur,
    onayla,
    sipariseDonustur
};
