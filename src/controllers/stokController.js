const mongoose = require("mongoose");

const Urun = require("../models/Urun");
const Depo = require("../models/Depo");
const Stok = require("../models/Stok");
const StokHareket = require("../models/StokHareket");
const StokTransfer = require("../models/StokTransfer");
const StokSayim = require("../models/StokSayim");

function tenantId(req) {
    return new mongoose.Types.ObjectId(String(req.tenantId));
}

async function depolar(req, res, next) {
    try {
        const list = await Depo.find({
            tenantId: tenantId(req),
            aktif: true
        })
        .sort({ ad: 1 })
        .lean();

        res.json({
            basarili: true,
            depolar: list
        });
    } catch (error) {
        next(error);
    }
}

async function depoOlustur(req, res, next) {
    try {
        const body = req.body || {};

        if (!body.kod || !body.ad) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Depo kodu ve depo adı zorunludur."
            });
        }

        const depo = await Depo.create({
            tenantId: tenantId(req),
            kod: String(body.kod).trim().toUpperCase(),
            ad: String(body.ad).trim(),
            sube: String(body.sube || "").trim(),
            adres: body.adres || "",
            aktif: body.aktif !== false
        });

        res.status(201).json({
            basarili: true,
            depo
        });
    } catch (error) {
        next(error);
    }
}

async function depoGuncelle(req, res, next) {
    try {
        if (!mongoose.Types.ObjectId.isValid(String(req.params.id || ""))) {
            return res.status(400).json({ basarili: false, mesaj: "Geçersiz depo kimliği." });
        }
        const body = req.body || {};
        if (!body.kod || !body.ad) {
            return res.status(400).json({ basarili: false, mesaj: "Depo kodu ve depo adı zorunludur." });
        }
        const depo = await Depo.findOneAndUpdate(
            { _id: req.params.id, tenantId: tenantId(req) },
            { $set: { kod: String(body.kod).trim().toUpperCase(), ad: String(body.ad).trim(), sube: String(body.sube || "").trim(), adres: String(body.adres || "").trim() } },
            { new: true, runValidators: true }
        ).lean();
        if (!depo) return res.status(404).json({ basarili: false, mesaj: "Depo bulunamadı." });
        res.json({ basarili: true, mesaj: "Depo güncellendi.", depo });
    } catch (error) {
        next(error);
    }
}

async function transfer(req, res, next) {
    try {
        const tId = tenantId(req);
        const body = req.body || {};
        const belgeNo = String(body.belgeNo || `TRF-${Date.now()}`).trim().toUpperCase();

        if (!body.urunId || !body.kaynakDepoId || !body.hedefDepoId) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Ürün, çıkış deposu ve giriş deposu zorunludur."
            });
        }

        if (String(body.kaynakDepoId) === String(body.hedefDepoId)) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Transfer için farklı depolar seçilmelidir."
            });
        }

        const miktar = Number(body.miktar || 0);
        const birimMaliyet = Number(body.birimMaliyet || 0);

        if (!Number.isFinite(miktar) || miktar <= 0) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Transfer miktarı sıfırdan büyük olmalıdır."
            });
        }

        if (!Number.isFinite(birimMaliyet) || birimMaliyet < 0) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Birim maliyet sıfır veya daha büyük olmalıdır."
            });
        }

        const [urun, kaynakDepo, hedefDepo] = await Promise.all([
            Urun.findOne({ _id: body.urunId, tenantId: tId }),
            Depo.findOne({ _id: body.kaynakDepoId, tenantId: tId, aktif: true }),
            Depo.findOne({ _id: body.hedefDepoId, tenantId: tId, aktif: true })
        ]);

        if (!urun) return res.status(404).json({ basarili: false, mesaj: "Ürün bulunamadı." });
        if (!kaynakDepo || !hedefDepo) return res.status(404).json({ basarili: false, mesaj: "Depo bulunamadı." });

        const kaynakStok = await Stok.findOne({
            tenantId: tId,
            urunId: urun._id,
            depoId: kaynakDepo._id
        });

        if (!kaynakStok || kaynakStok.miktar < miktar) {
            return res.status(409).json({
                basarili: false,
                mesaj: "Transfer için kaynak depoda yeterli stok yok."
            });
        }

        let hedefStok = await Stok.findOne({
            tenantId: tId,
            urunId: urun._id,
            depoId: hedefDepo._id
        });

        if (!hedefStok) {
            hedefStok = await Stok.create({
                tenantId: tId,
                urunId: urun._id,
                depoId: hedefDepo._id,
                miktar: 0,
                maliyet: 0
            });
        }

        const maliyet = birimMaliyet || kaynakStok.maliyet || urun.alisFiyati || 0;
        const kaynak = "TRANSFER";
        const aciklama = body.aciklama || `${kaynakDepo.kod} -> ${hedefDepo.kod} depo transferi`;

        const transferBelgesi = await StokTransfer.create({
            tenantId: tId,
            belgeNo,
            tarih: body.tarih || new Date(),
            urunId: urun._id,
            kaynakDepoId: kaynakDepo._id,
            hedefDepoId: hedefDepo._id,
            miktar,
            birimMaliyet: maliyet,
            aciklama,
            kullaniciId: req.kullanici?._id || req.user?._id || null
        });

        kaynakStok.miktar -= miktar;
        kaynakStok.sonHareketTarihi = new Date();
        hedefStok.miktar += miktar;
        hedefStok.maliyet = maliyet;
        hedefStok.sonHareketTarihi = new Date();

        await Promise.all([kaynakStok.save(), hedefStok.save()]);

        const [cikis, giris] = await Promise.all([
            StokHareket.create({
                tenantId: tId,
                urunId: urun._id,
                depoId: kaynakDepo._id,
                tip: "TRANSFER_CIKIS",
                miktar,
                tarih: transferBelgesi.tarih,
                birimMaliyet: maliyet,
                maliyetDogrulandi: maliyet > 0,
                maliyetKaynagi: "TRANSFER",
                kaynak,
                kaynakId: transferBelgesi._id,
                aciklama,
                kullaniciId: req.kullanici?._id || req.user?._id || null
            }),
            StokHareket.create({
                tenantId: tId,
                urunId: urun._id,
                depoId: hedefDepo._id,
                tip: "TRANSFER_GIRIS",
                miktar,
                tarih: transferBelgesi.tarih,
                birimMaliyet: maliyet,
                maliyetDogrulandi: maliyet > 0,
                maliyetKaynagi: "TRANSFER",
                kaynak,
                kaynakId: transferBelgesi._id,
                aciklama,
                kullaniciId: req.kullanici?._id || req.user?._id || null
            })
        ]);

        res.status(201).json({
            basarili: true,
            stoklar: [kaynakStok, hedefStok],
            hareketler: [cikis, giris],
            transfer: transferBelgesi
        });
    } catch (error) {
        next(error);
    }
}

async function transferler(req, res, next) {
    try {
        const list = await StokTransfer.find({ tenantId: tenantId(req) })
            .populate("urunId", "kod barkod ad birim")
            .populate("kaynakDepoId", "kod ad")
            .populate("hedefDepoId", "kod ad")
            .sort({ tarih: -1, createdAt: -1 })
            .limit(1000)
            .lean();
        res.json({ basarili: true, toplam: list.length, transferler: list });
    } catch (error) { next(error); }
}

async function sayim(req, res, next) {
    try {
        const tId = tenantId(req);
        const body = req.body || {};
        const belgeNo = String(body.belgeNo || `SYM-${Date.now()}`).trim().toUpperCase();
        if (!body.depoId || !Array.isArray(body.kalemler) || !body.kalemler.length) {
            return res.status(400).json({ basarili: false, mesaj: "Depo ve sayım kalemleri zorunludur." });
        }
        const depo = await Depo.findOne({ _id: body.depoId, tenantId: tId, aktif: true });
        if (!depo) return res.status(404).json({ basarili: false, mesaj: "Aktif depo bulunamadı." });

        const urunIds = [...new Set(body.kalemler.map(x => String(x.urunId || "")).filter(Boolean))];
        if (urunIds.length !== body.kalemler.length) {
            return res.status(400).json({ basarili: false, mesaj: "Sayımda her ürün yalnızca bir kez yer almalıdır." });
        }
        const urunler = await Urun.find({ _id: { $in: urunIds }, tenantId: tId });
        if (urunler.length !== urunIds.length) return res.status(404).json({ basarili: false, mesaj: "Sayım ürünlerinden biri bulunamadı." });
        const mevcutlar = await Stok.find({ tenantId: tId, depoId: depo._id, urunId: { $in: urunIds } });
        const stokMap = new Map(mevcutlar.map(x => [String(x.urunId), x]));
        const kalemler = body.kalemler.map(item => {
            const sayilan = Number(item.sayilanMiktar);
            if (!Number.isFinite(sayilan) || sayilan < 0) throw Object.assign(new Error("Sayılan miktar sıfır veya daha büyük olmalıdır."), { status: 400 });
            const stok = stokMap.get(String(item.urunId));
            const sistem = Number(stok?.miktar || 0);
            return { urunId: item.urunId, sistemMiktari: sistem, sayilanMiktar: sayilan, fark: sayilan - sistem, birimMaliyet: Number(stok?.maliyet || 0) };
        });
        const belge = await StokSayim.create({ tenantId: tId, belgeNo, tarih: body.tarih || new Date(), depoId: depo._id, kalemler, aciklama: body.aciklama || "", kullaniciId: req.kullanici?._id || req.user?._id || null });

        for (const kalem of kalemler) {
            let stok = stokMap.get(String(kalem.urunId));
            if (!stok) stok = new Stok({ tenantId: tId, depoId: depo._id, urunId: kalem.urunId, miktar: 0, maliyet: kalem.birimMaliyet });
            stok.miktar = kalem.sayilanMiktar;
            stok.sonHareketTarihi = new Date();
            await stok.save();
            if (kalem.fark) await StokHareket.create({ tenantId: tId, urunId: kalem.urunId, depoId: depo._id, tip: kalem.fark > 0 ? "SAYIM_ARTI" : "SAYIM_EKSI", miktar: Math.abs(kalem.fark), tarih: belge.tarih, birimMaliyet: kalem.birimMaliyet, maliyetDogrulandi: kalem.birimMaliyet > 0, maliyetKaynagi: "SAYIM", kaynak: "SAYIM", kaynakId: belge._id, aciklama: `${belgeNo} sayım farkı`, kullaniciId: req.kullanici?._id || req.user?._id || null });
        }
        res.status(201).json({ basarili: true, sayim: belge });
    } catch (error) { next(error); }
}

async function sayimlar(req, res, next) {
    try {
        const list = await StokSayim.find({ tenantId: tenantId(req) })
            .populate("depoId", "kod ad")
            .populate("kalemler.urunId", "kod barkod ad birim")
            .sort({ tarih: -1, createdAt: -1 })
            .limit(500)
            .lean();
        res.json({ basarili: true, toplam: list.length, sayimlar: list });
    } catch (error) { next(error); }
}

async function listele(req, res, next) {
    try {
        const filter = {
            tenantId: tenantId(req)
        };

        if (req.query.depoId) {
            filter.depoId = req.query.depoId;
        }

        if (req.query.urunId) {
            filter.urunId = req.query.urunId;
        }

        const stoklar = await Stok.find(filter)
            .populate("urunId", "kod barkod ad birim alisFiyati satisFiyati minimumStok kritikStok")
            .populate("depoId", "kod ad")
            .sort({ updatedAt: -1 })
            .lean();

        res.json({
            basarili: true,
            toplam: stoklar.length,
            stoklar
        });
    } catch (error) {
        next(error);
    }
}

async function hareket(req, res, next) {
    try {
        const tId = tenantId(req);
        const body = req.body || {};

        if (!body.urunId || !body.depoId || !body.tip) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Ürün, depo ve hareket tipi zorunludur."
            });
        }

        const tip = String(body.tip || "").trim().toUpperCase();
        const miktar = Number(body.miktar);
        const birimMaliyet = body.birimMaliyet === undefined || body.birimMaliyet === ""
            ? null
            : Number(body.birimMaliyet);
        const girisTipleri = ["GIRIS", "SAYIM_ARTI", "IADE_GIRIS", "DEVIR_GIRIS"];
        const cikisTipleri = ["CIKIS", "SAYIM_EKSI", "IADE_CIKIS", "DEVIR_CIKIS"];

        if (!Number.isFinite(miktar) || miktar <= 0) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Miktar sıfırdan büyük olmalıdır."
            });
        }

        if (birimMaliyet !== null && (!Number.isFinite(birimMaliyet) || birimMaliyet < 0)) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Birim maliyet sıfır veya daha büyük olmalıdır."
            });
        }

        if (![...girisTipleri, ...cikisTipleri].includes(tip)) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Geçersiz stok hareketi."
            });
        }

        const urun = await Urun.findOne({
            _id: body.urunId,
            tenantId: tId
        });

        if (!urun) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Ürün bulunamadı."
            });
        }

        const depo = await Depo.findOne({
            _id: body.depoId,
            tenantId: tId,
            aktif: true
        });

        if (!depo) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Depo bulunamadı."
            });
        }

        let stok = await Stok.findOne({
            tenantId: tId,
            urunId: urun._id,
            depoId: depo._id
        });

        if (!stok && cikisTipleri.includes(tip)) {
            return res.status(409).json({
                basarili: false,
                mesaj: "Yetersiz stok."
            });
        }

        if (!stok) {
            stok = await Stok.create({
                tenantId: tId,
                urunId: urun._id,
                depoId: depo._id,
                miktar: 0,
                maliyet: 0
            });
        }

        if (girisTipleri.includes(tip)) {
            stok.miktar += miktar;
        }
        else if (cikisTipleri.includes(tip)) {
            if (stok.miktar < miktar) {
                return res.status(409).json({
                    basarili: false,
                    mesaj: "Yetersiz stok."
                });
            }

            stok.miktar -= miktar;
        }
        if (birimMaliyet !== null && girisTipleri.includes(tip)) {
            stok.maliyet = birimMaliyet;
        }

        stok.sonHareketTarihi = new Date();

        await stok.save();

        const stokHareket = await StokHareket.create({
            tenantId: tId,
            urunId: urun._id,
            depoId: depo._id,
            tip,
            miktar,
            tarih: body.tarih || new Date(),
            birimMaliyet: birimMaliyet ?? stok.maliyet ?? 0,
            maliyetDogrulandi: Number(birimMaliyet ?? stok.maliyet ?? 0) > 0,
            maliyetKaynagi: birimMaliyet !== null ? "MANUEL_GIRIS" : "STOK_KARTI",
            kaynak: body.kaynak || "MANUEL",
            kaynakId: body.kaynakId || null,
            aciklama: body.aciklama || "",
            kullaniciId: req.kullanici?._id || req.user?._id || null
        });

        res.status(201).json({
            basarili: true,
            stok,
            hareket: stokHareket
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

        if (req.query.urunId) {
            filter.urunId = req.query.urunId;
        }

        if (req.query.depoId) {
            filter.depoId = req.query.depoId;
        }

        const list = await StokHareket.find(filter)
            .populate("urunId", "kod barkod ad")
            .populate("depoId", "kod ad")
            .sort({ createdAt: -1 })
            .lean();

        res.json({
            basarili: true,
            toplam: list.length,
            hareketler: list
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    depolar,
    depoOlustur,
    depoGuncelle,
    listele,
    hareket,
    transfer,
    transferler,
    sayim,
    sayimlar,
    hareketler
};
