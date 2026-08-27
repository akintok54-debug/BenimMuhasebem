const { tokenDogrula } = require("../services/tokenServisi");
const { AUTH_COOKIE, cookieOku } = require("../services/oturumGuvenligi");

function kimlikKontrol(req, res, next) {
    try {
        const header = req.headers.authorization;
        const bearer = header?.startsWith("Bearer ") ? header.substring(7).trim() : "";
        const cookieToken = cookieOku(req)[AUTH_COOKIE] || "";
        const token = cookieToken || bearer;
        if (!token) return res.status(401).json({ basarili: false, mesaj: "Yetkilendirme tokenı gerekli." });
        const kullanici = tokenDogrula(token);
        req.kullanici = kullanici; req.user = kullanici; req.authKaynak = cookieToken ? "cookie" : "bearer";
        next();
    } catch (error) {
        return res.status(401).json({ basarili: false, mesaj: "Geçersiz veya süresi dolmuş token." });
    }
}
module.exports = kimlikKontrol;
