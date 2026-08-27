const mongoose = require("mongoose");
const Kullanici = require("../models/Kullanici");

function tenantId(req) { return new mongoose.Types.ObjectId(String(req.tenantId)); }

async function listele(req, res, next) {
    try {
        const kullanicilar = await Kullanici.find({ tenantId: tenantId(req), silinmeTarihi: null })
            .select("adSoyad email rol aktif ozelYetkiler sonGirisTarihi")
            .sort({ adSoyad: 1 }).lean();
        return res.json({ basarili: true, kullanicilar });
    } catch (error) { next(error); }
}

async function yetkiGuncelle(req, res, next) {
    try {
        const izinli = ["balance.adjust"];
        const ozelYetkiler = [...new Set((Array.isArray(req.body?.ozelYetkiler) ? req.body.ozelYetkiler : []).filter(x => izinli.includes(x)))];
        const kullanici = await Kullanici.findOne({ _id: req.params.id, tenantId: tenantId(req), aktif: true });
        if (!kullanici) return res.status(404).json({ basarili: false, mesaj: "Kullanıcı bulunamadı." });
        if (["OWNER", "ADMIN"].includes(kullanici.rol) && !ozelYetkiler.includes("balance.adjust")) ozelYetkiler.push("balance.adjust");
        kullanici.ozelYetkiler = ozelYetkiler; await kullanici.save();
        return res.json({ basarili: true, mesaj: "Kullanıcı yetkileri güncellendi.", kullanici: { id: kullanici._id, ozelYetkiler: kullanici.ozelYetkiler } });
    } catch (error) { next(error); }
}

module.exports = { listele, yetkiGuncelle };
