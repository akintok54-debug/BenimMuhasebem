const mongoose = require("mongoose");

const Alis = require("../models/Alis");
const Urun = require("../models/Urun");
const Depo = require("../models/Depo");
const Stok = require("../models/Stok");
const StokHareket = require("../models/StokHareket");
const Tedarikci = require("../models/Tedarikci");

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

        const alislar = await Alis.find({
            tenantId
        })
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
        if (alis.odemeDurumu !== "ODENDI") {
            tedarikci.bakiye += genelToplam;
            await tedarikci.save();
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

module.exports = {
    listele,
    detay,
    olustur
};

