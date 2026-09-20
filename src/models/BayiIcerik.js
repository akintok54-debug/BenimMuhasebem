const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    tur: { type: String, enum: ['YENI', 'INDIRIMLI', 'KAMPANYA', 'REKLAM'], required: true },
    baslik: { type: String, required: true, maxlength: 150, trim: true },
    aktif: { type: Boolean, default: true },
    baslangic: { type: Date, required: true }, bitis: { type: Date, required: true },
    urunIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Urun' }],
    kategori: { type: String, default: '', maxlength: 150 }, marka: { type: String, default: '', maxlength: 150 },
    musteriIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Musteri' }],
    fiyatTurleri: { type: [String], enum: ['SATIS', 'BAYI', 'PERAKENDE'], default: ['BAYI'] },
    indirimOrani: { type: Number, min: 0, max: 100, default: 0 },
    tedarikciId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tedarikci', default: null },
    gorsel: { type: String, default: '', maxlength: 2800000 }, hedef: { type: String, default: '', maxlength: 1000 }
}, { timestamps: true });
schema.index({ tenantId: 1, aktif: 1, baslangic: 1, bitis: 1 });
module.exports = mongoose.model('BayiIcerik', schema);
