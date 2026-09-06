const Stok = require("../models/Stok");

// Sale quantities may exceed physical stock. Keep one atomic, tenant/depot scoped
// decrement and let the caller write the ledger in the same transaction.
async function satisStokDus({ tenantId, urunId, depoId, miktar, session }) {
    if (!Number.isFinite(Number(miktar)) || Number(miktar) <= 0) throw new Error("Satış miktarı geçersiz.");
    return Stok.findOneAndUpdate(
        { tenantId, urunId, depoId },
        { $inc: { miktar: -Number(miktar) }, $set: { sonHareketTarihi: new Date() } },
        { new: true, upsert: true, setDefaultsOnInsert: true, session }
    );
}
module.exports = { satisStokDus };
