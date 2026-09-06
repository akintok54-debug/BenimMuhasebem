const mongoose = require("mongoose");

function kimlik(value) {
    if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) {
        const error = new Error("Geçerli kayıt kimliği gerekli."); error.status = 400; throw error;
    }
    return new mongoose.Types.ObjectId(value);
}

function maskele(value, depth = 0) {
    if (depth > 12) return "[SINIRLANDI]";
    if (value == null || value instanceof Date || value instanceof mongoose.Types.ObjectId) return value;
    if (Array.isArray(value)) return value.map(x => maskele(x, depth + 1));
    if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, val]) => [key,
        /secret|token|password|sifre|parola|credential|authorization|cookie|api.?key|gizli|kurtarma/i.test(key) ? "[GİZLİ]" : maskele(val, depth + 1)]));
    if (typeof value === "string") return value
        .replace(/Bearer\s+[^\s"',;]+/gi, "Bearer [GİZLİ]")
        .replace(/((?:secret|token|password|sifre|api[_-]?key|authorization)\s*[=:]\s*)[^\s&,;"']+/gi, "$1[GİZLİ]")
        .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[GİZLİ]@");
    return value;
}

function onayKontrol(req, res, next) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (req.body?.onay !== "ONAYLIYORUM") return res.status(400).json({ basarili: false, mesaj: "Kritik işlem için ONAYLIYORUM onayı gerekli." });
    next();
}

module.exports = { kimlik, maskele, onayKontrol };
