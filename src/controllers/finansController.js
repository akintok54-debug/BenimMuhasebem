const mongoose = require("mongoose");

const Kasa = require("../models/Kasa");
const Banka = require("../models/Banka");
const ParaHareket = require("../models/ParaHareket");
const CariHareket = require("../models/CariHareket");
const CekSenetPortfoy = require("../models/CekSenetPortfoy");
const Musteri = require("../models/Musteri");
const Tedarikci = require("../models/Tedarikci");
const Satis = require("../models/Satis");
const Alis = require("../models/Alis");
const Masraf = require("../models/Masraf");
const PersonelFinansIslem = require("../models/PersonelFinansIslem");
const Personel = require("../models/Personel");
const { kaydet: auditKaydet } = require("../modules/platform/services/auditServisi");

function tenantId(req) { return new mongoose.Types.ObjectId(String(req.tenantId)); }
function metin(value) { return String(value ?? "").trim(); }
function paraBirimi(value) {
    const kod = metin(value || "TRY").toUpperCase();
    if (!["TRY", "USD", "EUR"].includes(kod)) throw Object.assign(new Error("Para birimi TRY, USD veya EUR olmalıdır."), { status: 400 });
    return kod;
}
function tutarDogrula(value) {
    const tutar = Number(value);
    if (!Number.isFinite(tutar) || tutar <= 0) throw Object.assign(new Error("Tutar sıfırdan büyük olmalıdır."), { status: 400 });
    return tutar;
}
function hesapModeli(tip) {
    if (tip === "KASA") return Kasa;
    if (tip === "BANKA") return Banka;
    throw Object.assign(new Error("Hesap tipi KASA veya BANKA olmalıdır."), { status: 400 });
}
function kullaniciId(req) { return req.currentUser?._id || req.kullanici?.kullaniciId || req.user?.kullaniciId || req.kullanici?._id || req.user?._id || null; }

function tarihAnahtari(value) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function hareketTuruBelirle(hareket) {
    const kaynak = String(hareket.kaynak || "MANUEL").toUpperCase();
    if (["TRANSFER", "SAHA_KASA_TESLIM"].includes(kaynak)) {
        if (hareket.hesapTipi === "KASA" && hareket.karsiHesapTipi === "BANKA") return hareket.tip === "CIKIS" ? "Kasa → Banka Transferi" : "Banka → Kasa Transferi";
        return "Kasalar Arası Transfer";
    }
    if (["TAHSILAT", "TEDARIKCI_TAHSILAT"].includes(kaynak)) return kaynak === "TAHSILAT" ? "Müşteri Tahsilatı" : "Diğer Para Girişi";
    if (["TAHSILAT_IPTAL", "MUSTERI_ODEME"].includes(kaynak)) return kaynak === "TAHSILAT_IPTAL" ? "Müşteri Tahsilatı İptali" : "Diğer Para Çıkışı";
    if (kaynak === "ODEME") return "Tedarikçi Ödemesi";
    if (["MASRAF", "SAHA_MASRAF"].includes(kaynak)) return "Masraf / Gider";
    if (kaynak === "MASRAF_IPTAL") return "Masraf / Gider İptali";
    if (kaynak === "SATIS") return "Satış Tahsilatı";
    if (kaynak === "ALIS_ODEME") return "Alış Ödemesi";
    if (kaynak === "PERSONEL") return "Personel Avans / Maaş Ödemesi";
    if (kaynak === "PERSONEL_IPTAL") return "Personel Ödemesi İptali";
    if (["ACILIS", "BAKIYE_DUZELTME", "DEVIR", "DUZELTME"].includes(kaynak)) return "Devir / Düzeltme";
    return hareket.tip === "GIRIS" ? "Diğer Para Girişi" : "Diğer Para Çıkışı";
}

function tarihSinirlari(query = {}) {
    const simdi = new Date();
    const varsayilanBaslangic = `${simdi.getFullYear()}-${String(simdi.getMonth() + 1).padStart(2, "0")}-01`;
    const varsayilanBitis = `${simdi.getFullYear()}-${String(simdi.getMonth() + 1).padStart(2, "0")}-${String(simdi.getDate()).padStart(2, "0")}`;
    const baslangicMetni = metin(query.baslangic || varsayilanBaslangic);
    const bitisMetni = metin(query.bitis || varsayilanBitis);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(baslangicMetni) || !/^\d{4}-\d{2}-\d{2}$/.test(bitisMetni)) {
        throw Object.assign(new Error("Tarih aralığı YYYY-AA-GG biçiminde olmalıdır."), { status: 400 });
    }
    const baslangic = new Date(`${baslangicMetni}T00:00:00+03:00`);
    const bitis = new Date(`${bitisMetni}T23:59:59.999+03:00`);
    if (Number.isNaN(baslangic.getTime()) || Number.isNaN(bitis.getTime()) || bitis < baslangic) {
        throw Object.assign(new Error("Geçerli bir tarih aralığı seçin."), { status: 400 });
    }
    return { baslangic, bitis, baslangicMetni, bitisMetni };
}

function ekstreOzetle(hareketler, devredenBakiye) {
    let yuruyenBakiye = Number(devredenBakiye || 0), toplamGiris = 0, toplamCikis = 0;
    const satirlar = hareketler.map(hareket => {
        const tutar = Number(hareket.tutar || 0);
        if (hareket.tip === "GIRIS") { toplamGiris += tutar; yuruyenBakiye += tutar; }
        else { toplamCikis += tutar; yuruyenBakiye -= tutar; }
        return { ...hareket, yuruyenBakiye };
    });
    return { satirlar, toplamGiris, toplamCikis, kapanisBakiyesi: yuruyenBakiye };
}

async function hareketleriZenginlestir(tId, hareketler) {
    const ids = [...new Set(hareketler.map(x => String(x.kaynakId || "")).filter(mongoose.Types.ObjectId.isValid))].map(x => new mongoose.Types.ObjectId(x));
    const karsiKasaIds = hareketler.filter(x => x.karsiHesapTipi === "KASA" && x.karsiHesapId).map(x => x.karsiHesapId);
    const karsiBankaIds = hareketler.filter(x => x.karsiHesapTipi === "BANKA" && x.karsiHesapId).map(x => x.karsiHesapId);
    const [cariler, satislar, alislar, masraflar, personelIslemleri, karsiKasalar, karsiBankalar] = await Promise.all([
        CariHareket.find({ _id: { $in: ids }, tenantId: tId }).select("tarafTipi tarafId belgeNo kaynak kaynakId").lean(),
        Satis.find({ _id: { $in: ids }, tenantId: tId }).select("musteriId belgeNo").lean(),
        Alis.find({ _id: { $in: ids }, tenantId: tId }).select("tedarikciId belgeNo").lean(),
        Masraf.find({ _id: { $in: ids }, tenantId: tId }).select("personelId firma fisNo kategori").lean(),
        PersonelFinansIslem.find({ _id: { $in: ids }, tenantId: tId }).select("personelId belgeNo tur").lean(),
        Kasa.find({ _id: { $in: karsiKasaIds }, tenantId: tId }).select("kod ad").lean(),
        Banka.find({ _id: { $in: karsiBankaIds }, tenantId: tId }).select("kod bankaAdi").lean()
    ]);
    const musteriIds = [...cariler.filter(x => x.tarafTipi === "MUSTERI").map(x => x.tarafId), ...satislar.map(x => x.musteriId)];
    const tedarikciIds = [...cariler.filter(x => x.tarafTipi === "TEDARIKCI").map(x => x.tarafId), ...alislar.map(x => x.tedarikciId)];
    const personelIds = [...masraflar.map(x => x.personelId).filter(Boolean), ...personelIslemleri.map(x => x.personelId).filter(Boolean)];
    const [musteriler, tedarikciler, personeller] = await Promise.all([
        Musteri.find({ _id: { $in: musteriIds }, tenantId: tId }).select("kod unvan adSoyad").lean(),
        Tedarikci.find({ _id: { $in: tedarikciIds }, tenantId: tId }).select("kod unvan adSoyad").lean(),
        Personel.find({ _id: { $in: personelIds }, tenantId: tId }).select("kod adSoyad").lean()
    ]);
    const map = rows => new Map(rows.map(x => [String(x._id), x]));
    const cariMap = map(cariler), satisMap = map(satislar), alisMap = map(alislar), masrafMap = map(masraflar), personelIslemMap = map(personelIslemleri), musteriMap = map(musteriler), tedarikciMap = map(tedarikciler), personelMap = map(personeller), kasaMap = map(karsiKasalar), bankaMap = map(karsiBankalar);
    return hareketler.map(h => {
        const kaynakId = String(h.kaynakId || ""), cari = cariMap.get(kaynakId), satis = satisMap.get(kaynakId), alis = alisMap.get(kaynakId), masraf = masrafMap.get(kaynakId), personelIslem = personelIslemMap.get(kaynakId);
        let ilgiliTip = "", ilgiliAd = "", ilgiliKod = "", belgeNo = h.belgeNo || "";
        if (cari) {
            const taraf = cari.tarafTipi === "MUSTERI" ? musteriMap.get(String(cari.tarafId)) : tedarikciMap.get(String(cari.tarafId));
            ilgiliTip = cari.tarafTipi; ilgiliAd = taraf?.unvan || taraf?.adSoyad || ""; ilgiliKod = taraf?.kod || ""; belgeNo ||= cari.belgeNo || "";
        } else if (satis) {
            const musteri = musteriMap.get(String(satis.musteriId)); ilgiliTip = "MUSTERI"; ilgiliAd = musteri?.unvan || musteri?.adSoyad || ""; ilgiliKod = musteri?.kod || ""; belgeNo ||= satis.belgeNo || "";
        } else if (alis) {
            const tedarikci = tedarikciMap.get(String(alis.tedarikciId)); ilgiliTip = "TEDARIKCI"; ilgiliAd = tedarikci?.unvan || tedarikci?.adSoyad || ""; ilgiliKod = tedarikci?.kod || ""; belgeNo ||= alis.belgeNo || "";
        } else if (personelIslem || masraf?.personelId) {
            const personel = personelMap.get(String(personelIslem?.personelId || masraf.personelId)); ilgiliTip = "PERSONEL"; ilgiliAd = personel?.adSoyad || masraf?.firma || ""; ilgiliKod = personel?.kod || ""; belgeNo ||= personelIslem?.belgeNo || masraf?.fisNo || "";
        } else if (masraf) {
            ilgiliTip = "GIDER"; ilgiliAd = masraf.firma || ""; belgeNo ||= masraf.fisNo || "";
        } else if (h.karsiHesapId) {
            const karsi = h.karsiHesapTipi === "KASA" ? kasaMap.get(String(h.karsiHesapId)) : bankaMap.get(String(h.karsiHesapId)); ilgiliTip = h.karsiHesapTipi || ""; ilgiliAd = karsi?.ad || karsi?.bankaAdi || ""; ilgiliKod = karsi?.kod || "";
        }
        const islemNo = belgeNo || h.transactionId || kaynakId || String(h._id || "");
        return { ...h, islemTuru: hareketTuruBelirle(h), ilgiliTip, ilgiliAd, ilgiliKod, belgeNo, islemNo };
    });
}

function donemSinirlari(query = {}) {
    const gun = /^\d{4}-\d{2}-\d{2}$/.test(String(query.tarih || "")) ? String(query.tarih) : tarihAnahtari(new Date());
    const donem = ["GUNLUK", "HAFTALIK", "AYLIK"].includes(String(query.donem || "").toUpperCase()) ? String(query.donem).toUpperCase() : "GUNLUK";
    const secili = new Date(`${gun}T12:00:00+03:00`);
    let baslangicGun = gun, bitisGun = gun;
    if (donem === "HAFTALIK") {
        const haftaninGunu = secili.getUTCDay() || 7, bas = new Date(secili.getTime() - (haftaninGunu - 1) * 86400000), son = new Date(bas.getTime() + 6 * 86400000);
        baslangicGun = tarihAnahtari(bas); bitisGun = tarihAnahtari(son);
    } else if (donem === "AYLIK") {
        baslangicGun = `${gun.slice(0, 7)}-01`; const sonrakiAy = new Date(`${baslangicGun}T12:00:00+03:00`); sonrakiAy.setUTCMonth(sonrakiAy.getUTCMonth() + 1); sonrakiAy.setUTCDate(0); bitisGun = tarihAnahtari(sonrakiAy);
    }
    return { donem, baslangicGun, bitisGun, baslangic: new Date(`${baslangicGun}T00:00:00+03:00`), bitis: new Date(`${bitisGun}T23:59:59.999+03:00`) };
}

async function kasaRaporVerisi(req, kasa, sinir) {
    const tId = tenantId(req), ortak = { tenantId: tId, hesapTipi: "KASA", hesapId: kasa._id };
    const [hamHareketler, baslangicSonrasi] = await Promise.all([
        ParaHareket.find({ ...ortak, tarih: { $gte: sinir.baslangic, $lte: sinir.bitis } }).populate("kullaniciId", "adSoyad email").sort({ tarih: 1, createdAt: 1 }).lean(),
        ParaHareket.aggregate([{ $match: { ...ortak, tarih: { $gte: sinir.baslangic } } }, { $group: { _id: "$tip", toplam: { $sum: "$tutar" } } }])
    ]);
    const sonNet = baslangicSonrasi.reduce((n, x) => n + (x._id === "GIRIS" ? 1 : -1) * Number(x.toplam || 0), 0), devredenBakiye = Number(kasa.bakiye || 0) - sonNet;
    const ekstre = ekstreOzetle(hamHareketler, devredenBakiye), hareketler = await hareketleriZenginlestir(tId, ekstre.satirlar);
    const gunMap = new Map(); let yuruyen = devredenBakiye;
    for (let cursor = new Date(sinir.baslangic); cursor <= sinir.bitis; cursor = new Date(cursor.getTime() + 86400000)) { const key = tarihAnahtari(cursor); gunMap.set(key, { gun: key, devredenBakiye: yuruyen, toplamGiris: 0, toplamCikis: 0, kapanisBakiyesi: yuruyen, hareketSayisi: 0 }); }
    for (const h of hareketler) { const key = tarihAnahtari(h.tarih), row = gunMap.get(key); if (!row) continue; row.hareketSayisi++; if (h.tip === "GIRIS") row.toplamGiris += Number(h.tutar || 0); else row.toplamCikis += Number(h.tutar || 0); }
    for (const row of gunMap.values()) { row.devredenBakiye = yuruyen; yuruyen += row.toplamGiris - row.toplamCikis; row.kapanisBakiyesi = yuruyen; }
    return { tarih: { baslangic: sinir.baslangicGun, bitis: sinir.bitisGun }, donem: sinir.donem, ozet: { devredenBakiye, toplamGiris: ekstre.toplamGiris, toplamCikis: ekstre.toplamCikis, kapanisBakiyesi: ekstre.kapanisBakiyesi, guncelBakiye: Number(kasa.bakiye || 0) }, gunler: [...gunMap.values()], hareketler };
}

async function acilisHareketi(req, hesapTipi, hesap) {
    const bakiye = Number(hesap.bakiye || 0);
    if (!bakiye) return;
    await ParaHareket.create({
        tenantId: tenantId(req), hesapTipi, hesapId: hesap._id,
        tip: bakiye > 0 ? "GIRIS" : "CIKIS", tutar: Math.abs(bakiye), paraBirimi: hesap.paraBirimi,
        aciklama: "Hesap açılış bakiyesi", kaynak: "ACILIS", belgeNo: `ACILIS-${hesap.kod}`,
        tarih: hesap.acilisTarihi || new Date(), kullaniciId: kullaniciId(req)
    });
}

async function kasaListele(req, res, next) {
    try { const kasalar = await Kasa.find({ tenantId: tenantId(req) }).sort({ aktif: -1, ad: 1 }).lean(); res.json({ basarili: true, toplam: kasalar.length, kasalar }); }
    catch (error) { next(error); }
}

async function kasaOlustur(req, res, next) {
    try {
        const body = req.body || {}, bakiye = Number(body.bakiye || 0);
        if (!metin(body.kod) || !metin(body.ad)) return res.status(400).json({ basarili: false, mesaj: "Kasa kodu ve kasa adı zorunludur." });
        if (!Number.isFinite(bakiye)) return res.status(400).json({ basarili: false, mesaj: "Açılış bakiyesi geçersizdir." });
        const kasaTuru = metin(body.kasaTuru || "NAKIT").toUpperCase();
        if (!["NAKIT", "DIGER"].includes(kasaTuru)) return res.status(400).json({ basarili: false, mesaj: "Kasa türü Nakit Kasa veya Diğer Kasa olmalıdır." });
        const acilisTarihi = body.acilisTarihi ? new Date(`${metin(body.acilisTarihi)}T12:00:00`) : new Date();
        if (Number.isNaN(acilisTarihi.getTime())) return res.status(400).json({ basarili: false, mesaj: "Açılış tarihi geçersizdir." });
        const kasa = await Kasa.create({ tenantId: tenantId(req), kod: metin(body.kod).toUpperCase(), ad: metin(body.ad), bakiye, acilisBakiyesi: bakiye, acilisTarihi, paraBirimi: paraBirimi(body.paraBirimi), kasaTuru, aktif: body.aktif !== false, sorumlu: metin(body.sorumlu), sube: metin(body.sube), aciklama: metin(body.aciklama) });
        await acilisHareketi(req, "KASA", kasa);
        res.status(201).json({ basarili: true, mesaj: "Kasa hesabı oluşturuldu.", kasa });
    } catch (error) { next(error); }
}

async function kasaEkstresi(req, res, next) {
    try {
        const tId = tenantId(req);
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ basarili: false, mesaj: "Geçersiz kasa hesabı." });
        const kasa = await Kasa.findOne({ _id: req.params.id, tenantId: tId }).lean();
        if (!kasa) return res.status(404).json({ basarili: false, mesaj: "Kasa hesabı bulunamadı." });
        const tarih = tarihSinirlari(req.query), rapor = await kasaRaporVerisi(req, kasa, { donem: "OZEL", baslangicGun: tarih.baslangicMetni, bitisGun: tarih.bitisMetni, baslangic: tarih.baslangic, bitis: tarih.bitis });
        res.json({ basarili: true, kasa, ...rapor, toplam: rapor.hareketler.length });
    } catch (error) { next(error); }
}

async function kasaRaporu(req, res, next) {
    try {
        const tId = tenantId(req);
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ basarili: false, mesaj: "Geçersiz kasa hesabı." });
        const kasa = await Kasa.findOne({ _id: req.params.id, tenantId: tId }).lean();
        if (!kasa) return res.status(404).json({ basarili: false, mesaj: "Kasa hesabı bulunamadı." });
        const rapor = await kasaRaporVerisi(req, kasa, donemSinirlari(req.query));
        res.json({ basarili: true, kasa, ...rapor, toplam: rapor.hareketler.length, disaAktarim: { excel: true, pdf: true, formatSurumu: 1 } });
    } catch (error) { next(error); }
}

async function bankaListele(req, res, next) {
    try { const bankalar = await Banka.find({ tenantId: tenantId(req) }).sort({ aktif: -1, bankaAdi: 1 }).lean(); res.json({ basarili: true, toplam: bankalar.length, bankalar }); }
    catch (error) { next(error); }
}

async function bankaOlustur(req, res, next) {
    try {
        const body = req.body || {}, bakiye = Number(body.bakiye || 0);
        if (!metin(body.kod) || !metin(body.bankaAdi)) return res.status(400).json({ basarili: false, mesaj: "Banka kodu ve banka adı zorunludur." });
        if (!Number.isFinite(bakiye)) return res.status(400).json({ basarili: false, mesaj: "Açılış bakiyesi geçersizdir." });
        const banka = await Banka.create({ tenantId: tenantId(req), kod: metin(body.kod).toUpperCase(), bankaAdi: metin(body.bankaAdi), sube: metin(body.sube), iban: metin(body.iban).replace(/\s+/g, "").toUpperCase(), hesapNo: metin(body.hesapNo), bakiye, paraBirimi: paraBirimi(body.paraBirimi), aktif: body.aktif !== false, aciklama: metin(body.aciklama) });
        await acilisHareketi(req, "BANKA", banka);
        res.status(201).json({ basarili: true, mesaj: "Banka hesabı oluşturuldu.", banka });
    } catch (error) { next(error); }
}

async function hesapGuncelle(req, res, next) {
    try {
        const tip = metin(req.params.tip).toUpperCase(), Model = hesapModeli(tip);
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ basarili: false, mesaj: "Geçersiz hesap." });
        const hesap = await Model.findOne({ _id: req.params.id, tenantId: tenantId(req) });
        if (!hesap) return res.status(404).json({ basarili: false, mesaj: "Hesap bulunamadı." });
        const body = req.body || {};
        if (body.kod !== undefined) hesap.kod = metin(body.kod).toUpperCase();
        if (tip === "KASA" && body.ad !== undefined) hesap.ad = metin(body.ad);
        if (tip === "KASA" && body.kasaTuru !== undefined) {
            const kasaTuru = metin(body.kasaTuru).toUpperCase();
            if (!["NAKIT", "DIGER"].includes(kasaTuru)) return res.status(400).json({ basarili: false, mesaj: "Geçersiz kasa türü." });
            hesap.kasaTuru = kasaTuru;
        }
        if (tip === "BANKA" && body.bankaAdi !== undefined) hesap.bankaAdi = metin(body.bankaAdi);
        for (const alan of ["sube", "hesapNo", "sorumlu", "aciklama"]) if (tip === "BANKA" || ["sube", "sorumlu", "aciklama"].includes(alan)) if (body[alan] !== undefined) hesap[alan] = metin(body[alan]);
        if (tip === "BANKA" && body.iban !== undefined) hesap.iban = metin(body.iban).replace(/\s+/g, "").toUpperCase();
        if (body.aktif !== undefined) hesap.aktif = body.aktif === true;
        if (body.paraBirimi !== undefined && Number(hesap.bakiye || 0) === 0) hesap.paraBirimi = paraBirimi(body.paraBirimi);
        if (!metin(hesap.kod) || !metin(tip === "KASA" ? hesap.ad : hesap.bankaAdi)) return res.status(400).json({ basarili: false, mesaj: "Hesap kodu ve adı zorunludur." });
        await hesap.save();
        res.json({ basarili: true, mesaj: "Hesap bilgileri güncellendi.", hesap });
    } catch (error) { next(error); }
}

async function paraHareketleri(req, res, next) {
    try {
        const filter = { tenantId: tenantId(req) };
        if (["KASA", "BANKA"].includes(req.query.hesapTipi)) filter.hesapTipi = req.query.hesapTipi;
        if (mongoose.Types.ObjectId.isValid(String(req.query.hesapId || ""))) filter.hesapId = req.query.hesapId;
        if (["GIRIS", "CIKIS"].includes(req.query.tip)) filter.tip = req.query.tip;
        if (req.query.kaynak) filter.kaynak = metin(req.query.kaynak);
        if (req.query.baslangic || req.query.bitis) {
            filter.tarih = {};
            if (req.query.baslangic) filter.tarih.$gte = new Date(`${req.query.baslangic}T00:00:00+03:00`);
            if (req.query.bitis) filter.tarih.$lte = new Date(`${req.query.bitis}T23:59:59.999+03:00`);
        }
        const limit = Math.min(500, Math.max(1, Number(req.query.limit || 200)));
        const [hareketler, toplam] = await Promise.all([
            ParaHareket.find(filter).populate("kullaniciId", "adSoyad email").sort({ tarih: -1, createdAt: -1 }).limit(limit).lean(),
            ParaHareket.countDocuments(filter)
        ]);
        res.json({ basarili: true, toplam, gosterilen: hareketler.length, hareketler: await hareketleriZenginlestir(tenantId(req), hareketler) });
    } catch (error) { next(error); }
}

async function hesapHareketi(req, res, next) {
    try {
        const tId = tenantId(req), body = req.body || {}, hesapTipi = metin(body.hesapTipi).toUpperCase(), tip = metin(body.tip).toUpperCase();
        const Model = hesapModeli(hesapTipi), tutar = tutarDogrula(body.tutar);
        if (!mongoose.Types.ObjectId.isValid(String(body.hesapId || ""))) return res.status(400).json({ basarili: false, mesaj: "Geçersiz hesap." });
        if (!["GIRIS", "CIKIS"].includes(tip)) return res.status(400).json({ basarili: false, mesaj: "İşlem türü para girişi veya para çıkışı olmalıdır." });
        const filter = { _id: body.hesapId, tenantId: tId, aktif: { $ne: false } };
        if (tip === "CIKIS") filter.bakiye = { $gte: tutar };
        const hesap = await Model.findOneAndUpdate(filter, { $inc: { bakiye: tip === "GIRIS" ? tutar : -tutar } }, { new: true });
        if (!hesap) return res.status(409).json({ basarili: false, mesaj: tip === "CIKIS" ? "Hesap bulunamadı, pasif veya bakiye yetersiz." : "Hesap bulunamadı veya pasif." });
        try {
            const hareket = await ParaHareket.create({ tenantId: tId, hesapTipi, hesapId: hesap._id, tip, tutar, paraBirimi: hesap.paraBirimi, aciklama: metin(body.aciklama) || (tip === "GIRIS" ? "Diğer para girişi" : "Diğer para çıkışı"), kaynak: "MANUEL", belgeNo: metin(body.belgeNo), tarih: body.tarih || new Date(), kullaniciId: kullaniciId(req) });
            res.status(201).json({ basarili: true, mesaj: "Para hareketi kaydedildi.", hesap, hareket });
        } catch (error) {
            await Model.updateOne({ _id: hesap._id, tenantId: tId }, { $inc: { bakiye: tip === "GIRIS" ? -tutar : tutar } });
            throw error;
        }
    } catch (error) { next(error); }
}

async function paraHareketDetay(req, res, next) {
    try {
        const hareket = await ParaHareket.findOne({ _id: req.params.id, tenantId: tenantId(req) }).populate("kullaniciId", "adSoyad email").populate("iptalEdenKullaniciId", "adSoyad email").lean();
        if (!hareket) return res.status(404).json({ basarili: false, mesaj: "Para hareketi bulunamadı." });
        return res.json({ basarili: true, hareket: (await hareketleriZenginlestir(tenantId(req), [hareket]))[0] });
    } catch (error) { next(error); }
}

async function manuelHareketIptal(req, res, next) {
    const session = await mongoose.startSession();
    let sonuc;
    try {
        await session.withTransaction(async () => {
            const tId = tenantId(req), hareket = await ParaHareket.findOneAndUpdate({ _id: req.params.id, tenantId: tId, kaynak: "MANUEL", durum: { $in: ["AKTIF", null] } }, { $set: { durum: "IPTAL_ISLENIYOR" } }, { new: true, session });
            if (!hareket) throw Object.assign(new Error("Aktif manuel para hareketi bulunamadı."), { status: 404 });
            const eski = hareket.toObject(), Model = hesapModeli(hareket.hesapTipi), tersTip = hareket.tip === "GIRIS" ? "CIKIS" : "GIRIS";
            const filter = { _id: hareket.hesapId, tenantId: tId, ...(tersTip === "CIKIS" ? { bakiye: { $gte: hareket.tutar } } : {}) };
            const hesap = await Model.findOneAndUpdate(filter, { $inc: { bakiye: tersTip === "GIRIS" ? hareket.tutar : -hareket.tutar } }, { new: true, session });
            if (!hesap) throw Object.assign(new Error("Hesap bakiyesi hareketi geri almaya yetmiyor veya hesap bulunamadı."), { status: 409 });
            const [tersHareket] = await ParaHareket.create([{ tenantId: tId, hesapTipi: hareket.hesapTipi, hesapId: hareket.hesapId, tip: tersTip, tutar: hareket.tutar, paraBirimi: hareket.paraBirimi || "TRY", aciklama: `Manuel hareket iptali: ${hareket.aciklama || hareket.belgeNo}`, kaynak: "MANUEL_IPTAL", kaynakId: hareket._id, orijinalHareketId: hareket._id, belgeNo: hareket.belgeNo || "", tarih: new Date(), kullaniciId: kullaniciId(req), islemAnahtari: `TX:${req.transactionId}:PARA:MANUEL_IPTAL:${hareket._id}` }], { session });
            hareket.durum = "IPTAL"; hareket.iptalTarihi = new Date(); hareket.iptalNedeni = metin(req.body?.neden) || "Manuel para hareketi iptal edildi"; hareket.iptalEdenKullaniciId = kullaniciId(req); hareket.tersHareketId = tersHareket._id; await hareket.save({ session });
            sonuc = { hareket, tersHareket, hesap, eski, yeni: hareket.toObject() };
        });
        await auditKaydet({ req, action: "MANUAL_MONEY_MOVEMENT_CANCELLED", resource: "ParaHareket", resourceId: String(req.params.id), tenantId: tenantId(req), category: "MUHASEBE_IPTAL", severity: "KRITIK", details: { islemId: String(req.params.id), transactionId: req.transactionId, eskiDeger: sonuc.eski, yeniDeger: sonuc.yeni } });
        return res.json({ basarili: true, mesaj: "Manuel para hareketi silinmeden ters kayıtla iptal edildi.", ...sonuc });
    } catch (error) { next(error); }
    finally { await session.endSession(); }
}

async function transfer(req, res, next) {
    try {
        const tId = tenantId(req), body = req.body || {}, tutar = tutarDogrula(body.tutar);
        const kaynakTip = metin(body.kaynakHesapTipi).toUpperCase(), hedefTip = metin(body.hedefHesapTipi).toUpperCase();
        const KaynakModel = hesapModeli(kaynakTip), HedefModel = hesapModeli(hedefTip);
        const kaynakId = metin(body.kaynakHesapId), hedefId = metin(body.hedefHesapId);
        if (!mongoose.Types.ObjectId.isValid(kaynakId) || !mongoose.Types.ObjectId.isValid(hedefId)) return res.status(400).json({ basarili: false, mesaj: "Kaynak ve hedef hesap geçerli olmalıdır." });
        if (kaynakTip === hedefTip && kaynakId === hedefId) return res.status(400).json({ basarili: false, mesaj: "Kaynak ve hedef hesap aynı olamaz." });
        const [kaynakKontrol, hedefKontrol] = await Promise.all([KaynakModel.findOne({ _id: kaynakId, tenantId: tId, aktif: { $ne: false } }), HedefModel.findOne({ _id: hedefId, tenantId: tId, aktif: { $ne: false } })]);
        if (!kaynakKontrol || !hedefKontrol) return res.status(404).json({ basarili: false, mesaj: "Kaynak veya hedef hesap bulunamadı ya da pasif." });
        const kaynakParaBirimi = kaynakKontrol.paraBirimi || "TRY", hedefParaBirimi = hedefKontrol.paraBirimi || "TRY";
        if (kaynakParaBirimi !== hedefParaBirimi) return res.status(409).json({ basarili: false, mesaj: "Farklı para birimindeki hesaplar arasında doğrudan transfer yapılamaz." });
        const kaynak = await KaynakModel.findOneAndUpdate({ _id: kaynakId, tenantId: tId, aktif: { $ne: false }, bakiye: { $gte: tutar } }, { $inc: { bakiye: -tutar } }, { new: true });
        if (!kaynak) return res.status(409).json({ basarili: false, mesaj: "Kaynak hesap bakiyesi yetersiz." });
        const hedef = await HedefModel.findOneAndUpdate({ _id: hedefId, tenantId: tId, aktif: { $ne: false } }, { $inc: { bakiye: tutar } }, { new: true });
        if (!hedef) { await KaynakModel.updateOne({ _id: kaynakId, tenantId: tId }, { $inc: { bakiye: tutar } }); return res.status(409).json({ basarili: false, mesaj: "Hedef hesap güncellenemedi." }); }
        const transferId = new mongoose.Types.ObjectId(), ortak = { tenantId: tId, transactionId: req.transactionId, tutar, paraBirimi: kaynak.paraBirimi || "TRY", kaynak: "TRANSFER", kaynakId: transferId, belgeNo: metin(body.belgeNo) || `TRF-${Date.now()}`, aciklama: metin(body.aciklama) || "Hesaplar arası transfer", tarih: body.tarih || new Date(), kullaniciId: kullaniciId(req) };
        try {
            const hareketler = await ParaHareket.insertMany([
                { ...ortak, hesapTipi: kaynakTip, hesapId: kaynak._id, tip: "CIKIS", islemAnahtari: `TX:${req.transactionId}:PARA:${kaynakTip}:${kaynak._id}:CIKIS:TRANSFER`, karsiHesapTipi: hedefTip, karsiHesapId: hedef._id },
                { ...ortak, hesapTipi: hedefTip, hesapId: hedef._id, tip: "GIRIS", islemAnahtari: `TX:${req.transactionId}:PARA:${hedefTip}:${hedef._id}:GIRIS:TRANSFER`, karsiHesapTipi: kaynakTip, karsiHesapId: kaynak._id }
            ]);
            res.status(201).json({ basarili: true, mesaj: "Hesaplar arası transfer tamamlandı.", kaynak, hedef, hareketler });
        } catch (error) {
            await Promise.all([KaynakModel.updateOne({ _id: kaynakId, tenantId: tId }, { $inc: { bakiye: tutar } }), HedefModel.updateOne({ _id: hedefId, tenantId: tId }, { $inc: { bakiye: -tutar } })]);
            throw error;
        }
    } catch (error) { next(error); }
}

function paraToplamlari(hesaplar) {
    return hesaplar.reduce((sonuc, hesap) => { const kod = hesap.paraBirimi || "TRY"; sonuc[kod] = (sonuc[kod] || 0) + Number(hesap.bakiye || 0); return sonuc; }, { TRY: 0, USD: 0, EUR: 0 });
}
function akisToplamlari(rows) {
    const sonuc = { TRY: { giris: 0, cikis: 0 }, USD: { giris: 0, cikis: 0 }, EUR: { giris: 0, cikis: 0 } };
    for (const row of rows) { const kod = row._id.paraBirimi || "TRY", alan = row._id.tip === "GIRIS" ? "giris" : "cikis"; sonuc[kod][alan] += Number(row.toplam || 0); }
    return sonuc;
}

async function ozet(req, res, next) {
    try {
        const tId = tenantId(req), simdi = new Date(), bugun = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate()), ay = new Date(simdi.getFullYear(), simdi.getMonth(), 1);
        const [kasalar, bankalar, sonHareketler, bugunAkis, ayAkis] = await Promise.all([
            Kasa.find({ tenantId: tId }).sort({ aktif: -1, ad: 1 }).lean(),
            Banka.find({ tenantId: tId }).sort({ aktif: -1, bankaAdi: 1 }).lean(),
            ParaHareket.find({ tenantId: tId }).populate("kullaniciId", "adSoyad email").sort({ tarih: -1, createdAt: -1 }).limit(100).lean(),
            ParaHareket.aggregate([{ $match: { tenantId: tId, tarih: { $gte: bugun }, kaynak: { $ne: "TRANSFER" } } }, { $group: { _id: { paraBirimi: "$paraBirimi", tip: "$tip" }, toplam: { $sum: "$tutar" } } }]),
            ParaHareket.aggregate([{ $match: { tenantId: tId, tarih: { $gte: ay }, kaynak: { $ne: "TRANSFER" } } }, { $group: { _id: { paraBirimi: "$paraBirimi", tip: "$tip" }, toplam: { $sum: "$tutar" } } }])
        ]);
        const aktifKasalar = kasalar.filter(x => x.aktif !== false), aktifBankalar = bankalar.filter(x => x.aktif !== false), nakitKasalar = aktifKasalar.filter(x => (x.kasaTuru || "NAKIT") === "NAKIT"), digerKasalar = aktifKasalar.filter(x => x.kasaTuru === "DIGER"), kasaToplamlari = paraToplamlari(aktifKasalar), bankaToplamlari = paraToplamlari(aktifBankalar);
        res.json({ basarili: true, kasaToplam: kasaToplamlari.TRY, bankaToplam: bankaToplamlari.TRY, toplamNakit: kasaToplamlari.TRY + bankaToplamlari.TRY, toplamlar: { kasa: kasaToplamlari, nakitKasa: paraToplamlari(nakitKasalar), digerKasa: paraToplamlari(digerKasalar), banka: bankaToplamlari, genel: { TRY: kasaToplamlari.TRY + bankaToplamlari.TRY, USD: kasaToplamlari.USD + bankaToplamlari.USD, EUR: kasaToplamlari.EUR + bankaToplamlari.EUR } }, nakitAkisi: { bugun: akisToplamlari(bugunAkis), ay: akisToplamlari(ayAkis) }, kasalar, bankalar, sonHareketler });
    } catch (error) { next(error); }
}

async function cekSenetPortfoyu(req, res, next) {
    try {
        const tId = tenantId(req), filter = { tenantId: tId };
        if (["CEK", "SENET"].includes(String(req.query.tur || "").toUpperCase())) filter.tur = String(req.query.tur).toUpperCase();
        if (req.query.durum) filter.durum = String(req.query.durum).toUpperCase();
        const evraklar = await CekSenetPortfoy.find(filter).populate("musteriId", "kod unvan adSoyad").populate("kullaniciId", "adSoyad email").sort({ vadeTarihi: 1, createdAt: -1 }).lean();
        const toplamlar = evraklar.filter(x => x.durum !== "IPTAL").reduce((o, x) => { const isaret = x.hareketTipi === "IADE" ? -1 : 1; o[x.tur] = (o[x.tur] || 0) + isaret * Number(x.tutar || 0); return o; }, { CEK: 0, SENET: 0 });
        res.json({ basarili: true, toplam: evraklar.length, toplamlar, evraklar });
    } catch (error) { next(error); }
}

module.exports = { kasaListele, kasaOlustur, kasaEkstresi, kasaRaporu, bankaListele, bankaOlustur, hesapGuncelle, paraHareketleri, paraHareketDetay, hesapHareketi, manuelHareketIptal, transfer, ozet, cekSenetPortfoyu, ekstreOzetle, hareketTuruBelirle, donemSinirlari };
