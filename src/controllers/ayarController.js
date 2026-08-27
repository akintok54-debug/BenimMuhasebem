const crypto = require("crypto");
const mongoose = require("mongoose");
const Ayar = require("../models/Ayar");
const { sifrele: guvenliSifrele } = require("../services/sifrelemeServisi");

const ENTEGRASYON_TIPLERI = ["E_FATURA", "E_IRSALIYE", "E_POSTA", "WHATSAPP", "E_TICARET", "KARGO", "ODEME", "MUHASEBE"];
const HAZIR_SABLONLAR = [
    { id: "modern", ad: "Modern", aciklama: "Renkli başlık, ferah alanlar ve güçlü toplam vurgusu." },
    { id: "klasik", ad: "Klasik", aciklama: "Kurumsal çizgiler ve geleneksel belge düzeni." },
    { id: "kompakt", ad: "Kompakt", aciklama: "Çok kalemli belgeler için sıkı ve ekonomik yerleşim." }
];

function tId(req) { return new mongoose.Types.ObjectId(String(req.tenantId)); }
function kId(req) { return String(req.kullanici?.kullaniciId || req.user?.kullaniciId || ""); }
function metin(v, max = 500) { return String(v ?? "").trim().slice(0, max); }
function varsayilanEntegrasyonlar() { return ENTEGRASYON_TIPLERI.map(tip => ({ tip })); }
async function ayarBul(req) {
    let ayar = await Ayar.findOne({ tenantId: tId(req) }).select("+entegrasyonlar.gizliAnahtar");
    if (!ayar) ayar = await Ayar.create({ tenantId: tId(req), entegrasyonlar: varsayilanEntegrasyonlar() });
    return ayar;
}
function sifrele(value) { return value ? guvenliSifrele(value) : ""; }
function belgeAyari(ayar, req) {
    const id = kId(req), mevcut = ayar.belgeAyarlari.find(x => String(x.kullaniciId) === id);
    return mevcut || { kullaniciId: id, faturaSablonu: "modern", irsaliyeSablonu: "modern", anaRenk: "#2563eb", vurguRengi: "#0f172a", dipnot: "Belge elektronik ortamda hazırlanmıştır.", bankaBilgisiGoster: true, vergiBilgisiGoster: true, imzaAlaniGoster: true };
}
function guvenliCikti(ayar, req) {
    return {
        genel: ayar.genel,
        entegrasyonlar: ENTEGRASYON_TIPLERI.map(tip => { const x = ayar.entegrasyonlar.find(i => i.tip === tip); return { tip, aktif: !!x?.aktif, saglayici: x?.saglayici || "", apiUrl: x?.apiUrl || "", hesapKodu: x?.hesapKodu || "", gizliAnahtarKayitli: !!x?.gizliAnahtar, sonTestTarihi: x?.sonTestTarihi || null, sonTestBasarili: x?.sonTestBasarili ?? null }; }),
        belgeAyari: belgeAyari(ayar, req),
        hazirSablonlar: HAZIR_SABLONLAR
    };
}
async function getir(req, res, next) { try { const ayar = await ayarBul(req); res.json({ basarili: true, ayarlar: guvenliCikti(ayar, req) }); } catch (e) { next(e); } }
async function genelGuncelle(req, res, next) {
    try {
        const ayar = await ayarBul(req), b = req.body || {};
        const allowed = ["paraBirimi", "dil", "saatDilimi", "varsayilanKdv", "faturaSeri", "irsaliyeSeri", "teklifGecerlilikGun", "negatifStokEngelle", "otomatikYedekleme", "ikiAsamaliOnay"];
        for (const key of allowed) if (b[key] !== undefined) ayar.genel[key] = b[key];
        await ayar.save(); res.json({ basarili: true, mesaj: "Genel ayarlar kaydedildi.", genel: ayar.genel });
    } catch (e) { next(e); }
}
async function entegrasyonGuncelle(req, res, next) {
    try {
        const tip = metin(req.params.tip, 30).toUpperCase();
        if (!ENTEGRASYON_TIPLERI.includes(tip)) return res.status(400).json({ basarili: false, mesaj: "Desteklenmeyen entegrasyon tipi." });
        const ayar = await ayarBul(req), b = req.body || {}; let x = ayar.entegrasyonlar.find(i => i.tip === tip);
        if (!x) { ayar.entegrasyonlar.push({ tip }); x = ayar.entegrasyonlar.at(-1); }
        if (b.aktif !== undefined) x.aktif = !!b.aktif;
        if (b.saglayici !== undefined) x.saglayici = metin(b.saglayici, 100);
        if (b.apiUrl !== undefined) { const url = metin(b.apiUrl, 500); if (url && !/^https:\/\//i.test(url)) return res.status(400).json({ basarili: false, mesaj: "API adresi HTTPS ile başlamalıdır." }); x.apiUrl = url; }
        if (b.hesapKodu !== undefined) x.hesapKodu = metin(b.hesapKodu, 100);
        if (b.gizliAnahtar) x.gizliAnahtar = sifrele(b.gizliAnahtar);
        await ayar.save(); res.json({ basarili: true, mesaj: `${tip} entegrasyonu kaydedildi.` });
    } catch (e) { next(e); }
}
async function belgeGuncelle(req, res, next) {
    try {
        const id = kId(req); if (!mongoose.Types.ObjectId.isValid(id)) return res.status(403).json({ basarili: false, mesaj: "Kullanıcı kimliği geçersiz." });
        const ayar = await ayarBul(req), b = req.body || {}; let x = ayar.belgeAyarlari.find(i => String(i.kullaniciId) === id);
        if (!x) { ayar.belgeAyarlari.push({ kullaniciId: id }); x = ayar.belgeAyarlari.at(-1); }
        ["faturaSablonu", "irsaliyeSablonu"].forEach(k => { if (b[k] !== undefined) x[k] = b[k]; });
        ["anaRenk", "vurguRengi"].forEach(k => { if (b[k] !== undefined && /^#[0-9a-f]{6}$/i.test(b[k])) x[k] = b[k]; });
        ["logo", "belgeBasligi", "dipnot"].forEach(k => { if (b[k] !== undefined) x[k] = metin(b[k], k === "logo" ? 500000 : 500); });
        ["bankaBilgisiGoster", "vergiBilgisiGoster", "imzaAlaniGoster"].forEach(k => { if (b[k] !== undefined) x[k] = !!b[k]; });
        await ayar.save(); res.json({ basarili: true, mesaj: "Kişisel belge şablonunuz kaydedildi.", belgeAyari: x });
    } catch (e) { next(e); }
}

module.exports = { getir, genelGuncelle, entegrasyonGuncelle, belgeGuncelle, HAZIR_SABLONLAR, ENTEGRASYON_TIPLERI };
