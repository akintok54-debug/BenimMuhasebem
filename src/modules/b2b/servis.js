const crypto = require("crypto");
const mongoose = require("mongoose");
const Urun = require("../../models/Urun");
const Stok = require("../../models/Stok");
const Depo = require("../../models/Depo");
const Musteri = require("../../models/Musteri");
const Siparis = require("../../models/Siparis");
const Grup = require("./models/BayiGrubu");
const { hesapla } = require("../../services/siparisHesaplamaServisi");
const hata = (mesaj, status = 400) => Object.assign(new Error(mesaj), { status });
const oid = x => { if (typeof x !== "string" || !/^[a-f\d]{24}$/i.test(x)) throw hata("Kayıt kimliği geçersiz."); return x.toLowerCase(); };
const sayi = (x, min = 0, max = 1e12) => { if (typeof x !== "number" || !Number.isFinite(x) || x < min || x > max) throw hata("Sayısal değer geçersiz."); return x; };
const metin = (x, max = 250) => { if (typeof x !== "string" || x.length > max) throw hata("Metin geçersiz veya çok uzun."); return x.trim(); };
function netFiyat(urun, musteri, grup, kampanyalar = []) {
    return require('../../services/fiyatServisi').fiyatlandir(urun, musteri, grup, kampanyalar).netFiyat;
}

async function fiyatListesiDogrula(tenantId, fiyatlar) {
    if (!Array.isArray(fiyatlar) || fiyatlar.length > 500) throw hata("Fiyat listesi en fazla 500 satır olabilir.");
    const ids = new Set();
    const temiz = fiyatlar.map(x => { const id = oid(x.urunId); if (ids.has(id)) throw hata("Ürün fiyatı tekrarlanamaz."); ids.add(id); return { urunId: id, fiyat: sayi(x.fiyat) }; });
    if (ids.size && await Urun.countDocuments({ tenantId, _id: { $in: [...ids] } }) !== ids.size) throw hata("Fiyat listesinde firmaya ait olmayan ürün var.");
    return temiz;
}
async function teklif(tenantId, customer, items, session = null) {
    const shop = require("./magazaServisi");
    if (shop.retail(customer)) customer = shop.perakendeMusteri(customer, await shop.ayarOku(tenantId, session));
    if (!Array.isArray(items) || !items.length || items.length > 100) throw hata("Sepet 1-100 ürün içermelidir.");
    const amounts = new Map();
    for (const item of items) { const id = oid(item.urunId); amounts.set(id, sayi((amounts.get(id) || 0) + sayi(item.miktar, 0.0001, 1e6), 0.0001, 1e6)); }
    const depo = await Depo.findOne({ _id: customer.b2b?.depoId, tenantId, aktif: true }).session(session).lean();
    if (!depo) throw hata("Bayi için aktif sipariş deposu tanımlanmalı.", 409);
    const grup = customer.b2b?.grupId ? await Grup.findOne({ _id: customer.b2b.grupId, tenantId }).session(session).lean() : null;
    if (customer.b2b?.grupId && !grup) throw hata("Bayi fiyat grubu bulunamadı.", 409);
    const urunler = await Urun.find({ tenantId, _id: { $in: [...amounts.keys()] }, aktif: true }).sort({ _id: 1 }).session(session).lean();
    if (urunler.length !== amounts.size) throw hata("Ürün bulunamadı veya satışa kapalı.", 404);
    if (shop.retail(customer) && urunler.some(x => netFiyat(x, customer, null) <= 0)) throw hata("Ürünün perakende fiyatı henüz tanımlanmamış. Firma ile görüşün.", 409);
    // The existing customer ledger is in TRY; do not invent currency conversions.
    if (urunler.some(x => x.paraBirimi !== "TRY")) throw hata("B2B açık hesap siparişinde ürün fiyatı TL olmalıdır.", 409);
    const stoklar = await Stok.find({ tenantId, depoId: depo._id, urunId: { $in: urunler.map(x => x._id) } }).session(session).lean();
    const stocks = new Map(stoklar.map(x => [String(x.urunId), Number(x.miktar || 0)]));
    if (customer.b2b.negatifStok === false) {
        const pending = await Siparis.aggregate([
            { $match: { tenantId: new mongoose.Types.ObjectId(String(tenantId)), depoId: depo._id, satisId: null, durum: { $nin: ["IPTAL", "TAMAMLANDI"] } } },
            { $unwind: "$kalemler" },
            { $match: { "kalemler.urunId": { $in: urunler.map(x => x._id) } } },
            { $group: { _id: "$kalemler.urunId", miktar: { $sum: "$kalemler.miktar" } } }
        ]).session(session);
        const allocated = new Map(pending.map(x => [String(x._id), x.miktar]));
        if (urunler.some(x => (stocks.get(String(x._id)) || 0) - (allocated.get(String(x._id)) || 0) < amounts.get(String(x._id)))) throw hata("Seçili depoda bekleyen siparişler sonrası yeterli stok yok.", 409);
    }
    const kampanyalar = await require('../../services/fiyatServisi').kampanyalariOku(tenantId, session);
    const result = hesapla(urunler.map(x => ({ urunId: x._id, miktar: amounts.get(String(x._id)), birimFiyat: netFiyat(x, customer, grup, kampanyalar), kdv: sayi(x.kdv, 0, 100), iskonto: 0 })));
    return { ...result, fiyatOnayi: crypto.createHash("sha256").update(JSON.stringify(result.kalemler)).digest("hex"), depoId: depo._id, paraBirimi: "TRY", urunler: urunler.map(x => ({ _id: x._id, ad: x.ad, kod: x.kod, birim: x.birim, ...(customer.b2b.gorunum?.stok === true ? { stok: stocks.get(String(x._id)) || 0 } : {}) })) };
}
function siparisNo(userId, key) {
    if (typeof key !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(key)) throw hata("Sipariş işlem anahtarı gerekli.");
    return "B2B-" + crypto.createHash("sha256").update(String(userId) + ":" + key).digest("hex").slice(0, 32).toUpperCase();
}
async function siparisOlustur(req) {
    const no = siparisNo(req.currentUser._id, req.body.transactionId);
    const filtre = { tenantId: req.tenantId, musteriId: req.bayi._id, siparisNo: no, kullaniciId: req.currentUser._id };
    const session = await mongoose.startSession();
    let result;
    try {
        await session.withTransaction(async () => {
            const existing = await Siparis.findOne(filtre).session(session).lean();
            if (existing) { result = existing; return; }
            // Serialize risk checks for concurrent orders belonging to the same customer.
            let customer = await Musteri.findOneAndUpdate({ _id: req.bayi._id, tenantId: req.tenantId, aktif: true, "b2b.aktif": true, "b2b.siparisYetkisi": true }, { $inc: { "b2b.surum": 1 } }, { new: true, session }).lean();
            if (!customer) throw hata("Bayi sipariş yetkisi kapalı.", 403);
            const shop = require("./magazaServisi");
            const isRetail = shop.retail(customer);
            let payment;
            if (isRetail) {
                const settings = await shop.ayarOku(req.tenantId, session);
                customer = shop.perakendeMusteri(customer, settings);
                payment = (await shop.odemeSecenekleri(settings, req.tenantId, session)).find(x => x.kod === req.body.odemeYontemi);
                if (!payment) throw shop.fail("Seçilen ödeme yöntemi kullanılamıyor. Sepeti yenileyin.", 409);
                if (metin(req.body.sevkAdresi || "", 700).length < 10) throw shop.fail("Teslimat adresini eksiksiz girin.");
            }
            if (customer.b2b.negatifStok === false) {
                if (!Array.isArray(req.body.kalemler) || req.body.kalemler.length > 100) throw hata("Sepet geçersiz.");
                // Serialize stock availability checks across different customers too.
                for (const id of [...new Set(req.body.kalemler.map(x => oid(x.urunId)))].sort()) {
                    await Stok.updateOne({ tenantId: req.tenantId, depoId: customer.b2b.depoId, urunId: id }, { $inc: { b2bSurum: 1 } }, { session });
                }
            }
            const q = await teklif(req.tenantId, customer, req.body.kalemler, session);
            if (req.body.fiyatOnayi !== q.fiyatOnayi) throw hata("Fiyatlar değişti. Sepeti yenileyip tekrar onaylayın.", 409);
            if (q.genelToplam < (customer.b2b.minimumSiparis || 0)) throw hata("Minimum sipariş tutarı karşılanmıyor.", 409);
            const [pending] = await Siparis.aggregate([{ $match: { tenantId: customer.tenantId, musteriId: customer._id, satisId: null, durum: { $nin: ["IPTAL", "TAMAMLANDI"] } } }, { $group: { _id: null, tutar: { $sum: "$genelToplam" } } }]).session(session);
            const risk = Math.max(0, Number(customer.bakiye || 0) + Number(pending?.tutar || 0) + q.genelToplam);
            if ([customer.limit, customer.riskLimiti].some(x => x > 0 && risk > x)) throw hata("Kredi/risk limiti aşılıyor. Firma ile görüşün.", 409);
            const { urunler, fiyatOnayi, ...saved } = q;
            const [order] = await Siparis.create([{ ...filtre, ...saved, kaynakKanal: "B2B", durum: "TASLAK", sevkAdresi: metin(req.body.sevkAdresi || customer.adres || "", 700), notlar: metin(req.body.notlar || "", 700), odemeKosullari: isRetail ? payment.ad : `${customer.vadeGun || 0} gün vade`, musteriTipi: isRetail ? "PERAKENDE" : "BAYI", magazaOdemeYontemi: payment?.kod || "", magazaOdemeDurumu: "BEKLIYOR" }], { session });
            result = order.toObject();
        });
    } catch (error) {
        if (error.code !== 11000) throw error;
        result = await Siparis.findOne(filtre).lean();
        if (!result) throw error;
    } finally { await session.endSession(); }
    return result;
}
module.exports = { hata, oid, sayi, metin, netFiyat, fiyatListesiDogrula, teklif, siparisNo, siparisOlustur };
