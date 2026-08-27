const Kullanici = require("../models/Kullanici");
const PlatformAuditLog = require("../modules/platform/models/PlatformAuditLog");

async function kullaniciVeriPaketi(kullaniciId, tenantId) {
    const [kullanici, islemler] = await Promise.all([
        Kullanici.findOne({ _id: kullaniciId, tenantId }).select("-sifre -ikiFaktor.gizliAnahtar").lean(),
        PlatformAuditLog.find({ actorUserId: kullaniciId, tenantId }).sort({ createdAt: -1 }).select("action resource resourceId success createdAt").lean()
    ]);
    if (!kullanici) return null;
    return { surum: 1, olusturmaTarihi: new Date(), kullanici, islemGecmisi: islemler };
}

module.exports = { kullaniciVeriPaketi };
