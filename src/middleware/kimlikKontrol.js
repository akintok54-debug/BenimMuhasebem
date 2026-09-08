const { tokenDogrula } = require("../services/tokenServisi");
const { cookieAdlari, cookieOku } = require("../services/oturumGuvenligi");

async function kimlikKontrol(req, res, next) {
    try {
        const header = req.headers.authorization;
        const bearer = header?.startsWith("Bearer ") ? header.substring(7).trim() : "";
        const cookieToken = cookieOku(req)[cookieAdlari(req).auth] || "";
        const token = cookieToken || bearer;
        if (!token) return res.status(401).json({ basarili: false, mesaj: "Yetkilendirme tokenı gerekli." });
        const kullanici = tokenDogrula(token);
        req.kullanici = kullanici; req.user = kullanici; req.authKaynak = cookieToken ? "cookie" : "bearer";
        await require("../modules/platform/services/sessionTelemetry").observe(req, token, kullanici);
        next();
    } catch (error) {
        return res.status(401).json({ basarili: false, mesaj: "Geçersiz veya süresi dolmuş token." });
    }
}
module.exports = kimlikKontrol;
