const crypto = require("crypto");

const AUTH_COOKIE = "bm_session", CSRF_COOKIE = "bm_csrf";
const OTURUM_SURESI_MS = 30 * 24 * 60 * 60 * 1000;
function cookieOku(req) { return Object.fromEntries(String(req.headers.cookie || "").split(";").map(x => x.trim()).filter(Boolean).map(x => { const i = x.indexOf("="); return [decodeURIComponent(x.slice(0, i)), decodeURIComponent(x.slice(i + 1))]; })); }
function secenek(httpOnly) { return { httpOnly, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: OTURUM_SURESI_MS }; }
function oturumCookieYaz(res, token) { const csrfToken = crypto.randomBytes(32).toString("hex"); res.cookie(AUTH_COOKIE, token, secenek(true)); res.cookie(CSRF_COOKIE, csrfToken, secenek(false)); return csrfToken; }
function oturumCookieSil(res) { res.clearCookie(AUTH_COOKIE, secenek(true)); res.clearCookie(CSRF_COOKIE, secenek(false)); }
function csrfKontrol(req, res, next) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method) || ["/api/auth/login", "/api/auth/2fa-dogrula"].includes(req.path) || req.headers.authorization?.startsWith("Bearer ")) return next();
    const cookies = cookieOku(req); if (!cookies[AUTH_COOKIE]) return next();
    const header = String(req.get("x-csrf-token") || ""), cookie = String(cookies[CSRF_COOKIE] || "");
    if (header && cookie && header.length === cookie.length && crypto.timingSafeEqual(Buffer.from(header), Buffer.from(cookie))) return next();
    res.locals.guvenlikOlayi = { kategori: "CSRF", seviye: "UYARI" };
    return res.status(403).json({ basarili: false, mesaj: "CSRF doğrulaması başarısız." });
}
module.exports = { AUTH_COOKIE, CSRF_COOKIE, cookieOku, oturumCookieYaz, oturumCookieSil, csrfKontrol };
