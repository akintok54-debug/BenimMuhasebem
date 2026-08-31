const mongoose = require("mongoose");
const SahaGun = require("../models/SahaGun");
const Kullanici = require("../models/Kullanici");
const Musteri = require("../models/Musteri");
const Satis = require("../models/Satis");
const SatisIade = require("../models/SatisIade");
const Siparis = require("../models/Siparis");
const Masraf = require("../models/Masraf");
const CariHareket = require("../models/CariHareket");
const Kasa = require("../models/Kasa");
const Banka = require("../models/Banka");
const ParaHareket = require("../models/ParaHareket");
const BelgePaylasim = require("../models/BelgePaylasim");
const Tenant = require("../modules/platform/models/Tenant");
const crypto = require("crypto");
const { kaydet: auditKaydet } = require("../modules/platform/services/auditServisi");

const yoneticiRolleri = new Set(["OWNER", "ADMIN", "MANAGER"]);
const tId = req => new mongoose.Types.ObjectId(String(req.tenantId));
const aktorId = req => new mongoose.Types.ObjectId(String(req.currentUser?._id || req.kullanici?.kullaniciId));
const gunMetni = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : new Date().toISOString().slice(0, 10);
const sinirlar = gun => ({ baslangic: new Date(`${gun}T00:00:00+03:00`), bitis: new Date(`${gun}T23:59:59.999+03:00`) });
const metin = (value, max = 500) => String(value ?? "").trim().slice(0, max);
const hash = token => crypto.createHash("sha256").update(String(token)).digest("hex");

function yonetici(req) { return yoneticiRolleri.has(String(req.currentUser?.rol || "").toUpperCase()); }
function hedefKullaniciId(req) {
    const istenen = String(req.query?.kullaniciId || req.body?.kullaniciId || "");
    if (yonetici(req) && mongoose.Types.ObjectId.isValid(istenen)) return new mongoose.Types.ObjectId(istenen);
    return aktorId(req);
}
function musteriSahiplik(req, kullaniciId = aktorId(req)) {
    return yonetici(req) ? {} : { $or: [{ temsilciId: kullaniciId }, { olusturanKullaniciId: kullaniciId }] };
}
function konum(value) {
    const enlem = Number(value?.enlem), boylam = Number(value?.boylam), hassasiyet = Number(value?.hassasiyet || 0);
    if (!Number.isFinite(enlem) || enlem < -90 || enlem > 90 || !Number.isFinite(boylam) || boylam < -180 || boylam > 180) {
        throw Object.assign(new Error("Geçerli GPS konumu zorunludur."), { status: 400 });
    }
    return { enlem, boylam, hassasiyet: Math.max(0, hassasiyet), adres: metin(value?.adres, 500) };
}
function pozitif(value, ad, sifirOlabilir = false) {
    const n = Number(value);
    if (!Number.isFinite(n) || (sifirOlabilir ? n < 0 : n <= 0)) throw Object.assign(new Error(`${ad} geçersizdir.`), { status: 400 });
    return n;
}
async function sahaKasasiBulVeyaOlustur(tenantId, kullaniciId) {
    let kasa = await Kasa.findOne({ tenantId, sorumluKullaniciId: kullaniciId, sahaKasasi: true });
    if (kasa) return kasa;
    const kullanici = await Kullanici.findOne({ _id: kullaniciId, tenantId }).select("adSoyad email").lean();
    if (!kullanici) throw Object.assign(new Error("Saha kasası için kullanıcı bulunamadı."), { status: 404 });
    const kod = `SAHA-${String(kullaniciId).slice(-8).toUpperCase()}`;
    try {
        kasa = await Kasa.create({ tenantId, kod, ad: `${kullanici.adSoyad || kullanici.email || "Personel"} Saha Kasası`, paraBirimi: "TRY", kasaTuru: "NAKIT", bakiye: 0, aktif: true, sahaKasasi: true, sorumluKullaniciId: kullaniciId, sorumlu: kullanici.adSoyad || kullanici.email || "" });
    } catch (error) {
        if (error?.code !== 11000) throw error;
        kasa = await Kasa.findOne({ tenantId, $or: [{ sorumluKullaniciId: kullaniciId, sahaKasasi: true }, { kod }] });
    }
    return kasa;
}
async function gunBul(req, { tamamlanmisDahil = true } = {}) {
    const filter = { tenantId: tId(req), kullaniciId: hedefKullaniciId(req), gun: gunMetni(req.query?.gun || req.body?.gun) };
    if (!tamamlanmisDahil) filter.durum = "AKTIF";
    return SahaGun.findOne(filter);
}

async function tesellumHesapla(req, kullaniciId, gun) {
    const tenantId = tId(req), { baslangic, bitis } = sinirlar(gun), ortak = { tenantId, kullaniciId, tarih: { $gte: baslangic, $lte: bitis } };
    const bagliSahaGun = await SahaGun.findOne({ tenantId, kullaniciId, gun }).select("_id").lean();
    const [satislar, iadeler, masraflar, tahsilatlar] = await Promise.all([
        Satis.find({ ...ortak, satisKanali: "SAHA" }).select("genelToplam odenenTutar kalanTutar odemeTipi belgeNo tarih musteriId").populate("musteriId", "kod unvan adSoyad whatsapp telefon").lean(),
        SatisIade.find({ ...ortak, satisKanali: "SAHA" }).select("genelToplam odemeTipi belgeNo tarih musteriId").lean(),
        Masraf.find({ ...ortak, durum: { $ne: "IPTAL" }, kaynak: "SAHA" }).select("kategori tutar aciklama fisNo hesapTipi").lean(),
        CariHareket.find({ ...ortak, tarafTipi: "MUSTERI", tip: "TAHSILAT", kaynak: "TAHSILAT", kaynakKanal: "SAHA", sahaGunId: bagliSahaGun?._id || null, durum: { $ne: "IPTAL" } }).select("tutar odemeYontemi kaynak kaynakKanal sahaGunId").lean()
    ]);
    const toplam = (liste, alan = "genelToplam") => liste.reduce((n, x) => n + Number(x[alan] || 0), 0);
    const odemeler = { nakit: 0, posKrediKarti: 0, iban: 0, cek: 0, senet: 0, acikHesap: 0 };
    for (const satis of satislar) {
        const tutar = Number(satis.genelToplam || 0);
        if (satis.odemeTipi === "NAKIT") odemeler.nakit += Number(satis.odenenTutar || tutar);
        else if (satis.odemeTipi === "KART") odemeler.posKrediKarti += Number(satis.odenenTutar || tutar);
        else if (satis.odemeTipi === "BANKA") odemeler.iban += Number(satis.odenenTutar || tutar);
        else if (satis.odemeTipi === "CEK") odemeler.cek += Number(satis.odenenTutar || tutar);
        else if (satis.odemeTipi === "SENET") odemeler.senet += Number(satis.odenenTutar || tutar);
        odemeler.acikHesap += Number(satis.kalanTutar || 0);
    }
    for (const h of tahsilatlar) {
        if (h.odemeYontemi === "NAKIT") odemeler.nakit += Number(h.tutar || 0);
        else if (h.odemeYontemi === "KREDI_KARTI") odemeler.posKrediKarti += Number(h.tutar || 0);
        else if (h.odemeYontemi === "IBAN") odemeler.iban += Number(h.tutar || 0);
        else if (h.odemeYontemi === "CEK") odemeler.cek += Number(h.tutar || 0);
        else if (h.odemeYontemi === "SENET") odemeler.senet += Number(h.tutar || 0);
    }
    const masraf = { mazot: 0, yemek: 0, diger: 0, toplam: toplam(masraflar, "tutar") };
    for (const x of masraflar) {
        if (x.kategori === "AKARYAKIT") masraf.mazot += Number(x.tutar || 0);
        else if (x.kategori === "YEMEK") masraf.yemek += Number(x.tutar || 0);
        else masraf.diger += Number(x.tutar || 0);
    }
    const iadeToplam = toplam(iadeler), nakitIade = iadeler.filter(x => x.odemeTipi === "NAKIT").reduce((n, x) => n + Number(x.genelToplam || 0), 0);
    const teslimEdilmesiGereken = Math.max(0, odemeler.nakit - nakitIade - masraf.toplam);
    const tahsilatToplami = odemeler.nakit + odemeler.posKrediKarti + odemeler.iban + odemeler.cek + odemeler.senet;
    return { gun, ciro: toplam(satislar), netCiro: toplam(satislar) - iadeToplam, satisAdedi: satislar.length, tahsilatlar: tahsilatToplami, ...odemeler, iadeler: iadeToplam, masraflar: masraf, teslimEdilmesiGereken, satislar };
}

async function panel(req, res, next) {
    try {
        const tenantId = tId(req), kullaniciId = hedefKullaniciId(req), gun = gunMetni(req.query.gun), kendiHesabi = String(kullaniciId) === String(aktorId(req));
        const sahaKasasi = await sahaKasasiBulVeyaOlustur(tenantId, kullaniciId);
        const [sahaGun, temsilciler, musteriler, kasalar, anaKasalar, bankalar] = await Promise.all([
            SahaGun.findOne({ tenantId, kullaniciId, gun }).populate("kullaniciId", "adSoyad email telefon").populate("rota.musteriId", "kod unvan adSoyad adres konum").populate("ziyaretler.musteriId", "kod unvan adSoyad whatsapp telefon").lean(),
            yonetici(req) ? Kullanici.find({ tenantId, rol: { $in: ["SALES", "SATIS"] }, aktif: true, silinmeTarihi: null }).select("adSoyad email telefon").sort({ adSoyad: 1 }).lean() : [],
            Musteri.find({ tenantId, aktif: { $ne: false }, ...(yonetici(req) ? {} : { $or: [{ temsilciId: kullaniciId }, { olusturanKullaniciId: kullaniciId }] }) }).select("kod unvan adSoyad telefon whatsapp email adres il ilce konum temsilciId bakiye notlar").sort({ unvan: 1, adSoyad: 1 }).lean(),
            Kasa.find({ tenantId, aktif: { $ne: false }, paraBirimi: { $in: ["TRY", null] }, sorumluKullaniciId: kullaniciId, sahaKasasi: true }).select("kod ad kasaTuru paraBirimi bakiye sahaKasasi sorumluKullaniciId").sort({ ad: 1 }).lean(),
            Kasa.find({ tenantId, aktif: { $ne: false }, paraBirimi: { $in: ["TRY", null] }, sahaKasasi: { $ne: true } }).select("kod ad kasaTuru paraBirimi").sort({ ad: 1 }).lean(),
            Banka.find({ tenantId, aktif: { $ne: false }, paraBirimi: { $in: ["TRY", null] } }).select("kod bankaAdi iban paraBirimi").sort({ bankaAdi: 1 }).lean()
        ]);
        if (sahaGun && !sahaGun.sahaKasaId) {
            await SahaGun.updateOne({ _id: sahaGun._id, tenantId, sahaKasaId: null }, { $set: { sahaKasaId: sahaKasasi._id } });
            sahaGun.sahaKasaId = sahaKasasi._id;
            if (!kasalar.some(x => String(x._id) === String(sahaKasasi._id))) kasalar.push({ _id: sahaKasasi._id, kod: sahaKasasi.kod, ad: sahaKasasi.ad, kasaTuru: sahaKasasi.kasaTuru, paraBirimi: sahaKasasi.paraBirimi, sahaKasasi: true, sorumluKullaniciId: sahaKasasi.sorumluKullaniciId });
        }
        const tesellum = await tesellumHesapla(req, kullaniciId, gun);
        res.set("Cache-Control", "private, no-store");
        res.json({ basarili: true, gun, sahaGun, tesellum, temsilciler, musteriler, kasalar, anaKasalar, bankalar, sahaKasa: { _id: sahaKasasi._id, kod: sahaKasasi.kod, ad: sahaKasasi.ad, bakiye: sahaKasasi.bakiye, paraBirimi: sahaKasasi.paraBirimi }, seciliKullaniciId: kullaniciId, kendiHesabi, yonetici: yonetici(req) });
    } catch (error) { next(error); }
}

async function musteriFinans(req, res, next) {
    try {
        const tenantId = tId(req), musteriId = String(req.params.id || "");
        if (!mongoose.Types.ObjectId.isValid(musteriId)) return res.status(400).json({ basarili: false, mesaj: "Geçerli müşteri zorunludur." });
        const musteri = await Musteri.findOne({ _id: musteriId, tenantId, aktif: { $ne: false }, ...musteriSahiplik(req) })
            .select("kod unvan adSoyad telefon whatsapp email adres il ilce konum bakiye notlar")
            .lean();
        if (!musteri) return res.status(404).json({ basarili: false, mesaj: "Müşteri bulunamadı veya bu müşteriye erişim yetkiniz yok." });
        const [cariHareketler, satislar, siparisler] = await Promise.all([
            CariHareket.find({ tenantId, tarafTipi: "MUSTERI", tarafId: musteri._id })
                .select("tip tutar aciklama kaynak belgeNo odemeYontemi bakiyeDegisimi oncekiBakiye sonrakiBakiye durum tarih kullaniciId")
                .populate("kullaniciId", "adSoyad email").sort({ tarih: -1, createdAt: -1 }).limit(100).lean(),
            Satis.find({ tenantId, musteriId: musteri._id }).select("belgeNo tarih genelToplam odenenTutar kalanTutar odemeTipi durum kullaniciId").sort({ tarih: -1 }).limit(50).lean(),
            Siparis.find({ tenantId, musteriId: musteri._id }).select("siparisNo tarih genelToplam durum paraBirimi kullaniciId").sort({ tarih: -1 }).limit(50).lean()
        ]);
        return res.json({ basarili: true, musteri, cariHareketler, satislar, siparisler });
    } catch (error) { next(error); }
}

async function gunBaslat(req, res, next) {
    try {
        const tenantId = tId(req), kullaniciId = aktorId(req), body = req.body || {}, gun = gunMetni(body.gun), km = pozitif(body.cikisKm, "Araç çıkış kilometresi", true);
        if (await SahaGun.exists({ tenantId, kullaniciId, gun })) return res.status(409).json({ basarili: false, mesaj: "Bu tarih için saha günü zaten açılmış." });
        const sahaKasasi = await sahaKasasiBulVeyaOlustur(tenantId, kullaniciId);
        const sahaGun = await SahaGun.create({ tenantId, kullaniciId, gun, durum: "AKTIF", sahaKasaId: sahaKasasi._id, aracPlaka: metin(body.aracPlaka, 20).toUpperCase(), cikisKm: km, baslangicTarihi: new Date(), baslangicKonumu: konum(body.konum), gunlukZiyaretHedefi: Math.round(pozitif(body.gunlukZiyaretHedefi ?? 10, "Ziyaret hedefi", true)), primOrani: pozitif(body.primOrani ?? 0, "Ciro prim oranı", true), satisBasiPrim: pozitif(body.satisBasiPrim ?? 0, "Satış başı prim", true), ciroHedefi: pozitif(body.ciroHedefi ?? 0, "Ciro hedefi", true) });
        res.locals.guvenlikOlayi = { kategori: "SAHA_GUN_BASLAT", seviye: "BILGI" };
        res.status(201).json({ basarili: true, mesaj: "Saha günü ve araç çıkışı başlatıldı.", sahaGun });
    } catch (error) { next(error); }
}

async function gunBitir(req, res, next) {
    try {
        const sahaGun = await gunBul(req, { tamamlanmisDahil: false });
        if (!sahaGun) return res.status(404).json({ basarili: false, mesaj: "Aktif saha günü bulunamadı." });
        if (sahaGun.ziyaretler.some(x => x.durum === "AKTIF") || sahaGun.molalar.some(x => !x.bitisTarihi)) return res.status(409).json({ basarili: false, mesaj: "Aktif ziyaret veya mola bitirilmeden gün kapatılamaz." });
        const donusKm = pozitif(req.body?.donusKm, "Araç dönüş kilometresi", true);
        if (donusKm < Number(sahaGun.cikisKm || 0)) return res.status(400).json({ basarili: false, mesaj: "Dönüş kilometresi çıkış kilometresinden küçük olamaz." });
        const rapor = await tesellumHesapla(req, sahaGun.kullaniciId, sahaGun.gun);
        sahaGun.donusKm = donusKm; sahaGun.toplamKm = donusKm - sahaGun.cikisKm; sahaGun.bitisTarihi = new Date(); sahaGun.bitisKonumu = konum(req.body?.konum); sahaGun.durum = "TAMAMLANDI";
        const hedefSaglandi = !sahaGun.ciroHedefi || rapor.netCiro >= sahaGun.ciroHedefi;
        sahaGun.hesaplananPrim = (hedefSaglandi ? rapor.netCiro * Number(sahaGun.primOrani || 0) / 100 : 0) + rapor.satisAdedi * Number(sahaGun.satisBasiPrim || 0);
        await sahaGun.save();
        res.locals.guvenlikOlayi = { kategori: "SAHA_GUN_BITIR", seviye: "BILGI" };
        res.json({ basarili: true, mesaj: "Gün sonu tamamlandı ve tesellüm raporu hesaplandı.", sahaGun, tesellum: rapor });
    } catch (error) { next(error); }
}

async function rotaGuncelle(req, res, next) {
    try {
        const sahaGun = await gunBul(req, { tamamlanmisDahil: false });
        if (!sahaGun) return res.status(404).json({ basarili: false, mesaj: "Aktif saha günü bulunamadı." });
        const rota = Array.isArray(req.body?.rota) ? req.body.rota : [];
        const ids = rota.map(x => String(x.musteriId || ""));
        if (ids.some(x => !mongoose.Types.ObjectId.isValid(x))) return res.status(400).json({ basarili: false, mesaj: "Rotada geçersiz müşteri var." });
        const sayi = await Musteri.countDocuments({ tenantId: tId(req), _id: { $in: ids }, aktif: { $ne: false }, ...musteriSahiplik(req, sahaGun.kullaniciId) });
        if (sayi !== new Set(ids).size) return res.status(404).json({ basarili: false, mesaj: "Rotadaki müşteri tenant içinde bulunamadı." });
        sahaGun.rota = rota.map((x, i) => ({ musteriId: x.musteriId, sira: i + 1, notlar: metin(x.notlar, 500) }));
        if (req.body.gunlukZiyaretHedefi !== undefined) sahaGun.gunlukZiyaretHedefi = Math.round(pozitif(req.body.gunlukZiyaretHedefi, "Ziyaret hedefi", true));
        await sahaGun.save(); res.json({ basarili: true, mesaj: "Günlük rota ve ziyaret hedefi kaydedildi.", sahaGun });
    } catch (error) { next(error); }
}

async function ziyaretBaslat(req, res, next) {
    try {
        const sahaGun = await gunBul(req, { tamamlanmisDahil: false });
        if (!sahaGun) return res.status(404).json({ basarili: false, mesaj: "Önce güne başlayın." });
        if (sahaGun.ziyaretler.some(x => x.durum === "AKTIF")) return res.status(409).json({ basarili: false, mesaj: "Önce aktif ziyareti bitirin." });
        const musteriId = String(req.body?.musteriId || "");
        const musteri = mongoose.Types.ObjectId.isValid(musteriId) && await Musteri.findOne({ _id: musteriId, tenantId: tId(req), aktif: { $ne: false }, ...musteriSahiplik(req, sahaGun.kullaniciId) });
        if (!musteri) return res.status(404).json({ basarili: false, mesaj: "Müşteri bulunamadı." });
        sahaGun.ziyaretler.push({ musteriId: musteri._id, baslangicTarihi: new Date(), baslangicKonumu: konum(req.body?.konum), durum: "AKTIF", notlar: metin(req.body?.notlar, 1500) });
        await sahaGun.save(); res.status(201).json({ basarili: true, mesaj: "Müşteri ziyareti GPS konumuyla başlatıldı.", ziyaret: sahaGun.ziyaretler.at(-1) });
    } catch (error) { next(error); }
}

async function ziyaretBitir(req, res, next) {
    try {
        const sahaGun = await gunBul(req, { tamamlanmisDahil: false });
        const ziyaret = sahaGun?.ziyaretler.id(req.params.id);
        if (!ziyaret || ziyaret.durum !== "AKTIF") return res.status(404).json({ basarili: false, mesaj: "Aktif ziyaret bulunamadı." });
        ziyaret.bitisTarihi = new Date(); ziyaret.bitisKonumu = konum(req.body?.konum); ziyaret.sureDakika = Math.max(0, Math.round((ziyaret.bitisTarihi - ziyaret.baslangicTarihi) / 60000)); ziyaret.durum = "TAMAMLANDI";
        const sonuc = String(req.body?.sonuc || "GORUSULDU").toUpperCase(); if (["GORUSULDU", "SATIS", "SIPARIS", "TAHSILAT", "ULASILAMADI", "DIGER"].includes(sonuc)) ziyaret.sonuc = sonuc;
        ziyaret.notlar = metin(req.body?.notlar ?? ziyaret.notlar, 1500); await sahaGun.save(); res.json({ basarili: true, mesaj: "Ziyaret tamamlandı; süre ve konum kaydedildi.", ziyaret });
    } catch (error) { next(error); }
}

async function molaBaslat(req, res, next) {
    try {
        const sahaGun = await gunBul(req, { tamamlanmisDahil: false });
        if (!sahaGun) return res.status(404).json({ basarili: false, mesaj: "Önce güne başlayın." });
        if (sahaGun.molalar.some(x => !x.bitisTarihi)) return res.status(409).json({ basarili: false, mesaj: "Aktif mola zaten var." });
        const tur = String(req.body?.tur || "DINLENME").toUpperCase();
        sahaGun.molalar.push({ tur: ["YEMEK", "DINLENME", "DIGER"].includes(tur) ? tur : "DIGER", baslangicTarihi: new Date(), konum: konum(req.body?.konum), notlar: metin(req.body?.notlar, 500) });
        await sahaGun.save(); res.status(201).json({ basarili: true, mesaj: "Mola başlatıldı.", mola: sahaGun.molalar.at(-1) });
    } catch (error) { next(error); }
}

async function molaBitir(req, res, next) {
    try {
        const sahaGun = await gunBul(req, { tamamlanmisDahil: false }); const mola = sahaGun?.molalar.id(req.params.id);
        if (!mola || mola.bitisTarihi) return res.status(404).json({ basarili: false, mesaj: "Aktif mola bulunamadı." });
        mola.bitisTarihi = new Date(); mola.sureDakika = Math.max(0, Math.round((mola.bitisTarihi - mola.baslangicTarihi) / 60000)); await sahaGun.save(); res.json({ basarili: true, mesaj: "Mola tamamlandı.", mola });
    } catch (error) { next(error); }
}

async function masrafOlustur(req, res, next) {
    const tenantId = tId(req), body = req.body || {}, tutar = pozitif(body.tutar, "Masraf tutarı"), kullaniciId = aktorId(req);
    let kasa, masraf, hareket;
    try {
        const sahaGun = await SahaGun.findOne({ tenantId, kullaniciId, gun: gunMetni(body.gun), durum: "AKTIF" });
        if (!sahaGun) return res.status(409).json({ basarili: false, mesaj: "Saha masrafı için aktif gün bulunmalıdır." });
        if (String(body.kasaId || "") !== String(sahaGun.sahaKasaId || "")) return res.status(403).json({ basarili: false, mesaj: "Saha masrafı yalnızca personelin saha kasasından ödenebilir." });
        kasa = await Kasa.findOneAndUpdate({ _id: body.kasaId, tenantId, aktif: { $ne: false }, paraBirimi: { $in: ["TRY", null] }, bakiye: { $gte: tutar } }, { $inc: { bakiye: -tutar } }, { new: true });
        if (!kasa) return res.status(409).json({ basarili: false, mesaj: "Kasa bulunamadı veya bakiyesi yetersiz." });
        const kategori = String(body.kategori || "DIGER").toUpperCase(); if (!["AKARYAKIT", "YEMEK", "DIGER"].includes(kategori)) return res.status(400).json({ basarili: false, mesaj: "Saha masrafı mazot, yemek veya diğer olmalıdır." });
        masraf = await Masraf.create({ tenantId, tarih: new Date(), kategori, aciklama: metin(body.aciklama, 300) || "Saha masrafı", firma: metin(body.firma, 160), fisNo: metin(body.fisNo, 80), fisGorseli: metin(body.fisGorseli, 2800000), notlar: metin(body.notlar, 1500), aracPlaka: sahaGun.aracPlaka, tutar, hesapTipi: "KASA", hesapId: kasa._id, paraBirimi: "TRY", odemeDurumu: "ODENDI", durum: "AKTIF", kaynak: "SAHA", kullaniciId });
        hareket = await ParaHareket.create({ tenantId, hesapTipi: "KASA", hesapId: kasa._id, tip: "CIKIS", tutar, paraBirimi: "TRY", aciklama: masraf.aciklama, kaynak: "SAHA_MASRAF", kaynakId: masraf._id, belgeNo: masraf.fisNo, tarih: masraf.tarih, kullaniciId });
        masraf.paraHareketId = hareket._id; await masraf.save(); res.status(201).json({ basarili: true, mesaj: "Saha masrafı kasa ve gider kayıtlarına işlendi.", masraf });
    } catch (error) {
        if (hareket?._id) await ParaHareket.deleteOne({ _id: hareket._id, tenantId }).catch(() => {});
        if (masraf?._id) await Masraf.deleteOne({ _id: masraf._id, tenantId }).catch(() => {});
        if (kasa?._id) await Kasa.updateOne({ _id: kasa._id, tenantId }, { $inc: { bakiye: tutar } }).catch(() => {});
        next(error);
    }
}

async function takip(req, res, next) {
    try {
        if (!yonetici(req)) return res.status(403).json({ basarili: false, mesaj: "Saha personeli takip ekranı yönetici yetkisi gerektirir." });
        const tenantId = tId(req), gun = gunMetni(req.query?.gun);
        const personeller = await Kullanici.find({ tenantId, rol: { $in: ["SALES", "SATIS"] }, aktif: true, silinmeTarihi: null }).select("adSoyad email telefon").sort({ adSoyad: 1 }).lean();
        const gunler = await SahaGun.find({ tenantId, gun, kullaniciId: { $in: personeller.map(x => x._id) } }).select("kullaniciId durum sahaKasaId kasaTeslimi baslangicTarihi bitisTarihi").populate("sahaKasaId", "kod ad bakiye").lean();
        const gunMap = new Map(gunler.map(x => [String(x.kullaniciId), x]));
        const satirlar = await Promise.all(personeller.map(async personel => {
            const sahaGun = gunMap.get(String(personel._id)) || null;
            const rapor = await tesellumHesapla(req, personel._id, gun);
            return { personel, sahaGun, ...rapor };
        }));
        const anaKasalar = await Kasa.find({ tenantId, aktif: { $ne: false }, sahaKasasi: { $ne: true }, paraBirimi: { $in: ["TRY", null] } }).select("kod ad bakiye paraBirimi").sort({ ad: 1 }).lean();
        return res.json({ basarili: true, gun, satirlar, anaKasalar });
    } catch (error) { next(error); }
}

async function teslimAl(req, res, next) {
    const tenantId = tId(req), body = req.body || {}, sahaGunId = String(req.params.id || ""), grupId = new mongoose.Types.ObjectId();
    let kaynak = null, hedef = null, teslimEdilen = 0, kaynakAzaldi = false, hedefArtti = false, sahiplenildi = false;
    try {
        const kendiTeslimi = req.sahaKasaKendiTeslimi === true;
        if (!kendiTeslimi && !yonetici(req)) return res.status(403).json({ basarili: false, mesaj: "Teslim alma işlemi yönetici yetkisi gerektirir." });
        if (!mongoose.Types.ObjectId.isValid(sahaGunId) || !mongoose.Types.ObjectId.isValid(String(body.hedefKasaId || ""))) return res.status(400).json({ basarili: false, mesaj: "Saha günü ve ana kasa geçerli olmalıdır." });
        teslimEdilen = pozitif(body.teslimEdilen, "Teslim edilen tutar", true);
        const sahaGun = await SahaGun.findOne({ _id: sahaGunId, tenantId });
        if (!sahaGun) return res.status(404).json({ basarili: false, mesaj: "Saha günü bulunamadı." });
        if (kendiTeslimi && String(sahaGun.kullaniciId) !== String(aktorId(req))) return res.status(403).json({ basarili: false, mesaj: "Yalnızca kendi saha kasanızı teslim edebilirsiniz." });
        if (kendiTeslimi && sahaGun.durum !== "TAMAMLANDI") return res.status(409).json({ basarili: false, mesaj: "Kasa tesliminden önce saha gününü bitirin." });
        if (sahaGun.kasaTeslimi?.teslimTarihi) return res.status(409).json({ basarili: false, mesaj: "Bu saha günü için kasa teslimi zaten yapılmış." });
        const kaynakKasaId = sahaGun.sahaKasaId || (await sahaKasasiBulVeyaOlustur(tenantId, sahaGun.kullaniciId))._id;
        [kaynak, hedef] = await Promise.all([
            Kasa.findOne({ _id: kaynakKasaId, tenantId, aktif: { $ne: false }, sahaKasasi: true, sorumluKullaniciId: sahaGun.kullaniciId }),
            Kasa.findOne({ _id: body.hedefKasaId, tenantId, aktif: { $ne: false }, sahaKasasi: { $ne: true }, paraBirimi: { $in: ["TRY", null] } })
        ]);
        if (!kaynak || !hedef || String(kaynak._id) === String(hedef._id)) return res.status(404).json({ basarili: false, mesaj: "Personel saha kasası veya ana kasa bulunamadı." });
        const rapor = await tesellumHesapla(req, sahaGun.kullaniciId, sahaGun.gun), teslimTarihi = new Date();
        const claim = await SahaGun.updateOne({ _id: sahaGun._id, tenantId, "kasaTeslimi.teslimTarihi": null }, { $set: { "kasaTeslimi.durum": "ISLENIYOR", "kasaTeslimi.teslimTarihi": teslimTarihi, "kasaTeslimi.transferGrupId": grupId, "kasaTeslimi.teslimEdenKullaniciId": sahaGun.kullaniciId, "kasaTeslimi.teslimAlanKullaniciId": aktorId(req) } });
        if (!claim.modifiedCount) return res.status(409).json({ basarili: false, mesaj: "Teslim alma işlemi başka bir istek tarafından tamamlandı." });
        sahiplenildi = true;
        if (teslimEdilen > 0) {
            const sonuc = await Kasa.updateOne({ _id: kaynak._id, tenantId, bakiye: { $gte: teslimEdilen } }, { $inc: { bakiye: -teslimEdilen } });
            if (!sonuc.modifiedCount) throw Object.assign(new Error("Personel saha kasası bakiyesi teslim için yetersiz."), { status: 409 });
            kaynakAzaldi = true;
            await Kasa.updateOne({ _id: hedef._id, tenantId }, { $inc: { bakiye: teslimEdilen } }); hedefArtti = true;
            await ParaHareket.create([
                { tenantId, hesapTipi: "KASA", hesapId: kaynak._id, tip: "CIKIS", tutar: teslimEdilen, paraBirimi: "TRY", aciklama: `Saha gün sonu teslimi ${sahaGun.gun}`, kaynak: "SAHA_KASA_TESLIM", kaynakId: sahaGun._id, karsiHesapTipi: "KASA", karsiHesapId: hedef._id, tarih: teslimTarihi, kullaniciId: aktorId(req), belgeNo: `ST-${sahaGun.gun}-${String(sahaGun._id).slice(-6).toUpperCase()}` },
                { tenantId, hesapTipi: "KASA", hesapId: hedef._id, tip: "GIRIS", tutar: teslimEdilen, paraBirimi: "TRY", aciklama: `Saha gün sonu teslimi ${sahaGun.gun}`, kaynak: "SAHA_KASA_TESLIM", kaynakId: sahaGun._id, karsiHesapTipi: "KASA", karsiHesapId: kaynak._id, tarih: teslimTarihi, kullaniciId: aktorId(req), belgeNo: `ST-${sahaGun.gun}-${String(sahaGun._id).slice(-6).toUpperCase()}` }
            ]);
        }
        const fark = teslimEdilen - rapor.teslimEdilmesiGereken, durum = Math.abs(fark) < 0.01 ? "TAM" : fark < 0 ? "EKSIK" : "FAZLA";
        await SahaGun.updateOne({ _id: sahaGun._id, tenantId, "kasaTeslimi.transferGrupId": grupId }, { $set: { sahaKasaId: kaynak._id, "kasaTeslimi.kaynakKasaId": kaynak._id, "kasaTeslimi.hedefKasaId": hedef._id, "kasaTeslimi.teslimEdilmesiGereken": rapor.teslimEdilmesiGereken, "kasaTeslimi.teslimEdilen": teslimEdilen, "kasaTeslimi.fark": fark, "kasaTeslimi.durum": durum } });
        await auditKaydet({ req, action: "SAHA_GUN_SONU_TESLIM_AL", resource: "SahaGun", resourceId: String(sahaGun._id), tenantId, category: "SAHA_KASA_TESLIM", severity: durum === "TAM" ? "BILGI" : "UYARI", details: { kimdenKullaniciId: String(sahaGun.kullaniciId), kimTarafindanKullaniciId: String(aktorId(req)), tarihSaat: teslimTarihi.toISOString(), tutar: teslimEdilen, teslimEdilmesiGereken: rapor.teslimEdilmesiGereken, fark, kaynakKasaId: String(kaynak._id), hedefKasaId: String(hedef._id) } });
        res.locals.guvenlikOlayi = { kategori: "SAHA_KASA_TESLIM", seviye: durum === "TAM" ? "BILGI" : "UYARI" };
        return res.json({ basarili: true, mesaj: "Teslim alınan tutar ana kasaya aktarıldı ve audit kaydı oluşturuldu.", kasaTeslimi: { teslimEdilmesiGereken: rapor.teslimEdilmesiGereken, teslimEdilen, fark, durum, teslimTarihi } });
    } catch (error) {
        if (hedefArtti) await Kasa.updateOne({ _id: hedef._id, tenantId }, { $inc: { bakiye: -teslimEdilen } }).catch(() => {});
        if (kaynakAzaldi) await Kasa.updateOne({ _id: kaynak._id, tenantId }, { $inc: { bakiye: teslimEdilen } }).catch(() => {});
        await ParaHareket.deleteMany({ tenantId, kaynak: "SAHA_KASA_TESLIM", kaynakId: sahaGunId }).catch(() => {});
        if (sahiplenildi) await SahaGun.updateOne({ _id: sahaGunId, tenantId, "kasaTeslimi.transferGrupId": grupId }, { $set: { kasaTeslimi: { durum: "BEKLIYOR", teslimTarihi: null } } }).catch(() => {});
        next(error);
    }
}

async function kasaTeslim(req, res, next) {
    try {
        const sahaGun = await gunBul(req);
        if (!sahaGun) {
            const tenantId = tId(req), kullaniciId = aktorId(req), body = req.body || {}, grupId = new mongoose.Types.ObjectId();
            if (!mongoose.Types.ObjectId.isValid(String(body.hedefKasaId || ""))) return res.status(400).json({ basarili: false, mesaj: "Ana kasa geçerli olmalıdır." });
            const kaynak = await sahaKasasiBulVeyaOlustur(tenantId, kullaniciId);
            const teslimEdilen = pozitif(body.teslimEdilen, "Teslim edilen tutar");
            const hedef = await Kasa.findOne({ _id: body.hedefKasaId, tenantId, aktif: { $ne: false }, sahaKasasi: { $ne: true }, paraBirimi: { $in: ["TRY", null] } });
            if (!hedef || String(kaynak._id) === String(hedef._id)) return res.status(404).json({ basarili: false, mesaj: "Saha kasası veya ana kasa bulunamadı." });
            const dusum = await Kasa.updateOne({ _id: kaynak._id, tenantId, bakiye: { $gte: teslimEdilen } }, { $inc: { bakiye: -teslimEdilen } });
            if (!dusum.modifiedCount) return res.status(409).json({ basarili: false, mesaj: "Saha kasası bakiyesi teslim tutarı için yetersiz veya işlem daha önce tamamlandı." });
            let hedefArtti = false;
            try {
                await Kasa.updateOne({ _id: hedef._id, tenantId }, { $inc: { bakiye: teslimEdilen } });
                hedefArtti = true;
                const tarih = new Date(), belgeNo = `ST-${gunMetni(body.gun)}-${String(grupId).slice(-6).toUpperCase()}`;
                await ParaHareket.create([
                    { tenantId, hesapTipi: "KASA", hesapId: kaynak._id, tip: "CIKIS", tutar: teslimEdilen, paraBirimi: "TRY", aciklama: `Saha kasa gün sonu teslimi ${gunMetni(body.gun)}`, kaynak: "SAHA_KASA_TESLIM", kaynakId: grupId, kaynakKanal: "SAHA", karsiHesapTipi: "KASA", karsiHesapId: hedef._id, tarih, kullaniciId, belgeNo },
                    { tenantId, hesapTipi: "KASA", hesapId: hedef._id, tip: "GIRIS", tutar: teslimEdilen, paraBirimi: "TRY", aciklama: `Saha kasa gün sonu teslimi ${gunMetni(body.gun)}`, kaynak: "SAHA_KASA_TESLIM", kaynakId: grupId, kaynakKanal: "SAHA", karsiHesapTipi: "KASA", karsiHesapId: kaynak._id, tarih, kullaniciId, belgeNo }
                ]);
                await auditKaydet({ req, action: "SAHA_KASA_GUN_SONU_TESLIM", resource: "Kasa", resourceId: String(kaynak._id), tenantId, category: "SAHA_KASA_TESLIM", severity: "BILGI", details: { gun: gunMetni(body.gun), tutar: teslimEdilen, kaynakKasaId: String(kaynak._id), hedefKasaId: String(hedef._id), transferGrupId: String(grupId) } });
                return res.json({ basarili: true, mesaj: "Saha kasası ana kasaya aktarıldı.", kasaTeslimi: { teslimEdilen, durum: "TAM", teslimTarihi: tarih } });
            } catch (error) {
                if (hedefArtti) await Kasa.updateOne({ _id: hedef._id, tenantId }, { $inc: { bakiye: -teslimEdilen } }).catch(() => {});
                await Kasa.updateOne({ _id: kaynak._id, tenantId }, { $inc: { bakiye: teslimEdilen } }).catch(() => {});
                await ParaHareket.deleteMany({ tenantId, kaynak: "SAHA_KASA_TESLIM", kaynakId: grupId }).catch(() => {});
                throw error;
            }
        }
        req.params.id = String(sahaGun._id);
        req.sahaKasaKendiTeslimi = true;
        return teslimAl(req, res, next);
    } catch (error) { next(error); }
}

async function tesellumPaylas(req, res, next) {
    try {
        const sahaGun = await gunBul(req); if (!sahaGun) return res.status(404).json({ basarili: false, mesaj: "Saha günü bulunamadı." });
        const rapor = await tesellumHesapla(req, sahaGun.kullaniciId, sahaGun.gun), tenant = await Tenant.findById(tId(req)).lean(), kullanici = await Kullanici.findById(sahaGun.kullaniciId).select("adSoyad email telefon").lean();
        const f = tenant?.firmaBilgileri || {}, token = crypto.randomBytes(32).toString("base64url");
        const paylasim = await BelgePaylasim.create({ tenantId: tId(req), tokenHash: hash(token), tur: "TESELLUM", baslik: `Tesellüm Raporu ${sahaGun.gun}`, firma: { unvan: f.unvan || tenant?.name || "İşletme", telefon: f.telefon || "", email: f.email || "", adres: f.adres || "" }, belge: { ...rapor, temsilci: kullanici, sahaGun: { gun: sahaGun.gun, aracPlaka: sahaGun.aracPlaka, cikisKm: sahaGun.cikisKm, donusKm: sahaGun.donusKm, toplamKm: sahaGun.toplamKm, ziyaretSayisi: sahaGun.ziyaretler.filter(x => x.durum === "TAMAMLANDI").length, hedef: sahaGun.gunlukZiyaretHedefi, prim: sahaGun.hesaplananPrim, kasaTeslimi: sahaGun.kasaTeslimi } }, sonGecerlilikTarihi: new Date(Date.now() + 30 * 86400000), kullaniciId: aktorId(req) });
        res.status(201).json({ basarili: true, mesaj: "Güvenli tesellüm bağlantısı oluşturuldu.", token, paylasimId: paylasim._id });
    } catch (error) { next(error); }
}

module.exports = { panel, takip, musteriFinans, gunBaslat, gunBitir, rotaGuncelle, ziyaretBaslat, ziyaretBitir, molaBaslat, molaBitir, masrafOlustur, teslimAl, kasaTeslim, tesellumPaylas, tesellumHesapla };
