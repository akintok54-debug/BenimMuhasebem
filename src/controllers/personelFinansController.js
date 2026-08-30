const mongoose = require("mongoose");
const Personel = require("../models/Personel");
const PersonelFinansIslem = require("../models/PersonelFinansIslem");
const Kasa = require("../models/Kasa");
const Banka = require("../models/Banka");
const ParaHareket = require("../models/ParaHareket");
const Masraf = require("../models/Masraf");

const NAKIT_CIKIS = ["MAAS_ODEME", "PRIM_ODEME", "AVANS_ODEME"];
const NAKIT_GIRIS = ["AVANS_TAHSILAT"];
const MASRAF_OLUSTURAN = ["MAAS_ODEME", "PRIM_ODEME"];
const TURLER = PersonelFinansIslem.schema.path("tur").enumValues;
const ETIKET = {
    MAAS_TAHAKKUK: "Maaş tahakkuku", PRIM_TAHAKKUK: "Prim tahakkuku", MAAS_ODEME: "Maaş ödemesi",
    PRIM_ODEME: "Prim ödemesi", AVANS_ODEME: "Avans ödemesi", AVANS_TAHSILAT: "Avans geri ödemesi", AVANS_MAHSUP: "Avans mahsubu", KESINTI: "Bordro kesintisi"
};

const tenantId = req => new mongoose.Types.ObjectId(String(req.tenantId));
const kullaniciId = req => req.kullanici?.kullaniciId || req.kullanici?._id || req.user?.kullaniciId || req.user?._id || null;
const metin = (value, max = 500) => String(value ?? "").trim().slice(0, max);
const hesapModeli = tip => tip === "KASA" ? Kasa : tip === "BANKA" ? Banka : null;

function tutarDogrula(value) {
    const tutar = Number(value);
    if (!Number.isFinite(tutar) || tutar <= 0) throw Object.assign(new Error("Tutar sıfırdan büyük olmalıdır."), { status: 400 });
    return Math.round(tutar * 100) / 100;
}

function tarihDogrula(value) {
    const tarih = value ? new Date(value) : new Date();
    if (Number.isNaN(tarih.getTime())) throw Object.assign(new Error("Geçerli bir işlem tarihi girin."), { status: 400 });
    return tarih;
}

function donemDogrula(value, tarih) {
    const donem = metin(value, 7) || `${tarih.getFullYear()}-${String(tarih.getMonth() + 1).padStart(2, "0")}`;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(donem)) throw Object.assign(new Error("Dönem YYYY-AA biçiminde olmalıdır."), { status: 400 });
    return donem;
}

function bosOzet() {
    return { maasTahakkuk: 0, primTahakkuk: 0, maasOdeme: 0, primOdeme: 0, kesinti: 0, avansOdeme: 0, avansTahsilat: 0, avansMahsup: 0, kalanMaas: 0, kalanPrim: 0, kalanHakEdis: 0, acikAvans: 0, netDurum: 0 };
}

function ozetHesapla(islemler, paraBirimi) {
    const ozet = bosOzet();
    for (const x of islemler.filter(x => x.durum !== "IPTAL" && (x.paraBirimi || "TRY") === paraBirimi)) {
        const tutar = Number(x.tutar || 0);
        if (x.tur === "MAAS_TAHAKKUK") ozet.maasTahakkuk += tutar;
        if (x.tur === "PRIM_TAHAKKUK") ozet.primTahakkuk += tutar;
        if (x.tur === "MAAS_ODEME") ozet.maasOdeme += tutar;
        if (x.tur === "PRIM_ODEME") ozet.primOdeme += tutar;
        if (x.tur === "KESINTI") ozet.kesinti += tutar;
        if (x.tur === "AVANS_ODEME") ozet.avansOdeme += tutar;
        if (x.tur === "AVANS_TAHSILAT") ozet.avansTahsilat += tutar;
        if (x.tur === "AVANS_MAHSUP") ozet.avansMahsup += tutar;
    }
    ozet.kalanMaas = Math.max(0, ozet.maasTahakkuk - ozet.maasOdeme);
    ozet.kalanPrim = Math.max(0, ozet.primTahakkuk - ozet.primOdeme);
    ozet.kalanHakEdis = Math.max(0, ozet.kalanMaas + ozet.kalanPrim - ozet.kesinti - ozet.avansMahsup);
    ozet.acikAvans = Math.max(0, ozet.avansOdeme - ozet.avansTahsilat - ozet.avansMahsup);
    ozet.netDurum = ozet.kalanHakEdis - ozet.acikAvans;
    return ozet;
}

async function personelBul(tId, id) {
    if (!mongoose.Types.ObjectId.isValid(String(id || ""))) return null;
    return Personel.findOne({ _id: id, tenantId: tId });
}

async function finansDetay(req, res, next) {
    try {
        const tId = tenantId(req), personel = await personelBul(tId, req.params.id);
        if (!personel) return res.status(404).json({ basarili: false, mesaj: "Personel bulunamadı." });
        const [islemler, kasalar, bankalar] = await Promise.all([
            PersonelFinansIslem.find({ tenantId: tId, personelId: personel._id }).populate("olusturanKullaniciId", "adSoyad email").populate("iptalEdenKullaniciId", "adSoyad email").sort({ tarih: -1, createdAt: -1 }).limit(500).lean(),
            Kasa.find({ tenantId: tId, aktif: { $ne: false } }).sort({ ad: 1 }).lean(),
            Banka.find({ tenantId: tId, aktif: { $ne: false } }).sort({ bankaAdi: 1 }).lean()
        ]);
        const paraBirimleri = [...new Set([personel.maasParaBirimi || "TRY", ...islemler.map(x => x.paraBirimi || "TRY")])];
        const ozetler = Object.fromEntries(paraBirimleri.map(kod => [kod, ozetHesapla(islemler, kod)]));
        const hesaplar = [...kasalar.map(x => ({ ...x, tip: "KASA", adGoster: x.ad })), ...bankalar.map(x => ({ ...x, tip: "BANKA", adGoster: x.bankaAdi }))];
        res.json({ basarili: true, personel, islemler, ozetler, hesaplar });
    } catch (error) { next(error); }
}

async function islemOlustur(req, res, next) {
    const tId = tenantId(req), body = req.body || {}, tur = metin(body.tur, 30).toUpperCase();
    let hesap = null, finansIslem = null, paraHareket = null, masraf = null, Model = null, hesapYon = 0, islemTutari = 0;
    try {
        if (!TURLER.includes(tur)) return res.status(400).json({ basarili: false, mesaj: "Geçersiz personel finans işlemi." });
        const personel = await personelBul(tId, req.params.id);
        if (!personel) return res.status(404).json({ basarili: false, mesaj: "Personel bulunamadı." });
        const tutar = tutarDogrula(body.tutar), tarih = tarihDogrula(body.tarih), donem = donemDogrula(body.donem, tarih);
        islemTutari = tutar;
        const paraBirimi = metin(body.paraBirimi || personel.maasParaBirimi || "TRY", 3).toUpperCase();
        if (!["TRY", "USD", "EUR"].includes(paraBirimi)) return res.status(400).json({ basarili: false, mesaj: "Geçersiz para birimi." });

        const mevcutlar = await PersonelFinansIslem.find({ tenantId: tId, personelId: personel._id, durum: "AKTIF", paraBirimi }).lean();
        const ozet = ozetHesapla(mevcutlar, paraBirimi);
        if (tur === "MAAS_ODEME" && tutar > ozet.kalanMaas) return res.status(409).json({ basarili: false, mesaj: `Ödeme kalan maaş tahakkukunu aşıyor (${ozet.kalanMaas.toFixed(2)} ${paraBirimi}).` });
        if (tur === "PRIM_ODEME" && tutar > ozet.kalanPrim) return res.status(409).json({ basarili: false, mesaj: `Ödeme kalan prim tahakkukunu aşıyor (${ozet.kalanPrim.toFixed(2)} ${paraBirimi}).` });
        if (["MAAS_ODEME", "PRIM_ODEME"].includes(tur) && tutar > ozet.kalanHakEdis) return res.status(409).json({ basarili: false, mesaj: `Ödeme kesintiler sonrası kalan hak edişi aşıyor (${ozet.kalanHakEdis.toFixed(2)} ${paraBirimi}).` });
        if (tur === "AVANS_TAHSILAT" && tutar > ozet.acikAvans) return res.status(409).json({ basarili: false, mesaj: `Tahsilat açık avansı aşıyor (${ozet.acikAvans.toFixed(2)} ${paraBirimi}).` });
        if (tur === "AVANS_MAHSUP" && (tutar > ozet.acikAvans || tutar > ozet.kalanHakEdis)) return res.status(409).json({ basarili: false, mesaj: `Mahsup tutarı açık avans ve kalan hak edişten büyük olamaz.` });
        if (tur === "KESINTI" && tutar > ozet.kalanHakEdis) return res.status(409).json({ basarili: false, mesaj: `Kesinti kalan hak edişi aşıyor (${ozet.kalanHakEdis.toFixed(2)} ${paraBirimi}).` });

        const nakit = NAKIT_CIKIS.includes(tur) || NAKIT_GIRIS.includes(tur);
        const hesapTipi = nakit ? metin(body.hesapTipi, 10).toUpperCase() : null;
        if (nakit) {
            Model = hesapModeli(hesapTipi);
            if (!Model || !mongoose.Types.ObjectId.isValid(String(body.hesapId || ""))) return res.status(400).json({ basarili: false, mesaj: "Geçerli bir kasa veya banka hesabı seçin." });
            hesapYon = NAKIT_CIKIS.includes(tur) ? -1 : 1;
            const filter = { _id: body.hesapId, tenantId: tId, aktif: { $ne: false }, paraBirimi };
            if (hesapYon < 0) filter.bakiye = { $gte: tutar };
            hesap = await Model.findOneAndUpdate(filter, { $inc: { bakiye: hesapYon * tutar } }, { new: true });
            if (!hesap) return res.status(409).json({ basarili: false, mesaj: "Hesap bulunamadı, para birimi uyuşmuyor veya bakiye yetersiz." });
        }

        const belgeNo = metin(body.belgeNo, 80) || `PER-${donem.replace("-", "")}-${Date.now().toString().slice(-6)}`;
        const aciklama = metin(body.aciklama, 500) || `${personel.adSoyad} · ${ETIKET[tur]} · ${donem}`;
        finansIslem = await PersonelFinansIslem.create({ tenantId: tId, personelId: personel._id, tur, tarih, donem, tutar, paraBirimi, aciklama, belgeNo, hesapTipi, hesapId: hesap?._id || null, olusturanKullaniciId: kullaniciId(req) });
        if (nakit) {
            paraHareket = await ParaHareket.create({ tenantId: tId, hesapTipi, hesapId: hesap._id, tip: hesapYon < 0 ? "CIKIS" : "GIRIS", tutar, paraBirimi, aciklama, kaynak: "PERSONEL", kaynakId: finansIslem._id, belgeNo, tarih, kullaniciId: kullaniciId(req) });
            finansIslem.paraHareketId = paraHareket._id;
        }
        if (MASRAF_OLUSTURAN.includes(tur)) {
            masraf = await Masraf.create({ tenantId: tId, tarih, kategori: "PERSONEL", aciklama, firma: personel.adSoyad, fisNo: belgeNo, notlar: `Otomatik personel masrafı · ${donem}`, tutar, kdvOrani: 0, kdvTutari: 0, hesapTipi, hesapId: hesap._id, paraBirimi, odemeDurumu: "ODENDI", durum: "AKTIF", kaynak: "PERSONEL", kullaniciId: kullaniciId(req), paraHareketId: paraHareket._id, personelId: personel._id, personelFinansIslemId: finansIslem._id });
            finansIslem.masrafId = masraf._id;
        }
        await finansIslem.save();
        res.status(201).json({ basarili: true, mesaj: `${ETIKET[tur]} kaydedildi.`, islem: finansIslem, hesap, paraHareket, masraf });
    } catch (error) {
        if (masraf?._id) await Masraf.deleteOne({ _id: masraf._id, tenantId: tId }).catch(() => {});
        if (paraHareket?._id) await ParaHareket.deleteOne({ _id: paraHareket._id, tenantId: tId }).catch(() => {});
        if (finansIslem?._id) await PersonelFinansIslem.deleteOne({ _id: finansIslem._id, tenantId: tId }).catch(() => {});
        if (hesap?._id && Model && hesapYon && islemTutari) await Model.updateOne({ _id: hesap._id, tenantId: tId }, { $inc: { bakiye: -hesapYon * islemTutari } }).catch(() => {});
        next(error);
    }
}

async function topluMaasTahakkuku(req, res, next) {
    try {
        const tId = tenantId(req), tarih = tarihDogrula(req.body?.tarih), donem = donemDogrula(req.body?.donem, tarih);
        const personeller = await Personel.find({ tenantId: tId, aktif: true, calismaDurumu: { $ne: "AYRILDI" }, maas: { $gt: 0 } }).lean();
        const islemler = personeller.map(x => ({ updateOne: { filter: { tenantId: tId, personelId: x._id, tur: "MAAS_TAHAKKUK", donem, durum: "AKTIF" }, update: { $setOnInsert: { tarih, tutar: x.maas, paraBirimi: x.maasParaBirimi || "TRY", aciklama: `${x.adSoyad} · Maaş tahakkuku · ${donem}`, belgeNo: `MAAS-${donem.replace("-", "")}-${x.kod}`, olusturanKullaniciId: kullaniciId(req) } }, upsert: true } }));
        const sonuc = islemler.length ? await PersonelFinansIslem.bulkWrite(islemler, { ordered: false }) : { upsertedCount: 0, matchedCount: 0 };
        res.status(201).json({ basarili: true, mesaj: `${sonuc.upsertedCount} personel için ${donem} maaş tahakkuku oluşturuldu.`, olusturulan: sonuc.upsertedCount, atlanan: sonuc.matchedCount, donem });
    } catch (error) { next(error); }
}

async function iptalEt(req, res, next) {
    const tId = tenantId(req), neden = metin(req.body?.neden, 500) || "Personel finans işlemi iptal edildi";
    let hesap = null, tersHareket = null, Model = null, tersYon = 0, masrafGuncellendi = false, iptalIslem = null;
    try {
        const islem = await PersonelFinansIslem.findOne({ _id: req.params.islemId, tenantId: tId, personelId: req.params.id, durum: "AKTIF" });
        iptalIslem = islem;
        if (!islem) return res.status(404).json({ basarili: false, mesaj: "Aktif personel finans işlemi bulunamadı." });
        const islemler = await PersonelFinansIslem.find({ tenantId: tId, personelId: islem.personelId, durum: "AKTIF", paraBirimi: islem.paraBirimi }).lean();
        const kalan = ozetHesapla(islemler.filter(x => String(x._id) !== String(islem._id)), islem.paraBirimi);
        if (islem.tur === "MAAS_TAHAKKUK" && kalan.maasTahakkuk < kalan.maasOdeme) return res.status(409).json({ basarili: false, mesaj: "Bu tahakkuka bağlı ödemeler bulunduğu için önce ödemeleri iptal edin." });
        if (islem.tur === "PRIM_TAHAKKUK" && kalan.primTahakkuk < kalan.primOdeme) return res.status(409).json({ basarili: false, mesaj: "Bu prime bağlı ödemeler bulunduğu için önce ödemeleri iptal edin." });
        if (["MAAS_TAHAKKUK", "PRIM_TAHAKKUK"].includes(islem.tur) && kalan.maasTahakkuk + kalan.primTahakkuk < kalan.maasOdeme + kalan.primOdeme + kalan.kesinti + kalan.avansMahsup) return res.status(409).json({ basarili: false, mesaj: "Bu tahakkuka bağlı ödeme, kesinti veya avans mahsubu bulunduğu için önce bağlı işlemleri iptal edin." });
        if (islem.tur === "AVANS_ODEME" && kalan.avansOdeme < kalan.avansTahsilat + kalan.avansMahsup) return res.status(409).json({ basarili: false, mesaj: "Bu avansa bağlı tahsilat veya mahsup bulunduğu için önce bağlı işlemleri iptal edin." });

        const nakit = NAKIT_CIKIS.includes(islem.tur) || NAKIT_GIRIS.includes(islem.tur);
        if (nakit) {
            Model = hesapModeli(islem.hesapTipi); tersYon = NAKIT_CIKIS.includes(islem.tur) ? 1 : -1;
            const filter = { _id: islem.hesapId, tenantId: tId };
            if (tersYon < 0) filter.bakiye = { $gte: islem.tutar };
            hesap = await Model.findOneAndUpdate(filter, { $inc: { bakiye: tersYon * islem.tutar } }, { new: true });
            if (!hesap) return res.status(409).json({ basarili: false, mesaj: "İptal için bağlı hesap bulunamadı veya hesap bakiyesi yetersiz." });
            tersHareket = await ParaHareket.create({ tenantId: tId, hesapTipi: islem.hesapTipi, hesapId: islem.hesapId, tip: tersYon > 0 ? "GIRIS" : "CIKIS", tutar: islem.tutar, paraBirimi: islem.paraBirimi, aciklama: `İptal: ${islem.aciklama}`, kaynak: "PERSONEL_IPTAL", kaynakId: islem._id, belgeNo: islem.belgeNo, tarih: new Date(), kullaniciId: kullaniciId(req) });
        }
        if (islem.masrafId) {
            await Masraf.updateOne({ _id: islem.masrafId, tenantId: tId, durum: "AKTIF" }, { $set: { durum: "IPTAL", iptalTarihi: new Date(), iptalNedeni: neden, iptalEdenKullaniciId: kullaniciId(req), iptalParaHareketId: tersHareket?._id || null } });
            masrafGuncellendi = true;
        }
        islem.durum = "IPTAL"; islem.iptalTarihi = new Date(); islem.iptalNedeni = neden; islem.iptalEdenKullaniciId = kullaniciId(req); islem.iptalParaHareketId = tersHareket?._id || null;
        await islem.save();
        res.json({ basarili: true, mesaj: "İşlem ters kayıtla iptal edildi.", islem, hesap, tersHareket });
    } catch (error) {
        if (masrafGuncellendi && iptalIslem?.masrafId) await Masraf.updateOne({ _id: iptalIslem.masrafId, tenantId: tId }, { $set: { durum: "AKTIF", iptalTarihi: null, iptalNedeni: "", iptalEdenKullaniciId: null, iptalParaHareketId: null } }).catch(() => {});
        if (tersHareket?._id) await ParaHareket.deleteOne({ _id: tersHareket._id, tenantId: tId }).catch(() => {});
        if (hesap?._id && Model && tersYon) await Model.updateOne({ _id: hesap._id, tenantId: tId }, { $inc: { bakiye: -tersYon * Number(tersHareket?.tutar || 0) } }).catch(() => {});
        next(error);
    }
}

module.exports = { finansDetay, islemOlustur, topluMaasTahakkuku, iptalEt, ozetHesapla };
