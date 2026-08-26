const mongoose = require("mongoose");

const WhatsAppMesaj = require("../models/WhatsAppMesaj");
const Musteri = require("../models/Musteri");

function tenantId(req) {
    return new mongoose.Types.ObjectId(String(req.tenantId));
}

async function listele(req, res, next) {
    try {
        const mesajlar = await WhatsAppMesaj.find({
            tenantId: tenantId(req)
        })
            .populate("musteriId", "kod unvan adSoyad telefon whatsapp")
            .sort({ createdAt: -1 })
            .lean();

        res.json({
            basarili: true,
            toplam: mesajlar.length,
            mesajlar
        });
    } catch (error) {
        next(error);
    }
}

async function kuyrugaEkle(req, res, next) {
    try {
        const tId = tenantId(req);
        const body = req.body || {};

        if (!body.musteriId || !body.mesaj) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Müşteri ve mesaj zorunludur."
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

        const telefon =
            musteri.whatsapp ||
            musteri.telefon ||
            "";

        if (!telefon) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Müşterinin telefon/WhatsApp numarası yok."
            });
        }

        /*
         * BURADA GERÇEK DIŞ SERVSE GÖNDERM YAPMIYORUZ.
         * Mesaj kuyruğa alınır.
         */
        const mesaj = await WhatsAppMesaj.create({
            tenantId: tId,
            musteriId: musteri._id,
            telefon,
            mesaj: String(body.mesaj).trim(),
            tip: body.tip || "GENEL",
            durum: "BEKLIYOR",
            provider: "YOK"
        });

        res.status(201).json({
            basarili: true,
            mesaj: "WhatsApp mesajı kuyruğa alındı. Henüz dış servise gönderilmedi.",
            kayit: mesaj
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    listele,
    kuyrugaEkle
};
