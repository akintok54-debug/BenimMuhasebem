const mongoose = require("mongoose");

const Siparis = require("../models/Siparis");
const Stok = require("../models/Stok");
const StokHareket = require("../models/StokHareket");
const Satis = require("../models/Satis");
const Musteri = require("../models/Musteri");
const Depo = require("../models/Depo");

function tenantId(req) {
    return new mongoose.Types.ObjectId(String(req.tenantId));
}

async function listele(req, res, next) {
    try {
        const siparisler = await Siparis.find({
            tenantId: tenantId(req)
        })
            .populate("musteriId", "kod unvan adSoyad")
            .populate("depoId", "kod ad")
            .sort({ tarih: -1 })
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

async function satisdonustur(req, res, next) {
    try {
        const tId = tenantId(req);

        const siparis = await Siparis.findOne({
            _id: req.params.id,
            tenantId: tId
        });

        if (!siparis) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Sipariş bulunamadı."
            });
        }

        if (siparis.satisId) {
            return res.status(409).json({
                basarili: false,
                mesaj: "Bu sipariş zaten satışa dönüştürülmüş."
            });
        }

        if (!["ONAYLANDI", "HAZIRLANIYOR"].includes(siparis.durum)) {
            return res.status(409).json({
                basarili: false,
                mesaj: "Sipariş satışa uygun durumda değil."
            });
        }

        const musteri = await Musteri.findOne({
            _id: siparis.musteriId,
            tenantId: tId
        });

        const depo = await Depo.findOne({
            _id: siparis.depoId,
            tenantId: tId
        });

        if (!musteri || !depo) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Müşteri veya depo bulunamadı."
            });
        }

        const stokKontrolleri = [];

        for (const kalem of siparis.kalemler) {
            const stok = await Stok.findOne({
                tenantId: tId,
                urunId: kalem.urunId,
                depoId: depo._id
            });

            if (!stok || stok.miktar < kalem.miktar) {
                return res.status(409).json({
                    basarili: false,
                    mesaj: "Sipariş için yeterli stok yok."
                });
            }

            stokKontrolleri.push({
                stok,
                miktar: kalem.miktar
            });
        }

        const belgeNo =
            String(req.body?.belgeNo || siparis.siparisNo)
                .trim()
                .toUpperCase();

        const mevcutSatis = await Satis.findOne({
            tenantId: tId,
            belgeNo
        });

        if (mevcutSatis) {
            return res.status(409).json({
                basarili: false,
                mesaj: "Bu satış belge numarası zaten kullanılıyor."
            });
        }

        const satis = await Satis.create({
            tenantId: tId,
            belgeNo,
            tarih: new Date(),
            musteriId: musteri._id,
            depoId: depo._id,
            kalemler: siparis.kalemler,
            araToplam: siparis.araToplam,
            toplamKdv: siparis.toplamKdv,
            genelToplam: siparis.genelToplam,
            odemeDurumu: "ACIK",
            odemeTipi: "ACIK_HESAP",
            notlar: `Sipariş ${siparis.siparisNo}`,
            kullaniciId: req.kullanici?._id || null
        });

        for (const item of stokKontrolleri) {
            item.stok.miktar -= item.miktar;
            item.stok.sonHareketTarihi = new Date();
            await item.stok.save();

            await StokHareket.create({
                tenantId: tId,
                urunId: item.stok.urunId,
                depoId: depo._id,
                tip: "CIKIS",
                miktar: item.miktar,
                birimMaliyet: item.stok.maliyet || 0,
                kaynak: "SIPARIS",
                kaynakId: siparis._id,
                aciklama: `Sipariş ${siparis.siparisNo}`,
                kullaniciId: req.kullanici?._id || null
            });
        }

        musteri.bakiye += siparis.genelToplam;
        await musteri.save();

        siparis.satisId = satis._id;
        siparis.durum = "TAMAMLANDI";
        await siparis.save();

        res.status(201).json({
            basarili: true,
            mesaj: "Sipariş satışa dönüştürüldü.",
            siparis,
            satis,
            musteriBakiye: musteri.bakiye
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    listele,
    satisdonustur
};
