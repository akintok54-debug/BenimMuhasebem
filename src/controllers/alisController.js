const mongoose = require("mongoose");

const Alis = require("../models/Alis");
const Urun = require("../models/Urun");
const Depo = require("../models/Depo");
const Stok = require("../models/Stok");
const StokHareket = require("../models/StokHareket");
const Tedarikci = require("../models/Tedarikci");
const Kasa = require("../models/Kasa");
const Banka = require("../models/Banka");
const CariHareket = require("../models/CariHareket");
const AlisIade = require("../models/AlisIade");
const SatinAlmaSiparis = require("../models/SatinAlmaSiparis");
const { hareketKaydet, tedarikciAlisKaydet } = require("../services/cariHesapServisi");
const alisDuzeltme = require("../services/alisDuzeltmeServisi");
const { kaydet: auditKaydet } = require("../modules/platform/services/auditServisi");

function tenantObjectId(req) {
    return new mongoose.Types.ObjectId(String(req.tenantId));
}
function kullaniciId(req) { return req.currentUser?._id || req.kullanici?.kullaniciId || req.user?.kullaniciId || req.kullanici?._id || req.user?._id || null; }

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

function kalemGecerliMi(kalem) {
    return Number.isFinite(kalem.miktar) && kalem.miktar > 0 &&
        Number.isFinite(kalem.birimFiyat) && kalem.birimFiyat >= 0 &&
        Number.isFinite(kalem.kdv) && kalem.kdv >= 0 && kalem.kdv <= 100 &&
        Number.isFinite(kalem.iskonto) && kalem.iskonto >= 0 && kalem.iskonto <= 100;
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

        if (!alis.belgeOdemeAyrildi) {
            const belgeOdemesi = await CariHareket.findOne({ tenantId: tenantObjectId(req), kaynak: "ALIS_ODEME", kaynakId: alis._id, durum: { $ne: "IPTAL" } }).select("tutar").lean();
            alis.belgeOdemeTutari = Number(belgeOdemesi?.tutar || 0);
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
    const rollback = { tenantId: null, alisId: null, stoklar: [] };
    try {
        const tenantId = tenantObjectId(req);
        rollback.tenantId = tenantId;
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
            tenantId,
            aktif: true
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
                iskonto: item.iskonto ?? urun.iskonto ?? 0
            });

            if (!kalemGecerliMi(kalem)) {
                return res.status(400).json({ basarili: false, mesaj: `Geçersiz alış kalemi: ${urun.kod}` });
            }

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
            belgeOdemeTutari: odenenTutar,
            belgeOdemeAyrildi: true,
            kalanTutar,
            hesapTipi: odenenTutar > 0 ? hesapTipi : null,
            hesapId: odenenTutar > 0 ? odemeHesabi?._id : null,
            notlar: body.notlar || "",
            kullaniciId:
                req.kullanici?._id ||
                req.user?._id ||
                null
        });
        rollback.alisId = alis._id;

        /*
         * ALIŞ -> STOK GRŞ
         */
        for (const kalem of kalemler) {
            const stokBirimMaliyeti = kalem.birimFiyat * (1 - Number(kalem.iskonto || 0) / 100);
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
                        maliyet: stokBirimMaliyeti,
                        sonHareketTarihi: new Date()
                    }
                },
                {
                    new: true,
                    upsert: true,
                    setDefaultsOnInsert: true
                }
            );
            if (!stok) throw new Error("Stok güncellenemedi.");
            rollback.stoklar.push({ stokId: stok._id, miktar: kalem.miktar });

            await StokHareket.create({
                tenantId,
                urunId: kalem.urunId,
                depoId: depo._id,
                tip: "GIRIS",
                miktar: kalem.miktar,
                tarih: alis.tarih,
                birimMaliyet: stokBirimMaliyeti,
                maliyetDogrulandi: stokBirimMaliyeti > 0,
                maliyetKaynagi: "ALIS_BELGESI",
                kaynak: "ALIS",
                kaynakId: alis._id,
                aciklama: `Alış ${belgeNo}`,
                kullaniciId:
                    req.kullanici?._id ||
                    req.user?._id ||
                    null
            });

        }

        /*
         * AÇIK / KISM ALIŞ -> TEDARKÇ BORCU
         */
        const muhasebe = await tedarikciAlisKaydet({
            tenantId,
            tedarikciId: tedarikci._id,
            genelToplam,
            odenenTutar,
            hesap: odemeHesabi,
            kaynakId: alis._id,
            belgeNo,
            tarih: body.tarih || new Date(),
            kullaniciId: kullaniciId(req)
        });

        return res.status(201).json({
            basarili: true,
            mesaj: "Alış kaydedildi. Stok güncellendi.",
            alis,
            tedarikciBakiye: muhasebe.taraf.bakiye
        });
    } catch (error) {
        if (rollback.alisId && rollback.tenantId) {
            await StokHareket.deleteMany({ tenantId: rollback.tenantId, kaynak: "ALIS", kaynakId: rollback.alisId }).catch(() => {});
            for (const stok of rollback.stoklar) await Stok.updateOne({ _id: stok.stokId, tenantId: rollback.tenantId }, { $inc: { miktar: -stok.miktar } }).catch(() => {});
            await Alis.deleteOne({ _id: rollback.alisId, tenantId: rollback.tenantId }).catch(() => {});
        }
        next(error);
    }
}

async function guncelle(req, res, next) {
    try {
        const tenantId = tenantObjectId(req), sonuc = await alisDuzeltme.duzelt({ tenantId, alisId: req.params.id, body: req.body || {}, kullaniciId: kullaniciId(req), transactionId: req.transactionId });
        await auditKaydet({ req, action: "PURCHASE_CORRECTED", resource: "Alis", resourceId: String(req.params.id), tenantId, category: "MUHASEBE_DUZELTME", severity: "UYARI", details: { islemId: String(req.params.id), transactionId: req.transactionId, eskiDeger: sonuc.eski, yeniDeger: sonuc.yeni, cariFarki: sonuc.netCariFarki } });
        res.json({ basarili: true, mesaj: "Alış; stok, tedarikçi carisi ve ödeme hesabıyla birlikte düzeltildi.", alis: sonuc.alis });
    } catch (error) { next(error); }
}

async function iptalEt(req, res, next) {
    try {
        const tenantId = tenantObjectId(req), sonuc = await alisDuzeltme.iptal({ tenantId, alisId: req.params.id, neden: req.body?.neden, kullaniciId: kullaniciId(req), transactionId: req.transactionId });
        await auditKaydet({ req, action: "PURCHASE_CANCELLED", resource: "Alis", resourceId: String(req.params.id), tenantId, category: "MUHASEBE_IPTAL", severity: "KRITIK", details: { islemId: String(req.params.id), transactionId: req.transactionId, eskiDeger: sonuc.eski, yeniDeger: sonuc.yeni } });
        res.json({ basarili: true, mesaj: "Alış fiziksel olarak silinmeden ters stok, cari ve finans hareketleriyle iptal edildi.", alis: sonuc.alis });
    } catch (error) { next(error); }
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
    const rollback = { tenantId: null, iadeId: null, stoklar: [] };
    try {
        const tenantId = tenantObjectId(req), body = req.body || {};
        rollback.tenantId = tenantId;
        if (!body.belgeNo || !body.tedarikciId || !body.depoId || !Array.isArray(body.kalemler) || !body.kalemler.length) return res.status(400).json({ basarili: false, mesaj: "İade belge no, tedarikçi, depo ve kalem zorunludur." });
        const [tedarikci, depo] = await Promise.all([Tedarikci.findOne({ _id: body.tedarikciId, tenantId }), Depo.findOne({ _id: body.depoId, tenantId, aktif: true })]);
        if (!tedarikci || !depo) return res.status(404).json({ basarili: false, mesaj: "Tedarikçi veya depo bulunamadı." });
        const kalemler = []; let genelToplam = 0;
        for (const item of body.kalemler) {
            const urun = await Urun.findOne({ _id: item.urunId, tenantId });
            const stok = await Stok.findOne({ tenantId, urunId: item.urunId, depoId: depo._id });
            const kalem = hesaplaKalem({ urunId: item.urunId, miktar: item.miktar, birimFiyat: item.birimFiyat ?? urun?.alisFiyati, kdv: item.kdv ?? urun?.kdv, iskonto: item.iskonto ?? urun?.iskonto ?? 0 });
            if (!urun || !kalemGecerliMi(kalem) || Number(stok?.miktar || 0) < kalem.miktar) return res.status(409).json({ basarili: false, mesaj: "İade için ürün veya stok miktarı geçersiz." });
            kalemler.push({ urunId: urun._id, miktar: kalem.miktar, birimFiyat: kalem.birimFiyat, kdv: kalem.kdv, iskonto: kalem.iskonto, toplam: kalem.toplam }); genelToplam += kalem.toplam;
        }
        const belgeNo = String(body.belgeNo).trim().toUpperCase();
        const iade = await AlisIade.create({ tenantId, belgeNo, tarih: body.tarih || new Date(), tedarikciId: tedarikci._id, depoId: depo._id, kalemler, genelToplam, aciklama: body.aciklama || "Alış iadesi", kullaniciId: req.kullanici?._id || req.user?._id || null });
        rollback.iadeId = iade._id;
        for (const kalem of kalemler) {
            const stokSonucu = await Stok.updateOne({ tenantId, urunId: kalem.urunId, depoId: depo._id, miktar: { $gte: kalem.miktar } }, { $inc: { miktar: -kalem.miktar }, $set: { sonHareketTarihi: new Date() } });
            if (!stokSonucu.modifiedCount) throw Object.assign(new Error("İade sırasında stok başka bir işlem tarafından değiştirildi."), { status: 409 });
            rollback.stoklar.push({ urunId: kalem.urunId, depoId: depo._id, miktar: kalem.miktar });
            const iadeBirimMaliyeti = kalem.birimFiyat * (1 - Number(kalem.iskonto || 0) / 100);
            await StokHareket.create({ tenantId, urunId: kalem.urunId, depoId: depo._id, tip: "IADE_CIKIS", miktar: kalem.miktar, tarih: iade.tarih, birimMaliyet: iadeBirimMaliyeti, maliyetDogrulandi: iadeBirimMaliyeti > 0, maliyetKaynagi: "ALIS_IADE_BELGESI", kaynak: "ALIS_IADE", kaynakId: iade._id, aciklama: `Alış iadesi ${belgeNo}`, kullaniciId: req.kullanici?._id || req.user?._id || null });
        }
        const muhasebe = await hareketKaydet({ tenantId, tarafTipi: "TEDARIKCI", tarafId: tedarikci._id, tip: "IADE", tutar: genelToplam, bakiyeDegisimi: -genelToplam, belgeNo, aciklama: `Alış iadesi ${belgeNo}`, kaynak: "ALIS_IADE", kaynakId: iade._id, tarih: body.tarih || new Date(), kullaniciId: req.kullanici?._id || req.user?._id || null });
        res.status(201).json({ basarili: true, iade, cariHareket: muhasebe.cariHareket, tedarikciBakiye: muhasebe.taraf.bakiye });
    } catch (error) {
        if (rollback.iadeId && rollback.tenantId) {
            await StokHareket.deleteMany({ tenantId: rollback.tenantId, kaynak: "ALIS_IADE", kaynakId: rollback.iadeId }).catch(() => {});
            for (const stok of rollback.stoklar) await Stok.updateOne({ tenantId: rollback.tenantId, urunId: stok.urunId, depoId: stok.depoId }, { $inc: { miktar: stok.miktar } }).catch(() => {});
            await AlisIade.deleteOne({ _id: rollback.iadeId, tenantId: rollback.tenantId }).catch(() => {});
        }
        next(error);
    }
}

async function iadeDetay(req, res, next) {
    try {
        const iade = await AlisIade.findOne({ _id: req.params.id, tenantId: tenantObjectId(req) }).populate("tedarikciId").populate("depoId").populate("kalemler.urunId").lean();
        if (!iade) return res.status(404).json({ basarili: false, mesaj: "Alış iadesi bulunamadı." });
        return res.json({ basarili: true, iade });
    } catch (error) { next(error); }
}

async function iadeIptalEt(req, res, next) {
    const session = await mongoose.startSession();
    let sonuc;
    try {
        await session.withTransaction(async () => {
            const tenantId = tenantObjectId(req), iade = await AlisIade.findOneAndUpdate({ _id: req.params.id, tenantId, durum: { $in: ["AKTIF", null] } }, { $set: { durum: "IPTAL_ISLENIYOR" } }, { new: false, session });
            if (!iade) throw Object.assign(new Error("Aktif alış iadesi bulunamadı."), { status: 404 });
            const eski = iade.toObject();
            for (const kalem of iade.kalemler) {
                await Stok.findOneAndUpdate({ tenantId, urunId: kalem.urunId, depoId: iade.depoId }, { $inc: { miktar: Number(kalem.miktar || 0) }, $set: { sonHareketTarihi: new Date() } }, { upsert: true, new: true, session, setDefaultsOnInsert: true });
                await StokHareket.create([{ tenantId, urunId: kalem.urunId, depoId: iade.depoId, tip: "GIRIS", miktar: kalem.miktar, tarih: new Date(), kaynak: "ALIS_IADE_IPTAL", kaynakId: iade._id, aciklama: `Alış iadesi iptali ${iade.belgeNo}`, kullaniciId: kullaniciId(req), islemAnahtari: `TX:${req.transactionId}:STOK:ALIS_IADE_IPTAL:${iade._id}:${kalem.urunId}` }], { session });
            }
            const tedarikci = await Tedarikci.findOneAndUpdate({ _id: iade.tedarikciId, tenantId }, { $inc: { bakiye: Number(iade.genelToplam || 0) } }, { new: true, session });
            if (!tedarikci) throw Object.assign(new Error("İadenin tedarikçi kaydı bulunamadı."), { status: 409 });
            await require("../models/CariHareket").create([{ tenantId, tarafTipi: "TEDARIKCI", tarafId: iade.tedarikciId, tip: "DUZELTME", tutar: iade.genelToplam, bakiyeDegisimi: Number(iade.genelToplam || 0), aciklama: `Alış iadesi iptali ${iade.belgeNo}`, kaynak: "ALIS_IADE_IPTAL", kaynakId: iade._id, belgeNo: iade.belgeNo, tarih: new Date(), kullaniciId: kullaniciId(req), islemAnahtari: `TX:${req.transactionId}:CARI:ALIS_IADE_IPTAL:${iade._id}` }], { session });
            iade.durum = "IPTAL"; iade.iptalTarihi = new Date(); iade.iptalNedeni = String(req.body?.neden || "Alış iadesi iptal edildi").trim(); iade.iptalEdenKullaniciId = kullaniciId(req); await iade.save({ session });
            sonuc = { iade, tedarikciBakiye: tedarikci.bakiye, eski, yeni: iade.toObject() };
        });
        await auditKaydet({ req, action: "PURCHASE_RETURN_CANCELLED", resource: "AlisIade", resourceId: String(req.params.id), tenantId: tenantObjectId(req), category: "MUHASEBE_IPTAL", severity: "KRITIK", details: { islemId: String(req.params.id), transactionId: req.transactionId, eskiDeger: sonuc.eski, yeniDeger: sonuc.yeni } });
        return res.json({ basarili: true, mesaj: "Alış iadesi ters stok ve cari kaydıyla iptal edildi.", ...sonuc });
    } catch (error) { next(error); }
    finally { await session.endSession(); }
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
        for (const item of body.kalemler) { const urun = await Urun.findOne({ _id: item.urunId, tenantId }); if (!urun) return res.status(404).json({ basarili: false, mesaj: "Ürün bulunamadı." }); const k = hesaplaKalem({ urunId: urun._id, miktar: item.miktar, birimFiyat: item.birimFiyat ?? urun.alisFiyati, kdv: item.kdv ?? urun.kdv, iskonto: item.iskonto ?? urun.iskonto ?? 0 }); if (!kalemGecerliMi(k)) return res.status(400).json({ basarili: false, mesaj: "Sipariş kalemi geçersiz." }); kalemler.push({ urunId: urun._id, miktar: k.miktar, birimFiyat: k.birimFiyat, kdv: k.kdv, iskonto: k.iskonto, toplam: k.toplam }); genelToplam += k.toplam; }
        const siparis = await SatinAlmaSiparis.create({ tenantId, siparisNo: String(body.siparisNo).trim().toUpperCase(), tarih: body.tarih || new Date(), tedarikciId: tedarikci._id, kalemler, genelToplam, notlar: body.notlar || "", kullaniciId: req.kullanici?._id || req.user?._id || null });
        res.status(201).json({ basarili: true, siparis });
    } catch (error) { next(error); }
}

module.exports = {
    listele,
    detay,
    olustur,
    guncelle,
    iptalEt,
    iadeleriListele,
    iadeOlustur,
    iadeDetay,
    iadeIptalEt,
    siparisleriListele,
    siparisOlustur
};

module.exports.hesaplaKalem = hesaplaKalem;
module.exports.kalemGecerliMi = kalemGecerliMi;

