const mongoose = require("mongoose");
const Alis = require("../models/Alis");
const Urun = require("../models/Urun");
const Stok = require("../models/Stok");
const StokHareket = require("../models/StokHareket");
const Tedarikci = require("../models/Tedarikci");
const CariHareket = require("../models/CariHareket");
const ParaHareket = require("../models/ParaHareket");
const Kasa = require("../models/Kasa");
const Banka = require("../models/Banka");
const { tedarikciFaturalariYenidenDagit } = require("./cariHesapServisi");

const HesapModeli = tip => tip === "KASA" ? Kasa : tip === "BANKA" ? Banka : null;
const sayi = value => Number(value || 0);
const yuvarla = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
function hata(mesaj, status = 400) { return Object.assign(new Error(mesaj), { status }); }
function snapshot(alis) { return { belgeNo: alis.belgeNo, tarih: alis.tarih, tedarikciId: String(alis.tedarikciId), depoId: String(alis.depoId), kalemler: alis.kalemler.map(k => ({ urunId: String(k.urunId), miktar: k.miktar, birimFiyat: k.birimFiyat, kdv: k.kdv, iskonto: k.iskonto, araToplam: k.araToplam, kdvTutari: k.kdvTutari, toplam: k.toplam })), araToplam: alis.araToplam, toplamKdv: alis.toplamKdv, genelToplam: alis.genelToplam, odemeDurumu: alis.odemeDurumu, odenenTutar: alis.odenenTutar, belgeOdemeTutari: alis.belgeOdemeTutari, kalanTutar: alis.kalanTutar, hesapTipi: alis.hesapTipi, hesapId: alis.hesapId ? String(alis.hesapId) : null, durum: alis.durum, revizyonNo: alis.revizyonNo || 0, notlar: alis.notlar || "" }; }
function satirHesapla(item, urun) { const miktar = sayi(item.miktar), birimFiyat = Number(item.birimFiyat), kdv = item.kdv === undefined ? sayi(urun.kdv ?? 20) : Number(item.kdv), iskonto = item.iskonto === undefined ? sayi(urun.iskonto) : Number(item.iskonto); if (!(miktar > 0) || !(birimFiyat >= 0) || kdv < 0 || kdv > 100 || iskonto < 0 || iskonto > 100) throw hata(`Geçersiz alış kalemi: ${urun.kod || urun._id}`); const brut = miktar * birimFiyat, iskontoTutari = brut * iskonto / 100, araToplam = brut - iskontoTutari, kdvTutari = araToplam * kdv / 100; return { urunId: urun._id, miktar, birimFiyat, kdv, iskonto, araToplam: yuvarla(araToplam), kdvTutari: yuvarla(kdvTutari), toplam: yuvarla(araToplam + kdvTutari) }; }
async function yeniVeri(tenantId, alis, body, session) { if (body.tedarikciId && String(body.tedarikciId) !== String(alis.tedarikciId)) throw hata("Muhasebeleşmiş alışın tedarikçisi değiştirilemez; iptal edip yeniden oluşturun.", 409); if (body.depoId && String(body.depoId) !== String(alis.depoId)) throw hata("Muhasebeleşmiş alışın deposu değiştirilemez; iptal edip yeniden oluşturun.", 409); if (!Array.isArray(body.kalemler) || !body.kalemler.length) throw hata("En az bir alış kalemi zorunludur."); const ids = [...new Set(body.kalemler.map(x => String(x.urunId || "")))]; if (ids.some(x => !mongoose.Types.ObjectId.isValid(x))) throw hata("Alış kaleminde geçersiz ürün var."); const urunler = await Urun.find({ tenantId, _id: { $in: ids } }).session(session); const map = new Map(urunler.map(x => [String(x._id), x])); if (map.size !== ids.length) throw hata("Alış kalemindeki ürünlerden biri bulunamadı.", 404); const kalemler = body.kalemler.map(x => satirHesapla(x, map.get(String(x.urunId)))); const araToplam = yuvarla(kalemler.reduce((n, x) => n + x.araToplam, 0)), toplamKdv = yuvarla(kalemler.reduce((n, x) => n + x.kdvTutari, 0)), genelToplam = yuvarla(kalemler.reduce((n, x) => n + x.toplam, 0)); const odemeDurumu = String(body.odemeDurumu || alis.odemeDurumu || "ACIK").toUpperCase(); let odenenTutar = body.odenenTutar === undefined ? sayi(alis.odenenTutar) : sayi(body.odenenTutar); if (odemeDurumu === "ACIK") odenenTutar = 0; if (odemeDurumu === "ODENDI") odenenTutar = genelToplam; if (!["ACIK", "KISMI", "ODENDI"].includes(odemeDurumu) || odenenTutar < 0 || odenenTutar > genelToplam || (odemeDurumu === "KISMI" && (!(odenenTutar > 0) || !(odenenTutar < genelToplam)))) throw hata("Ödeme durumu ve tutarı alış toplamıyla uyumlu değil."); return { belgeNo: String(body.belgeNo || alis.belgeNo).trim().toUpperCase(), tarih: body.tarih || alis.tarih, kalemler, araToplam, toplamKdv, genelToplam, odemeDurumu, odemeTipi: body.odemeTipi || alis.odemeTipi, odenenTutar: yuvarla(odenenTutar), kalanTutar: yuvarla(genelToplam - odenenTutar), notlar: body.notlar === undefined ? alis.notlar : String(body.notlar || "") }; }
function miktarMap(kalemler) { const map = new Map(); for (const k of kalemler) map.set(String(k.urunId), sayi(map.get(String(k.urunId))) + sayi(k.miktar)); return map; }
function farkPlani(eski, yeni) {
    const eskiMap = miktarMap(eski.kalemler || []), yeniMap = miktarMap(yeni.kalemler || []);
    const stokFarklari = [...new Set([...eskiMap.keys(), ...yeniMap.keys()])].map(urunId => ({
        urunId,
        miktarFarki: yuvarla(sayi(yeniMap.get(urunId)) - sayi(eskiMap.get(urunId)))
    })).filter(x => Math.abs(x.miktarFarki) > 0.000001);
    return {
        stokFarklari,
        cariFarki: yuvarla((sayi(yeni.genelToplam) - sayi(yeni.odenenTutar)) - (sayi(eski.genelToplam) - sayi(eski.odenenTutar))),
        odemeHesabiFarki: yuvarla(sayi(eski.odenenTutar) - sayi(yeni.odenenTutar))
    };
}
async function odemeHesabiBul(tenantId, alis, body, session) { const eskiCari = await CariHareket.findOne({ tenantId, kaynak: "ALIS_ODEME", kaynakId: alis._id, durum: { $ne: "IPTAL" } }).sort({ createdAt: -1 }).session(session); const eskiPara = eskiCari ? await ParaHareket.findOne({ tenantId, kaynak: "ALIS_ODEME", kaynakId: eskiCari._id }).sort({ createdAt: -1 }).session(session) : null; const eskiTip = alis.hesapTipi || eskiPara?.hesapTipi || null, eskiId = alis.hesapId || eskiPara?.hesapId || null, yeniTip = String(body.hesapTipi || eskiTip || "").toUpperCase() || null, yeniId = body.hesapId || eskiId || null; return { eskiCari, eskiPara, eskiTip, eskiId, yeniTip, yeniId }; }
async function hesapBakiyesiUygula({ tenantId, eskiTip, eskiId, eskiTutar, yeniTip, yeniId, yeniTutar, alis, tarih, belgeNo, kullaniciId, transactionId, session }) { if (eskiTutar > 0 && (!HesapModeli(eskiTip) || !eskiId)) throw hata("Eski alış ödeme hesabı bulunamadı; düzeltme durduruldu.", 409); if (yeniTutar > 0 && (!HesapModeli(yeniTip) || !mongoose.Types.ObjectId.isValid(String(yeniId || "")))) throw hata("Düzeltilen ödeme için kasa veya banka hesabı zorunludur."); const ayni = eskiTip === yeniTip && String(eskiId || "") === String(yeniId || ""); if (ayni && eskiId) { const delta = yuvarla(eskiTutar - yeniTutar), Model = HesapModeli(eskiTip), filter = { _id: eskiId, tenantId, ...(delta < 0 ? { bakiye: { $gte: -delta } } : {}) }; const result = await Model.updateOne(filter, { $inc: { bakiye: delta } }, { session }); if (!result.modifiedCount && Math.abs(delta) > 0.000001) throw hata("Ödeme hesabı bakiyesi düzeltme için yetersiz.", 409); if (Math.abs(delta) > 0.000001) await ParaHareket.create([{ tenantId, hesapTipi: eskiTip, hesapId: eskiId, tip: delta > 0 ? "GIRIS" : "CIKIS", tutar: Math.abs(delta), aciklama: `Alış düzeltmesi ${belgeNo}`, kaynak: "ALIS_DUZELTME", kaynakId: alis._id, belgeNo, tarih, kullaniciId, islemAnahtari: `TX:${transactionId}:PARA:ALIS_DUZELTME:${alis._id}` }], { session }); return; } if (eskiTutar > 0) { const OldModel = HesapModeli(eskiTip); await OldModel.updateOne({ _id: eskiId, tenantId }, { $inc: { bakiye: eskiTutar } }, { session }); await ParaHareket.create([{ tenantId, hesapTipi: eskiTip, hesapId: eskiId, tip: "GIRIS", tutar: eskiTutar, aciklama: `Alış eski ödemesi geri alma ${belgeNo}`, kaynak: "ALIS_DUZELTME", kaynakId: alis._id, belgeNo, tarih, kullaniciId, islemAnahtari: `TX:${transactionId}:PARA:ALIS_ESKI_ODEME:${alis._id}` }], { session }); } if (yeniTutar > 0) { const NewModel = HesapModeli(yeniTip), result = await NewModel.updateOne({ _id: yeniId, tenantId, aktif: { $ne: false }, bakiye: { $gte: yeniTutar } }, { $inc: { bakiye: -yeniTutar } }, { session }); if (!result.modifiedCount) throw hata("Yeni ödeme hesabı bakiyesi yetersiz.", 409); await ParaHareket.create([{ tenantId, hesapTipi: yeniTip, hesapId: yeniId, tip: "CIKIS", tutar: yeniTutar, aciklama: `Alış yeni ödemesi ${belgeNo}`, kaynak: "ALIS_DUZELTME", kaynakId: alis._id, belgeNo, tarih, kullaniciId, islemAnahtari: `TX:${transactionId}:PARA:ALIS_YENI_ODEME:${alis._id}` }], { session }); } }
async function duzelt({ tenantId, alisId, body, kullaniciId, transactionId }) { const session = await mongoose.startSession(); let sonuc; try { await session.withTransaction(async () => { const alis = await Alis.findOneAndUpdate({ _id: alisId, tenantId, durum: { $in: ["AKTIF", null] } }, { $set: { durum: "DUZELTILIYOR" } }, { new: true, session }); if (!alis) throw hata("Alış bulunamadı, iptal edildi veya başka bir düzeltme işleniyor.", 409); const eski = snapshot(alis), yeni = await yeniVeri(tenantId, alis, body, session); const eskiMap = miktarMap(alis.kalemler), yeniMap = miktarMap(yeni.kalemler), ids = new Set([...eskiMap.keys(), ...yeniMap.keys()]); for (const urunId of ids) { const delta = sayi(yeniMap.get(urunId)) - sayi(eskiMap.get(urunId)); if (Math.abs(delta) < 0.000001) continue; const filter = { tenantId, urunId, depoId: alis.depoId, ...(delta < 0 ? { miktar: { $gte: -delta } } : {}) }, update = { $inc: { miktar: delta }, $set: { sonHareketTarihi: new Date() } }; const stok = await Stok.findOneAndUpdate(filter, update, { new: true, upsert: delta > 0, setDefaultsOnInsert: true, session }); if (!stok) throw hata("Alış miktarı azaltılamadı; ilgili stok kullanılmış veya yetersiz.", 409); const satir = yeni.kalemler.find(k => String(k.urunId) === urunId) || alis.kalemler.find(k => String(k.urunId) === urunId), maliyet = sayi(satir?.birimFiyat) * (1 - sayi(satir?.iskonto) / 100); await StokHareket.create([{ tenantId, urunId, depoId: alis.depoId, tip: delta > 0 ? "GIRIS" : "CIKIS", miktar: Math.abs(delta), tarih: yeni.tarih, birimMaliyet: maliyet, maliyetDogrulandi: maliyet > 0, maliyetKaynagi: "ALIS_DUZELTME", kaynak: "ALIS_DUZELTME", kaynakId: alis._id, aciklama: `Alış ${alis.belgeNo} revizyonu`, kullaniciId, islemAnahtari: `TX:${transactionId}:STOK:ALIS_DUZELTME:${alis._id}:${urunId}` }], { session }); }
        const odeme = await odemeHesabiBul(tenantId, alis, body, session);
        const eskiBelgeOdemesi = alis.belgeOdemeAyrildi ? sayi(alis.belgeOdemeTutari) : sayi(odeme.eskiCari?.tutar);
        await hesapBakiyesiUygula({ tenantId, eskiTip: odeme.eskiTip, eskiId: odeme.eskiId, eskiTutar: eskiBelgeOdemesi, yeniTip: odeme.yeniTip, yeniId: odeme.yeniId, yeniTutar: yeni.odenenTutar, alis, tarih: yeni.tarih, belgeNo: yeni.belgeNo, kullaniciId, transactionId, session });
        const netDelta = yuvarla((yeni.genelToplam - yeni.odenenTutar) - (sayi(alis.genelToplam) - eskiBelgeOdemesi));
        if (Math.abs(netDelta) > 0.000001) {
            const cariSonucu = await Tedarikci.updateOne({ _id: alis.tedarikciId, tenantId }, { $inc: { bakiye: netDelta } }, { session });
            if (!cariSonucu.modifiedCount) throw hata("Alışın tedarikçi cari hesabı bulunamadı.", 409);
            await CariHareket.create([{ tenantId, tarafTipi: "TEDARIKCI", tarafId: alis.tedarikciId, tip: "DUZELTME", tutar: Math.abs(netDelta), bakiyeDegisimi: netDelta, aciklama: `Alış düzeltmesi ${yeni.belgeNo}`, kaynak: "ALIS_DUZELTME", kaynakId: alis._id, belgeNo: yeni.belgeNo, tarih: yeni.tarih, kullaniciId, islemAnahtari: `TX:${transactionId}:CARI:ALIS_DUZELTME:${alis._id}` }], { session });
        }
        Object.assign(alis, yeni, { belgeOdemeTutari: yeni.odenenTutar, belgeOdemeAyrildi: true, hesapTipi: yeni.odenenTutar > 0 ? odeme.yeniTip : null, hesapId: yeni.odenenTutar > 0 ? odeme.yeniId : null, durum: "AKTIF", revizyonNo: sayi(alis.revizyonNo) + 1, sonDuzeltmeTarihi: new Date(), sonDuzeltenKullaniciId: kullaniciId });
        await alis.save({ session });
        await tedarikciFaturalariYenidenDagit({ tenantId, tedarikciId: alis.tedarikciId, session });
        const guncelAlis = await Alis.findById(alis._id).session(session); sonuc = { alis: snapshot(guncelAlis), eski, yeni: snapshot(guncelAlis), netCariFarki: netDelta };
    }); return sonuc; } finally { await session.endSession(); } }
async function iptal({ tenantId, alisId, neden, kullaniciId, transactionId }) {
    const session = await mongoose.startSession(); let sonuc;
    try {
        await session.withTransaction(async () => {
            const alis = await Alis.findOneAndUpdate({ _id: alisId, tenantId, durum: { $in: ["AKTIF", null] } }, { $set: { durum: "DUZELTILIYOR" } }, { new: true, session });
            if (!alis) throw hata("Alış bulunamadı veya daha önce iptal edildi.", 409);
            const eski = snapshot(alis);
            for (const [urunId, miktar] of miktarMap(alis.kalemler)) {
                const result = await Stok.updateOne({ tenantId, urunId, depoId: alis.depoId, miktar: { $gte: miktar } }, { $inc: { miktar: -miktar }, $set: { sonHareketTarihi: new Date() } }, { session });
                if (!result.modifiedCount) throw hata("Alış iptal edilemedi; alınan stokun bir kısmı kullanılmış.", 409);
                await StokHareket.create([{ tenantId, urunId, depoId: alis.depoId, tip: "CIKIS", miktar, tarih: new Date(), kaynak: "ALIS_IPTAL", kaynakId: alis._id, aciklama: `Alış iptali ${alis.belgeNo}`, kullaniciId, islemAnahtari: `TX:${transactionId}:STOK:ALIS_IPTAL:${alis._id}:${urunId}` }], { session });
            }
            const odeme = await odemeHesabiBul(tenantId, alis, {}, session);
            const belgeOdemesi = alis.belgeOdemeAyrildi ? sayi(alis.belgeOdemeTutari) : sayi(odeme.eskiCari?.tutar), net = yuvarla(sayi(alis.genelToplam) - belgeOdemesi);
            if (Math.abs(net) > 0.000001) {
                const cariSonucu = await Tedarikci.updateOne({ _id: alis.tedarikciId, tenantId }, { $inc: { bakiye: -net } }, { session });
                if (!cariSonucu.modifiedCount) throw hata("Alışın tedarikçi cari hesabı bulunamadı.", 409);
                await CariHareket.create([{ tenantId, tarafTipi: "TEDARIKCI", tarafId: alis.tedarikciId, tip: "DUZELTME", tutar: Math.abs(net), bakiyeDegisimi: -net, aciklama: `Alış iptali ${alis.belgeNo}`, kaynak: "ALIS_IPTAL", kaynakId: alis._id, belgeNo: alis.belgeNo, tarih: new Date(), kullaniciId, islemAnahtari: `TX:${transactionId}:CARI:ALIS_IPTAL:${alis._id}` }], { session });
            }
            if (belgeOdemesi > 0) {
                if (!HesapModeli(odeme.eskiTip) || !odeme.eskiId) throw hata("Alış ödeme hesabı bulunamadı; iptal durduruldu.", 409);
                await HesapModeli(odeme.eskiTip).updateOne({ _id: odeme.eskiId, tenantId }, { $inc: { bakiye: belgeOdemesi } }, { session });
                await ParaHareket.create([{ tenantId, hesapTipi: odeme.eskiTip, hesapId: odeme.eskiId, tip: "GIRIS", tutar: belgeOdemesi, aciklama: `Alış iptali ${alis.belgeNo}`, kaynak: "ALIS_IPTAL", kaynakId: alis._id, belgeNo: alis.belgeNo, tarih: new Date(), kullaniciId, islemAnahtari: `TX:${transactionId}:PARA:ALIS_IPTAL:${alis._id}` }], { session });
            }
            alis.durum = "IPTAL"; alis.iptalTarihi = new Date(); alis.iptalNedeni = String(neden || "Alış iptal edildi").trim(); alis.iptalEdenKullaniciId = kullaniciId; await alis.save({ session });
            await tedarikciFaturalariYenidenDagit({ tenantId, tedarikciId: alis.tedarikciId, session });
            sonuc = { alis: snapshot(alis), eski, yeni: snapshot(alis) };
        });
        return sonuc;
    } finally { await session.endSession(); }
}

module.exports = { duzelt, iptal, snapshot, farkPlani };
