const crypto = require("crypto");
const mongoose = require("mongoose");
const BelgePaylasim = require("../models/BelgePaylasim");
const Teklif = require("../models/Teklif");
const Siparis = require("../models/Siparis");
const Urun = require("../models/Urun");
const Tenant = require("../modules/platform/models/Tenant");

const hash = token => crypto.createHash("sha256").update(String(token)).digest("hex");
const tId = req => new mongoose.Types.ObjectId(String(req.tenantId));
const firmaCiktisi = tenant => {
    const f = tenant?.firmaBilgileri?.toObject?.() || tenant?.firmaBilgileri || {};
    return { unvan: f.unvan || tenant?.name || "İşletme", telefon: f.telefon || "", email: f.email || "", web: f.web || "", adres: f.adres || "", il: f.il || "", ilce: f.ilce || "", vergiDairesi: f.vergiDairesi || "", vergiNo: f.vergiNo || "" };
};

async function paylasimOlustur(req, res, next) {
    try {
        const tenantId = tId(req), body = req.body || {}, tur = String(body.tur || "").toUpperCase();
        if (!["KATALOG", "TEKLIF", "SIPARIS"].includes(tur)) return res.status(400).json({ basarili: false, mesaj: "Paylaşım türü geçersiz." });
        const tenant = await Tenant.findById(tenantId).lean();
        if (!tenant) return res.status(404).json({ basarili: false, mesaj: "Firma bulunamadı." });
        let belge, baslik;
        if (tur === "KATALOG") {
            const kategori = String(body.kategori || "").trim();
            const filtre = { tenantId, aktif: { $ne: false } };
            if (kategori) filtre.kategori = kategori;
            const hamUrunler = await Urun.find(filtre).select("kod barkod ad kategori marka model uyumluluk birim satisFiyati bayiFiyati perakendeFiyati iskonto paraBirimi kdv gorsel").sort({ kategori: 1, ad: 1 }).limit(1000).lean();
            const urunler = hamUrunler.map(x => ({ ...x, gorsel: /^(https:\/\/|\/)/i.test(String(x.gorsel || "")) ? x.gorsel : "" }));
            if (!urunler.length) return res.status(400).json({ basarili: false, mesaj: "Katalog için uygun ürün bulunamadı." });
            baslik = String(body.baslik || (kategori ? `${kategori} Kataloğu` : "Ürün Kataloğu")).trim().slice(0, 160);
            belge = { kategori, urunler };
        } else {
            if (!mongoose.Types.ObjectId.isValid(body.belgeId)) return res.status(400).json({ basarili: false, mesaj: "Belge seçimi geçersiz." });
            const Model = tur === "TEKLIF" ? Teklif : Siparis;
            const noAlan = tur === "TEKLIF" ? "teklifNo" : "siparisNo";
            const kayit = await Model.findOne({ _id: body.belgeId, tenantId }).populate("musteriId", "kod unvan adSoyad").populate("kalemler.urunId", "kod ad birim paraBirimi").lean();
            if (!kayit) return res.status(404).json({ basarili: false, mesaj: "Belge bulunamadı." });
            baslik = `${tur === "TEKLIF" ? "Teklif" : "Sipariş"} ${kayit[noAlan]}`;
            belge = kayit;
        }
        const gun = Math.min(90, Math.max(1, Number(body.gecerlilikGun || 30))), token = crypto.randomBytes(32).toString("base64url");
        const paylasim = await BelgePaylasim.create({ tenantId, tokenHash: hash(token), tur, baslik, firma: firmaCiktisi(tenant), belge, sonGecerlilikTarihi: new Date(Date.now() + gun * 86400000), kullaniciId: req.kullanici?._id || req.user?._id || null });
        res.status(201).json({ basarili: true, mesaj: "Süreli paylaşım bağlantısı oluşturuldu.", paylasim: { id: paylasim._id, tur, baslik, token, sonGecerlilikTarihi: paylasim.sonGecerlilikTarihi } });
    } catch (error) { next(error); }
}

async function paylasilanBelge(req, res, next) {
    try {
        const token = String(req.params.token || "");
        if (token.length < 30) return res.status(404).json({ basarili: false, mesaj: "Bağlantı geçersiz veya süresi dolmuş." });
        const paylasim = await BelgePaylasim.findOne({ tokenHash: hash(token), aktif: true, sonGecerlilikTarihi: { $gt: new Date() } });
        if (!paylasim) return res.status(404).json({ basarili: false, mesaj: "Bağlantı geçersiz veya süresi dolmuş." });
        paylasim.goruntulenmeSayisi += 1; paylasim.sonGoruntulenmeTarihi = new Date(); await paylasim.save();
        res.set("Cache-Control", "no-store");
        res.json({ basarili: true, paylasim: { tur: paylasim.tur, baslik: paylasim.baslik, firma: paylasim.firma, belge: paylasim.belge, sonGecerlilikTarihi: paylasim.sonGecerlilikTarihi } });
    } catch (error) { next(error); }
}

module.exports = { paylasimOlustur, paylasilanBelge };
