const crypto = require("node:crypto");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Ayar = require("./models/MagazaAyar");
const Tenant = require("../platform/models/Tenant");
const User = require("../../models/Kullanici");
const Customer = require("../../models/Musteri");
const Depot = require("../../models/Depo");
const Bank = require("../../models/Banka");
const Cash = require("../../models/Kasa");
const { telefonNormalize } = require("../../utils/kullaniciKimligi");
const { sifrele } = require("../../services/sifrelemeServisi");
const fail = (message, status = 400) => Object.assign(new Error(message), { status, kod: "B2B_STORE_ERROR" });
const retail = customer => customer?.b2b?.musteriTipi === "PERAKENDE";
const visibility = customer => retail(customer) ? { katalogFiyati: true, gorsel: true, stok: false, barkod: false, depo: false } : customer?.b2b?.gorunum || {};
function text(value, max = 200) { if (typeof value !== "string" || value.trim().length > max) throw fail("Bilgileri kontrol edin."); return value.trim(); }
async function ayarOku(tenantId, session = null) {
    const ayar = await Ayar.findById(tenantId).select("+paytrSecret").session(session).lean();
    if (!ayar?.aktif) throw fail("Mağaza şu anda siparişe kapalı.", 409);
    return ayar;
}
async function magazaBul(slug) {
    let company;
    const access = { $or: [{ status: "active" }, { status: "trial" }] };
    if (slug) {
        if (typeof slug !== "string" || !/^[a-z0-9-]{1,100}$/.test(slug)) throw fail("Mağaza bağlantısı geçersiz.", 404);
        company = await Tenant.findOne({ slug, ...access }).select("name slug status trialEndsAt firmaBilgileri.unvan").lean();
    } else {
        const shops = await Ayar.find({ aktif: true }).select("_id").limit(2).lean();
        if (shops.length !== 1) throw fail("Firmanızın mağaza bağlantısını kullanın.", 404);
        company = await Tenant.findOne({ _id: shops[0]._id, ...access }).select("name slug status trialEndsAt firmaBilgileri.unvan").lean();
    }
    if (!company) throw fail("Mağaza bulunamadı.", 404);
    if (!["active", "trial"].includes(require("../../services/abonelikServisi").abonelikDurumuHesapla(company))) throw fail("Firma erişimi aktif değil.", 403);
    const ayar = await ayarOku(company._id);
    if (!await Depot.exists({ _id: ayar.depoId, tenantId: company._id, aktif: true })) throw fail("Mağaza deposu kullanılamıyor.", 409);
    return { company, ayar };
}
async function odemeSecenekleri(ayar, tenantId, session = null) {
    const bank = ayar.bankaId ? await Bank.findOne({ _id: ayar.bankaId, tenantId, aktif: true, paraBirimi: "TRY" }).select("bankaAdi iban hesapSahibi demo aktif").session(session).lean() : null;
    return [
        ...(ayar.havale && require("../../services/odemeHesabiServisi").yayinlanabilir(bank) ? [{ kod: "HAVALE", ad: "Havale / EFT", bankaAdi: bank.bankaAdi, iban: bank.iban }] : []),
        ...(ayar.kapida ? [{ kod: "KAPIDA", ad: "Kapıda ödeme" }] : []),
        ...(ayar.kart && bank && ayar.paytrMerchantId && ayar.paytrSecret && !ayar.paytrTest ? [{ kod: "KART", ad: "Kredi / banka kartı" }] : [])
    ];
}
function perakendeMusteri(customer, ayar) {
    return { ...customer, b2b: { ...customer?.b2b, musteriTipi: "PERAKENDE", aktif: true, siparisYetkisi: customer?.b2b?.siparisYetkisi !== false, depoId: ayar.depoId, grupId: null, fiyatlar: [], negatifStok: false, minimumSiparis: 0, gorunum: visibility({ b2b: { musteriTipi: "PERAKENDE" } }) }, vadeGun: 0, limit: 0, riskLimiti: 0 };
}
async function kaydol(body) {
    const { company, ayar } = await magazaBul(body.firma);
    const adSoyad = text(body.adSoyad, 100), email = text(body.email, 254).toLowerCase();
    const phone = telefonNormalize(text(body.telefon, 30));
    const password = body.sifre;
    const adres = text(body.adres, 500), il = text(body.il, 80), ilce = text(body.ilce, 80);
    if (adSoyad.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^905\d{9}$/.test(phone) || adres.length < 10 || !il || !ilce || typeof password !== "string" || password.length < 12 || password.length > 128) throw fail("Ad soyad, geçerli e-posta/cep telefonu, teslimat adresi ve en az 12 karakterli parola girin.");
    const ticari = body.ticariBasvuru === true;
    const unvan = ticari ? text(body.unvan, 200) : adSoyad;
    const vergiNo = ticari ? text(body.vergiNo, 11) : "";
    const vergiDairesi = ticari ? text(body.vergiDairesi, 100) : "";
    if (ticari && (unvan.length < 2 || !/^\d{10,11}$/.test(vergiNo) || !vergiDairesi)) throw fail("Firma unvanı, vergi numarası ve vergi dairesini girin.");
    if (await User.exists({ $or: [{ email }, { telefonNormalize: phone }] })) throw fail("Bu e-posta veya telefonla hesap var. Giriş yapın ya da parolanızı yenileyin.", 409);
    const hash = await bcrypt.hash(password, 12);
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const [customer] = await Customer.create([{
                tenantId: company._id, kod: "WEB-" + crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase(),
                adSoyad, unvan, email, telefon: phone, whatsapp: phone, adres, il, ilce, vergiNo, vergiDairesi,
                bakiye: 0, aktif: true,
                b2b: { ...perakendeMusteri({}, ayar).b2b, ticariBasvuru: ticari, kayitKaynagi: "MAGAZA" }
            }], { session });
            await User.create([{
                tenantId: company._id, musteriId: customer._id, adSoyad, email, telefon: phone,
                telefonNormalize: phone, sifre: hash, rol: "BAYI", aktif: true, hesapDurumu: "active", ozelYetkiler: [], yetkiModu: "ROL"
            }], { session });
        });
    } catch (e) {
        if (e.code === 11000) throw fail("Bu e-posta veya telefonla hesap var. Giriş yapın ya da parolanızı yenileyin.", 409);
        throw e;
    } finally { await session.endSession(); }
    return { mesaj: "Perakende hesabınız oluşturuldu. Giriş yaparak alışverişe başlayabilirsiniz.", firma: company.slug };
}
async function ayarKaydet(tenantId, body) {
    const fields = {};
    for(const key of ['bayiKdvDahil','perakendeKdvDahil'])if(body[key]!==undefined){if(typeof body[key]!=='boolean')throw fail('KDV gösterim seçimi geçersiz.');fields[key]=body[key];}
    for (const key of ["aktif", "havale", "kapida", "kart", "paytrTest"]) {
        if (typeof body[key] !== "boolean") throw fail("Mağaza seçeneklerini kontrol edin.");
        fields[key] = body[key];
    }
    for (const [key, Model] of [["depoId", Depot], ["bankaId", Bank], ["kasaId", Cash]]) {
        const id = body[key] || null;
        if (id && (!mongoose.isValidObjectId(id) || !await Model.exists({ _id: id, tenantId, aktif: true, ...(key !== "depoId" ? { paraBirimi: "TRY" } : {}) }))) throw fail("Seçilen depo/hesap bu firmaya ait değil veya aktif değil.");
        fields[key] = id;
    }
    if (fields.aktif && !fields.depoId) throw fail("Mağazayı açmak için depo seçin.");
    fields.paytrMerchantId = text(body.paytrMerchantId || "", 30);
    if (fields.paytrMerchantId && !/^\d+$/.test(fields.paytrMerchantId)) throw fail("PayTR mağaza numarası sayısal olmalıdır.");
    if (body.paytrKey || body.paytrSalt) {
        const key = text(body.paytrKey, 200), salt = text(body.paytrSalt, 200);
        if (!key || !salt) throw fail("PayTR anahtarı ve gizli değer birlikte girilmelidir.");
        fields.paytrSecret = sifrele(JSON.stringify({ key, salt }));
    }
    await Ayar.findOneAndUpdate({ _id: tenantId }, { $set: fields }, { upsert: true, runValidators: true });
}
module.exports = { fail, retail, visibility, ayarOku, magazaBul, odemeSecenekleri, perakendeMusteri, kaydol, ayarKaydet };
