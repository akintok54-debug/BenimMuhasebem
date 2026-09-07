const express = require("express");
const bcrypt = require("bcryptjs");
const kimlik = require("../../middleware/kimlikKontrol");
const tenant = require("../../middleware/tenantKontrol");
const { rateLimit } = require("../../middleware/guvenlikKatmani");
const { bayiKontrol, yoneticiKontrol, kapsam, cookieCsrf } = require("./guvenlik");
const s = require("./servis");
const User = require("../../models/Kullanici"), Customer = require("../../models/Musteri"), Product = require("../../models/Urun");
const Order = require("../../models/Siparis"), Sale = require("../../models/Satis"), Stock = require("../../models/Stok"), Depot = require("../../models/Depo");
const Ledger = require("../../models/CariHareket"), Bank = require("../../models/Banka"), Group = require("./models/BayiGrubu");
const { belgeOzetleriniEkle } = require("../../services/belgeTutarOzetiServisi");
const { kaydet } = require("../platform/services/auditServisi");
const portal = express.Router(), admin = express.Router();
function bodyKontrol(req, res, next) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (req.body === undefined) req.body = {};
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) return res.status(400).json({ basarili: false, mesaj: "İstek gövdesi geçersiz." });
    next();
}
portal.use(bodyKontrol); admin.use(bodyKontrol);
const run = fn => async (req, res, next) => { try { await fn(req, res); } catch (e) { if (e.code === 11000) return res.status(409).json({ basarili: false, mesaj: "Kayıt zaten mevcut." }); next(e); } };
const page = req => Math.min(100000, Math.max(0, Number.parseInt(req.query.page, 10) || 0));
const literal = x => String(x || "").slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const orderFields = "siparisNo belgeNo tarih durum kalemler araToplam toplamKdv genelToplam paraBirimi satisId sevkAdresi odemeKosullari odemeDurumu odenenTutar kalanTutar";
function documentQuery(Model, req, id) {
    return Model.findOne({ ...kapsam(req), _id: s.oid(id) }).select(orderFields)
        .populate({ path: "kalemler.urunId", match: { tenantId: req.tenantId }, select: "ad kod barkod birim" }).lean();
}
portal.use(cookieCsrf, kimlik, bayiKontrol, rateLimit({ pencereMs: 60000, limit: 120, anahtar: req => `b2b:${req.currentUser._id}` }));
portal.get("/me", run(async (req, res) => {
    const c = req.bayi;
    const company = await require("../platform/models/Tenant").findById(req.tenantId).select("name firmaBilgileri.unvan firmaBilgileri.vergiDairesi firmaBilgileri.vergiNo firmaBilgileri.adres firmaBilgileri.telefon").lean();
    res.json({ basarili: true, firma: { unvan: company?.firmaBilgileri?.unvan || company?.name, vergiDairesi: company?.firmaBilgileri?.vergiDairesi, vergiNo: company?.firmaBilgileri?.vergiNo, adres: company?.firmaBilgileri?.adres, telefon: company?.firmaBilgileri?.telefon }, kullanici: { id: req.currentUser._id, adSoyad: req.currentUser.adSoyad, email: req.currentUser.email },
        cari: { unvan: c.unvan || c.adSoyad, kod: c.kod, adres: c.adres, vergiNo: c.vergiNo, vergiDairesi: c.vergiDairesi, bakiye: c.bakiye, vadeGun: c.vadeGun, limit: c.limit, riskLimiti: c.riskLimiti, siparisYetkisi: c.b2b.siparisYetkisi, minimumSiparis: c.b2b.minimumSiparis }, favoriler: req.currentUser.favoriler || [] });
}));
portal.get("/catalog", run(async (req, res) => {
    const filter = { tenantId: req.tenantId, aktif: true };
    if (req.query.q) filter.$or = ["ad", "kod", "barkod"].map(k => ({ [k]: { $regex: literal(req.query.q), $options: "i" } }));
    if (req.query.exact === "1" && req.query.q) filter.$or = [{ kod: String(req.query.q).slice(0, 100).toUpperCase() }, { barkod: String(req.query.q).slice(0, 100) }];
    for (const key of ["kategori", "marka"]) if (req.query[key]) filter[key] = String(req.query[key]).slice(0, 100);
    if (req.query.favorites === "1") filter._id = { $in: req.currentUser.favoriler || [] };
    const [products, total, categories, brands, group, depot] = await Promise.all([
        Product.find(filter).select("ad kod barkod kategori marka birim gorsel kdv bayiFiyati satisFiyati paraBirimi").sort({ ad: 1, _id: 1 }).skip(page(req) * 24).limit(24).lean(),
        Product.countDocuments(filter), Product.distinct("kategori", { tenantId: req.tenantId, aktif: true }), Product.distinct("marka", { tenantId: req.tenantId, aktif: true }),
        req.bayi.b2b.grupId ? Group.findOne({ _id: req.bayi.b2b.grupId, tenantId: req.tenantId }).lean() : null,
        Depot.findOne({ _id: req.bayi.b2b.depoId, tenantId: req.tenantId, aktif: true }).select("ad").lean()
    ]);
    if (req.bayi.b2b.grupId && !group) throw s.hata("Fiyat grubu kontrol edilmeli.", 409);
    const stocks = depot ? await Stock.find({ tenantId: req.tenantId, depoId: depot._id, urunId: { $in: products.map(x => x._id) } }).select("urunId miktar").lean() : [];
    const map = new Map(stocks.map(x => [String(x.urunId), x.miktar]));
    res.json({ basarili: true, total, page: page(req), categories, brands, depo: depot?.ad || null, products: products.map(x => ({ _id: x._id, ad: x.ad, kod: x.kod, barkod: x.barkod, kategori: x.kategori, marka: x.marka, birim: x.birim, gorsel: x.gorsel, kdv: x.kdv, paraBirimi: x.paraBirimi, netFiyat: s.netFiyat(x, req.bayi, group), stok: depot ? map.get(String(x._id)) || 0 : null })) });
}));
portal.put("/favorites/:id", run(async (req, res) => {
    const id = s.oid(req.params.id);
    if (!await Product.exists({ _id: id, tenantId: req.tenantId, aktif: true })) throw s.hata("Ürün bulunamadı.", 404);
    if (req.body.aktif !== true && req.body.aktif !== false) throw s.hata("Favori durumu geçersiz.");
    if (req.body.aktif && req.currentUser.favoriler.length >= 500) throw s.hata("En fazla 500 favori eklenebilir.");
    await User.updateOne({ _id: req.currentUser._id, tenantId: req.tenantId, musteriId: req.bayi._id, rol: "BAYI" }, { [req.body.aktif ? "$addToSet" : "$pull"]: { favoriler: id } });
    res.json({ basarili: true });
}));
portal.post("/quote", run(async (req, res) => res.json({ basarili: true, teklif: belgeOzetleriniEkle(await s.teklif(req.tenantId, req.bayi, req.body.kalemler)) })));
portal.post("/orders", run(async (req, res) => {
    const order = await s.siparisOlustur(req);
    await kaydet({ req, action: "B2B_ORDER_SUBMITTED", resource: "Siparis", resourceId: order._id, tenantId: req.tenantId, details: { musteriId: req.bayi._id } });
    res.status(201).json({ basarili: true, siparis: { _id: order._id, siparisNo: order.siparisNo, durum: order.durum, genelToplam: order.genelToplam } });
}));
portal.get("/orders", run(async (req, res) => res.json({ basarili: true, orders: await Order.find(kapsam(req)).select("siparisNo tarih durum genelToplam paraBirimi satisId").sort({ tarih: -1, _id: -1 }).skip(page(req) * 25).limit(25).lean() })));
portal.get("/orders/:id", run(async (req, res) => { const order = await documentQuery(Order, req, req.params.id); if (!order) throw s.hata("Sipariş bulunamadı.", 404); res.json({ basarili: true, document: belgeOzetleriniEkle(order) }); }));
portal.get("/ledger", run(async (req, res) => res.json({ basarili: true, bakiye: req.bayi.bakiye, hareketler: await Ledger.find({ tenantId: req.tenantId, tarafId: req.bayi._id, tarafTipi: "MUSTERI" }).select("tarih tip tutar belgeNo odemeYontemi bakiyeDegisimi oncekiBakiye sonrakiBakiye durum").sort({ tarih: -1, _id: -1 }).skip(page(req) * 50).limit(50).lean() })));
portal.get("/documents", run(async (req, res) => res.json({ basarili: true, documents: await Sale.find(kapsam(req)).select("belgeNo tarih genelToplam paraBirimi odemeDurumu odenenTutar kalanTutar").sort({ tarih: -1, _id: -1 }).skip(page(req) * 25).limit(25).lean() })));
portal.get("/documents/:id", run(async (req, res) => { const doc = await documentQuery(Sale, req, req.params.id); if (!doc) throw s.hata("Belge bulunamadı.", 404); res.json({ basarili: true, document: belgeOzetleriniEkle(doc) }); }));
portal.get("/payments", run(async (req, res) => res.json({ basarili: true, vadeGun: req.bayi.vadeGun, hesaplar: await Bank.find({ tenantId: req.tenantId, aktif: true }).select("bankaAdi iban paraBirimi").lean(), odemeler: await Ledger.find({ tenantId: req.tenantId, tarafId: req.bayi._id, tarafTipi: "MUSTERI", tip: "TAHSILAT" }).select("tarih tutar odemeYontemi belgeNo durum").sort({ tarih: -1, _id: -1 }).skip(page(req) * 25).limit(25).lean() })));

admin.use(cookieCsrf, kimlik, tenant, yoneticiKontrol);
admin.use((req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });
admin.get("/products", run(async (req, res) => res.json({ basarili: true, products: await Product.find({ tenantId: req.tenantId, aktif: true, $or: ["ad", "kod", "barkod"].map(k => ({ [k]: { $regex: literal(req.query.q), $options: "i" } })) }).select("ad kod paraBirimi").sort({ ad: 1 }).limit(30).lean() })));
admin.get("/", run(async (req, res) => {
    const filter = { tenantId: req.tenantId };
    const [customers, groups, depots, users] = await Promise.all([
        Customer.find({ ...filter, ...(req.query.q ? { $or: ["unvan", "adSoyad", "kod"].map(k => ({ [k]: { $regex: literal(req.query.q), $options: "i" } })) } : {}) }).select("kod unvan adSoyad b2b limit riskLimiti vadeGun").sort({ "b2b.aktif": -1, kod: 1 }).skip(page(req) * 50).limit(50).lean(),
        Group.find(filter).sort({ ad: 1 }).lean(), Depot.find({ ...filter, aktif: true }).select("ad kod").lean(), User.find({ ...filter, rol: "BAYI", silinmeTarihi: null }).select("adSoyad email musteriId aktif sonGirisTarihi").limit(1000).lean()
    ]);
    res.json({ basarili: true, customers, groups, depots, users });
}));
async function saveGroup(req, res) {
    const fields = { ad: s.metin(req.body.ad, 80), iskonto: s.sayi(req.body.iskonto, 0, 100), fiyatlar: await s.fiyatListesiDogrula(req.tenantId, req.body.fiyatlar || []) };
    if (!fields.ad) throw s.hata("Grup adı zorunlu.");
    const group = req.params.id ? await Group.findOneAndUpdate({ _id: s.oid(req.params.id), tenantId: req.tenantId }, { $set: fields }, { new: true, runValidators: true }) : await Group.create({ tenantId: req.tenantId, ...fields });
    if (!group) throw s.hata("Grup bulunamadı.", 404);
    await kaydet({ req, tenantId: req.tenantId, action: "B2B_GROUP_UPDATED", resource: "BayiGrubu", resourceId: group._id });
    res.json({ basarili: true, group });
}
admin.post("/groups", run(saveGroup)); admin.patch("/groups/:id", run(saveGroup));
admin.patch("/customers/:id", run(async (req, res) => {
    const body = req.body, fields = {};
    for (const k of ["aktif", "siparisYetkisi", "negatifStok"]) { if (typeof body[k] !== "boolean") throw s.hata("Bayi seçenekleri geçersiz."); fields[`b2b.${k}`] = body[k]; }
    for (const k of ["limit", "riskLimiti", "vadeGun"]) fields[k] = s.sayi(body[k], 0, k === "vadeGun" ? 3650 : 1e12);
    fields["b2b.minimumSiparis"] = s.sayi(body.minimumSiparis);
    for (const [k, Model] of [["grupId", Group], ["depoId", Depot]]) {
        const id = body[k] ? s.oid(body[k]) : null;
        if (id && !await Model.exists({ _id: id, tenantId: req.tenantId, ...(k === "depoId" ? { aktif: true } : {}) })) throw s.hata("Grup/depo firmaya ait değil.");
        fields[`b2b.${k}`] = id;
    }
    if (body.aktif && !fields["b2b.depoId"]) throw s.hata("Aktif bayi için depo seçin.");
    fields["b2b.fiyatlar"] = await s.fiyatListesiDogrula(req.tenantId, body.fiyatlar || []);
    const customer = await Customer.findOneAndUpdate({ _id: s.oid(req.params.id), tenantId: req.tenantId }, { $set: fields }, { new: true, runValidators: true }).select("_id");
    if (!customer) throw s.hata("Müşteri bulunamadı.", 404);
    await kaydet({ req, tenantId: req.tenantId, action: "B2B_CUSTOMER_UPDATED", resource: "Musteri", resourceId: customer._id, details: fields });
    res.json({ basarili: true });
}));
admin.post("/customers/:id/users", run(async (req, res) => {
    const customerId = s.oid(req.params.id), body = req.body;
    if (!await Customer.exists({ _id: customerId, tenantId: req.tenantId, "b2b.aktif": true })) throw s.hata("Önce B2B bayi hesabını etkinleştirin.", 409);
    const adSoyad = s.metin(body.adSoyad, 100), email = s.metin(body.email, 254).toLowerCase(), password = s.metin(body.sifre, 128);
    if (adSoyad.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) throw s.hata("Ad, e-posta ve en az 12 karakterli parola gerekli.");
    const plan = await require("../platform/models/Tenant").findById(req.tenantId).select("limits.users").lean();
    const limit = Number(plan?.limits?.users || 0);
    if (limit > 0 && await User.countDocuments({ tenantId: req.tenantId, silinmeTarihi: null }) >= limit) throw s.hata("Paket kullanıcı limiti dolu.", 409);
    const user = await User.create({ tenantId: req.tenantId, musteriId: customerId, adSoyad, email, sifre: await bcrypt.hash(password, 12), rol: "BAYI", aktif: true, ozelYetkiler: [], yetkiModu: "ROL" });
    await kaydet({ req, tenantId: req.tenantId, action: "B2B_USER_CREATED", resource: "Kullanici", resourceId: user._id });
    res.status(201).json({ basarili: true, kullanici: { _id: user._id, email: user.email } });
}));
admin.patch("/users/:id", run(async (req, res) => {
    if (typeof req.body.aktif !== "boolean") throw s.hata("Durum geçersiz.");
    const user = await User.findOneAndUpdate({ _id: s.oid(req.params.id), tenantId: req.tenantId, rol: "BAYI" }, { $set: { aktif: req.body.aktif } }).select("_id");
    if (!user) throw s.hata("Bayi kullanıcısı bulunamadı.", 404);
    await kaydet({ req, tenantId: req.tenantId, action: "B2B_USER_STATUS", resource: "Kullanici", resourceId: user._id, details: { aktif: req.body.aktif } });
    res.json({ basarili: true });
}));
admin.get("/orders", run(async (req, res) => res.json({ basarili: true, orders: await Order.find({ tenantId: req.tenantId, kaynakKanal: "B2B" }).select("siparisNo tarih durum genelToplam musteriId satisId").populate({ path: "musteriId", match: { tenantId: req.tenantId }, select: "unvan adSoyad" }).sort({ tarih: -1, _id: -1 }).skip(page(req) * 25).limit(25).lean() })));
const transitions = { TASLAK: ["ONAYLANDI", "IPTAL"], ONAYLANDI: ["HAZIRLANIYOR", "IPTAL"], HAZIRLANIYOR: ["SEVK_EDILDI", "IPTAL"], SEVK_EDILDI: [] };
admin.patch("/orders/:id/status", run(async (req, res) => {
    const filter = { _id: s.oid(req.params.id), tenantId: req.tenantId, kaynakKanal: "B2B", satisId: null };
    const order = await Order.findOne(filter).select("durum").lean();
    if (!order || !transitions[order.durum]?.includes(req.body.durum)) throw s.hata("Sipariş durum geçişi geçersiz.", 409);
    const updated = await Order.updateOne({ ...filter, durum: order.durum }, { $set: { durum: req.body.durum } });
    if (!updated.modifiedCount) throw s.hata("Sipariş başka bir işlemde güncellendi.", 409);
    await kaydet({ req, tenantId: req.tenantId, action: "B2B_ORDER_STATUS", resource: "Siparis", resourceId: order._id, details: { eski: order.durum, yeni: req.body.durum } });
    res.json({ basarili: true });
}));
module.exports = { portal, admin, transitions };
