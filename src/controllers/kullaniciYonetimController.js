const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Kullanici = require("../models/Kullanici");
const { YETKI_KATALOGU, etkinYetkiler, izinVar } = require("../middleware/yetkiKontrol");
const { telefonNormalize, dahiliTelefonEpostasi, gercekEposta } = require("../utils/kullaniciKimligi");

const ROLLER = ["ADMIN", "MANAGER", "SALES", "CASHIER", "ACCOUNTING", "WAREHOUSE", "ECOMMERCE"];
const ROL_ETIKETLERI = { OWNER: "İşletme Sahibi", ADMIN: "Yönetici", MANAGER: "Operasyon Yöneticisi", SALES: "Saha Satış", CASHIER: "Kasa Sorumlusu", ACCOUNTING: "Muhasebe", WAREHOUSE: "Depo", ECOMMERCE: "E-Ticaret" };
const IZIN_KODLARI = new Set(YETKI_KATALOGU.map(x => x.kod));

function tenantId(req) { return new mongoose.Types.ObjectId(String(req.tenantId)); }
function metin(value, limit = 250) { return String(value || "").trim().slice(0, limit); }
function emailDogrula(value) { return /^\S+@\S+\.\S+$/.test(value) && value.length <= 254; }
function izinleriTemizle(value) { return [...new Set((Array.isArray(value) ? value : []).map(String).filter(x => IZIN_KODLARI.has(x)))]; }
function varsayilanYetkiler(rol) { return YETKI_KATALOGU.map(x => x.kod).filter(kod => izinVar(rol, kod)); }
function guvenliKullanici(k) {
    const nesne = k.toObject ? k.toObject() : k;
    return { id: nesne._id, _id: nesne._id, adSoyad: nesne.adSoyad, email: gercekEposta(nesne.email), telefon: nesne.telefon || "", unvan: nesne.unvan || "", rol: nesne.rol, rolEtiketi: ROL_ETIKETLERI[nesne.rol] || nesne.rol, aktif: nesne.aktif !== false, yetkiModu: nesne.yetkiModu || "ROL", ozelYetkiler: nesne.ozelYetkiler || [], etkinYetkiler: etkinYetkiler(nesne), sonGirisTarihi: nesne.sonGirisTarihi, createdAt: nesne.createdAt };
}
function yonetilebilirRol(req, rol) {
    const actorRol = String(req.currentUser?.rol || "").toUpperCase();
    return ROLLER.includes(rol) && !(actorRol === "ADMIN" && rol === "ADMIN");
}

async function listele(req, res, next) {
    try {
        const kullanicilar = await Kullanici.find({ tenantId: tenantId(req), silinmeTarihi: null }).select("adSoyad email telefon unvan rol aktif ozelYetkiler yetkiModu sonGirisTarihi createdAt").sort({ aktif: -1, adSoyad: 1 });
        return res.json({ basarili: true, kullanicilar: kullanicilar.map(guvenliKullanici), yetkiKatalogu: YETKI_KATALOGU, roller: ROLLER.map(kod => ({ kod, ad: ROL_ETIKETLERI[kod], varsayilanYetkiler: varsayilanYetkiler(kod) })) });
    } catch (error) { next(error); }
}

async function olustur(req, res, next) {
    try {
        const body = req.body || {}, adSoyad = metin(body.adSoyad, 100), telefon = metin(body.telefon, 30), telefonKod = telefonNormalize(telefon), girilenEmail = metin(body.email, 254).toLowerCase(), sifre = String(body.sifre || ""), rol = metin(body.rol).toUpperCase();
        if (adSoyad.length < 2) return res.status(400).json({ basarili: false, mesaj: "Ad soyad en az 2 karakter olmalıdır." });
        if (!girilenEmail && telefonKod.length < 10) return res.status(400).json({ basarili: false, mesaj: "E-posta veya geçerli cep telefonu zorunludur." });
        if (girilenEmail && !emailDogrula(girilenEmail)) return res.status(400).json({ basarili: false, mesaj: "E-posta adresi geçersizdir." });
        if (telefon && (telefonKod.length < 10 || telefonKod.length > 15)) return res.status(400).json({ basarili: false, mesaj: "Telefon numarası geçersizdir." });
        if (sifre.length < 8 || sifre.length > 128) return res.status(400).json({ basarili: false, mesaj: "Parola 8-128 karakter arasında olmalıdır." });
        if (!yonetilebilirRol(req, rol)) return res.status(403).json({ basarili: false, mesaj: "Bu rolü atama yetkiniz bulunmuyor." });
        const email = girilenEmail || dahiliTelefonEpostasi(telefonKod), tekrar = [{ email }]; if (telefonKod) tekrar.push({ telefonNormalize: telefonKod });
        if (await Kullanici.exists({ $or: tekrar })) return res.status(409).json({ basarili: false, mesaj: "Bu e-posta veya telefon başka bir kullanıcıda kayıtlı." });
        const limit = Number(req.tenant?.limits?.users || 0);
        if (limit > 0 && await Kullanici.countDocuments({ tenantId: tenantId(req), silinmeTarihi: null }) >= limit) return res.status(409).json({ basarili: false, mesaj: `Paketiniz en fazla ${limit} kullanıcıya izin veriyor. Paket veya kullanıcı durumunu kontrol edin.` });
        const ozelYetkiler = izinleriTemizle(body.ozelYetkiler), yetkiModu = Array.isArray(body.ozelYetkiler) ? "OZEL" : "ROL";
        const kullanici = await Kullanici.create({ tenantId: tenantId(req), adSoyad, email, telefon, telefonNormalize: telefonKod || undefined, unvan: metin(body.unvan, 100) || ROL_ETIKETLERI[rol], sifre: await bcrypt.hash(sifre, 12), rol, aktif: body.aktif !== false, hesapDurumu: "active", ozelYetkiler, yetkiModu, geciciSifre: body.geciciSifre === true });
        res.locals.guvenlikOlayi = { kategori: "KULLANICI_OLUSTURMA", seviye: "BILGI" };
        return res.status(201).json({ basarili: true, mesaj: "Kullanıcı oluşturuldu; e-posta veya telefonuyla giriş yapabilir.", kullanici: guvenliKullanici(kullanici) });
    } catch (error) { if (error?.code === 11000) return res.status(409).json({ basarili: false, mesaj: "E-posta veya telefon zaten kullanılıyor." }); next(error); }
}

async function guncelle(req, res, next) {
    try {
        const kullanici = await Kullanici.findOne({ _id: req.params.id, tenantId: tenantId(req), silinmeTarihi: null });
        if (!kullanici) return res.status(404).json({ basarili: false, mesaj: "Kullanıcı bulunamadı." });
        if (kullanici.rol === "OWNER") return res.status(403).json({ basarili: false, mesaj: "İşletme sahibi hesabı bu ekrandan değiştirilemez." });
        if (req.currentUser?.rol === "ADMIN" && kullanici.rol === "ADMIN") return res.status(403).json({ basarili: false, mesaj: "Yönetici başka bir yönetici hesabını değiştiremez." });
        if (String(kullanici._id) === String(req.currentUser?._id)) return res.status(409).json({ basarili: false, mesaj: "Kendi rol ve yetkilerinizi bu ekrandan değiştiremezsiniz." });
        const body = req.body || {};
        if (body.adSoyad !== undefined) { const ad = metin(body.adSoyad, 100); if (ad.length < 2) return res.status(400).json({ basarili: false, mesaj: "Ad soyad geçersizdir." }); kullanici.adSoyad = ad; }
        if (body.unvan !== undefined) kullanici.unvan = metin(body.unvan, 100);
        if (body.rol !== undefined) { const rol = metin(body.rol).toUpperCase(); if (!yonetilebilirRol(req, rol)) return res.status(403).json({ basarili: false, mesaj: "Bu rolü atama yetkiniz bulunmuyor." }); kullanici.rol = rol; }
        if (body.aktif !== undefined) kullanici.aktif = body.aktif === true;
        if (body.ozelYetkiler !== undefined) { kullanici.ozelYetkiler = izinleriTemizle(body.ozelYetkiler); kullanici.yetkiModu = "OZEL"; }
        if (body.yetkiModu === "ROL") { kullanici.yetkiModu = "ROL"; kullanici.ozelYetkiler = []; }
        await kullanici.save(); res.locals.guvenlikOlayi = { kategori: "KULLANICI_YETKI", seviye: "BILGI" };
        return res.json({ basarili: true, mesaj: "Kullanıcı ve yetkileri anında güncellendi.", kullanici: guvenliKullanici(kullanici) });
    } catch (error) { next(error); }
}

async function yetkiGuncelle(req, res, next) { req.body = { ...(req.body || {}), ozelYetkiler: izinleriTemizle(req.body?.ozelYetkiler) }; return guncelle(req, res, next); }

async function sifreBelirle(req, res, next) {
    try {
        const sifre = String(req.body?.sifre || "");
        if (sifre.length < 8 || sifre.length > 128) return res.status(400).json({ basarili: false, mesaj: "Parola 8-128 karakter arasında olmalıdır." });
        const kullanici = await Kullanici.findOne({ _id: req.params.id, tenantId: tenantId(req), silinmeTarihi: null });
        if (!kullanici || kullanici.rol === "OWNER" || String(kullanici._id) === String(req.currentUser?._id) || (req.currentUser?.rol === "ADMIN" && kullanici.rol === "ADMIN")) return res.status(403).json({ basarili: false, mesaj: "Bu kullanıcının parolasını değiştirme yetkiniz bulunmuyor." });
        kullanici.sifre = await bcrypt.hash(sifre, 12); kullanici.geciciSifre = req.body?.geciciSifre === true; await kullanici.save();
        res.locals.guvenlikOlayi = { kategori: "KULLANICI_PAROLA", seviye: "UYARI" };
        return res.json({ basarili: true, mesaj: "Kullanıcının yeni parolası güvenli biçimde kaydedildi." });
    } catch (error) { next(error); }
}

module.exports = { listele, olustur, guncelle, yetkiGuncelle, sifreBelirle, varsayilanYetkiler };
