const fiyat = require('../../public/erp/fiyat');
const Icerik = require('../models/BayiIcerik');
async function kampanyalariOku(tenantId, session = null, now = new Date()) {
    return Icerik.find({ tenantId, aktif: true, baslangic: { $lte: now }, bitis: { $gt: now } }).session(session).lean();
}
module.exports = { ...fiyat, kampanyalariOku };
