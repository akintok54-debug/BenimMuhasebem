const { tokenDogrula } = require("../services/tokenServisi");

function kimlikKontrol(req, res, next) {
    try {
        const header = req.headers.authorization;

        if (!header || !header.startsWith("Bearer ")) {
            return res.status(401).json({
                basarili: false,
                mesaj: "Yetkilendirme tokenı gerekli."
            });
        }

        const token = header.substring(7).trim();

        if (!token) {
            return res.status(401).json({
                basarili: false,
                mesaj: "Yetkilendirme tokenı gerekli."
            });
        }

        const kullanici = tokenDogrula(token);

        req.kullanici = kullanici;
        req.user = kullanici;

        next();

    } catch (error) {
        return res.status(401).json({
            basarili: false,
            mesaj: "Geçersiz veya süresi dolmuş token."
        });
    }
}

module.exports = kimlikKontrol;

