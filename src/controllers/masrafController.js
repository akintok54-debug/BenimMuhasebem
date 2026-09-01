const mongoose = require("mongoose");
const Masraf = require("../models/Masraf");
const Kasa = require("../models/Kasa");
const Banka = require("../models/Banka");
const ParaHareket = require("../models/ParaHareket");
const { kaydet: auditKaydet } = require("../modules/platform/services/auditServisi");

function tenantId(req) { return new mongoose.Types.ObjectId(String(req.tenantId)); }
function kullaniciId(req) { return req.currentUser?._id || req.kullanici?.kullaniciId || req.user?.kullaniciId || req.kullanici?._id || req.user?._id || null; }
function metin(value, max = 500) { return String(value ?? "").trim().slice(0, max); }
function hesapModeli(tip) { return tip === "KASA" ? Kasa : tip === "BANKA" ? Banka : null; }
function regexGuvenli(value) { return metin(value, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function kategoriDogrula(value) {
    const kategori = metin(value || "DIGER").toUpperCase();
    if (!Masraf.schema.path("kategori").enumValues.includes(kategori)) throw Object.assign(new Error("Geçersiz masraf kategorisi."), { status: 400 });
    return kategori;
}
function sayi(value, ad, { min = 0, max = Infinity } = {}) {
    const sonuc = Number(value || 0);
    if (!Number.isFinite(sonuc) || sonuc < min || sonuc > max) throw Object.assign(new Error(`${ad} geçersizdir.`), { status: 400 });
    return sonuc;
}
function fisGorseliDogrula(value) {
    if (!value) return "";
    if (typeof value !== "string" || !(/^data:image\/(jpeg|png|webp);base64,/i.test(value) || /^https:\/\//i.test(value))) throw Object.assign(new Error("Fiş görseli JPG, PNG, WebP veya güvenli görsel adresi olmalıdır."), { status: 400 });
    if (value.length > 2_800_000) throw Object.assign(new Error("Fiş görseli en fazla 2 MB olabilir."), { status: 400 });
    return value;
}

async function listele(req, res, next) {
    try {
        const filter = { tenantId: tenantId(req) };
        if (req.query.kategori) filter.kategori = kategoriDogrula(req.query.kategori);
        if (["KASA", "BANKA"].includes(req.query.hesapTipi)) filter.hesapTipi = req.query.hesapTipi;
        if (["AKTIF", "IPTAL"].includes(req.query.durum)) filter.durum = req.query.durum;
        if (req.query.baslangic || req.query.bitis) {
            filter.tarih = {};
            if (req.query.baslangic) filter.tarih.$gte = new Date(`${req.query.baslangic}T00:00:00`);
            if (req.query.bitis) filter.tarih.$lte = new Date(`${req.query.bitis}T23:59:59.999`);
        }
        const arama = regexGuvenli(req.query.arama);
        if (arama) filter.$or = ["aciklama", "firma", "fisNo", "aracPlaka"].map(alan => ({ [alan]: { $regex: arama, $options: "i" } }));
        const limit = Math.min(500, Math.max(1, Number(req.query.limit || 300)));
        const [masraflar, toplam] = await Promise.all([
            Masraf.find(filter).populate("kullaniciId", "adSoyad email").populate("iptalEdenKullaniciId", "adSoyad email").sort({ tarih: -1, createdAt: -1 }).limit(limit).lean(),
            Masraf.countDocuments(filter)
        ]);
        res.json({ basarili: true, toplam, gosterilen: masraflar.length, masraflar });
    } catch (error) { next(error); }
}

async function detay(req, res, next) {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ basarili: false, mesaj: "Geçersiz masraf kaydı." });
        const masraf = await Masraf.findOne({ _id: req.params.id, tenantId: tenantId(req) }).populate("kullaniciId", "adSoyad email").populate("iptalEdenKullaniciId", "adSoyad email").lean();
        if (!masraf) return res.status(404).json({ basarili: false, mesaj: "Masraf kaydı bulunamadı." });
        res.json({ basarili: true, masraf });
    } catch (error) { next(error); }
}

async function ozet(req, res, next) {
    try {
        const tId = tenantId(req), simdi = new Date(), bugun = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate()), ayBasi = new Date(simdi.getFullYear(), simdi.getMonth(), 1);
        const masraflar = await Masraf.find({ tenantId: tId, durum: { $ne: "IPTAL" }, odemeDurumu: "ODENDI" }).select("kategori tutar tarih paraBirimi").lean();
        const bos = () => ({ TRY: 0, USD: 0, EUR: 0 }), toplamlar = bos(), bugunToplamlari = bos(), ayToplamlari = bos(), kategoriToplamlari = {};
        for (const item of masraflar) {
            const kod = item.paraBirimi || "TRY", tutar = Number(item.tutar || 0), tarih = new Date(item.tarih);
            toplamlar[kod] = (toplamlar[kod] || 0) + tutar;
            if (tarih >= bugun) bugunToplamlari[kod] = (bugunToplamlari[kod] || 0) + tutar;
            if (tarih >= ayBasi) ayToplamlari[kod] = (ayToplamlari[kod] || 0) + tutar;
            if (!kategoriToplamlari[item.kategori]) kategoriToplamlari[item.kategori] = bos();
            kategoriToplamlari[item.kategori][kod] += tutar;
        }
        res.json({ basarili: true, toplam: toplamlar.TRY, toplamlar, bugunToplamlari, ayToplamlari, kategoriToplamlari, kayitSayisi: masraflar.length });
    } catch (error) { next(error); }
}

async function olustur(req, res, next) {
    const tId = tenantId(req), body = req.body || {}, tutar = sayi(body.tutar, "Tutar", { min: 0.01 });
    const aciklama = metin(body.aciklama, 300), hesapTipi = metin(body.hesapTipi).toUpperCase(), Model = hesapModeli(hesapTipi);
    let hesap = null, masraf = null, paraHareket = null;
    try {
        if (!aciklama) return res.status(400).json({ basarili: false, mesaj: "Masraf açıklaması zorunludur." });
        if (!Model || !mongoose.Types.ObjectId.isValid(String(body.hesapId || ""))) return res.status(400).json({ basarili: false, mesaj: "Geçerli bir kasa veya banka hesabı seçilmelidir." });
        hesap = await Model.findOneAndUpdate({ _id: body.hesapId, tenantId: tId, aktif: true, bakiye: { $gte: tutar } }, { $inc: { bakiye: -tutar } }, { new: true });
        if (!hesap) return res.status(409).json({ basarili: false, mesaj: "Masraf hesabı bulunamadı, pasif veya bakiyesi yetersiz." });
        const kdvOrani = sayi(body.kdvOrani, "KDV oranı", { min: 0, max: 100 });
        const kdvTutari = body.kdvTutari === undefined || body.kdvTutari === "" ? tutar - (tutar / (1 + kdvOrani / 100)) : sayi(body.kdvTutari, "KDV tutarı", { min: 0, max: tutar });
        masraf = await Masraf.create({
            tenantId: tId, tarih: body.tarih || new Date(), kategori: kategoriDogrula(body.kategori), aciklama, tutar,
            firma: metin(body.firma, 160), fisNo: metin(body.fisNo, 80), fisGorseli: fisGorseliDogrula(body.fisGorseli),
            notlar: metin(body.notlar, 1500), kdvOrani, kdvTutari, aracPlaka: metin(body.aracPlaka, 20).toUpperCase(),
            hesapTipi, hesapId: hesap._id, paraBirimi: hesap.paraBirimi || "TRY", odemeDurumu: "ODENDI", durum: "AKTIF",
            kaynak: "MANUEL", kullaniciId: kullaniciId(req)
        });
        paraHareket = await ParaHareket.create({ tenantId: tId, hesapTipi, hesapId: hesap._id, tip: "CIKIS", tutar, paraBirimi: hesap.paraBirimi || "TRY", aciklama, kaynak: "MASRAF", kaynakId: masraf._id, belgeNo: metin(body.fisNo, 80), tarih: body.tarih || new Date(), kullaniciId: kullaniciId(req) });
        masraf.paraHareketId = paraHareket._id; await masraf.save();
        res.status(201).json({ basarili: true, mesaj: "Masraf ve fiş belgesi kaydedildi.", masraf, hesap, paraHareket });
    } catch (error) {
        if (paraHareket?._id) await ParaHareket.deleteOne({ _id: paraHareket._id, tenantId: tId }).catch(() => {});
        if (masraf?._id) await Masraf.deleteOne({ _id: masraf._id, tenantId: tId }).catch(() => {});
        if (hesap?._id && Model) await Model.updateOne({ _id: hesap._id, tenantId: tId }, { $inc: { bakiye: tutar } }).catch(() => {});
        next(error);
    }
}

async function guncelle(req, res, next) {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ basarili: false, mesaj: "Geçersiz masraf kaydı." });
        const masraf = await Masraf.findOne({ _id: req.params.id, tenantId: tenantId(req), durum: { $ne: "IPTAL" } });
        if (!masraf) return res.status(404).json({ basarili: false, mesaj: "Aktif masraf kaydı bulunamadı." });
        const body = req.body || {}, eskiDeger = masraf.toObject();
        if (body.tutar !== undefined) {
            const yeniTutar = sayi(body.tutar, "Tutar", { min: 0.01 }), fark = yeniTutar - Number(masraf.tutar || 0), Model = hesapModeli(masraf.hesapTipi);
            if (Math.abs(fark) > 0.000001) {
                const hesap = await Model.findOneAndUpdate({ _id: masraf.hesapId, tenantId: tenantId(req), ...(fark > 0 ? { bakiye: { $gte: fark } } : {}) }, { $inc: { bakiye: -fark } }, { new: true });
                if (!hesap) return res.status(409).json({ basarili: false, mesaj: "Masraf düzeltme farkı için hesap bakiyesi yetersiz veya hesap bulunamadı." });
                try {
                    await ParaHareket.create({ tenantId: tenantId(req), hesapTipi: masraf.hesapTipi, hesapId: masraf.hesapId, tip: fark > 0 ? "CIKIS" : "GIRIS", tutar: Math.abs(fark), paraBirimi: masraf.paraBirimi || "TRY", aciklama: `Masraf düzeltmesi: ${masraf.aciklama}`, kaynak: "MASRAF_DUZELTME", kaynakId: masraf._id, orijinalHareketId: masraf.paraHareketId || null, belgeNo: masraf.fisNo || "", tarih: body.tarih || new Date(), kullaniciId: kullaniciId(req), islemAnahtari: `TX:${req.transactionId}:PARA:MASRAF_DUZELTME:${masraf._id}` });
                } catch (error) { await Model.updateOne({ _id: masraf.hesapId, tenantId: tenantId(req) }, { $inc: { bakiye: fark } }).catch(() => {}); throw error; }
                masraf.tutar = yeniTutar;
                const kdvOrani = body.kdvOrani === undefined ? Number(masraf.kdvOrani || 0) : sayi(body.kdvOrani, "KDV oranı", { min: 0, max: 100 });
                masraf.kdvOrani = kdvOrani; masraf.kdvTutari = body.kdvTutari === undefined ? yeniTutar - yeniTutar / (1 + kdvOrani / 100) : sayi(body.kdvTutari, "KDV tutarı", { min: 0, max: yeniTutar });
            }
        }
        if (body.tarih !== undefined) masraf.tarih = body.tarih;
        if (body.kategori !== undefined) masraf.kategori = kategoriDogrula(body.kategori);
        if (body.aciklama !== undefined) masraf.aciklama = metin(body.aciklama, 300);
        if (body.firma !== undefined) masraf.firma = metin(body.firma, 160);
        if (body.fisNo !== undefined) masraf.fisNo = metin(body.fisNo, 80);
        if (body.fisGorseli !== undefined) masraf.fisGorseli = fisGorseliDogrula(body.fisGorseli);
        if (body.notlar !== undefined) masraf.notlar = metin(body.notlar, 1500);
        if (body.aracPlaka !== undefined) masraf.aracPlaka = metin(body.aracPlaka, 20).toUpperCase();
        await masraf.save();
        await auditKaydet({ req, action: "EXPENSE_CORRECTED", resource: "Masraf", resourceId: String(masraf._id), tenantId: tenantId(req), category: "MUHASEBE_DUZELTME", severity: "UYARI", details: { islemId: String(masraf._id), transactionId: req.transactionId, eskiDeger, yeniDeger: masraf.toObject() } });
        res.json({ basarili: true, mesaj: "Masraf ve bağlı ödeme hesabı fark kadar güncellendi.", masraf });
    } catch (error) { next(error); }
}

async function iptalEt(req, res, next) {
    const tId = tenantId(req), neden = metin(req.body?.neden, 500) || "Masraf kaydı iptal edildi";
    let masraf = null, hesapGuncellendi = false, hareket = null;
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ basarili: false, mesaj: "Geçersiz masraf kaydı." });
        masraf = await Masraf.findOneAndUpdate({ _id: req.params.id, tenantId: tId, durum: { $ne: "IPTAL" } }, { $set: { durum: "IPTAL", iptalTarihi: new Date(), iptalNedeni: neden, iptalEdenKullaniciId: kullaniciId(req) } }, { new: true });
        if (!masraf) return res.status(409).json({ basarili: false, mesaj: "Masraf bulunamadı veya daha önce iptal edildi." });
        const Model = hesapModeli(masraf.hesapTipi);
        const hesap = await Model.findOneAndUpdate({ _id: masraf.hesapId, tenantId: tId }, { $inc: { bakiye: masraf.tutar } }, { new: true });
        if (!hesap) throw Object.assign(new Error("Masraf hesabı bulunamadığı için iptal tamamlanamadı."), { status: 409 });
        hesapGuncellendi = true;
        hareket = await ParaHareket.create({ tenantId: tId, hesapTipi: masraf.hesapTipi, hesapId: masraf.hesapId, tip: "GIRIS", tutar: masraf.tutar, paraBirimi: masraf.paraBirimi || "TRY", aciklama: `Masraf iptali: ${masraf.aciklama}`, kaynak: "MASRAF_IPTAL", kaynakId: masraf._id, belgeNo: masraf.fisNo || "", tarih: new Date(), kullaniciId: kullaniciId(req), orijinalHareketId: masraf.paraHareketId || null });
        masraf.iptalParaHareketId = hareket._id; await masraf.save();
        await auditKaydet({ req, action: "EXPENSE_CANCELLED", resource: "Masraf", resourceId: String(masraf._id), tenantId: tId, category: "MUHASEBE_IPTAL", severity: "KRITIK", details: { islemId: String(masraf._id), transactionId: req.transactionId, yeniDeger: masraf.toObject() } });
        res.json({ basarili: true, mesaj: "Masraf iptal edildi ve tutar hesaba iade edildi.", masraf, hesap, hareket });
    } catch (error) {
        if (hareket?._id) await ParaHareket.deleteOne({ _id: hareket._id, tenantId: tId }).catch(() => {});
        if (masraf?._id) {
            if (hesapGuncellendi) { const Model = hesapModeli(masraf.hesapTipi); await Model.updateOne({ _id: masraf.hesapId, tenantId: tId }, { $inc: { bakiye: -masraf.tutar } }).catch(() => {}); }
            await Masraf.updateOne({ _id: masraf._id, tenantId: tId }, { $set: { durum: "AKTIF", iptalTarihi: null, iptalNedeni: "", iptalEdenKullaniciId: null } }).catch(() => {});
        }
        next(error);
    }
}

module.exports = { listele, detay, ozet, olustur, guncelle, iptalEt };
