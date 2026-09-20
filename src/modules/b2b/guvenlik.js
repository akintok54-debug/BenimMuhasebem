const mongoose = require("mongoose");
const User = require("../../models/Kullanici");
const Customer = require("../../models/Musteri");
const { tenantAboneliginiKontrolEt } = require("../../services/abonelikServisi");
function cookieCsrf(req, res, next) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const { cookieOku, cookieAdlari } = require("../../services/oturumGuvenligi");
    const cookies = cookieOku(req), names = cookieAdlari(req);
    if (!cookies[names.auth]) return next();
    const sent = String(req.get("x-csrf-token") || ""), expected = String(cookies[names.csrf] || "");
    if (!sent || !expected || Buffer.byteLength(sent) !== Buffer.byteLength(expected) || !require("crypto").timingSafeEqual(Buffer.from(sent), Buffer.from(expected))) return res.status(403).json({ basarili: false, mesaj: "CSRF doğrulaması gerekli." });
    next();
}
async function bayiKontrol(req, res, next) {
    res.set("Cache-Control", "private, no-store");
    try {
        const claim = req.kullanici;
        if (claim?.purpose || claim?.rol !== "BAYI" || !mongoose.isValidObjectId(claim.tenantId) || !mongoose.isValidObjectId(claim.kullaniciId)) return res.sendStatus(403);
        const user = await User.findOne({ _id: claim.kullaniciId, tenantId: claim.tenantId, rol: "BAYI", aktif: true, silinmeTarihi: null, hesapDurumu: { $in: ["active", "trial"] } }).select("_id tenantId musteriId adSoyad email rol favoriler").lean();
        if (!user?.musteriId) return res.sendStatus(403);
        const customer = await Customer.findOne({ _id: user.musteriId, tenantId: user.tenantId, aktif: true, "b2b.aktif": true }).lean();
        if (!customer) return res.sendStatus(403);
        const access = await tenantAboneliginiKontrolEt(String(user.tenantId));
        if (!access.erisim) return res.status(403).json({ basarili: false, mesaj: "Firma erişimi aktif değil." });
        const shop = require("./magazaServisi");
        const settings = shop.retail(customer) ? await require("./models/MagazaAyar").findById(user.tenantId).lean() : null;
        req.currentUser = user; req.tenantId = user.tenantId; req.bayi = settings ? shop.perakendeMusteri(customer, settings) : customer;
        next();
    } catch (error) { next(error); }
}
function yoneticiKontrol(req, res, next) {
    if (!["OWNER", "ADMIN"].includes(req.currentUser?.rol)) return res.sendStatus(403);
    next();
}
const kapsam = req => ({ tenantId: req.tenantId, musteriId: req.bayi._id });
module.exports = { bayiKontrol, yoneticiKontrol, kapsam, cookieCsrf };
