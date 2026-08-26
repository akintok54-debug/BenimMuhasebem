const mongoose = require("mongoose");

const Siparis = require("../models/Siparis");
const Stok = require("../models/Stok");
const StokHareket = require("../models/StokHareket");
const Satis = require("../models/Satis");
const Musteri = require("../models/Musteri");
const Depo = require("../models/Depo");
const Urun = require("../models/Urun");
const CariHareket = require("../models/CariHareket");

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
            .populate("kalemler.urunId", "kod ad birim")
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

async function detay(req, res, next) {
    try { const siparis = await Siparis.findOne({ _id: req.params.id, tenantId: tenantId(req) }).populate("musteriId").populate("depoId").populate("kalemler.urunId").lean(); if (!siparis) return res.status(404).json({ basarili:false, mesaj:"Sipariş bulunamadı." }); res.json({ basarili:true, siparis }); } catch(error){ next(error); }
}

async function guncelle(req, res, next) {
    try {
        const tId=tenantId(req), body=req.body||{}; const siparis=await Siparis.findOne({_id:req.params.id,tenantId:tId});
        if(!siparis) return res.status(404).json({basarili:false,mesaj:"Sipariş bulunamadı."});
        if(siparis.satisId || siparis.durum==="TAMAMLANDI") return res.status(409).json({basarili:false,mesaj:"Satışa dönüşmüş sipariş değiştirilemez."});
        if(!Array.isArray(body.kalemler)||!body.kalemler.length) return res.status(400).json({basarili:false,mesaj:"En az bir sipariş kalemi gerekir."});
        const kalemler=[]; let araToplam=0,toplamKdv=0,genelToplam=0;
        for(const item of body.kalemler){const urun=await Urun.findOne({_id:item.urunId,tenantId:tId});if(!urun)return res.status(404).json({basarili:false,mesaj:"Ürün bulunamadı."});const miktar=Number(item.miktar||0),birimFiyat=Number(item.birimFiyat??urun.satisFiyati),kdv=Number(item.kdv??urun.kdv),iskonto=Number(item.iskonto||0);if(miktar<=0)return res.status(400).json({basarili:false,mesaj:"Miktar geçersiz."});const brut=miktar*birimFiyat,kalemAra=brut-(brut*iskonto/100),kdvTutari=kalemAra*kdv/100;kalemler.push({urunId:urun._id,miktar,birimFiyat,kdv,iskonto,araToplam:kalemAra,kdvTutari,toplam:kalemAra+kdvTutari});araToplam+=kalemAra;toplamKdv+=kdvTutari;genelToplam+=kalemAra+kdvTutari;}
        siparis.siparisNo=String(body.siparisNo||siparis.siparisNo).trim().toUpperCase();siparis.tarih=body.tarih||siparis.tarih;siparis.depoId=body.depoId||siparis.depoId;siparis.kalemler=kalemler;siparis.araToplam=araToplam;siparis.toplamKdv=toplamKdv;siparis.genelToplam=genelToplam;siparis.notlar=body.notlar??siparis.notlar;siparis.durum=body.durum||siparis.durum;await siparis.save();res.json({basarili:true,siparis});
    }catch(error){next(error);}
}

async function olustur(req, res, next) {
    try {
        const tId = tenantId(req);
        const body = req.body || {};
        if (!body.siparisNo || !body.musteriId || !body.depoId) {
            return res.status(400).json({ basarili: false, mesaj: "Sipariş no, müşteri ve depo zorunludur." });
        }
        if (!Array.isArray(body.kalemler) || !body.kalemler.length) {
            return res.status(400).json({ basarili: false, mesaj: "En az bir sipariş kalemi gerekir." });
        }
        const [musteri, depo] = await Promise.all([
            Musteri.findOne({ _id: body.musteriId, tenantId: tId }),
            Depo.findOne({ _id: body.depoId, tenantId: tId })
        ]);
        if (!musteri || !depo) return res.status(404).json({ basarili: false, mesaj: "Müşteri veya depo bulunamadı." });
        const kalemler = [];
        let araToplam = 0, toplamKdv = 0, genelToplam = 0;
        for (const item of body.kalemler) {
            const urun = await Urun.findOne({ _id: item.urunId, tenantId: tId });
            if (!urun) return res.status(404).json({ basarili: false, mesaj: "Ürün bulunamadı." });
            const miktar = Number(item.miktar || 0);
            const birimFiyat = Number(item.birimFiyat ?? urun.satisFiyati ?? 0);
            const kdv = Number(item.kdv ?? urun.kdv ?? 20);
            const iskonto = Number(item.iskonto || 0);
            if (miktar <= 0 || birimFiyat < 0) return res.status(400).json({ basarili: false, mesaj: "Kalem miktarı/fiyatı geçersiz." });
            const brut = miktar * birimFiyat;
            const kalemAra = brut - (brut * iskonto / 100);
            const kdvTutari = kalemAra * kdv / 100;
            kalemler.push({ urunId: urun._id, miktar, birimFiyat, kdv, iskonto, araToplam: kalemAra, kdvTutari, toplam: kalemAra + kdvTutari });
            araToplam += kalemAra; toplamKdv += kdvTutari; genelToplam += kalemAra + kdvTutari;
        }
        const siparis = await Siparis.create({
            tenantId: tId, siparisNo: String(body.siparisNo).trim().toUpperCase(),
            tarih: body.tarih || new Date(), musteriId: musteri._id, depoId: depo._id,
            kalemler, araToplam, toplamKdv, genelToplam, durum: body.durum || "TASLAK",
            notlar: body.notlar || "", kullaniciId: req.kullanici?._id || req.user?._id || null
        });
        res.status(201).json({ basarili: true, siparis });
    } catch (error) { next(error); }
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

        await CariHareket.create({
            tenantId: tId, tarafTipi: "MUSTERI", tarafId: musteri._id,
            tip: "BORC", tutar: siparis.genelToplam, aciklama: `Sipariş satışı ${belgeNo}`,
            kaynak: "SATIS", kaynakId: satis._id, tarih: new Date(),
            kullaniciId: req.kullanici?._id || req.user?._id || null
        });

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
    detay,
    guncelle,
    olustur,
    satisdonustur
};
