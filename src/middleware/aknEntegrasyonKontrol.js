const mongoose = require("mongoose");
const { tokenDogrula } = require("../services/tokenServisi");
const { tenantAboneliginiKontrolEt } = require("../services/abonelikServisi");

async function aknEntegrasyonKontrol(req, res, next) {
    try {
        const header = String(req.headers.authorization || "");
        const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
        if (!token) return res.status(401).json({ basarili: false, mesaj: "Entegrasyon tokenı gerekli." });

        const payload = tokenDogrula(token);
        if (payload.purpose !== "akn-eticaret") {
            return res.status(401).json({ basarili: false, mesaj: "Geçersiz entegrasyon tokenı." });
        }

        const tenantId = String(payload.tenantId || "");
        if (!mongoose.Types.ObjectId.isValid(tenantId)) {
            return res.status(403).json({ basarili: false, mesaj: "Entegrasyon firma kimliği geçersiz." });
        }

        const kontrol = await tenantAboneliginiKontrolEt(tenantId);
        if (!kontrol.erisim) {
            return res.status(kontrol.httpStatus).json({ basarili: false, kod: kontrol.kod, mesaj: kontrol.mesaj });
        }

        req.tenantId = tenantId;
        req.tenant = kontrol.tenant;
        req.authKaynak = "akn-eticaret";
        return next();
    } catch (_) {
        return res.status(401).json({ basarili: false, mesaj: "Geçersiz veya süresi dolmuş entegrasyon tokenı." });
    }
}

module.exports = aknEntegrasyonKontrol;
