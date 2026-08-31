const crypto = require("node:crypto");
const mongoose = require("mongoose");
const IslemKaydi = require("../models/IslemKaydi");
const { islemBaglamindaCalistir } = require("../services/islemBaglami");

function temizTransactionId(req) {
    const value = String(req.get?.("Idempotency-Key") || req.body?.transactionId || "").trim();
    return (value || crypto.randomUUID()).slice(0, 160);
}

function tekIslemKontrol(kapsam) {
    return async function tekIslemMiddleware(req, res, next) {
        const transactionId = temizTransactionId(req);
        const tenantId = new mongoose.Types.ObjectId(String(req.tenantId));
        let kayit;
        try {
            kayit = await IslemKaydi.create({ tenantId, transactionId, kapsam, durum: "ISLENIYOR" });
        } catch (error) {
            if (error.code !== 11000) return next(error);
            const mevcut = await IslemKaydi.findOne({ tenantId, transactionId }).lean();
            if (mevcut?.durum === "TAMAMLANDI" && mevcut.yanit) {
                return res.status(mevcut.httpStatus || 200).json({ ...mevcut.yanit, tekrar: true, transactionId });
            }
            return res.status(409).json({
                basarili: false,
                tekrar: true,
                transactionId,
                mesaj: mevcut?.durum === "BASARISIZ"
                    ? "Bu işlem anahtarı daha önce başarısız bir işlemde kullanıldı. Verileri düzeltip yeni bir işlem başlatın."
                    : "Bu işlem aynı transactionId ile zaten işleniyor. İkinci kayıt oluşturulmadı."
            });
        }

        req.transactionId = transactionId;
        res.locals.transactionId = transactionId;
        let yanit = null;
        const originalJson = res.json.bind(res);
        res.json = body => {
            yanit = body && typeof body === "object" ? { ...body, transactionId } : body;
            return originalJson(yanit);
        };
        res.once("finish", () => {
            const basarili = res.statusCode < 500;
            IslemKaydi.updateOne(
                { _id: kayit._id },
                { $set: { durum: basarili ? "TAMAMLANDI" : "BASARISIZ", httpStatus: res.statusCode, yanit, tamamlanmaTarihi: new Date() } }
            ).catch(() => {});
        });

        return islemBaglamindaCalistir(transactionId, next);
    };
}

module.exports = tekIslemKontrol;
