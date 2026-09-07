const mongoose = require("mongoose");

const Siparis = require("../models/Siparis");
const Stok = require("../models/Stok");
const StokHareket = require("../models/StokHareket");
const Satis = require("../models/Satis");
const Musteri = require("../models/Musteri");
const Depo = require("../models/Depo");
const Urun = require("../models/Urun");
const CariHareket = require("../models/CariHareket");
const EticaretSiparis = require("../models/EticaretSiparis");
const IntegrationConnection = require("../models/IntegrationConnection");
const { marketplaceAdapter } = require("../integrations/marketplace/adapterFactory");

// ERP siparişi iptal edildiğinde kaynak pazaryeri kaydını da IPTAL olarak günceller ve pazaryerine bildirir; pazaryeri bildirimi başarısız olsa da yerel durum güncellenir.
async function pazaryeriSiparisIptaliniBildir(tId, siparisId) {
    const eticaretSiparis = await EticaretSiparis.findOneAndUpdate({ tenantId: tId, erpSiparisId: siparisId, durum: { $ne: "IPTAL" } }, { $set: { durum: "IPTAL" } }, { new: true });
    if (!eticaretSiparis || eticaretSiparis.platform !== "IDEASOFT") return;
    try {
        const connection = await IntegrationConnection.findOne({ _id: eticaretSiparis.connectionId, tenantId: tId, active: true }).select("+encryptedCredentials");
        if (!connection) return;
        await marketplaceAdapter(connection).updateOrderStatus(eticaretSiparis.externalOrderId, "cancelled");
    } catch (error) { console.error("PAZARYERI_SIPARIS_IPTAL_BILDIRIM_HATASI", { name: error.name, message: error.message }); }
}

function tenantId(req) {
    return new mongoose.Types.ObjectId(String(req.tenantId));
}
const aktorId = req => req.currentUser?._id || req.kullanici?.kullaniciId || req.user?.kullaniciId;
const yonetici = req => ["OWNER", "ADMIN"].includes(String(req.currentUser?.rol || req.kullanici?.rol || req.user?.rol || "").toUpperCase());
const sahiplik = req => yonetici(req) ? {} : { kullaniciId: aktorId(req) };
const musteriSahiplik = req => yonetici(req) ? {} : { $or: [{ temsilciId: aktorId(req) }, { olusturanKullaniciId: aktorId(req) }] };

async function listele(req, res, next) {
    try {
        const siparisler = await Siparis.find({
            tenantId: tenantId(req), ...sahiplik(req)
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
    try { const siparis = await Siparis.findOne({ _id: req.params.id, tenantId: tenantId(req), ...sahiplik(req) }).populate("musteriId").populate("depoId").populate("kalemler.urunId").lean(); if (!siparis) return res.status(404).json({ basarili:false, mesaj:"Sipariş bulunamadı." }); res.json({ basarili:true, siparis }); } catch(error){ next(error); }
}

async function guncelle(req, res, next) {
    try {
        const tId=tenantId(req), body=req.body||{}; const siparis=await Siparis.findOne({_id:req.params.id,tenantId:tId,...sahiplik(req)});
        if(!siparis) return res.status(404).json({basarili:false,mesaj:"Sipariş bulunamadı."});
        if(siparis.satisId || siparis.durum==="TAMAMLANDI") return res.status(409).json({basarili:false,mesaj:"Satışa dönüşmüş sipariş değiştirilemez."});
        if(!Array.isArray(body.kalemler)||!body.kalemler.length) return res.status(400).json({basarili:false,mesaj:"En az bir sipariş kalemi gerekir."});
        const oncekiDurum=siparis.durum;
        const kalemler=[]; let araToplam=0,toplamKdv=0,genelToplam=0;
        for(const item of body.kalemler){const urun=await Urun.findOne({_id:item.urunId,tenantId:tId});if(!urun)return res.status(404).json({basarili:false,mesaj:"Ürün bulunamadı."});const miktar=Number(item.miktar||0),birimFiyat=Number(item.birimFiyat??urun.satisFiyati),kdv=Number(item.kdv??urun.kdv),iskonto=Number(item.iskonto||0);if(miktar<=0)return res.status(400).json({basarili:false,mesaj:"Miktar geçersiz."});const brut=miktar*birimFiyat,kalemAra=brut-(brut*iskonto/100),kdvTutari=kalemAra*kdv/100;kalemler.push({urunId:urun._id,miktar,birimFiyat,kdv,iskonto,araToplam:kalemAra,kdvTutari,toplam:kalemAra+kdvTutari});araToplam+=kalemAra;toplamKdv+=kdvTutari;genelToplam+=kalemAra+kdvTutari;}
        siparis.siparisNo=String(body.siparisNo||siparis.siparisNo).trim().toUpperCase();siparis.tarih=body.tarih||siparis.tarih;siparis.depoId=body.depoId||siparis.depoId;siparis.kalemler=kalemler;siparis.araToplam=araToplam;siparis.toplamKdv=toplamKdv;siparis.genelToplam=genelToplam;siparis.notlar=body.notlar??siparis.notlar;siparis.durum=body.durum||siparis.durum;
        ["paraBirimi", "teslimTarihi", "sevkAdresi", "odemeKosullari"].forEach(k => { if (body[k] !== undefined) siparis[k] = body[k] || null; });
        await siparis.save();
        if (siparis.durum==="IPTAL" && oncekiDurum!=="IPTAL") await pazaryeriSiparisIptaliniBildir(tId, siparis._id);
        res.json({basarili:true,siparis});
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
            Musteri.findOne({ _id: body.musteriId, tenantId: tId, ...musteriSahiplik(req) }),
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
            ...require("../services/siparisHesaplamaServisi").hesapla(kalemler), durum: body.durum || "TASLAK",
            paraBirimi: body.paraBirimi || "TRY", teslimTarihi: body.teslimTarihi || null,
            sevkAdresi: body.sevkAdresi || "", odemeKosullari: body.odemeKosullari || "",
            notlar: body.notlar || "", kullaniciId: aktorId(req)
        });
        res.status(201).json({ basarili: true, siparis });
    } catch (error) { next(error); }
}

async function satisdonustur(req, res, next) {
    const session = await mongoose.startSession();
    try {
        const tId = tenantId(req);

        const siparis = await Siparis.findOne({
            _id: req.params.id,
            tenantId: tId,
            ...sahiplik(req)
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

        const satisDurumlari = siparis.kaynakKanal === "B2B" ? ["SEVK_EDILDI"] : ["ONAYLANDI", "HAZIRLANIYOR"];
        if (!satisDurumlari.includes(siparis.durum)) {
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

        const stokKontrolleri = new Map();

        for (const kalem of siparis.kalemler) {
            const urunAnahtari = String(kalem.urunId);
            const onceki = stokKontrolleri.get(urunAnahtari);
            const stok = onceki?.stok || await Stok.findOne({
                tenantId: tId,
                urunId: kalem.urunId,
                depoId: depo._id
            });
            const toplamMiktar = Number(onceki?.miktar || 0) + Number(kalem.miktar || 0);


            stokKontrolleri.set(urunAnahtari, { stok, urunId: kalem.urunId, miktar: toplamMiktar });
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

        let satis;
        let musteriBakiye;
        await session.withTransaction(async () => {
            const guncelSiparis = await Siparis.findOne({
                _id: siparis._id, tenantId: tId, satisId: null,
                durum: { $in: satisDurumlari }
            }).session(session);
            if (!guncelSiparis) throw Object.assign(new Error("Sipariş başka bir işlem tarafından satışa dönüştürüldü."), { status: 409 });

            [satis] = await Satis.create([{
                tenantId: tId, belgeNo, tarih: new Date(), musteriId: musteri._id,
                depoId: depo._id, kalemler: guncelSiparis.kalemler,
                araToplam: guncelSiparis.araToplam, toplamKdv: guncelSiparis.toplamKdv,
                genelToplam: guncelSiparis.genelToplam, odemeDurumu: "ACIK",
                odemeTipi: "ACIK_HESAP", odenenTutar: 0, kalanTutar: guncelSiparis.genelToplam,
                notlar: `Sipariş ${guncelSiparis.siparisNo}`, kullaniciId: aktorId(req)
            }], { session });

            for (const item of stokKontrolleri.values()) {
                const stok = await require("../services/satisStokServisi").satisStokDus({
                    tenantId: tId, urunId: item.urunId, depoId: depo._id, miktar: item.miktar, session
                });
                await StokHareket.create([{
                    tenantId: tId, urunId: stok.urunId, depoId: depo._id, tip: "CIKIS",
                    miktar: item.miktar, tarih: satis.tarih, birimMaliyet: stok.maliyet || 0,
                    maliyetDogrulandi: Number(stok.maliyet || 0) > 0, maliyetKaynagi: "STOK_KARTI",
                    kaynak: "SATIS", kaynakId: satis._id,
                    islemAnahtari: `SATIS:${satis._id}:STOK:${stok.urunId}:${depo._id}`,
                    aciklama: `Sipariş ${guncelSiparis.siparisNo} → satış ${belgeNo}`,
                    kullaniciId: aktorId(req)
                }], { session });
            }

            const oncekiMusteri = await Musteri.findOneAndUpdate(
                { _id: musteri._id, tenantId: tId },
                { $inc: { bakiye: guncelSiparis.genelToplam } },
                { new: false, session }
            );
            if (!oncekiMusteri) throw Object.assign(new Error("Müşteri hesabı işlem sırasında bulunamadı."), { status: 409 });
            const oncekiBakiye = Number(oncekiMusteri.bakiye || 0);
            musteriBakiye = oncekiBakiye + Number(guncelSiparis.genelToplam || 0);
            await CariHareket.create([{
                tenantId: tId, tarafTipi: "MUSTERI", tarafId: musteri._id,
                tip: "BORC", tutar: guncelSiparis.genelToplam, bakiyeDegisimi: guncelSiparis.genelToplam,
                oncekiBakiye, sonrakiBakiye: musteriBakiye,
                aciklama: `Sipariş satışı ${belgeNo}`, kaynak: "SATIS", kaynakId: satis._id,
                islemAnahtari: `SATIS:${satis._id}:BORC`, tarih: new Date(), kullaniciId: aktorId(req)
            }], { session });

            guncelSiparis.satisId = satis._id;
            guncelSiparis.durum = "TAMAMLANDI";
            await guncelSiparis.save({ session });
            siparis.satisId = satis._id;
            siparis.durum = "TAMAMLANDI";
        });

        res.status(201).json({
            basarili: true,
            mesaj: "Sipariş satışa dönüştürüldü.",
            siparis,
            satis,
            musteriBakiye
        });
    } catch (error) {
        next(error);
    } finally {
        await session.endSession();
    }
}

module.exports = {
    listele,
    detay,
    guncelle,
    olustur,
    satisdonustur
};
