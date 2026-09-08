const crypto = require("crypto");

const AUTH_COOKIE = "bm_session", CSRF_COOKIE = "bm_csrf";
const BAYI_AUTH_COOKIE = "bm_b2b_session", BAYI_CSRF_COOKIE = "bm_b2b_csrf";
function bayiIstegi(req) { return String(req.originalUrl || req.path || "").startsWith("/api/b2b/"); }
function cookieAdlari(req) { return bayiIstegi(req) ? { auth: BAYI_AUTH_COOKIE, csrf: BAYI_CSRF_COOKIE } : { auth: AUTH_COOKIE, csrf: CSRF_COOKIE }; }
const OTURUM_SURESI_GUN = Math.min(365, Math.max(30, Number(process.env.SESSION_MAX_AGE_DAYS || 365)));
const OTURUM_SURESI_MS = OTURUM_SURESI_GUN * 24 * 60 * 60 * 1000;
const CSRF_HARIC_AUTH_YOLLARI = new Set([
    "/api/b2b/auth/login",
    "/api/b2b/auth/2fa-dogrula",
    "/api/auth/login",
    "/api/auth/kayit",
    "/api/auth/sifremi-unuttum",
    "/api/auth/sifre-yenile",
    "/api/auth/2fa-dogrula"
]);
function cookieOku(req) { return Object.fromEntries(String(req.headers.cookie || "").split(";").map(x => x.trim()).filter(Boolean).map(x => { const i = x.indexOf("="); return [decodeURIComponent(x.slice(0, i)), decodeURIComponent(x.slice(i + 1))]; })); }
function secenek(httpOnly) { return { httpOnly, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: OTURUM_SURESI_MS }; }
function oturumCookieYaz(res, token, bayi = false) { const csrfToken = crypto.randomBytes(32).toString("hex"); res.cookie(bayi ? BAYI_AUTH_COOKIE : AUTH_COOKIE, token, secenek(true)); res.cookie(bayi ? BAYI_CSRF_COOKIE : CSRF_COOKIE, csrfToken, secenek(false)); return csrfToken; }
function oturumCookieSil(res, bayi = false) { res.clearCookie(bayi ? BAYI_AUTH_COOKIE : AUTH_COOKIE, secenek(true)); res.clearCookie(bayi ? BAYI_CSRF_COOKIE : CSRF_COOKIE, secenek(false)); }
function csrfKontrol(req, res, next) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method) || CSRF_HARIC_AUTH_YOLLARI.has(req.path) || req.headers.authorization?.startsWith("Bearer ")) return next();
    const names = cookieAdlari(req); const cookies = cookieOku(req); if (!cookies[names.auth]) return next();
    const header = String(req.get("x-csrf-token") || ""), cookie = String(cookies[names.csrf] || "");
    if (header && cookie && header.length === cookie.length && crypto.timingSafeEqual(Buffer.from(header), Buffer.from(cookie))) return next();
    res.locals.guvenlikOlayi = { kategori: "CSRF", seviye: "UYARI" };
    return res.status(403).json({ basarili: false, mesaj: "CSRF doğrulaması başarısız." });
}
module.exports = { BAYI_AUTH_COOKIE, BAYI_CSRF_COOKIE, bayiIstegi, cookieAdlari, AUTH_COOKIE, CSRF_COOKIE, cookieOku, oturumCookieYaz, oturumCookieSil, csrfKontrol };
