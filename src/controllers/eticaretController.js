const mongoose = require("mongoose");

const EticaretSiparis = require("../models/EticaretSiparis");
const Musteri = require("../models/Musteri");
const Urun = require("../models/Urun");

function tenantId(req) {
    return new mongoose.Types.ObjectId(String(req.tenantId));
}

async function listele(req, res, next) {
    try {
        const siparisler = await EticaretSiparis.find({
            tenantId: tenantId(req)
        })
            .populate("musteriId", "kod unvan adSoyad telefon whatsapp")
            .populate("urunler.urunId", "kod barkod ad")
            .sort({ createdAt: -1 })
            .lean();

        res.json({
            basarili: true,
            toplam: siparisler.length,
            siparisler
        });
    } catch (error) {
        next(error);
    }
}

async function al(req, res, next) {
    try {
        const tId = tenantId(req);
        const body = req.body || {};

        if (!body.platform || !body.platformSiparisNo) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Platform ve platform sipariş numarası zorunludur."
            });
        }

        if (!Array.isArray(body.urunler) || body.urunler.length === 0) {
            return res.status(400).json({
                basarili: false,
                mesaj: "En az bir ürün bulunmalıdır."
            });
        }

        const mevcut = await EticaretSiparis.findOne({
            tenantId: tId,
            platform: String(body.platform).trim().toUpperCase(),
            platformSiparisNo: String(body.platformSiparisNo).trim()
        });

        if (mevcut) {
            return res.status(409).json({
                basarili: false,
                mesaj: "Bu platform siparişi daha önce alınmış."
            });
        }

        let musteriId = null;

        if (body.musteriId) {
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

            musteriId = musteri._id;
        }

        const urunler = [];
        let toplam = 0;

        for (const item of body.urunler) {
            const urun = await Urun.findOne({
                _id: item.urunId,
                tenantId: tId
            });

            if (!urun) {
                return res.status(404).json({
                    basarili: false,
                    mesaj: `Ürün bulunamadı: ${item.urunId}`
                });
            }

            const miktar = Number(item.miktar || 0);
            const birimFiyat = Number(item.birimFiyat || 0);

            if (miktar <= 0) {
                return res.status(400).json({
                    basarili: false,
                    mesaj: "Ürün miktarı sıfırdan büyük olmalıdır."
                });
            }

            urunler.push({
                urunId: urun._id,
                miktar,
                birimFiyat
            });

            toplam += miktar * birimFiyat;
        }

        const siparis = await EticaretSiparis.create({
            tenantId: tId,
            platform: String(body.platform).trim().toUpperCase(),
            platformSiparisNo: String(body.platformSiparisNo).trim(),
            musteriId,
            urunler,
            toplam,
            durum: "ALINDI",
            hamVeri: body.hamVeri || body
        });

        res.status(201).json({
            basarili: true,
            siparis
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    listele,
    al
};
