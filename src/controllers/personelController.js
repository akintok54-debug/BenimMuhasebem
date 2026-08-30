const mongoose = require("mongoose");
const Personel = require("../models/Personel");
const PersonelIzin = require("../models/PersonelIzin");
const PersonelDevam = require("../models/PersonelDevam");

const tenantId = req => new mongoose.Types.ObjectId(String(req.tenantId));
const kullaniciId = req => req.kullanici?.kullaniciId || req.user?.kullaniciId || null;
const metin = (value, max = 250) => String(value || "").trim().slice(0, max);

function tarih(value, alan) {
    if (!value) return null;
    const sonuc = new Date(value);
    if (Number.isNaN(sonuc.getTime())) {
        const hata = new Error(`${alan} geçerli bir tarih olmalıdır.`);
        hata.status = 400;
        throw hata;
    }
    return sonuc;
}

function gunBaslangici(value = new Date()) {
    const d = new Date(value);
    d.setUTCHours(0, 0, 0, 0);
    return d;
}

function izinGunHesapla(baslangic, bitis) {
    const fark = gunBaslangici(bitis) - gunBaslangici(baslangic);
    if (fark < 0) {
        const hata = new Error("İzin bitiş tarihi başlangıç tarihinden önce olamaz.");
        hata.status = 400;
        throw hata;
    }
    return Math.floor(fark / 86400000) + 1;
}

function personelGovdesi(body, yeni = false) {
    const sonuc = {};
    const metinAlanlari = ["adSoyad", "telefon", "email", "gorev", "departman", "yonetici", "lokasyon", "iban", "sgkMeslekKodu", "notlar"];
    for (const alan of metinAlanlari) {
        if (yeni || body[alan] !== undefined) sonuc[alan] = metin(body[alan], alan === "notlar" ? 2000 : 250);
    }
    if (yeni || body.kod !== undefined) sonuc.kod = metin(body.kod, 50).toUpperCase();
    for (const alan of ["istihdamTuru", "calismaDurumu", "maasParaBirimi"]) {
        if (body[alan] !== undefined) sonuc[alan] = metin(body[alan], 30).toUpperCase();
    }
    for (const alan of ["iseGirisTarihi", "cikisTarihi", "dogumTarihi"]) {
        if (body[alan] !== undefined) sonuc[alan] = tarih(body[alan], alan);
    }
    for (const alan of ["maas", "yillikIzinHakki"]) {
        if (body[alan] !== undefined) {
            const sayi = Number(body[alan]);
            if (!Number.isFinite(sayi) || sayi < 0) {
                const hata = new Error(`${alan} negatif olamaz.`);
                hata.status = 400;
                throw hata;
            }
            sonuc[alan] = sayi;
        }
    }
    if (body.aktif !== undefined) sonuc.aktif = body.aktif !== false;
    if (body.adres !== undefined) sonuc.adres = {
        acikAdres: metin(body.adres?.acikAdres, 500), il: metin(body.adres?.il, 100), ilce: metin(body.adres?.ilce, 100)
    };
    if (body.acilDurum !== undefined) sonuc.acilDurum = {
        adSoyad: metin(body.acilDurum?.adSoyad), yakinlik: metin(body.acilDurum?.yakinlik, 100), telefon: metin(body.acilDurum?.telefon, 50)
    };
    if (sonuc.email && !/^\S+@\S+\.\S+$/.test(sonuc.email)) {
        const hata = new Error("Geçerli bir personel e-postası girin.");
        hata.status = 400;
        throw hata;
    }
    if (sonuc.iban) sonuc.iban = sonuc.iban.replace(/\s/g, "").toUpperCase();
    if (sonuc.calismaDurumu === "AYRILDI") sonuc.aktif = false;
    return sonuc;
}

async function panel(req, res, next) {
    try {
        const tId = tenantId(req);
        const bugun = gunBaslangici();
        const yarin = new Date(bugun.getTime() + 86400000);
        const ayBasi = new Date(Date.UTC(bugun.getUTCFullYear(), bugun.getUTCMonth(), 1));
        const [toplam, aktif, izinde, bekleyenIzin, departmanlar, devam, bordro] = await Promise.all([
            Personel.countDocuments({ tenantId: tId }),
            Personel.countDocuments({ tenantId: tId, aktif: true, calismaDurumu: { $ne: "AYRILDI" } }),
            PersonelIzin.countDocuments({ tenantId: tId, durum: "ONAYLANDI", baslangicTarihi: { $lte: bugun }, bitisTarihi: { $gte: bugun } }),
            PersonelIzin.countDocuments({ tenantId: tId, durum: "BEKLIYOR" }),
            Personel.aggregate([{ $match: { tenantId: tId, aktif: true } }, { $group: { _id: { $ifNull: ["$departman", "Belirtilmemiş"] }, toplam: { $sum: 1 } } }, { $sort: { toplam: -1 } }]),
            PersonelDevam.aggregate([{ $match: { tenantId: tId, tarih: { $gte: bugun, $lt: yarin } } }, { $group: { _id: "$durum", toplam: { $sum: 1 } } }]),
            Personel.aggregate([{ $match: { tenantId: tId, aktif: true } }, { $group: { _id: "$maasParaBirimi", toplam: { $sum: "$maas" } } }])
        ]);
        res.json({ basarili: true, panel: { toplam, aktif, izinde, bekleyenIzin, departmanlar, devam, bordro, ayBasi } });
    } catch (error) { next(error); }
}

async function listele(req, res, next) {
    try {
        const filter = { tenantId: tenantId(req) };
        const arama = metin(req.query.arama);
        if (req.query.aktif === "true") filter.aktif = true;
        if (req.query.aktif === "false") filter.aktif = false;
        if (req.query.departman) filter.departman = metin(req.query.departman);
        if (arama) filter.$or = ["kod", "adSoyad", "telefon", "email", "gorev", "departman"].map(alan => ({ [alan]: { $regex: arama, $options: "i" } }));
        const personeller = await Personel.find(filter).sort({ aktif: -1, adSoyad: 1 }).lean();
        res.json({ basarili: true, toplam: personeller.length, personeller });
    } catch (error) { next(error); }
}

async function detay(req, res, next) {
    try {
        const filter = { _id: req.params.id, tenantId: tenantId(req) };
        const personel = await Personel.findOne(filter).lean();
        if (!personel) return res.status(404).json({ basarili: false, mesaj: "Personel bulunamadı." });
        const [izinler, devam, kullanilanIzin] = await Promise.all([
            PersonelIzin.find({ tenantId: filter.tenantId, personelId: personel._id }).sort({ baslangicTarihi: -1 }).limit(25).lean(),
            PersonelDevam.find({ tenantId: filter.tenantId, personelId: personel._id }).sort({ tarih: -1 }).limit(31).lean(),
            PersonelIzin.aggregate([{ $match: { tenantId: filter.tenantId, personelId: personel._id, tur: "YILLIK", durum: "ONAYLANDI" } }, { $group: { _id: null, toplam: { $sum: "$gun" } } }])
        ]);
        res.json({ basarili: true, personel, izinler, devam, kullanilanYillikIzin: kullanilanIzin[0]?.toplam || 0 });
    } catch (error) { next(error); }
}

async function olustur(req, res, next) {
    try {
        const govde = personelGovdesi(req.body || {}, true);
        if (!govde.kod || !govde.adSoyad) return res.status(400).json({ basarili: false, mesaj: "Personel kodu ve ad soyad zorunludur." });
        const tId = tenantId(req);
        if (await Personel.exists({ tenantId: tId, kod: govde.kod })) return res.status(409).json({ basarili: false, mesaj: "Bu personel kodu zaten kullanılıyor." });
        const personel = await Personel.create({ tenantId: tId, ...govde });
        res.status(201).json({ basarili: true, personel });
    } catch (error) { next(error); }
}

async function guncelle(req, res, next) {
    try {
        const personel = await Personel.findOne({ _id: req.params.id, tenantId: tenantId(req) });
        if (!personel) return res.status(404).json({ basarili: false, mesaj: "Personel bulunamadı." });
        Object.assign(personel, personelGovdesi(req.body || {}));
        await personel.save();
        res.json({ basarili: true, personel });
    } catch (error) { next(error); }
}

async function izinListele(req, res, next) {
    try {
        const filter = { tenantId: tenantId(req) };
        if (req.query.durum) filter.durum = metin(req.query.durum, 30).toUpperCase();
        if (req.query.personelId) filter.personelId = req.query.personelId;
        const izinler = await PersonelIzin.find(filter).populate("personelId", "kod adSoyad departman gorev").sort({ createdAt: -1 }).limit(250).lean();
        res.json({ basarili: true, izinler });
    } catch (error) { next(error); }
}

async function izinOlustur(req, res, next) {
    try {
        const tId = tenantId(req);
        const personel = await Personel.findOne({ _id: req.body.personelId, tenantId: tId });
        if (!personel) return res.status(404).json({ basarili: false, mesaj: "Personel bulunamadı." });
        const baslangicTarihi = tarih(req.body.baslangicTarihi, "İzin başlangıç tarihi");
        const bitisTarihi = tarih(req.body.bitisTarihi, "İzin bitiş tarihi");
        if (!baslangicTarihi || !bitisTarihi) return res.status(400).json({ basarili: false, mesaj: "İzin tarihleri zorunludur." });
        const izin = await PersonelIzin.create({ tenantId: tId, personelId: personel._id, tur: metin(req.body.tur, 30).toUpperCase() || "YILLIK", baslangicTarihi, bitisTarihi, gun: izinGunHesapla(baslangicTarihi, bitisTarihi), aciklama: metin(req.body.aciklama, 1000), olusturanKullaniciId: kullaniciId(req) });
        res.status(201).json({ basarili: true, izin });
    } catch (error) { next(error); }
}

async function izinDurumGuncelle(req, res, next) {
    try {
        const izin = await PersonelIzin.findOne({ _id: req.params.id, tenantId: tenantId(req) });
        if (!izin) return res.status(404).json({ basarili: false, mesaj: "İzin kaydı bulunamadı." });
        const durum = metin(req.body.durum, 30).toUpperCase();
        if (!["ONAYLANDI", "REDDEDILDI", "IPTAL"].includes(durum)) return res.status(400).json({ basarili: false, mesaj: "Geçersiz izin durumu." });
        izin.durum = durum;
        izin.kararNotu = metin(req.body.kararNotu, 1000);
        izin.kararVerenKullaniciId = kullaniciId(req);
        izin.kararTarihi = new Date();
        await izin.save();
        res.json({ basarili: true, izin });
    } catch (error) { next(error); }
}

async function devamListele(req, res, next) {
    try {
        const filter = { tenantId: tenantId(req) };
        if (req.query.personelId) filter.personelId = req.query.personelId;
        if (req.query.baslangic || req.query.bitis) filter.tarih = {};
        if (req.query.baslangic) filter.tarih.$gte = gunBaslangici(tarih(req.query.baslangic, "Başlangıç tarihi"));
        if (req.query.bitis) filter.tarih.$lte = gunBaslangici(tarih(req.query.bitis, "Bitiş tarihi"));
        const devam = await PersonelDevam.find(filter).populate("personelId", "kod adSoyad departman").sort({ tarih: -1 }).limit(500).lean();
        res.json({ basarili: true, devam });
    } catch (error) { next(error); }
}

async function devamKaydet(req, res, next) {
    try {
        const tId = tenantId(req);
        const personel = await Personel.findOne({ _id: req.body.personelId, tenantId: tId });
        if (!personel) return res.status(404).json({ basarili: false, mesaj: "Personel bulunamadı." });
        const kayitTarihi = gunBaslangici(tarih(req.body.tarih, "Devam tarihi") || new Date());
        const girisSaati = metin(req.body.girisSaati, 10);
        const cikisSaati = metin(req.body.cikisSaati, 10);
        let calismaDakika = 0;
        if (/^\d{2}:\d{2}$/.test(girisSaati) && /^\d{2}:\d{2}$/.test(cikisSaati)) {
            const [gh, gd] = girisSaati.split(":").map(Number);
            const [ch, cd] = cikisSaati.split(":").map(Number);
            calismaDakika = Math.max(0, (ch * 60 + cd) - (gh * 60 + gd));
        }
        const devam = await PersonelDevam.findOneAndUpdate(
            { tenantId: tId, personelId: personel._id, tarih: kayitTarihi },
            { $set: { durum: metin(req.body.durum, 30).toUpperCase() || "GELDI", girisSaati, cikisSaati, calismaDakika, notlar: metin(req.body.notlar, 1000), kaydedenKullaniciId: kullaniciId(req) } },
            { new: true, upsert: true, runValidators: true }
        );
        res.json({ basarili: true, devam });
    } catch (error) { next(error); }
}

module.exports = { panel, listele, detay, olustur, guncelle, izinListele, izinOlustur, izinDurumGuncelle, devamListele, devamKaydet };
