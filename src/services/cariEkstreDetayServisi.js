const Satis = require('../models/Satis');
const Urun = require('../models/Urun');

// Only expose invoice lines belonging to the ledger's own tenant and customer.
async function detaylandir(tenantId, hareketler) {
    const sources = hareketler.filter(h => h.tarafTipi === 'MUSTERI' && h.kaynak === 'SATIS' && (h.sourceId || h.kaynakId));
    if (!sources.length) return hareketler;
    const sales = await Satis.find({tenantId, $or: sources.map(h => ({_id: h.sourceId || h.kaynakId, musteriId: h.tarafId}))})
        .select('_id musteriId belgeNo kalemler').lean();
    const products = await Urun.find({tenantId, _id: {$in: sales.flatMap(s => s.kalemler.map(k => k.urunId))}}).select('_id ad kod birim').lean();
    const productMap = new Map(products.map(p => [String(p._id), p]));
    return hareketler.map(h => {
        const sale = h.kaynak === 'SATIS' && sales.find(s => String(s._id) === String(h.sourceId || h.kaynakId) && String(s.musteriId) === String(h.tarafId));
        if (!sale) return h;
        return {...h, belgeNo: sale.belgeNo, kalemler: sale.kalemler.map(k => {
            const p = productMap.get(String(k.urunId));
            return {ad: p?.ad || 'Ürün kaydı bulunamadı', kod: p?.kod || '', birim: p?.birim || '', miktar: k.miktar, birimFiyat: k.birimFiyat, toplam: k.toplam};
        })};
    });
}
module.exports = {detaylandir};
