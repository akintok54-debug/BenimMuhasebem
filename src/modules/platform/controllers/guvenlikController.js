const PlatformAuditLog = require("../models/PlatformAuditLog");

async function merkez(req, res, next) {
    try {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const [ozet, olaylar] = await Promise.all([
            PlatformAuditLog.aggregate([
                { $match: { createdAt: { $gte: since }, category: { $in: ["GIRIS", "SUPHELI_GIRIS", "YETKISIZ_ERISIM", "API_HATASI", "BANKA_ENTEGRASYON", "SISTEM_GUVENLIK"] } } },
                { $group: { _id: "$category", toplam: { $sum: 1 }, basarisiz: { $sum: { $cond: ["$success", 0, 1] } }, sonOlay: { $max: "$createdAt" } } }
            ]),
            PlatformAuditLog.find({ category: { $in: ["GIRIS", "SUPHELI_GIRIS", "YETKISIZ_ERISIM", "API_HATASI", "BANKA_ENTEGRASYON", "SISTEM_GUVENLIK"] } }).sort({ createdAt: -1 }).limit(100).select("category severity success httpStatus action ip userAgent tenantId actorUserId requestId createdAt").lean()
        ]);
        res.set("Cache-Control", "no-store");
        return res.json({ basarili: true, donemGun: 30, ozet, olaylar });
    } catch (error) { next(error); }
}

async function auditKayitlari(req, res, next) {
    try {
        const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100)));
        const filter = {};
        if (req.query.category) filter.category = String(req.query.category).slice(0, 50);
        const kayitlar = await PlatformAuditLog.find(filter)
            .populate("actorUserId", "adSoyad email rol")
            .populate("tenantId", "name slug")
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
        res.set("Cache-Control", "no-store");
        return res.json({ basarili: true, kayitlar });
    } catch (error) { next(error); }
}

async function sistemHatalari(req, res, next) {
    try {
        const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100)));
        const son24Saat = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const filter = { $or: [{ category: "API_HATASI" }, { httpStatus: { $gte: 500 } }] };
        const [hatalar, son24SaatToplam] = await Promise.all([
            PlatformAuditLog.find(filter)
                .populate("actorUserId", "adSoyad email rol")
                .populate("tenantId", "name slug")
                .sort({ createdAt: -1 })
                .limit(limit)
                .lean(),
            PlatformAuditLog.countDocuments({ ...filter, createdAt: { $gte: son24Saat } })
        ]);
        res.set("Cache-Control", "no-store");
        return res.json({ basarili: true, son24SaatToplam, toplam: hatalar.length, hatalar });
    } catch (error) { next(error); }
}

module.exports = { merkez, auditKayitlari, sistemHatalari };
