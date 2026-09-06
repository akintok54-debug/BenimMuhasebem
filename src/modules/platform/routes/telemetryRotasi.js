const express = require("express");
const User = require("../../../models/Kullanici");
const { tokenDogrula } = require("../../../services/tokenServisi");
const { cookieOku, AUTH_COOKIE } = require("../../../services/oturumGuvenligi");
function optionalIdentity(req,res,next) {
    try { const token=cookieOku(req)[AUTH_COOKIE] || req.headers.authorization?.replace(/^Bearer /, ""); const p=token && tokenDogrula(token); if (p?.kullaniciId && p.rol && !p.purpose) req.kullanici=req.user=p; } catch (_) {}
    next();
}
const { rateLimit } = require("../../../middleware/guvenlikKatmani");
const audit = require("../services/auditServisi");
const { safePath } = require("../services/hataIzlemeServisi");
const router = express.Router();
router.post("/client-error", optionalIdentity,
    rateLimit({ pencereMs: 60000, limit: 10, anahtar: req => `client-error:${req.kullanici?.kullaniciId || req.ip}` }),
    async (req, res, next) => {
        try {
            const payload = req.kullanici;
            const user = payload ? await User.findOne({ _id: payload.kullaniciId, aktif: true, silinmeTarihi: null }).select("_id rol tenantId").lean() : null;
            if (payload && (!user || (user.rol !== "SUPER_ADMIN" && (!user.tenantId || String(user.tenantId) !== String(payload.tenantId))))) return res.status(403).json({ basarili: false });
            const b = req.body || {};
            if (!["JAVASCRIPT", "PROMISE", "RESOURCE", "NETWORK"].includes(b.kind)) return res.status(400).json({ basarili: false });
            const line = Number(b.line), column = Number(b.column);
            req.currentUser = user;
            if (user) req.user.tenantId = user.tenantId || null;
            const saved = await audit.kaydet({ req, tenantId: user?.tenantId || null, action: `CLIENT_${b.kind}`, resource: "browser", category: "TARAYICI_HATASI", severity: "UYARI", success: false,
                details: { page: safePath(b.page), file: safePath(b.file), line: Number.isInteger(line) && line >= 0 && line < 10000000 ? line : null,
                    column: Number.isInteger(column) && column >= 0 && column < 10000000 ? column : null,
                    name: ["Error", "TypeError", "ReferenceError", "SyntaxError", "RangeError", "URIError", "NetworkError"].includes(b.name) ? b.name : "Error",
                    release: require("../../../../package.json").version,
                    source: user ? "CLIENT_REPORTED" : "ANONYMOUS_CLIENT_REPORTED" } });
            if (!saved) return res.status(503).json({ basarili: false });
            res.status(202).json({ basarili: true, requestId: req.id });
        } catch (error) { next(error); }
    });
module.exports = router;
