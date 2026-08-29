const mongoose = require("mongoose");

const Kasa = require("../models/Kasa");
const Banka = require("../models/Banka");
const ParaHareket = require("../models/ParaHareket");

function tenantId(req) { return new mongoose.Types.ObjectId(String(req.tenantId)); }
function metin(value) { return String(value ?? "").trim(); }
function paraBirimi(value) {
    const kod = metin(value || "TRY").toUpperCase();
    if (!["TRY", "USD", "EUR"].includes(kod)) throw Object.assign(new Error("Para birimi TRY, USD veya EUR olmalıdır."), { status: 400 });
    return kod;
}
function tutarDogrula(value) {
    const tutar = Number(value);
    if (!Number.isFinite(tutar) || tutar <= 0) throw Object.assign(new Error("Tutar sıfırdan büyük olmalıdır."), { status: 400 });
    return tutar;
}
function hesapModeli(tip) {
    if (tip === "KASA") return Kasa;
    if (tip === "BANKA") return Banka;
    throw Object.assign(new Error("Hesap tipi KASA veya BANKA olmalıdır."), { status: 400 });
}
function kullaniciId(req) { return req.kullanici?._id || req.user?._id || null; }

async function acilisHareketi(req, hesapTipi, hesap) {
    const bakiye = Number(hesap.bakiye || 0);
    if (!bakiye) return;
    await ParaHareket.create({
        tenantId: tenantId(req), hesapTipi, hesapId: hesap._id,
        tip: bakiye > 0 ? "GIRIS" : "CIKIS", tutar: Math.abs(bakiye), paraBirimi: hesap.paraBirimi,
        aciklama: "Hesap açılış bakiyesi", kaynak: "ACILIS", belgeNo: `ACILIS-${hesap.kod}`,
        kullaniciId: kullaniciId(req)
    });
}

async function kasaListele(req, res, next) {
    try { const kasalar = await Kasa.find({ tenantId: tenantId(req) }).sort({ aktif: -1, ad: 1 }).lean(); res.json({ basarili: true, toplam: kasalar.length, kasalar }); }
    catch (error) { next(error); }
}

async function kasaOlustur(req, res, next) {
    try {
        const body = req.body || {}, bakiye = Number(body.bakiye || 0);
        if (!metin(body.kod) || !metin(body.ad)) return res.status(400).json({ basarili: false, mesaj: "Kasa kodu ve kasa adı zorunludur." });
        if (!Number.isFinite(bakiye)) return res.status(400).json({ basarili: false, mesaj: "Açılış bakiyesi geçersizdir." });
        const kasa = await Kasa.create({ tenantId: tenantId(req), kod: metin(body.kod).toUpperCase(), ad: metin(body.ad), bakiye, paraBirimi: paraBirimi(body.paraBirimi), aktif: body.aktif !== false, aciklama: metin(body.aciklama) });
        await acilisHareketi(req, "KASA", kasa);
        res.status(201).json({ basarili: true, mesaj: "Kasa hesabı oluşturuldu.", kasa });
    } catch (error) { next(error); }
}

async function bankaListele(req, res, next) {
    try { const bankalar = await Banka.find({ tenantId: tenantId(req) }).sort({ aktif: -1, bankaAdi: 1 }).lean(); res.json({ basarili: true, toplam: bankalar.length, bankalar }); }
    catch (error) { next(error); }
}

async function bankaOlustur(req, res, next) {
    try {
        const body = req.body || {}, bakiye = Number(body.bakiye || 0);
        if (!metin(body.kod) || !metin(body.bankaAdi)) return res.status(400).json({ basarili: false, mesaj: "Banka kodu ve banka adı zorunludur." });
        if (!Number.isFinite(bakiye)) return res.status(400).json({ basarili: false, mesaj: "Açılış bakiyesi geçersizdir." });
        const banka = await Banka.create({ tenantId: tenantId(req), kod: metin(body.kod).toUpperCase(), bankaAdi: metin(body.bankaAdi), sube: metin(body.sube), iban: metin(body.iban).replace(/\s+/g, "").toUpperCase(), hesapNo: metin(body.hesapNo), bakiye, paraBirimi: paraBirimi(body.paraBirimi), aktif: body.aktif !== false, aciklama: metin(body.aciklama) });
        await acilisHareketi(req, "BANKA", banka);
        res.status(201).json({ basarili: true, mesaj: "Banka hesabı oluşturuldu.", banka });
    } catch (error) { next(error); }
}

async function hesapGuncelle(req, res, next) {
    try {
        const tip = metin(req.params.tip).toUpperCase(), Model = hesapModeli(tip);
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ basarili: false, mesaj: "Geçersiz hesap." });
        const hesap = await Model.findOne({ _id: req.params.id, tenantId: tenantId(req) });
        if (!hesap) return res.status(404).json({ basarili: false, mesaj: "Hesap bulunamadı." });
        const body = req.body || {};
        if (body.kod !== undefined) hesap.kod = metin(body.kod).toUpperCase();
        if (tip === "KASA" && body.ad !== undefined) hesap.ad = metin(body.ad);
        if (tip === "BANKA" && body.bankaAdi !== undefined) hesap.bankaAdi = metin(body.bankaAdi);
        for (const alan of ["sube", "hesapNo", "aciklama"]) if (tip === "BANKA" || alan === "aciklama") if (body[alan] !== undefined) hesap[alan] = metin(body[alan]);
        if (tip === "BANKA" && body.iban !== undefined) hesap.iban = metin(body.iban).replace(/\s+/g, "").toUpperCase();
        if (body.aktif !== undefined) hesap.aktif = body.aktif === true;
        if (body.paraBirimi !== undefined && Number(hesap.bakiye || 0) === 0) hesap.paraBirimi = paraBirimi(body.paraBirimi);
        if (!metin(hesap.kod) || !metin(tip === "KASA" ? hesap.ad : hesap.bankaAdi)) return res.status(400).json({ basarili: false, mesaj: "Hesap kodu ve adı zorunludur." });
        await hesap.save();
        res.json({ basarili: true, mesaj: "Hesap bilgileri güncellendi.", hesap });
    } catch (error) { next(error); }
}

async function paraHareketleri(req, res, next) {
    try {
        const filter = { tenantId: tenantId(req) };
        if (["KASA", "BANKA"].includes(req.query.hesapTipi)) filter.hesapTipi = req.query.hesapTipi;
        if (mongoose.Types.ObjectId.isValid(String(req.query.hesapId || ""))) filter.hesapId = req.query.hesapId;
        if (["GIRIS", "CIKIS"].includes(req.query.tip)) filter.tip = req.query.tip;
        if (req.query.kaynak) filter.kaynak = metin(req.query.kaynak);
        if (req.query.baslangic || req.query.bitis) {
            filter.tarih = {};
            if (req.query.baslangic) filter.tarih.$gte = new Date(`${req.query.baslangic}T00:00:00`);
            if (req.query.bitis) filter.tarih.$lte = new Date(`${req.query.bitis}T23:59:59.999`);
        }
        const limit = Math.min(500, Math.max(1, Number(req.query.limit || 200)));
        const [hareketler, toplam] = await Promise.all([
            ParaHareket.find(filter).populate("kullaniciId", "adSoyad email").sort({ tarih: -1, createdAt: -1 }).limit(limit).lean(),
            ParaHareket.countDocuments(filter)
        ]);
        res.json({ basarili: true, toplam, gosterilen: hareketler.length, hareketler });
    } catch (error) { next(error); }
}

async function hesapHareketi(req, res, next) {
    try {
        const tId = tenantId(req), body = req.body || {}, hesapTipi = metin(body.hesapTipi).toUpperCase(), tip = metin(body.tip).toUpperCase();
        const Model = hesapModeli(hesapTipi), tutar = tutarDogrula(body.tutar);
        if (!mongoose.Types.ObjectId.isValid(String(body.hesapId || ""))) return res.status(400).json({ basarili: false, mesaj: "Geçersiz hesap." });
        if (!["GIRIS", "CIKIS"].includes(tip)) return res.status(400).json({ basarili: false, mesaj: "İşlem türü para girişi veya para çıkışı olmalıdır." });
        const filter = { _id: body.hesapId, tenantId: tId, aktif: true };
        if (tip === "CIKIS") filter.bakiye = { $gte: tutar };
        const hesap = await Model.findOneAndUpdate(filter, { $inc: { bakiye: tip === "GIRIS" ? tutar : -tutar } }, { new: true });
        if (!hesap) return res.status(409).json({ basarili: false, mesaj: tip === "CIKIS" ? "Hesap bulunamadı, pasif veya bakiye yetersiz." : "Hesap bulunamadı veya pasif." });
        try {
            const hareket = await ParaHareket.create({ tenantId: tId, hesapTipi, hesapId: hesap._id, tip, tutar, paraBirimi: hesap.paraBirimi, aciklama: metin(body.aciklama) || (tip === "GIRIS" ? "Diğer para girişi" : "Diğer para çıkışı"), kaynak: "MANUEL", belgeNo: metin(body.belgeNo), tarih: body.tarih || new Date(), kullaniciId: kullaniciId(req) });
            res.status(201).json({ basarili: true, mesaj: "Para hareketi kaydedildi.", hesap, hareket });
        } catch (error) {
            await Model.updateOne({ _id: hesap._id, tenantId: tId }, { $inc: { bakiye: tip === "GIRIS" ? -tutar : tutar } });
            throw error;
        }
    } catch (error) { next(error); }
}

async function transfer(req, res, next) {
    try {
        const tId = tenantId(req), body = req.body || {}, tutar = tutarDogrula(body.tutar);
        const kaynakTip = metin(body.kaynakHesapTipi).toUpperCase(), hedefTip = metin(body.hedefHesapTipi).toUpperCase();
        const KaynakModel = hesapModeli(kaynakTip), HedefModel = hesapModeli(hedefTip);
        const kaynakId = metin(body.kaynakHesapId), hedefId = metin(body.hedefHesapId);
        if (!mongoose.Types.ObjectId.isValid(kaynakId) || !mongoose.Types.ObjectId.isValid(hedefId)) return res.status(400).json({ basarili: false, mesaj: "Kaynak ve hedef hesap geçerli olmalıdır." });
        if (kaynakTip === hedefTip && kaynakId === hedefId) return res.status(400).json({ basarili: false, mesaj: "Kaynak ve hedef hesap aynı olamaz." });
        const [kaynakKontrol, hedefKontrol] = await Promise.all([KaynakModel.findOne({ _id: kaynakId, tenantId: tId, aktif: true }), HedefModel.findOne({ _id: hedefId, tenantId: tId, aktif: true })]);
        if (!kaynakKontrol || !hedefKontrol) return res.status(404).json({ basarili: false, mesaj: "Kaynak veya hedef hesap bulunamadı ya da pasif." });
        if (kaynakKontrol.paraBirimi !== hedefKontrol.paraBirimi) return res.status(409).json({ basarili: false, mesaj: "Farklı para birimindeki hesaplar arasında doğrudan transfer yapılamaz." });
        const kaynak = await KaynakModel.findOneAndUpdate({ _id: kaynakId, tenantId: tId, aktif: true, bakiye: { $gte: tutar } }, { $inc: { bakiye: -tutar } }, { new: true });
        if (!kaynak) return res.status(409).json({ basarili: false, mesaj: "Kaynak hesap bakiyesi yetersiz." });
        const hedef = await HedefModel.findOneAndUpdate({ _id: hedefId, tenantId: tId, aktif: true }, { $inc: { bakiye: tutar } }, { new: true });
        if (!hedef) { await KaynakModel.updateOne({ _id: kaynakId, tenantId: tId }, { $inc: { bakiye: tutar } }); return res.status(409).json({ basarili: false, mesaj: "Hedef hesap güncellenemedi." }); }
        const transferId = new mongoose.Types.ObjectId(), ortak = { tenantId: tId, tutar, paraBirimi: kaynak.paraBirimi, kaynak: "TRANSFER", kaynakId: transferId, belgeNo: metin(body.belgeNo) || `TRF-${Date.now()}`, aciklama: metin(body.aciklama) || "Hesaplar arası transfer", tarih: body.tarih || new Date(), kullaniciId: kullaniciId(req) };
        try {
            const hareketler = await ParaHareket.insertMany([
                { ...ortak, hesapTipi: kaynakTip, hesapId: kaynak._id, tip: "CIKIS", karsiHesapTipi: hedefTip, karsiHesapId: hedef._id },
                { ...ortak, hesapTipi: hedefTip, hesapId: hedef._id, tip: "GIRIS", karsiHesapTipi: kaynakTip, karsiHesapId: kaynak._id }
            ]);
            res.status(201).json({ basarili: true, mesaj: "Hesaplar arası transfer tamamlandı.", kaynak, hedef, hareketler });
        } catch (error) {
            await Promise.all([KaynakModel.updateOne({ _id: kaynakId, tenantId: tId }, { $inc: { bakiye: tutar } }), HedefModel.updateOne({ _id: hedefId, tenantId: tId }, { $inc: { bakiye: -tutar } })]);
            throw error;
        }
    } catch (error) { next(error); }
}

function paraToplamlari(hesaplar) {
    return hesaplar.reduce((sonuc, hesap) => { const kod = hesap.paraBirimi || "TRY"; sonuc[kod] = (sonuc[kod] || 0) + Number(hesap.bakiye || 0); return sonuc; }, { TRY: 0, USD: 0, EUR: 0 });
}
function akisToplamlari(rows) {
    const sonuc = { TRY: { giris: 0, cikis: 0 }, USD: { giris: 0, cikis: 0 }, EUR: { giris: 0, cikis: 0 } };
    for (const row of rows) { const kod = row._id.paraBirimi || "TRY", alan = row._id.tip === "GIRIS" ? "giris" : "cikis"; sonuc[kod][alan] += Number(row.toplam || 0); }
    return sonuc;
}

async function ozet(req, res, next) {
    try {
        const tId = tenantId(req), simdi = new Date(), bugun = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate()), ay = new Date(simdi.getFullYear(), simdi.getMonth(), 1);
        const [kasalar, bankalar, sonHareketler, bugunAkis, ayAkis] = await Promise.all([
            Kasa.find({ tenantId: tId }).sort({ aktif: -1, ad: 1 }).lean(),
            Banka.find({ tenantId: tId }).sort({ aktif: -1, bankaAdi: 1 }).lean(),
            ParaHareket.find({ tenantId: tId }).populate("kullaniciId", "adSoyad email").sort({ tarih: -1, createdAt: -1 }).limit(100).lean(),
            ParaHareket.aggregate([{ $match: { tenantId: tId, tarih: { $gte: bugun }, kaynak: { $ne: "TRANSFER" } } }, { $group: { _id: { paraBirimi: "$paraBirimi", tip: "$tip" }, toplam: { $sum: "$tutar" } } }]),
            ParaHareket.aggregate([{ $match: { tenantId: tId, tarih: { $gte: ay }, kaynak: { $ne: "TRANSFER" } } }, { $group: { _id: { paraBirimi: "$paraBirimi", tip: "$tip" }, toplam: { $sum: "$tutar" } } }])
        ]);
        const aktifKasalar = kasalar.filter(x => x.aktif !== false), aktifBankalar = bankalar.filter(x => x.aktif !== false), kasaToplamlari = paraToplamlari(aktifKasalar), bankaToplamlari = paraToplamlari(aktifBankalar);
        res.json({ basarili: true, kasaToplam: kasaToplamlari.TRY, bankaToplam: bankaToplamlari.TRY, toplamNakit: kasaToplamlari.TRY + bankaToplamlari.TRY, toplamlar: { kasa: kasaToplamlari, banka: bankaToplamlari, genel: { TRY: kasaToplamlari.TRY + bankaToplamlari.TRY, USD: kasaToplamlari.USD + bankaToplamlari.USD, EUR: kasaToplamlari.EUR + bankaToplamlari.EUR } }, nakitAkisi: { bugun: akisToplamlari(bugunAkis), ay: akisToplamlari(ayAkis) }, kasalar, bankalar, sonHareketler });
    } catch (error) { next(error); }
}

module.exports = { kasaListele, kasaOlustur, bankaListele, bankaOlustur, hesapGuncelle, paraHareketleri, hesapHareketi, transfer, ozet };
