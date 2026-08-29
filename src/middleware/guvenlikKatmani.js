const crypto = require("crypto");
const { artir } = require("../services/rateLimitStore");
function rateLimit({ pencereMs = 15 * 60 * 1000, limit = 300, anahtar = req => req.ip } = {}) {
    return async (req, res, next) => {
        try {
        const key = String(anahtar(req) || "unknown");
        const kova = await artir(key, pencereMs);
        res.set("RateLimit-Limit", String(limit));
        res.set("RateLimit-Remaining", String(Math.max(0, limit - kova.adet)));
        res.set("RateLimit-Reset", String(Math.ceil(kova.son / 1000)));
        if (kova.adet > limit) return res.status(429).json({ basarili: false, mesaj: "Çok fazla istek gönderildi. Lütfen daha sonra tekrar deneyin." });
        next();
        } catch (error) { next(error); }
    };
}

function guvenliAnahtarlar(value, derinlik = 0) {
    if (derinlik > 20 || value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(x => guvenliAnahtarlar(x, derinlik + 1));
    const temiz = {};
    for (const [key, item] of Object.entries(value)) {
        if (key.startsWith("$") || key.includes(".") || ["__proto__", "constructor", "prototype"].includes(key)) continue;
        temiz[key] = guvenliAnahtarlar(item, derinlik + 1);
    }
    return temiz;
}

function istekKimligi(req, res, next) {
    req.id = String(req.get("x-request-id") || crypto.randomUUID()).slice(0, 100);
    res.set("X-Request-Id", req.id);
    next();
}

function girdiTemizleme(req, res, next) {
    req.body = guvenliAnahtarlar(req.body);
    Object.defineProperty(req, "query", { value: guvenliAnahtarlar(req.query), configurable: true, writable: true, enumerable: true });
    next();
}

function httpsZorunlulugu(req, res, next) {
    if (process.env.NODE_ENV !== "production" || req.secure || String(req.get("x-forwarded-proto") || "").split(",")[0].trim() === "https") return next();
    if (req.method === "GET" || req.method === "HEAD") return res.redirect(308, `https://${req.get("host")}${req.originalUrl}`);
    return res.status(426).json({ basarili: false, mesaj: "Bu işlem güvenli HTTPS bağlantısı gerektirir." });
}

function kanonikAlanAdi(req, res, next) {
    if (process.env.NODE_ENV !== "production") return next();

    const kanonikHost = String(process.env.CANONICAL_HOST || "www.benimmuhasebe.com")
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/$/, "");
    const istekHost = String(req.get("x-forwarded-host") || req.get("host") || "")
        .split(",")[0]
        .trim()
        .toLowerCase();

    if (!kanonikHost || istekHost === kanonikHost) return next();
    return res.redirect(308, `https://${kanonikHost}${req.originalUrl}`);
}

module.exports = { rateLimit, istekKimligi, girdiTemizleme, httpsZorunlulugu, kanonikAlanAdi, guvenliAnahtarlar };
