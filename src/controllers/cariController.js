const mongoose = require("mongoose");

const Musteri = require("../models/Musteri");
const Tedarikci = require("../models/Tedarikci");
const CariHareket = require("../models/CariHareket");
const Kasa = require("../models/Kasa");
const Banka = require("../models/Banka");
const ParaHareket = require("../models/ParaHareket");
const SahaGun = require("../models/SahaGun");
const CekSenetPortfoy = require("../models/CekSenetPortfoy");
const CariEkstrePaylasim = require("../models/CariEkstrePaylasim");
const Tenant = require("../modules/platform/models/Tenant");
const crypto = require("crypto");
const { etkinYetkiler } = require("../middleware/yetkiKontrol");
const { hareketKaydet, tedarikciOdemeKaydet, tedarikciFaturalariYenidenDagit } = require("../services/cariHesapServisi");
const { kaydet: auditKaydet } = require("../modules/platform/services/auditServisi");

function tenantId(req) {
    return new mongoose.Types.ObjectId(String(req.tenantId));
}

function cariErisimi(req) {
    const izinler = new Set(etkinYetkiler(req.currentUser || {}));
    return {
        musteri: izinler.has("customer.read"),
        tedarikci: izinler.has("supplier.read")
    };
}
const aktorId = req => req.currentUser?._id || req.kullanici?.kullaniciId || req.user?.kullaniciId;
const satisTemsilcisi = req => ["SALES", "SATIS"].includes(String(req.currentUser?.rol || req.kullanici?.rol || req.user?.rol || "").toUpperCase());
const musteriSahiplik = req => satisTemsilcisi(req) ? { $or: [{ temsilciId: aktorId(req) }, { olusturanKullaniciId: aktorId(req) }] } : {};

async function hesapBul(req, hesapTipi, hesapId) {
    const tId = tenantId(req);

    if (!["KASA", "BANKA"].includes(hesapTipi)) {
        return null;
    }

    if (!mongoose.Types.ObjectId.isValid(String(hesapId))) {
        return null;
    }

    if (hesapTipi === "KASA") {
        return Kasa.findOne({
            _id: hesapId,
            tenantId: tId,
            aktif: { $ne: false }
        });
    }

    return Banka.findOne({
        _id: hesapId,
        tenantId: tId,
        aktif: { $ne: false }
    });
}

function odemeBilgisi(body) {
    const yontem = String(body.odemeYontemi || (body.hesapTipi === "BANKA" ? "KREDI_KARTI" : "NAKIT")).toUpperCase();
    if (!["NAKIT", "KREDI_KARTI", "IBAN", "SENET", "CEK"].includes(yontem)) return null;
    if (yontem === "NAKIT") return { yontem, hesapTipi: "KASA" };
    if (["KREDI_KARTI", "IBAN"].includes(yontem)) return { yontem, hesapTipi: "BANKA" };
    return { yontem, hesapTipi: null };
}

function tedarikciOdemeSonrasiBakiye(mevcutBakiye, tutar) {
    return Number(mevcutBakiye || 0) - Number(tutar || 0);
}

async function ozet(req, res, next) {
    try {
        const tId = tenantId(req);
        const erisim = cariErisimi(req);

        const [musteriler, tedarikciler] = await Promise.all([
            erisim.musteri ? Musteri.find({
                tenantId: tId, ...musteriSahiplik(req)
            })
                .select("kod unvan adSoyad bakiye")
                .lean() : [],

            erisim.tedarikci ? Tedarikci.find({
                tenantId: tId
            })
                .select("kod unvan adSoyad bakiye")
                .lean() : []
        ]);

        const musteriAlacak = musteriler.reduce(
            (toplam, item) => toplam + Number(item.bakiye || 0),
            0
        );

        const tedarikciBorc = tedarikciler.reduce(
            (toplam, item) => toplam + Number(item.bakiye || 0),
            0
        );

        const sonuc = {
            basarili: true,
            ...(erisim.musteri ? { musteriAlacak } : {}),
            ...(erisim.tedarikci ? { tedarikciBorc } : {})
        };
        if (erisim.musteri && erisim.tedarikci) sonuc.netCari = musteriAlacak - tedarikciBorc;
        return res.json(sonuc);
    } catch (error) {
        next(error);
    }
}

async function hareketler(req, res, next) {
    try {
        const erisim = cariErisimi(req);
        const filter = {
            tenantId: tenantId(req)
        };

        if (req.query.tarafTipi) {
            const tarafTipi = String(req.query.tarafTipi).toUpperCase();
            if ((tarafTipi === "MUSTERI" && !erisim.musteri) || (tarafTipi === "TEDARIKCI" && !erisim.tedarikci)) {
                return res.status(403).json({ basarili: false, mesaj: "Bu cari türünü görüntüleme yetkiniz bulunmuyor." });
            }
            if (!["MUSTERI", "TEDARIKCI"].includes(tarafTipi)) {
                return res.status(400).json({ basarili: false, mesaj: "Geçersiz cari türü." });
            }
            filter.tarafTipi = tarafTipi;
        } else if (erisim.musteri !== erisim.tedarikci) {
            filter.tarafTipi = erisim.musteri ? "MUSTERI" : "TEDARIKCI";
        }

        if (req.query.tarafId) {
            filter.tarafId = req.query.tarafId;
        }

        if (satisTemsilcisi(req)) {
            if (filter.tarafTipi && filter.tarafTipi !== "MUSTERI") return res.status(403).json({ basarili: false, mesaj: "Bu cari kaydına erişim yetkiniz bulunmuyor." });
            const izinliMusteriler = await Musteri.find({ tenantId: filter.tenantId, ...musteriSahiplik(req) }).select("_id").lean();
            const izinliIds = izinliMusteriler.map(x => x._id);
            if (filter.tarafId && !izinliIds.some(x => String(x) === String(filter.tarafId))) return res.status(404).json({ basarili: false, mesaj: "Müşteri cari kaydı bulunamadı." });
            filter.tarafTipi = "MUSTERI";
            filter.tarafId = filter.tarafId || { $in: izinliIds };
        }

        const hareketler = await CariHareket.find(filter)
            .sort({
                tarih: -1,
                createdAt: -1
            })
            .lean();

        return res.json({
            basarili: true,
            toplam: hareketler.length,
            hareketler
        });
    } catch (error) {
        next(error);
    }
}

async function musteriManuelHareket(req, res, next) {
    try {
        const tId = tenantId(req);
        const body = req.body || {};
        const tutar = Number(body.tutar || 0);
        const tip = String(body.tip || "").toUpperCase();
        const kaynak = tip === "MASRAF" ? "MASRAF" : "MANUEL";
        const hareketTipi = tip === "MASRAF" ? "BORC" : tip;

        if (!mongoose.Types.ObjectId.isValid(String(body.musteriId || "")) || !["BORC", "ALACAK", "MASRAF"].includes(tip) || !Number.isFinite(tutar) || tutar <= 0) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Müşteri, işlem türü ve pozitif tutar zorunludur."
            });
        }

        const bakiyeDegisimi = hareketTipi === "BORC" ? tutar : -tutar;
        const musteri = await Musteri.findOneAndUpdate(
            { _id: body.musteriId, tenantId: tId },
            { $inc: { bakiye: bakiyeDegisimi } },
            { new: true }
        );

        if (!musteri) {
            return res.status(404).json({ basarili: false, mesaj: "Müşteri bulunamadı." });
        }

        try {
            const hareket = await CariHareket.create({
                tenantId: tId,
                tarafTipi: "MUSTERI",
                tarafId: musteri._id,
                tip: hareketTipi,
                tutar,
                aciklama: String(body.aciklama || (tip === "MASRAF" ? "Müşteri masrafı" : `Manuel ${tip.toLocaleLowerCase("tr-TR")}`)).trim(),
                kaynak,
                belgeNo: String(body.belgeNo || "").trim(),
                tarih: body.tarih || new Date(),
                kullaniciId: aktorId(req)
            });

            return res.status(201).json({
                basarili: true,
                mesaj: tip === "MASRAF" ? "Masraf müşteri hesabına eklendi." : "Cari hareket kaydedildi.",
                musteriBakiye: musteri.bakiye,
                hareket
            });
        } catch (error) {
            await Musteri.updateOne({ _id: musteri._id, tenantId: tId }, { $inc: { bakiye: -bakiyeDegisimi } });
            throw error;
        }
    } catch (error) {
        next(error);
    }
}

async function ekstrePaylas(req, res, next) {
    try {
        const tId = tenantId(req);
        if (!mongoose.Types.ObjectId.isValid(String(req.params.musteriId || ""))) {
            return res.status(400).json({ basarili: false, mesaj: "Geçersiz müşteri bilgisi." });
        }
        const musteri = await Musteri.findOne({ _id: req.params.musteriId, tenantId: tId, ...musteriSahiplik(req) }).select("_id").lean();
        if (!musteri) return res.status(404).json({ basarili: false, mesaj: "Müşteri bulunamadı." });

        const token = crypto.randomBytes(32).toString("hex");
        const sonGecerlilik = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await CariEkstrePaylasim.create({
            tenantId: tId,
            musteriId: musteri._id,
            token,
            sonGecerlilik,
            olusturanKullaniciId: aktorId(req)
        });

        const protokol = String(req.get("x-forwarded-proto") || req.protocol).split(",")[0].trim();
        const link = `${protokol}://${req.get("host")}/erp/cari-ekstre.html?token=${token}`;
        return res.status(201).json({ basarili: true, link, sonGecerlilik });
    } catch (error) {
        next(error);
    }
}

async function paylasilanEkstre(req, res, next) {
    try {
        res.set("Cache-Control", "no-store");
        const paylasim = await CariEkstrePaylasim.findOne({
            token: String(req.params.token || ""),
            sonGecerlilik: { $gt: new Date() }
        }).lean();
        if (!paylasim) return res.status(404).json({ basarili: false, mesaj: "Ekstre bağlantısı geçersiz veya süresi dolmuş." });

        const [musteri, hareketler, tenant] = await Promise.all([
            Musteri.findOne({ _id: paylasim.musteriId, tenantId: paylasim.tenantId }).select("kod unvan adSoyad bakiye").lean(),
            CariHareket.find({ tenantId: paylasim.tenantId, tarafTipi: "MUSTERI", tarafId: paylasim.musteriId }).sort({ tarih: 1, createdAt: 1 }).select("tip tutar aciklama kaynak belgeNo tarih").lean(),
            Tenant.findById(paylasim.tenantId).select("name firmaBilgileri").lean()
        ]);
        if (!musteri) return res.status(404).json({ basarili: false, mesaj: "Müşteri bulunamadı." });

        const f = tenant?.firmaBilgileri || {};
        return res.json({ basarili: true, musteri, hareketler, firma: { unvan: f.unvan || tenant?.name || "İşletme", telefon: f.telefon || "", email: f.email || "", web: f.web || "" }, olusturmaTarihi: paylasim.createdAt, sonGecerlilik: paylasim.sonGecerlilik });
    } catch (error) {
        next(error);
    }
}

async function musteriTahsilat(req, res, next) {
    try {
        const tId = tenantId(req);
        const body = req.body || {};
        const tutar = Number(body.tutar || 0);
        const sahaIslemi = String(body.kaynakKanal || "").toUpperCase() === "SAHA";
        const istemciAnahtari = String(body.islemAnahtari || req.get?.("Idempotency-Key") || "").trim().slice(0, 160);
        const islemAnahtari = istemciAnahtari ? `${sahaIslemi ? "SAHA" : "CARI"}:TAHSILAT:${istemciAnahtari}` : undefined;

        if (!mongoose.Types.ObjectId.isValid(String(body.musteriId || "")) || !Number.isFinite(tutar) || tutar <= 0) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Müşteri ve pozitif tutar zorunludur."
            });
        }

        const odeme = odemeBilgisi(body);
        if (!odeme) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Ödeme yöntemi nakit, kredi kartı, IBAN, senet veya çek olmalıdır."
            });
        }

        const musteri = await Musteri.findOne({
            _id: body.musteriId,
            tenantId: tId,
            ...musteriSahiplik(req)
        });

        if (!musteri) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Müşteri bulunamadı."
            });
        }

        if (islemAnahtari) {
            const mevcut = await CariHareket.findOne({ tenantId: tId, islemAnahtari }).select("+islemAnahtari");
            if (mevcut) return res.status(200).json({ basarili: true, tekrar: true, mesaj: "Bu tahsilat daha önce finans sistemine işlendi.", cariHareket: mevcut, musteriBakiye: musteri.bakiye });
        }

        let sahaGun = null;
        if (sahaIslemi) {
            const gun = /^\d{4}-\d{2}-\d{2}$/.test(String(body.sahaGun || "")) ? String(body.sahaGun) : new Date().toISOString().slice(0, 10);
            sahaGun = await SahaGun.findOne({ tenantId: tId, kullaniciId: aktorId(req), gun, durum: "AKTIF" });
            if (!sahaGun) return res.status(409).json({ basarili: false, mesaj: "Saha tahsilatı için aktif saha günü bulunmalıdır." });
        }

        const hesap = odeme.hesapTipi ? await hesapBul(req, odeme.hesapTipi, body.hesapId) : null;

        if (odeme.hesapTipi && !hesap) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Tahsilat hesabı bulunamadı."
            });
        }

        if (sahaIslemi && odeme.yontem === "NAKIT" && String(hesap?._id || "") !== String(sahaGun.sahaKasaId || "")) {
            return res.status(403).json({ basarili: false, mesaj: "Nakit saha tahsilatı yalnızca personelin saha kasasına işlenebilir." });
        }

        musteri.bakiye -= tutar;
        if (hesap) hesap.bakiye += tutar;

        await musteri.save();
        if (hesap) await hesap.save();

        let cariHareket = null, paraHareket = null, portfoy = null;
        try {
            cariHareket = await CariHareket.create({
                tenantId: tId, tarafTipi: "MUSTERI", tarafId: musteri._id, tip: "TAHSILAT", tutar,
                aciklama: body.aciklama || "Müşteri tahsilatı", kaynak: "TAHSILAT",
                kaynakKanal: sahaIslemi ? "SAHA" : "MERKEZ", sahaGunId: sahaGun?._id || null,
                islemAnahtari,
                belgeNo: String(body.belgeNo || "").trim(), odemeYontemi: odeme.yontem,
                oncekiBakiye: Number(musteri.bakiye) + tutar, sonrakiBakiye: Number(musteri.bakiye), bakiyeDegisimi: -tutar,
                tarih: body.tarih || new Date(), kullaniciId: aktorId(req)
            });
            paraHareket = hesap ? await ParaHareket.create({
                tenantId: tId, hesapTipi: odeme.hesapTipi, hesapId: hesap._id, tip: "GIRIS", tutar,
                paraBirimi: hesap.paraBirimi || "TRY", aciklama: body.aciklama || "Müşteri tahsilatı",
                kaynak: "TAHSILAT", kaynakId: cariHareket._id, tarih: body.tarih || new Date(),
                kaynakKanal: sahaIslemi ? "SAHA" : "MERKEZ", sahaGunId: sahaGun?._id || null,
                belgeNo: String(body.belgeNo || "").trim(), kullaniciId: aktorId(req)
            }) : null;
            if (["CEK", "SENET"].includes(odeme.yontem)) portfoy = await CekSenetPortfoy.create({ tenantId: tId, tur: odeme.yontem, hareketTipi: "GIRIS", musteriId: musteri._id, tutar, belgeNo: String(body.belgeNo || "").trim(), vadeTarihi: body.vadeTarihi || null, banka: String(body.banka || "").trim(), kesideci: String(body.kesideci || "").trim(), kaynak: "TAHSILAT", kaynakId: cariHareket._id, aciklama: body.aciklama || "Müşteri tahsilatı", kullaniciId: aktorId(req) });
            return res.status(201).json({ basarili: true, mesaj: "Tahsilat cari, finans ve evrak portföyüne kaydedildi.", musteriBakiye: musteri.bakiye, hesap, cariHareket, paraHareket, portfoy });
        } catch (error) {
            if (portfoy?._id) await CekSenetPortfoy.deleteOne({ _id: portfoy._id, tenantId: tId }).catch(() => {});
            if (paraHareket?._id) await ParaHareket.deleteMany({ _id: { $in: [paraHareket._id] }, tenantId: tId }).catch(() => {});
            if (cariHareket?._id) await CariHareket.deleteOne({ _id: cariHareket._id, tenantId: tId }).catch(() => {});
            musteri.bakiye += tutar; await musteri.save().catch(() => {});
            if (hesap) { hesap.bakiye -= tutar; await hesap.save().catch(() => {}); }
            throw error;
        }
    } catch (error) {
        next(error);
    }
}

async function musteriTahsilatSil(req, res, next) {
    let hareket = null, musteri = null, hesap = null, paraHareket = null, tersHareket = null, bakiyelerGuncellendi = false, iptalSahiplenildi = false, eskiDeger = null;
    try {
        const tId = tenantId(req);
        hareket = await CariHareket.findOne({
            _id: req.params.id,
            tenantId: tId,
            tarafTipi: "MUSTERI",
            tip: "TAHSILAT",
            kaynak: "TAHSILAT",
            durum: { $ne: "IPTAL" }
        });
        if (!hareket) return res.status(404).json({ basarili: false, mesaj: "Tahsilat kaydı bulunamadı." });
        eskiDeger = hareket.toObject();

        musteri = await Musteri.findOne({ _id: hareket.tarafId, tenantId: tId });
        if (!musteri) return res.status(409).json({ basarili: false, mesaj: "Tahsilatın müşteri kaydı bulunamadı." });

        paraHareket = await ParaHareket.findOne({
            tenantId: tId,
            kaynak: "TAHSILAT",
            kaynakId: hareket._id
        });
        if (paraHareket) {
            hesap = paraHareket.hesapTipi === "KASA"
                ? await Kasa.findOne({ _id: paraHareket.hesapId, tenantId: tId })
                : await Banka.findOne({ _id: paraHareket.hesapId, tenantId: tId });
            if (!hesap) return res.status(409).json({ basarili: false, mesaj: "Tahsilatın aktarıldığı hesap bulunamadı." });
            if (Number(hesap.bakiye || 0) < Number(paraHareket.tutar || 0)) {
                return res.status(409).json({ basarili: false, mesaj: "Hesap bakiyesi tahsilatı geri almaya yetmiyor." });
            }
        }

        const claim = await CariHareket.updateOne(
            { _id: hareket._id, tenantId: tId, durum: "AKTIF" },
            { $set: { durum: "IPTAL_ISLENIYOR" } }
        );
        if (!claim.modifiedCount) return res.status(409).json({ basarili: false, mesaj: "Tahsilat iptali başka bir istek tarafından işleniyor veya tamamlandı." });
        iptalSahiplenildi = true;

        musteri.bakiye += Number(hareket.tutar || 0);
        await musteri.save();
        if (hesap) {
            hesap.bakiye -= Number(paraHareket.tutar || 0);
            await hesap.save();
        }
        bakiyelerGuncellendi = true;
        if (paraHareket) {
            tersHareket = await ParaHareket.create({ tenantId: tId, hesapTipi: paraHareket.hesapTipi, hesapId: paraHareket.hesapId, tip: "CIKIS", tutar: paraHareket.tutar, paraBirimi: paraHareket.paraBirimi || "TRY", aciklama: `Tahsilat iptali: ${hareket.aciklama || hareket.belgeNo || "Müşteri tahsilatı"}`, kaynak: "TAHSILAT_IPTAL", kaynakId: hareket._id, belgeNo: hareket.belgeNo || paraHareket.belgeNo || "", tarih: new Date(), kullaniciId: req.currentUser?._id || req.kullanici?.kullaniciId || req.user?.kullaniciId || null, orijinalHareketId: paraHareket._id });
        }
        hareket.durum = "IPTAL"; hareket.iptalTarihi = new Date(); hareket.iptalNedeni = String(req.body?.neden || "Tahsilat iptal edildi").trim(); hareket.iptalEdenKullaniciId = req.currentUser?._id || req.kullanici?.kullaniciId || req.user?.kullaniciId || null; hareket.iptalParaHareketId = tersHareket?._id || null; await hareket.save();
        await CekSenetPortfoy.updateMany({ tenantId: tId, kaynak: "TAHSILAT", kaynakId: hareket._id, durum: { $ne: "IPTAL" } }, { $set: { durum: "IPTAL" } });
        await auditKaydet({ req, action: "CUSTOMER_COLLECTION_CANCELLED", resource: "CariHareket", resourceId: String(hareket._id), tenantId: tId, category: "MUHASEBE_IPTAL", severity: "KRITIK", details: { islemId: String(hareket._id), transactionId: req.transactionId, eskiDeger, yeniDeger: hareket.toObject() } });

        return res.json({ basarili: true, mesaj: "Tahsilat iptal edildi; geçmiş hareket korundu ve ters kasa hareketi oluşturuldu.", tersHareket });
    } catch (error) {
        const tId = tenantId(req);
        if (tersHareket?._id) await ParaHareket.deleteOne({ _id: tersHareket._id, tenantId: tId }).catch(() => {});
        if (bakiyelerGuncellendi) {
            if (musteri?._id) await Musteri.updateOne({ _id: musteri._id, tenantId: tId }, { $inc: { bakiye: -Number(hareket?.tutar || 0) } }).catch(() => {});
            if (hesap?._id) { const Model = paraHareket?.hesapTipi === "KASA" ? Kasa : Banka; await Model.updateOne({ _id: hesap._id, tenantId: tId }, { $inc: { bakiye: Number(paraHareket?.tutar || 0) } }).catch(() => {}); }
        }
        if (iptalSahiplenildi && hareket?._id) await CariHareket.updateOne({ _id: hareket._id, tenantId: tId, durum: "IPTAL_ISLENIYOR" }, { $set: { durum: "AKTIF" } }).catch(() => {});
        next(error);
    }
}

async function musteriTahsilatGuncelle(req, res, next) {
    try {
        const tId = tenantId(req);
        const body = req.body || {};
        const yeniTutar = Number(body.tutar || 0);
        if (!Number.isFinite(yeniTutar) || yeniTutar <= 0) {
            return res.status(400).json({ basarili: false, mesaj: "Tahsilat tutarı pozitif olmalıdır." });
        }

        const hareket = await CariHareket.findOne({
            _id: req.params.id,
            tenantId: tId,
            tarafTipi: "MUSTERI",
            tip: "TAHSILAT",
            kaynak: "TAHSILAT",
            durum: { $ne: "IPTAL" }
        });
        if (!hareket) return res.status(404).json({ basarili: false, mesaj: "Tahsilat kaydı bulunamadı." });
        const eskiDeger = hareket.toObject();

        const musteri = await Musteri.findOne({ _id: hareket.tarafId, tenantId: tId });
        if (!musteri) return res.status(409).json({ basarili: false, mesaj: "Tahsilatın müşteri kaydı bulunamadı." });

        const eskiTutar = Number(hareket.tutar || 0);
        const fark = yeniTutar - eskiTutar;
        if (fark > 0 && Number(musteri.bakiye || 0) < fark) {
            return res.status(409).json({ basarili: false, mesaj: "Yeni tahsilat tutarı müşterinin kalan bakiyesini aşamaz." });
        }

        const paraHareket = await ParaHareket.findOne({ tenantId: tId, kaynak: "TAHSILAT", kaynakId: hareket._id });
        let hesap = null;
        if (paraHareket) {
            hesap = paraHareket.hesapTipi === "KASA"
                ? await Kasa.findOne({ _id: paraHareket.hesapId, tenantId: tId })
                : await Banka.findOne({ _id: paraHareket.hesapId, tenantId: tId });
            if (!hesap) return res.status(409).json({ basarili: false, mesaj: "Tahsilatın aktarıldığı hesap bulunamadı." });
            if (fark < 0 && Number(hesap.bakiye || 0) < Math.abs(fark)) {
                return res.status(409).json({ basarili: false, mesaj: "Hesap bakiyesi tahsilat tutarını azaltmaya yetmiyor." });
            }
        }

        musteri.bakiye -= fark;
        await musteri.save();
        if (hesap) {
            hesap.bakiye += fark;
            await hesap.save();
            paraHareket.tutar = yeniTutar;
            paraHareket.tarih = body.tarih || hareket.tarih;
            paraHareket.aciklama = String(body.aciklama ?? hareket.aciklama ?? "").trim();
            await paraHareket.save();
        }

        hareket.tutar = yeniTutar;
        hareket.bakiyeDegisimi = -yeniTutar;
        if (hareket.oncekiBakiye !== null) hareket.sonrakiBakiye = Number(hareket.oncekiBakiye) - yeniTutar;
        hareket.tarih = body.tarih || hareket.tarih;
        hareket.aciklama = String(body.aciklama ?? hareket.aciklama ?? "").trim();
        await hareket.save();
        await CekSenetPortfoy.updateMany({ tenantId: tId, kaynak: "TAHSILAT", kaynakId: hareket._id, durum: { $ne: "IPTAL" } }, { $set: { tutar: yeniTutar } });
        await auditKaydet({ req, action: "CUSTOMER_COLLECTION_CORRECTED", resource: "CariHareket", resourceId: String(hareket._id), tenantId: tId, category: "MUHASEBE_DUZELTME", severity: "UYARI", details: { islemId: String(hareket._id), transactionId: req.transactionId, eskiDeger, yeniDeger: hareket.toObject() } });

        return res.json({
            basarili: true,
            mesaj: "Tahsilat güncellendi; müşteri ve hesap bakiyeleri fark kadar düzeltildi.",
            musteriBakiye: musteri.bakiye,
            cariHareket: hareket,
            paraHareket
        });
    } catch (error) { next(error); }
}

async function musteriOdeme(req, res, next) {
    try {
        const tId = tenantId(req), body = req.body || {}, tutar = Number(body.tutar || 0);
        const odeme = odemeBilgisi(body);
        if (!mongoose.Types.ObjectId.isValid(String(body.musteriId || "")) || !Number.isFinite(tutar) || tutar <= 0 || !odeme) {
            return res.status(400).json({ basarili: false, mesaj: "Müşteri, pozitif tutar ve geçerli ödeme yöntemi zorunludur." });
        }
        const musteri = await Musteri.findOne({ _id: body.musteriId, tenantId: tId, ...musteriSahiplik(req) });
        if (!musteri) return res.status(404).json({ basarili: false, mesaj: "Müşteri bulunamadı." });
        const hesap = odeme.hesapTipi ? await hesapBul(req, odeme.hesapTipi, body.hesapId) : null;
        if (odeme.hesapTipi && !hesap) return res.status(404).json({ basarili: false, mesaj: "Ödeme hesabı bulunamadı." });
        const sonuc = await hareketKaydet({
            tenantId: tId, tarafTipi: "MUSTERI", tarafId: musteri._id,
            tip: "ODEME", tutar, bakiyeDegisimi: tutar,
            aciklama: String(body.aciklama || "Müşteriye ödeme").trim(), kaynak: "MUSTERI_ODEME",
            belgeNo: body.belgeNo, odemeYontemi: odeme.yontem,
            tarih: body.tarih || new Date(), kullaniciId: aktorId(req),
            hesap, paraTipi: hesap ? "CIKIS" : null
        });
        return res.status(201).json({ basarili: true, mesaj: "Müşteri ödemesi kaydedildi.", musteriBakiye: sonuc.taraf.bakiye, cariHareket: sonuc.cariHareket, paraHareket: sonuc.paraHareket });
    } catch (error) { next(error); }
}

async function musteriBakiyeDuzelt(req, res, next) {
    try {
        const tId = tenantId(req), body = req.body || {}, yeniBakiye = Number(body.yeniBakiye);
        if (!mongoose.Types.ObjectId.isValid(String(req.params.musteriId || "")) || !Number.isFinite(yeniBakiye)) {
            return res.status(400).json({ basarili: false, mesaj: "Geçerli müşteri ve yeni bakiye zorunludur." });
        }
        const musteri = await Musteri.findOne({ _id: req.params.musteriId, tenantId: tId });
        if (!musteri) return res.status(404).json({ basarili: false, mesaj: "Müşteri bulunamadı." });
        const oncekiBakiye = Number(musteri.bakiye || 0), fark = yeniBakiye - oncekiBakiye;
        if (Math.abs(fark) < 0.000001) return res.status(409).json({ basarili: false, mesaj: "Yeni bakiye mevcut bakiyeyle aynı." });
        musteri.bakiye = yeniBakiye; await musteri.save();
        try {
            const hareket = await CariHareket.create({
                tenantId: tId, tarafTipi: "MUSTERI", tarafId: musteri._id, tip: "DUZELTME", tutar: Math.abs(fark),
                aciklama: String(body.aciklama || "Yetkili cari bakiye düzeltmesi").trim(), kaynak: "BAKIYE_DUZELTME",
                belgeNo: String(body.belgeNo || "").trim(), bakiyeDegisimi: fark, oncekiBakiye, sonrakiBakiye: yeniBakiye,
                tarih: body.tarih || new Date(), kullaniciId: aktorId(req)
            });
            return res.json({ basarili: true, mesaj: "Cari bakiye düzeltildi.", oncekiBakiye, musteriBakiye: yeniBakiye, fark, hareket });
        } catch (error) { musteri.bakiye = oncekiBakiye; await musteri.save(); throw error; }
    } catch (error) { next(error); }
}

async function tedarikciOdeme(req, res, next) {
    try {
        const tId = tenantId(req);
        const body = req.body || {};
        const tutar = Number(body.tutar || 0);

        if (!mongoose.Types.ObjectId.isValid(String(body.tedarikciId || "")) || !Number.isFinite(tutar) || tutar <= 0) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Tedarikçi ve pozitif tutar zorunludur."
            });
        }

        const odeme = odemeBilgisi(body);
        if (!odeme) return res.status(400).json({ basarili: false, mesaj: "Ödeme yöntemi nakit, kredi kartı, senet veya çek olmalıdır." });

        const hesap = odeme.hesapTipi ? await hesapBul(req, odeme.hesapTipi, body.hesapId) : null;

        if (odeme.hesapTipi && !hesap) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Ödeme hesabı bulunamadı."
            });
        }

        const sonuc = await tedarikciOdemeKaydet({
            tenantId: tId, tedarikciId: body.tedarikciId, tutar,
            aciklama: body.aciklama || "Tedarikçi ödemesi",
            belgeNo: body.belgeNo, odemeYontemi: odeme.yontem,
            tarih: body.tarih || new Date(), kullaniciId: aktorId(req),
            hesap
        });
        return res.status(201).json({
            basarili: true,
            mesaj: sonuc.taraf.bakiye < 0 ? "Ödeme kaydedildi; tedarikçi hesabı avans/alacak bakiyesine geçti." : "Ödeme kaydedildi.",
            tedarikciBakiye: sonuc.taraf.bakiye, hesap, cariHareket: sonuc.cariHareket, paraHareket: sonuc.paraHareket
        });
    } catch (error) {
        next(error);
    }
}

async function tedarikciOdemeGuncelle(req, res, next) {
    const session = await mongoose.startSession();
    let sonuc;
    try {
        await session.withTransaction(async () => {
            const tId = tenantId(req), body = req.body || {}, yeniTutar = Number(body.tutar || 0);
            if (!Number.isFinite(yeniTutar) || yeniTutar <= 0) throw Object.assign(new Error("Ödeme tutarı pozitif olmalıdır."), { status: 400 });
            const hareket = await CariHareket.findOne({ _id: req.params.id, tenantId: tId, tarafTipi: "TEDARIKCI", tip: "ODEME", kaynak: "ODEME", durum: "AKTIF" }).session(session);
            if (!hareket) throw Object.assign(new Error("Aktif tedarikçi ödemesi bulunamadı."), { status: 404 });
            const eski = hareket.toObject(), eskiTutar = Number(hareket.tutar || 0), fark = yeniTutar - eskiTutar;
            const tedarikci = await Tedarikci.findOne({ _id: hareket.tarafId, tenantId: tId }).session(session);
            if (!tedarikci) throw Object.assign(new Error("Ödemenin tedarikçi kaydı bulunamadı."), { status: 409 });
            const para = await ParaHareket.findOne({ tenantId: tId, kaynak: "ODEME", kaynakId: hareket._id }).session(session);
            let hesap = null;
            if (para) {
                const Model = para.hesapTipi === "KASA" ? Kasa : Banka;
                hesap = await Model.findOne({ _id: para.hesapId, tenantId: tId }).session(session);
                if (!hesap) throw Object.assign(new Error("Ödemenin kasa/banka hesabı bulunamadı."), { status: 409 });
                if (fark > 0 && Number(hesap.bakiye || 0) < fark) throw Object.assign(new Error("Ödeme hesabında düzeltme farkı için yeterli bakiye yok."), { status: 409 });
                hesap.bakiye = Number(hesap.bakiye || 0) - fark;
                await hesap.save({ session });
                if (Math.abs(fark) > 0.000001) await ParaHareket.create([{ tenantId: tId, hesapTipi: para.hesapTipi, hesapId: para.hesapId, tip: fark > 0 ? "CIKIS" : "GIRIS", tutar: Math.abs(fark), paraBirimi: para.paraBirimi || "TRY", aciklama: `Tedarikçi ödeme düzeltmesi: ${hareket.belgeNo || hareket._id}`, kaynak: "ODEME_DUZELTME", kaynakId: hareket._id, orijinalHareketId: para._id, belgeNo: hareket.belgeNo || "", tarih: body.tarih || new Date(), kullaniciId: aktorId(req), islemAnahtari: `TX:${req.transactionId}:PARA:TEDARIKCI_ODEME_DUZELTME:${hareket._id}` }], { session });
            }
            tedarikci.bakiye = Number(tedarikci.bakiye || 0) - fark;
            await tedarikci.save({ session });
            hareket.tutar = yeniTutar; hareket.bakiyeDegisimi = -yeniTutar;
            if (hareket.oncekiBakiye !== null) hareket.sonrakiBakiye = Number(hareket.oncekiBakiye) - yeniTutar;
            hareket.tarih = body.tarih || hareket.tarih; hareket.aciklama = String(body.aciklama ?? hareket.aciklama ?? "").trim();
            await hareket.save({ session });
            const dagitim = await tedarikciFaturalariYenidenDagit({ tenantId: tId, tedarikciId: hareket.tarafId, session });
            sonuc = { hareket, eski, yeni: hareket.toObject(), tedarikciBakiye: tedarikci.bakiye, dagitim };
        });
        await auditKaydet({ req, action: "SUPPLIER_PAYMENT_CORRECTED", resource: "CariHareket", resourceId: String(req.params.id), tenantId: tenantId(req), category: "MUHASEBE_DUZELTME", severity: "UYARI", details: { islemId: String(req.params.id), transactionId: req.transactionId, eskiDeger: sonuc.eski, yeniDeger: sonuc.yeni } });
        return res.json({ basarili: true, mesaj: "Tedarikçi ödemesi; cari, kasa/banka ve açık faturalarla birlikte düzeltildi.", ...sonuc });
    } catch (error) { next(error); }
    finally { await session.endSession(); }
}

async function tedarikciOdemeIptal(req, res, next) {
    const session = await mongoose.startSession();
    let sonuc;
    try {
        await session.withTransaction(async () => {
            const tId = tenantId(req);
            const hareket = await CariHareket.findOneAndUpdate({ _id: req.params.id, tenantId: tId, tarafTipi: "TEDARIKCI", tip: "ODEME", kaynak: "ODEME", durum: "AKTIF" }, { $set: { durum: "IPTAL_ISLENIYOR" } }, { new: true, session });
            if (!hareket) throw Object.assign(new Error("Aktif tedarikçi ödemesi bulunamadı veya iptal edilmiş."), { status: 404 });
            const eski = hareket.toObject(), tutar = Number(hareket.tutar || 0);
            const tedarikci = await Tedarikci.findOne({ _id: hareket.tarafId, tenantId: tId }).session(session);
            if (!tedarikci) throw Object.assign(new Error("Ödemenin tedarikçi kaydı bulunamadı."), { status: 409 });
            tedarikci.bakiye = Number(tedarikci.bakiye || 0) + tutar; await tedarikci.save({ session });
            const para = await ParaHareket.findOne({ tenantId: tId, kaynak: "ODEME", kaynakId: hareket._id }).session(session);
            let tersHareket = null;
            if (para) {
                const Model = para.hesapTipi === "KASA" ? Kasa : Banka, hesap = await Model.findOne({ _id: para.hesapId, tenantId: tId }).session(session);
                if (!hesap) throw Object.assign(new Error("Ödemenin kasa/banka hesabı bulunamadı."), { status: 409 });
                hesap.bakiye = Number(hesap.bakiye || 0) + tutar; await hesap.save({ session });
                [tersHareket] = await ParaHareket.create([{ tenantId: tId, hesapTipi: para.hesapTipi, hesapId: para.hesapId, tip: "GIRIS", tutar, paraBirimi: para.paraBirimi || "TRY", aciklama: `Tedarikçi ödeme iptali: ${hareket.belgeNo || hareket._id}`, kaynak: "ODEME_IPTAL", kaynakId: hareket._id, orijinalHareketId: para._id, belgeNo: hareket.belgeNo || "", tarih: new Date(), kullaniciId: aktorId(req), islemAnahtari: `TX:${req.transactionId}:PARA:TEDARIKCI_ODEME_IPTAL:${hareket._id}` }], { session });
            }
            hareket.durum = "IPTAL"; hareket.iptalTarihi = new Date(); hareket.iptalNedeni = String(req.body?.neden || "Tedarikçi ödemesi iptal edildi").trim(); hareket.iptalEdenKullaniciId = aktorId(req); hareket.iptalParaHareketId = tersHareket?._id || null; await hareket.save({ session });
            const dagitim = await tedarikciFaturalariYenidenDagit({ tenantId: tId, tedarikciId: hareket.tarafId, session });
            sonuc = { hareket, eski, yeni: hareket.toObject(), tersHareket, tedarikciBakiye: tedarikci.bakiye, dagitim };
        });
        await auditKaydet({ req, action: "SUPPLIER_PAYMENT_CANCELLED", resource: "CariHareket", resourceId: String(req.params.id), tenantId: tenantId(req), category: "MUHASEBE_IPTAL", severity: "KRITIK", details: { islemId: String(req.params.id), transactionId: req.transactionId, eskiDeger: sonuc.eski, yeniDeger: sonuc.yeni } });
        return res.json({ basarili: true, mesaj: "Tedarikçi ödemesi silinmeden ters finans kaydıyla iptal edildi; faturalar yeniden dağıtıldı.", ...sonuc });
    } catch (error) { next(error); }
    finally { await session.endSession(); }
}

async function tedarikciManuelHareket(req, res, next) {
    try {
        const tId = tenantId(req), body = req.body || {}, tutar = Number(body.tutar || 0), tip = String(body.tip || "").toUpperCase();
        if (!mongoose.Types.ObjectId.isValid(String(body.tedarikciId || "")) || !["BORC", "ALACAK", "MASRAF"].includes(tip) || !Number.isFinite(tutar) || tutar <= 0) return res.status(400).json({ basarili: false, mesaj: "Tedarikçi, işlem türü ve pozitif tutar zorunludur." });
        const hareketTipi = tip === "MASRAF" ? "ALACAK" : tip, degisim = hareketTipi === "ALACAK" ? tutar : -tutar;
        const sonuc = await hareketKaydet({ tenantId: tId, tarafTipi: "TEDARIKCI", tarafId: body.tedarikciId, tip: hareketTipi, tutar, bakiyeDegisimi: degisim, aciklama: String(body.aciklama || "Manuel tedarikçi cari işlemi").trim(), kaynak: tip === "MASRAF" ? "MASRAF" : "MANUEL", belgeNo: body.belgeNo, tarih: body.tarih || new Date(), kullaniciId: aktorId(req) });
        return res.status(201).json({ basarili: true, mesaj: "Tedarikçi cari hareketi kaydedildi.", tedarikciBakiye: sonuc.taraf.bakiye, hareket: sonuc.cariHareket });
    } catch (error) { next(error); }
}

async function tedarikciBakiyeDuzelt(req, res, next) {
    try {
        const tId = tenantId(req), body = req.body || {}, yeniBakiye = Number(body.yeniBakiye);
        if (!mongoose.Types.ObjectId.isValid(String(req.params.tedarikciId || "")) || !Number.isFinite(yeniBakiye)) return res.status(400).json({ basarili: false, mesaj: "Geçerli tedarikçi ve yeni bakiye zorunludur." });
        const tedarikci = await Tedarikci.findOne({ _id: req.params.tedarikciId, tenantId: tId });
        if (!tedarikci) return res.status(404).json({ basarili: false, mesaj: "Tedarikçi bulunamadı." });
        const oncekiBakiye = Number(tedarikci.bakiye || 0), fark = yeniBakiye - oncekiBakiye;
        if (Math.abs(fark) < 0.000001) return res.status(409).json({ basarili: false, mesaj: "Yeni bakiye mevcut bakiyeyle aynı." });
        const sonuc = await hareketKaydet({ tenantId: tId, tarafTipi: "TEDARIKCI", tarafId: tedarikci._id, tip: "DUZELTME", tutar: Math.abs(fark), bakiyeDegisimi: fark, aciklama: String(body.aciklama || "Yetkili tedarikçi bakiye düzeltmesi").trim(), kaynak: "BAKIYE_DUZELTME", belgeNo: body.belgeNo, tarih: body.tarih || new Date(), kullaniciId: aktorId(req) });
        return res.json({ basarili: true, mesaj: "Tedarikçi bakiyesi düzeltildi.", tedarikciBakiye: sonuc.taraf.bakiye, hareket: sonuc.cariHareket });
    } catch (error) { next(error); }
}

async function tedarikciTahsilat(req, res, next) {
    try {
        const tId = tenantId(req), body = req.body || {}, tutar = Number(body.tutar || 0), odeme = odemeBilgisi(body);
        if (!mongoose.Types.ObjectId.isValid(String(body.tedarikciId || "")) || !Number.isFinite(tutar) || tutar <= 0 || !odeme) return res.status(400).json({ basarili: false, mesaj: "Tedarikçi, pozitif tutar ve geçerli ödeme yöntemi zorunludur." });
        const hesap = odeme.hesapTipi ? await hesapBul(req, odeme.hesapTipi, body.hesapId) : null; if (odeme.hesapTipi && !hesap) return res.status(404).json({ basarili: false, mesaj: "Tahsilat hesabı bulunamadı." });
        const sonuc = await hareketKaydet({ tenantId: tId, tarafTipi: "TEDARIKCI", tarafId: body.tedarikciId, tip: "TAHSILAT", tutar, bakiyeDegisimi: tutar, odemeYontemi: odeme.yontem, aciklama: String(body.aciklama || "Tedarikçiden tahsilat").trim(), kaynak: "TEDARIKCI_TAHSILAT", belgeNo: body.belgeNo, tarih: body.tarih || new Date(), kullaniciId: aktorId(req), hesap, paraTipi: hesap ? "GIRIS" : null });
        return res.status(201).json({ basarili: true, mesaj: "Tedarikçi tahsilatı kaydedildi.", tedarikciBakiye: sonuc.taraf.bakiye, cariHareket: sonuc.cariHareket, paraHareket: sonuc.paraHareket });
    } catch (error) { next(error); }
}

module.exports = {
    ozet,
    hareketler,
    musteriTahsilat,
    musteriTahsilatGuncelle,
    musteriTahsilatSil,
    musteriOdeme,
    musteriBakiyeDuzelt,
    tedarikciOdeme,
    tedarikciOdemeGuncelle,
    tedarikciOdemeIptal,
    tedarikciTahsilat,
    tedarikciManuelHareket,
    tedarikciBakiyeDuzelt,
    musteriManuelHareket,
    ekstrePaylas,
    paylasilanEkstre,
    tedarikciOdemeSonrasiBakiye
};
