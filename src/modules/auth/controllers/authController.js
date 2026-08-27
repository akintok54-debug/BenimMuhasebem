const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const Kullanici = require("../../../models/Kullanici");
const Tenant = require("../../platform/models/Tenant");
const { tokenOlustur, tokenDogrula, geciciTokenOlustur } = require("../../../services/tokenServisi");
const { kullaniciVeriPaketi } = require("../../../services/kvkkServisi");
const { oturumCookieYaz, oturumCookieSil } = require("../../../services/oturumGuvenligi");
const { sifrele, coz } = require("../../../services/sifrelemeServisi");
const ikiFaktor = require("../../../services/ikiFaktorServisi");
const { sifreSifirlamaEpostasiGonder } = require("../../../services/epostaServisi");

function kullaniciId(req) { return req.kullanici?.kullaniciId || req.user?.kullaniciId; }
function guvenliKullanici(k) { return { id: k._id, adSoyad: k.adSoyad, email: k.email, telefon: k.telefon || "", unvan: k.unvan || "", rol: k.rol, tenantId: k.tenantId, ozelYetkiler: k.ozelYetkiler || [], ikiFaktorEtkin: !!k.ikiFaktor?.etkin, sonGirisTarihi: k.sonGirisTarihi, createdAt: k.createdAt }; }
async function oturumAc(req, res, k) { k.sonGirisTarihi = new Date(); await k.save(); const p = { kullaniciId: k._id.toString(), email: k.email, rol: k.rol, tenantId: k.tenantId?.toString() || null }; const token = tokenOlustur(p), csrfToken = oturumCookieYaz(res, token); req.user = p; return res.json({ basarili: true, mesaj: "Giriş başarılı.", csrfToken, token: process.env.JWT_ALLOW_LEGACY === "false" ? undefined : token, kullanici: { ...guvenliKullanici(k), aktif: k.aktif } }); }

async function login(req, res) {
    try { const { email, sifre } = req.body || {}; if (!email || !sifre) return res.status(400).json({ basarili: false, mesaj: "E-posta ve şifre zorunludur." }); const k = await Kullanici.findOne({ email: String(email).trim().toLowerCase() }).select("+ikiFaktor.gizliAnahtar +ikiFaktor.kurtarmaKodlariHash"); if (!k || !k.aktif || !(await bcrypt.compare(String(sifre), String(k.sifre)))) { if (k) req.user = { kullaniciId: k._id, tenantId: k.tenantId, rol: k.rol }; res.locals.guvenlikOlayi = { kategori: "GIRIS", seviye: "UYARI" }; return res.status(401).json({ basarili: false, mesaj: "E-posta veya şifre hatalı." }); } if (k.ikiFaktor?.etkin) return res.json({ basarili: true, ikiFaktorGerekli: true, challengeToken: geciciTokenOlustur({ purpose: "2fa", kullaniciId: k._id.toString() }) }); return oturumAc(req, res, k); } catch (e) { console.error("LOGIN_HATASI", { message: e.message }); return res.status(500).json({ basarili: false, mesaj: "Giriş işlemi sırasında sunucu hatası." }); }
}
async function sifremiUnuttum(req, res) {
    const genelMesaj = "Hesap bulunuyorsa parola yenileme bağlantısı e-posta adresinize gönderildi.";
    try {
        const email = String(req.body?.email || "").trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ basarili: false, mesaj: "Geçerli bir e-posta adresi girin." });
        const k = await Kullanici.findOne({ email, aktif: true }).select("+sifreSifirlama.tokenHash +sifreSifirlama.sonKullanmaTarihi");
        if (k) {
            const token = crypto.randomBytes(32).toString("hex");
            k.sifreSifirlama = { tokenHash: crypto.createHash("sha256").update(token).digest("hex"), sonKullanmaTarihi: new Date(Date.now() + 20 * 60 * 1000) };
            await k.save();
            const origin = String(process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
            const result = await sifreSifirlamaEpostasiGonder({ email: k.email, adSoyad: k.adSoyad, resetUrl: `${origin}/erp/sifre-yenile.html?token=${token}` });
            if (!result.gonderildi) console.warn("PASSWORD_RESET_EMAIL_DISABLED", { reason: result.neden });
        }
        return res.json({ basarili: true, mesaj: genelMesaj });
    } catch (e) {
        console.error("PASSWORD_RESET_REQUEST_ERROR", { message: e.message });
        return res.json({ basarili: true, mesaj: genelMesaj });
    }
}
async function sifreYenile(req, res) {
    try {
        const token = String(req.body?.token || ""), yeniSifre = String(req.body?.yeniSifre || "");
        if (token.length < 32 || yeniSifre.length < 8) return res.status(400).json({ basarili: false, mesaj: "Bağlantı geçersiz veya yeni parola en az 8 karakter değil." });
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
        const k = await Kullanici.findOne({ aktif: true, "sifreSifirlama.tokenHash": tokenHash, "sifreSifirlama.sonKullanmaTarihi": { $gt: new Date() } }).select("+sifreSifirlama.tokenHash +sifreSifirlama.sonKullanmaTarihi");
        if (!k) return res.status(400).json({ basarili: false, mesaj: "Parola yenileme bağlantısı geçersiz veya süresi dolmuş." });
        k.sifre = await bcrypt.hash(yeniSifre, 12);
        k.sifreSifirlama = { tokenHash: "", sonKullanmaTarihi: null };
        k.geciciSifre = false;
        await k.save();
        oturumCookieSil(res);
        return res.json({ basarili: true, mesaj: "Parolanız yenilendi. Yeni parolanızla giriş yapabilirsiniz." });
    } catch (e) {
        console.error("PASSWORD_RESET_ERROR", { message: e.message });
        return res.status(500).json({ basarili: false, mesaj: "Parola yenilenemedi." });
    }
}
async function ikiFaktorDogrula(req, res) { try { const p = tokenDogrula(String(req.body?.challengeToken || "")); if (p.purpose !== "2fa") throw new Error(); const k = await Kullanici.findOne({ _id: p.kullaniciId, aktif: true }).select("+ikiFaktor.gizliAnahtar +ikiFaktor.kurtarmaKodlariHash"); if (!k?.ikiFaktor?.etkin) throw new Error(); const kod = String(req.body?.kod || ""), secret = coz(k.ikiFaktor.gizliAnahtar); let ok = ikiFaktor.kodDogrula(secret, kod); if (!ok) { const hash = ikiFaktor.kodHash(kod), i = k.ikiFaktor.kurtarmaKodlariHash.indexOf(hash); if (i >= 0) { k.ikiFaktor.kurtarmaKodlariHash.splice(i, 1); ok = true; } } if (!ok) return res.status(401).json({ basarili: false, mesaj: "Doğrulama kodu geçersiz." }); return oturumAc(req, res, k); } catch (_) { return res.status(401).json({ basarili: false, mesaj: "2FA doğrulama isteği geçersiz veya süresi dolmuş." }); } }
async function ikiFaktorBaslat(req, res, next) { try { const k = await Kullanici.findById(kullaniciId(req)).select("+ikiFaktor.gizliAnahtar +ikiFaktor.kurtarmaKodlariHash"); const secret = ikiFaktor.secretOlustur(), kodlar = ikiFaktor.kurtarmaKodlariOlustur(); k.ikiFaktor = { etkin: false, yontem: "TOTP", gizliAnahtar: sifrele(secret), kurtarmaKodlariHash: kodlar.map(ikiFaktor.kodHash), dogrulamaTarihi: null }; await k.save(); res.set("Cache-Control", "no-store"); return res.json({ basarili: true, secret, otpauthUri: ikiFaktor.otpauthUri(secret, k.email), kurtarmaKodlari: kodlar }); } catch (e) { next(e); } }
async function ikiFaktorOnayla(req, res, next) { try { const k = await Kullanici.findById(kullaniciId(req)).select("+ikiFaktor.gizliAnahtar"); if (!k?.ikiFaktor?.gizliAnahtar || !ikiFaktor.kodDogrula(coz(k.ikiFaktor.gizliAnahtar), req.body?.kod)) return res.status(400).json({ basarili: false, mesaj: "TOTP kodu doğrulanamadı." }); k.ikiFaktor.etkin = true; k.ikiFaktor.dogrulamaTarihi = new Date(); await k.save(); return res.json({ basarili: true, mesaj: "İki faktörlü doğrulama etkinleştirildi." }); } catch (e) { next(e); } }
async function ikiFaktorKapat(req, res, next) { try { const k = await Kullanici.findById(kullaniciId(req)).select("+ikiFaktor.gizliAnahtar"); if (!k || !(await bcrypt.compare(String(req.body?.sifre || ""), k.sifre)) || !ikiFaktor.kodDogrula(coz(k.ikiFaktor.gizliAnahtar), req.body?.kod)) return res.status(401).json({ basarili: false, mesaj: "Parola veya doğrulama kodu hatalı." }); k.ikiFaktor = { etkin: false, yontem: "NONE", gizliAnahtar: "", kurtarmaKodlariHash: [], dogrulamaTarihi: null }; await k.save(); return res.json({ basarili: true, mesaj: "İki faktörlü doğrulama kapatıldı." }); } catch (e) { next(e); } }

async function profil(req, res, next) { try { const [k, tenant] = await Promise.all([Kullanici.findById(kullaniciId(req)).select("-sifre").lean(), Tenant.findById(req.tenantId).select("name plan status firmaBilgileri").lean()]); if (!k?.aktif) return res.status(404).json({ basarili: false, mesaj: "Kullanıcı hesabı bulunamadı." }); return res.json({ basarili: true, kullanici: guvenliKullanici(k), firma: tenant || null }); } catch (e) { next(e); } }
async function profilGuncelle(req, res, next) { try { const b = req.body || {}, adSoyad = String(b.adSoyad || "").trim(), email = String(b.email || "").trim().toLowerCase(); if (adSoyad.length < 2 || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ basarili: false, mesaj: "Geçerli ad soyad ve e-posta zorunludur." }); if (await Kullanici.exists({ email, _id: { $ne: kullaniciId(req) } })) return res.status(409).json({ basarili: false, mesaj: "Bu e-posta başka bir hesapta kullanılıyor." }); const k = await Kullanici.findOneAndUpdate({ _id: kullaniciId(req), aktif: true }, { $set: { adSoyad, email, telefon: String(b.telefon || "").trim(), unvan: String(b.unvan || "").trim() } }, { new: true }).select("-sifre"); return res.json({ basarili: true, mesaj: "Hesap bilgileriniz güncellendi.", kullanici: guvenliKullanici(k) }); } catch (e) { next(e); } }
async function sifreDegistir(req, res, next) { try { const { mevcutSifre, yeniSifre } = req.body || {}; if (String(yeniSifre || "").length < 8) return res.status(400).json({ basarili: false, mesaj: "Yeni parola en az 8 karakter olmalıdır." }); const k = await Kullanici.findOne({ _id: kullaniciId(req), aktif: true }); if (!k || !(await bcrypt.compare(String(mevcutSifre || ""), k.sifre))) return res.status(401).json({ basarili: false, mesaj: "Mevcut parola hatalı." }); k.sifre = await bcrypt.hash(String(yeniSifre), 12); await k.save(); return res.json({ basarili: true, mesaj: "Parolanız değiştirildi. Yeniden giriş yapın." }); } catch (e) { next(e); } }
async function hesapSil(req, res, next) { try { const { sifre, onay } = req.body || {}; if (String(onay || "").trim().toLocaleUpperCase("tr-TR") !== "HESABIMI SİL") return res.status(400).json({ basarili: false, mesaj: "Onay alanına HESABIMI SİL yazmalısınız." }); const k = await Kullanici.findOne({ _id: kullaniciId(req), aktif: true }); if (!k || !(await bcrypt.compare(String(sifre || ""), k.sifre))) return res.status(401).json({ basarili: false, mesaj: "Parola hatalı." }); k.adSoyad = "Silinmiş Kullanıcı"; k.email = `silinmis-${Date.now()}-${k._id}@deleted.invalid`; k.telefon = ""; k.unvan = ""; k.aktif = false; k.silinmeTarihi = new Date(); k.sifre = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12); await k.save(); return res.json({ basarili: true, mesaj: "Hesabınız kapatıldı ve kişisel bilgileriniz anonimleştirildi." }); } catch (e) { next(e); } }
async function verilerimiDisariAktar(req, res, next) { try { const paket = await kullaniciVeriPaketi(kullaniciId(req), req.tenantId); if (!paket) return res.status(404).json({ basarili: false, mesaj: "Kullanıcı hesabı bulunamadı." }); res.set("Cache-Control", "no-store"); res.set("Content-Disposition", `attachment; filename=benimmuhasebe-verilerim-${new Date().toISOString().slice(0, 10)}.json`); return res.json({ basarili: true, veriPaketi: paket }); } catch (e) { next(e); } }
function logout(req, res) { oturumCookieSil(res); return res.json({ basarili: true, mesaj: "Oturum kapatıldı." }); }

module.exports = { login, sifremiUnuttum, sifreYenile, ikiFaktorDogrula, ikiFaktorBaslat, ikiFaktorOnayla, ikiFaktorKapat, profil, profilGuncelle, sifreDegistir, hesapSil, verilerimiDisariAktar, logout };
