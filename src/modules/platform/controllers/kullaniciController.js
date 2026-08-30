const Kullanici = require("../../../models/Kullanici");

async function listele(req, res, next) {
    try {
        const limit = Math.min(500, Math.max(1, Number(req.query.limit || 200)));
        const filter = {};
        if (req.query.rol) filter.rol = String(req.query.rol).trim().toUpperCase();
        if (req.query.aktif === "true") filter.aktif = true;
        if (req.query.aktif === "false") filter.aktif = false;

        const [kullanicilar, rolOzeti] = await Promise.all([
            Kullanici.find(filter)
                .select("adSoyad email rol aktif hesapDurumu tenantId sonGirisTarihi createdAt")
                .populate("tenantId", "name slug status")
                .sort({ createdAt: -1 })
                .limit(limit)
                .lean(),
            Kullanici.aggregate([
                { $group: { _id: "$rol", toplam: { $sum: 1 }, aktif: { $sum: { $cond: ["$aktif", 1, 0] } } } },
                { $sort: { toplam: -1 } }
            ])
        ]);

        res.set("Cache-Control", "no-store");
        return res.json({ basarili: true, toplam: kullanicilar.length, rolOzeti, kullanicilar });
    } catch (error) {
        next(error);
    }
}

module.exports = { listele };
