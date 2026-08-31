const mongoose = require("mongoose");
const Satis = require("../models/Satis");
const SatisIade = require("../models/SatisIade");
const Alis = require("../models/Alis");
const AlisIade = require("../models/AlisIade");
const Stok = require("../models/Stok");
const StokHareket = require("../models/StokHareket");
const Urun = require("../models/Urun");
const Depo = require("../models/Depo");
const Musteri = require("../models/Musteri");
const Tedarikci = require("../models/Tedarikci");
const Kullanici = require("../models/Kullanici");
const CariHareket = require("../models/CariHareket");
const ParaHareket = require("../models/ParaHareket");
const Masraf = require("../models/Masraf");
const Kasa = require("../models/Kasa");
const Banka = require("../models/Banka");
const CekSenetPortfoy = require("../models/CekSenetPortfoy");
const Tenant = require("../modules/platform/models/Tenant");

const RAPORLAR = [
    ["donemBasiMalMevcudu", "Dönem Başı Mal Mevcudu"], ["donemIcindeAlinanMal", "Dönem İçinde Alınan Mal"],
    ["donemIcindeSatilanMal", "Dönem İçinde Satılan Mal"], ["satilanMalinMaliyeti", "Satılan Malın Maliyeti"],
    ["donemSonuMalMevcudu", "Dönem Sonu Mal Mevcudu"], ["toplamSatisGeliri", "Toplam Satış Geliri"],
    ["satisIadeleri", "Satış İadeleri"], ["netSatislar", "Net Satışlar"], ["toplamAlis", "Toplam Alış"],
    ["alisIadeleri", "Alış İadeleri"], ["digerGelirler", "Diğer Gelirler"], ["toplamGiderler", "Toplam Giderler"],
    ["brutKar", "Brüt Kâr"], ["faaliyetKari", "Faaliyet Kârı"], ["netKarZarar", "Net Kâr / Zarar"],
    ["musteriAlacaklari", "Müşteri Alacakları"], ["tedarikciBorclari", "Tedarikçi Borçları"],
    ["kasaBakiyesi", "Kasa Bakiyesi"], ["bankaBakiyesi", "Banka Bakiyesi"],
    ["cekSenetPortfoyu", "Çek / Senet Portföyü"], ["stokDegeri", "Stok Değeri"], ["kritikStoklar", "Kritik Stoklar"],
    ["enCokSatanUrunler", "En Çok Satan Ürünler"], ["enCokKarBirakanUrunler", "En Çok Kâr Bırakan Ürünler"],
    ["musteriBazliSatis", "Müşteri Bazlı Satış Raporu"], ["tedarikciBazliAlis", "Tedarikçi Bazlı Alış Raporu"],
    ["satisTemsilcisiPerformansi", "Satış Temsilcisi Performans Raporu"], ["tahsilatRaporu", "Tahsilat Raporu"],
    ["odemeRaporu", "Ödeme Raporu"], ["giderKategoriRaporu", "Gider Kategori Raporu"]
];

function hata(mesaj) { return Object.assign(new Error(mesaj), { status: 400 }); }
function yuvarla(value) { return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100; }
function toplam(liste, alan) { return yuvarla((liste || []).reduce((n, x) => n + Number(typeof alan === "function" ? alan(x) : x?.[alan] || 0), 0)); }
function id(value, ad) { if (!value) return null; if (!mongoose.Types.ObjectId.isValid(String(value))) throw hata(`${ad} filtresi geçersizdir.`); return new mongoose.Types.ObjectId(String(value)); }
function gunBaslangici(value) { const d = value ? new Date(`${value}T00:00:00+03:00`) : new Date(); if (Number.isNaN(d.getTime())) throw hata("Başlangıç tarihi geçersizdir."); return d; }
function gunSonu(value) { const d = value ? new Date(`${value}T23:59:59.999+03:00`) : new Date(); if (Number.isNaN(d.getTime())) throw hata("Bitiş tarihi geçersizdir."); return d; }
function tarihYaz(d) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(d); }
function tarihAraligi(query = {}, simdi = new Date()) {
    const yerel = new Date(simdi.toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
    const y = yerel.getFullYear(), m = yerel.getMonth(), g = yerel.getDate();
    const basla = (yy, mm, dd) => new Date(Date.UTC(yy, mm, dd, -3, 0, 0, 0));
    const bitir = (yy, mm, dd) => new Date(Date.UTC(yy, mm, dd, 20, 59, 59, 999));
    const kod = String(query.donem || "BU_AY").toUpperCase(); let baslangic; let bitis;
    if (kod === "OZEL") { baslangic = gunBaslangici(query.baslangic); bitis = gunSonu(query.bitis); }
    else if (kod === "BUGUN") { baslangic = basla(y, m, g); bitis = bitir(y, m, g); }
    else if (kod === "DUN") { baslangic = basla(y, m, g - 1); bitis = bitir(y, m, g - 1); }
    else if (kod === "BU_HAFTA") { const fark = (yerel.getDay() + 6) % 7; baslangic = basla(y, m, g - fark); bitis = bitir(y, m, g); }
    else if (kod === "GECEN_AY") { baslangic = basla(y, m - 1, 1); bitis = bitir(y, m, 0); }
    else if (kod === "BU_YIL") { baslangic = basla(y, 0, 1); bitis = bitir(y, m, g); }
    else if (kod === "GECEN_YIL") { baslangic = basla(y - 1, 0, 1); bitis = bitir(y - 1, 11, 31); }
    else { baslangic = basla(y, m, 1); bitis = bitir(y, m, g); }
    if (baslangic > bitis) throw hata("Başlangıç tarihi bitiş tarihinden sonra olamaz.");
    return { kod, baslangic, bitis, baslangicYazi: tarihYaz(baslangic), bitisYazi: tarihYaz(bitis) };
}
function oncekiAralik(aralik) { const sure = aralik.bitis.getTime() - aralik.baslangic.getTime() + 1; const bitis = new Date(aralik.baslangic.getTime() - 1), baslangic = new Date(bitis.getTime() - sure + 1); return { kod: "ONCEKI_DONEM", baslangic, bitis, baslangicYazi: tarihYaz(baslangic), bitisYazi: tarihYaz(bitis) }; }
function karsilastirmaAraligi(query, aralik) { const kod = String(query.donem || "BU_AY").toUpperCase(); if (kod === "BUGUN") return tarihAraligi({ donem: "DUN" }); if (kod === "BU_AY") return tarihAraligi({ donem: "GECEN_AY" }); if (kod === "BU_YIL") return tarihAraligi({ donem: "GECEN_YIL" }); return oncekiAralik(aralik); }
function kalemNet(k) { return yuvarla(Number(k.miktar || 0) * Number(k.birimFiyat || 0) * (1 - Number(k.iskonto || 0) / 100)); }
function stokYon(tip) { return ["GIRIS", "SAYIM_ARTI", "IADE_GIRIS", "TRANSFER_GIRIS"].includes(tip) ? 1 : -1; }
function ad(nesne) { return nesne?.unvan || nesne?.adSoyad || nesne?.ad || nesne?.bankaAdi || "-"; }
function mapTopla(map, key, baslangic, ekler) { if (!map.has(key)) map.set(key, { ...baslangic }); const satir = map.get(key); for (const [alan, value] of Object.entries(ekler)) satir[alan] = Number(satir[alan] || 0) + Number(value || 0); return satir; }
function cariDegisimi(h) {
    if (h.bakiyeDegisimi !== null && h.bakiyeDegisimi !== undefined) return Number(h.bakiyeDegisimi || 0);
    if (h.tarafTipi === "MUSTERI") return ({ BORC: 1, ODEME: 1, TAHSILAT: -1, IADE: -1, ALACAK: -1 }[h.tip] || 0) * Number(h.tutar || 0);
    return ({ ALACAK: 1, TAHSILAT: 1, ODEME: -1, IADE: -1, BORC: -1 }[h.tip] || 0) * Number(h.tutar || 0);
}
function hesaplamalariTamamla(v) {
    const netAlis = yuvarla(v.toplamAlis - v.alisIadeleri);
    const satilanMalinMaliyeti = yuvarla(v.donemBasiMalMevcudu + netAlis - v.donemSonuMalMevcudu);
    const netSatislar = yuvarla(v.toplamSatisGeliri - v.satisIadeleri);
    const brutKar = yuvarla(netSatislar - satilanMalinMaliyeti);
    const faaliyetKari = yuvarla(brutKar + v.digerGelirler - v.toplamGiderler);
    const toplamGelirler = yuvarla(netSatislar + v.digerGelirler);
    const netKarZarar = yuvarla(toplamGelirler - v.toplamGiderler - satilanMalinMaliyeti);
    return { ...v, netAlis, satilanMalinMaliyeti, netSatislar, brutKar, faaliyetKari, toplamGelirler, netKarZarar };
}
function stokDegeriKesim(stoklar, hareketler, kesim) {
    let deger = toplam(stoklar, x => Number(x.miktar || 0) * Number(x.maliyet || 0));
    for (const h of hareketler) if (new Date(h.createdAt) > kesim) deger -= stokYon(h.tip) * Number(h.miktar || 0) * Number(h.birimMaliyet || 0);
    return yuvarla(deger);
}
function degisim(yeni, eski) { return { yeni: yuvarla(yeni), eski: yuvarla(eski), fark: yuvarla(yeni - eski), yuzde: eski ? yuvarla((yeni - eski) / Math.abs(eski) * 100) : null }; }

async function filtreSecenekleri(tenantId) {
    const [depolar, musteriler, tedarikciler, urunler, temsilciler, kasalar, bankalar] = await Promise.all([
        Depo.find({ tenantId, aktif: { $ne: false } }).select("kod ad").sort({ ad: 1 }).lean(),
        Musteri.find({ tenantId, aktif: { $ne: false } }).select("kod unvan adSoyad").sort({ unvan: 1, adSoyad: 1 }).lean(),
        Tedarikci.find({ tenantId, aktif: { $ne: false } }).select("kod unvan adSoyad").sort({ unvan: 1, adSoyad: 1 }).lean(),
        Urun.find({ tenantId, aktif: { $ne: false } }).select("kod ad marka kategori").sort({ ad: 1 }).lean(),
        Kullanici.find({ tenantId, aktif: true, silinmeTarihi: null }).select("adSoyad rol").sort({ adSoyad: 1 }).lean(),
        Kasa.find({ tenantId, aktif: true }).select("sube").lean(), Banka.find({ tenantId, aktif: true }).select("sube").lean()
    ]);
    return { depolar, musteriler, tedarikciler, urunler, temsilciler, markalar: [...new Set(urunler.map(x => x.marka).filter(Boolean))].sort(), kategoriler: [...new Set(urunler.map(x => x.kategori).filter(Boolean))].sort(), subeler: [...new Set([...kasalar, ...bankalar].map(x => x.sube).filter(Boolean))].sort(), odemeTipleri: ["ACIK_HESAP", "NAKIT", "KART", "BANKA", "CEK", "SENET", "KREDI_KARTI", "IBAN"] };
}

async function raporuHesapla(tenantId, query = {}, sabitAralik = null) {
    const aralik = sabitAralik || tarihAraligi(query), tarih = { $gte: aralik.baslangic, $lte: aralik.bitis };
    const depoId = id(query.depoId, "Depo"), musteriId = id(query.musteriId, "Müşteri"), tedarikciId = id(query.tedarikciId, "Tedarikçi"), urunId = id(query.urunId, "Ürün"), temsilciId = id(query.temsilciId, "Satış temsilcisi");
    const urunFiltre = { tenantId };
    if (urunId) urunFiltre._id = urunId;
    if (query.marka) urunFiltre.marka = String(query.marka).trim();
    if (query.kategori) urunFiltre.kategori = String(query.kategori).trim();
    const urunler = await Urun.find(urunFiltre).select("kod ad marka kategori kritikStok minimumStok").lean();
    const urunKisitli = !!(urunId || query.marka || query.kategori), urunIds = urunler.map(x => x._id);
    const urunKosulu = urunKisitli ? { $in: urunIds } : null;
    const odemeTipi = String(query.odemeTipi || "").toUpperCase(), satisOdemeTipi = odemeTipi === "KREDI_KARTI" ? "KART" : odemeTipi === "IBAN" ? "BANKA" : odemeTipi, alisOdemeTipi = satisOdemeTipi === "BANKA" ? "HAVALE_EFT" : satisOdemeTipi, cariOdemeTipi = odemeTipi === "KART" ? "KREDI_KARTI" : odemeTipi === "BANKA" || odemeTipi === "HAVALE_EFT" ? "IBAN" : odemeTipi, sube = String(query.sube || "").trim();
    const hesapFiltre = { tenantId, aktif: true, ...(sube ? { sube } : {}) };
    const [kasalar, bankalar] = await Promise.all([Kasa.find(hesapFiltre).select("kod ad bakiye paraBirimi sube").lean(), Banka.find(hesapFiltre).select("kod bankaAdi bakiye paraBirimi sube").lean()]);
    const hesapIds = [...kasalar, ...bankalar].map(x => x._id);
    const satisFiltre = { tenantId, tarih, ...(depoId ? { depoId } : {}), ...(musteriId ? { musteriId } : {}), ...(temsilciId ? { kullaniciId: temsilciId } : {}), ...(satisOdemeTipi ? { odemeTipi: satisOdemeTipi } : {}), ...(urunKosulu ? { "kalemler.urunId": urunKosulu } : {}) };
    const alisFiltre = { tenantId, tarih, ...(depoId ? { depoId } : {}), ...(tedarikciId ? { tedarikciId } : {}), ...(alisOdemeTipi ? { odemeTipi: alisOdemeTipi } : {}), ...(urunKosulu ? { "kalemler.urunId": urunKosulu } : {}) };
    const satisIadeFiltre = { tenantId, tarih, ...(depoId ? { depoId } : {}), ...(musteriId ? { musteriId } : {}), ...(temsilciId ? { kullaniciId: temsilciId } : {}), ...(satisOdemeTipi ? { odemeTipi: satisOdemeTipi } : {}), ...(urunKosulu ? { "kalemler.urunId": urunKosulu } : {}) };
    const alisIadeFiltre = { tenantId, tarih, ...(depoId ? { depoId } : {}), ...(tedarikciId ? { tedarikciId } : {}), ...(urunKosulu ? { "kalemler.urunId": urunKosulu } : {}) };
    const stokFiltre = { tenantId, ...(depoId ? { depoId } : {}), ...(urunKosulu ? { urunId: urunKosulu } : {}) };
    const cariFiltre = { tenantId, tarih: { $lte: aralik.bitis }, durum: { $ne: "IPTAL" } };
    const masrafFiltre = { tenantId, tarih, durum: { $ne: "IPTAL" }, ...(sube ? { hesapId: { $in: hesapIds } } : {}) };
    const hareketFiltre = { tenantId, createdAt: { $gte: aralik.baslangic }, ...(depoId ? { depoId } : {}), ...(urunKosulu ? { urunId: urunKosulu } : {}) };
    const [satislar, satisIadeleri, alislar, alisIadeleri, stoklar, stokHareketleri, cariHam, donemCariHam, paraSonrasi, digerGelirler, masraflar, portfoy, tenant, cariMusteriler, cariTedarikciler] = await Promise.all([
        Satis.find(satisFiltre).select("belgeNo tarih musteriId depoId kalemler araToplam genelToplam odemeTipi odenenTutar kullaniciId").populate("musteriId", "kod unvan adSoyad").populate("kullaniciId", "adSoyad").lean(),
        SatisIade.find(satisIadeFiltre).select("belgeNo tarih musteriId kalemler genelToplam orijinalSatisId kullaniciId").populate("musteriId", "kod unvan adSoyad").populate("kullaniciId", "adSoyad").lean(),
        Alis.find(alisFiltre).select("belgeNo tarih tedarikciId depoId kalemler araToplam genelToplam odemeTipi odenenTutar").populate("tedarikciId", "kod unvan adSoyad").lean(),
        AlisIade.find(alisIadeFiltre).select("belgeNo tarih tedarikciId kalemler genelToplam").populate("tedarikciId", "kod unvan adSoyad").lean(),
        Stok.find(stokFiltre).select("urunId depoId miktar maliyet").populate("urunId", "kod ad marka kategori kritikStok minimumStok").populate("depoId", "kod ad").lean(),
        StokHareket.find(hareketFiltre).select("urunId depoId tip miktar birimMaliyet kaynak kaynakId createdAt").lean(),
        CariHareket.find(cariFiltre).select("tarafTipi tarafId tip tutar bakiyeDegisimi tarih odemeYontemi belgeNo aciklama kullaniciId").populate("kullaniciId", "adSoyad").lean(),
        CariHareket.find({ ...cariFiltre, tarih }).select("tarafTipi tarafId tip tutar bakiyeDegisimi tarih odemeYontemi belgeNo aciklama kullaniciId").populate("kullaniciId", "adSoyad").sort({ tarih: -1 }).lean(),
        ParaHareket.find({ tenantId, tarih: { $gt: aralik.bitis }, ...(sube ? { hesapId: { $in: hesapIds } } : {}) }).select("hesapTipi hesapId tip tutar").lean(),
        ParaHareket.find({ tenantId, tarih, tip: "GIRIS", kaynak: "MANUEL", ...(sube ? { hesapId: { $in: hesapIds } } : {}) }).select("tutar tarih aciklama belgeNo hesapTipi hesapId").lean(),
        Masraf.find(masrafFiltre).select("kategori tutar tarih aciklama fisNo hesapTipi hesapId paraBirimi").sort({ tarih: -1 }).lean(),
        CekSenetPortfoy.find({ tenantId, createdAt: { $lte: aralik.bitis }, durum: "PORTFOYDE", ...(musteriId ? { musteriId } : {}) }).select("tur tutar belgeNo vadeTarihi musteriId durum").populate("musteriId", "kod unvan adSoyad").lean(),
        Tenant.findById(tenantId).select("name firmaBilgileri.unvan").lean(),
        Musteri.find({ tenantId }).select("kod unvan adSoyad").lean(), Tedarikci.find({ tenantId }).select("kod unvan adSoyad").lean()
    ]);

    const cariMusteriMap = new Map(cariMusteriler.map(x => [String(x._id), x])), cariTedarikciMap = new Map(cariTedarikciler.map(x => [String(x._id), x]));
    const cariUygun = h => h.tarafTipi === "MUSTERI" ? (!musteriId || String(h.tarafId) === String(musteriId)) : (!tedarikciId || String(h.tarafId) === String(tedarikciId));
    const cariAdlandir = h => ({ ...h, taraf: h.tarafTipi === "MUSTERI" ? cariMusteriMap.get(String(h.tarafId)) : cariTedarikciMap.get(String(h.tarafId)) });
    const cariHareketler = cariHam.filter(cariUygun).map(cariAdlandir), donemCari = donemCariHam.filter(cariUygun).map(cariAdlandir);

    const urunMap = new Map(urunler.map(x => [String(x._id), x])), urunRaporu = new Map(), alisUrunRaporu = new Map(), musteriRaporu = new Map(), tedarikciRaporu = new Map(), temsilciRaporu = new Map(), gunler = new Map();
    const uygunKalemler = belge => (belge.kalemler || []).filter(k => !urunKisitli || urunMap.has(String(k.urunId)));
    const gun = tarihValue => { const key = tarihYaz(new Date(tarihValue)); if (!gunler.has(key)) gunler.set(key, { tarih: key, satis: 0, alis: 0, gider: 0, tahsilat: 0, odeme: 0 }); return gunler.get(key); };
    let toplamSatisGeliri = 0, satisIadeToplami = 0, toplamAlis = 0, alisIadeToplami = 0;
    for (const s of satislar) {
        const kalemler = uygunKalemler(s), belgeNet = kalemler.reduce((n, k) => n + kalemNet(k), 0); toplamSatisGeliri += belgeNet; gun(s.tarih).satis += belgeNet;
        mapTopla(musteriRaporu, String(s.musteriId?._id || s.musteriId), { kod: s.musteriId?.kod || "", ad: ad(s.musteriId), belgeSayisi: 0, satis: 0, iade: 0 }, { belgeSayisi: 1, satis: belgeNet });
        mapTopla(temsilciRaporu, String(s.kullaniciId?._id || s.kullaniciId || "atanmamis"), { ad: s.kullaniciId?.adSoyad || "Atanmamış", belgeSayisi: 0, satis: 0, iade: 0, tahsilat: 0 }, { belgeSayisi: 1, satis: belgeNet, tahsilat: s.odenenTutar });
        for (const k of kalemler) { const u = urunMap.get(String(k.urunId)); mapTopla(urunRaporu, String(k.urunId), { kod: u?.kod || "", urun: u?.ad || "-", marka: u?.marka || "", kategori: u?.kategori || "", satilanMiktar: 0, iadeMiktari: 0, netSatis: 0, maliyet: 0, kar: 0 }, { satilanMiktar: k.miktar, netSatis: kalemNet(k) }); }
    }
    for (const i of satisIadeleri) { const kalemler = uygunKalemler(i), net = kalemler.reduce((n, k) => n + kalemNet(k), 0); satisIadeToplami += net; gun(i.tarih).satis -= net; mapTopla(musteriRaporu, String(i.musteriId?._id || i.musteriId), { kod: i.musteriId?.kod || "", ad: ad(i.musteriId), belgeSayisi: 0, satis: 0, iade: 0 }, { iade: net }); mapTopla(temsilciRaporu, String(i.kullaniciId?._id || i.kullaniciId || "atanmamis"), { ad: i.kullaniciId?.adSoyad || "Atanmamış", belgeSayisi: 0, satis: 0, iade: 0, tahsilat: 0 }, { iade: net }); for (const k of kalemler) { const u = urunMap.get(String(k.urunId)); mapTopla(urunRaporu, String(k.urunId), { kod: u?.kod || "", urun: u?.ad || "-", marka: u?.marka || "", kategori: u?.kategori || "", satilanMiktar: 0, iadeMiktari: 0, netSatis: 0, maliyet: 0, kar: 0 }, { iadeMiktari: k.miktar, netSatis: -kalemNet(k) }); } }
    for (const a of alislar) { const kalemler = uygunKalemler(a), net = kalemler.reduce((n, k) => n + kalemNet(k), 0); toplamAlis += net; gun(a.tarih).alis += net; mapTopla(tedarikciRaporu, String(a.tedarikciId?._id || a.tedarikciId), { kod: a.tedarikciId?.kod || "", ad: ad(a.tedarikciId), belgeSayisi: 0, alis: 0, iade: 0 }, { belgeSayisi: 1, alis: net }); for (const k of kalemler) { const u = urunMap.get(String(k.urunId)); mapTopla(alisUrunRaporu, String(k.urunId), { kod: u?.kod || "", urun: u?.ad || "-", alinanMiktar: 0, iadeMiktari: 0, alis: 0, iade: 0 }, { alinanMiktar: k.miktar, alis: kalemNet(k) }); } }
    for (const i of alisIadeleri) { const kalemler = uygunKalemler(i), net = kalemler.reduce((n, k) => n + kalemNet(k), 0); alisIadeToplami += net; gun(i.tarih).alis -= net; mapTopla(tedarikciRaporu, String(i.tedarikciId?._id || i.tedarikciId), { kod: i.tedarikciId?.kod || "", ad: ad(i.tedarikciId), belgeSayisi: 0, alis: 0, iade: 0 }, { iade: net }); for (const k of kalemler) { const u = urunMap.get(String(k.urunId)); mapTopla(alisUrunRaporu, String(k.urunId), { kod: u?.kod || "", urun: u?.ad || "-", alinanMiktar: 0, iadeMiktari: 0, alis: 0, iade: 0 }, { iadeMiktari: k.miktar, iade: kalemNet(k) }); } }
    const satisIds = new Set(satislar.map(x => String(x._id)));
    for (const h of stokHareketleri) if (h.kaynak === "SATIS" && satisIds.has(String(h.kaynakId))) { const r = urunRaporu.get(String(h.urunId)); if (r) r.maliyet += Number(h.miktar || 0) * Number(h.birimMaliyet || 0); }
    const urunSatirlari = [...urunRaporu.values()].map(x => ({ ...x, netMiktar: yuvarla(x.satilanMiktar - x.iadeMiktari), netSatis: yuvarla(x.netSatis), maliyet: yuvarla(x.maliyet), kar: yuvarla(x.netSatis - x.maliyet) }));
    const alisUrunSatirlari = [...alisUrunRaporu.values()].map(x => ({ ...x, netMiktar: yuvarla(x.alinanMiktar - x.iadeMiktari), netAlis: yuvarla(x.alis - x.iade) })).sort((a, b) => b.netAlis - a.netAlis);
    const musteriSatirlari = [...musteriRaporu.values()].map(x => ({ ...x, netSatis: yuvarla(x.satis - x.iade) })).sort((a, b) => b.netSatis - a.netSatis);
    const tedarikciSatirlari = [...tedarikciRaporu.values()].map(x => ({ ...x, netAlis: yuvarla(x.alis - x.iade) })).sort((a, b) => b.netAlis - a.netAlis);
    const temsilciSatirlari = [...temsilciRaporu.values()].map(x => ({ ...x, netSatis: yuvarla(x.satis - x.iade) })).sort((a, b) => b.netSatis - a.netSatis);
    const tahsilatlar = donemCari.filter(x => x.tarafTipi === "MUSTERI" && x.tip === "TAHSILAT" && (!cariOdemeTipi || x.odemeYontemi === cariOdemeTipi));
    const odemeler = donemCari.filter(x => x.tarafTipi === "TEDARIKCI" && x.tip === "ODEME" && (!cariOdemeTipi || x.odemeYontemi === cariOdemeTipi));
    for (const h of tahsilatlar) gun(h.tarih).tahsilat += Number(h.tutar || 0); for (const h of odemeler) gun(h.tarih).odeme += Number(h.tutar || 0); for (const m of masraflar) gun(m.tarih).gider += Number(m.tutar || 0);
    const cariBakiyeler = new Map(); for (const h of cariHareketler) { const key = `${h.tarafTipi}:${h.tarafId}`; const satir = mapTopla(cariBakiyeler, key, { tarafTipi: h.tarafTipi, kod: h.taraf?.kod || "", ad: ad(h.taraf), bakiye: 0 }, { bakiye: cariDegisimi(h) }); satir.bakiye = yuvarla(satir.bakiye); }
    const musteriAlacakSatirlari = [...cariBakiyeler.values()].filter(x => x.tarafTipi === "MUSTERI" && x.bakiye > 0).sort((a, b) => b.bakiye - a.bakiye), tedarikciBorcSatirlari = [...cariBakiyeler.values()].filter(x => x.tarafTipi === "TEDARIKCI" && x.bakiye > 0).sort((a, b) => b.bakiye - a.bakiye);
    const hesapSonrasi = new Map(); for (const h of paraSonrasi) mapTopla(hesapSonrasi, `${h.hesapTipi}:${h.hesapId}`, { net: 0 }, { net: (h.tip === "GIRIS" ? 1 : h.tip === "CIKIS" ? -1 : 0) * h.tutar });
    const hesapSatiri = (x, tip) => ({ kod: x.kod || "", ad: ad(x), sube: x.sube || "", paraBirimi: x.paraBirimi || "TRY", bakiye: yuvarla(Number(x.bakiye || 0) - Number(hesapSonrasi.get(`${tip}:${x._id}`)?.net || 0)) });
    const kasaSatirlari = kasalar.map(x => hesapSatiri(x, "KASA")), bankaSatirlari = bankalar.map(x => hesapSatiri(x, "BANKA"));
    const kategoriMap = new Map(); for (const m of masraflar) mapTopla(kategoriMap, m.kategori, { kategori: m.kategori, kayitSayisi: 0, toplam: 0 }, { kayitSayisi: 1, toplam: m.tutar });
    const giderKategoriSatirlari = [...kategoriMap.values()].sort((a, b) => b.toplam - a.toplam), kritikStokSatirlari = stoklar.filter(x => Number(x.miktar || 0) <= Number(x.urunId?.kritikStok || x.urunId?.minimumStok || 0)).map(x => ({ urunKodu: x.urunId?.kod || "", urun: x.urunId?.ad || "-", depo: x.depoId?.ad || "-", miktar: x.miktar, kritikSeviye: x.urunId?.kritikStok || x.urunId?.minimumStok || 0, stokDegeri: yuvarla(x.miktar * x.maliyet) }));
    const acilisKesimi = new Date(aralik.baslangic.getTime() - 1), donemBasiMalMevcudu = stokDegeriKesim(stoklar, stokHareketleri, acilisKesimi), donemSonuMalMevcudu = stokDegeriKesim(stoklar, stokHareketleri, aralik.bitis);
    const degerler = hesaplamalariTamamla({ donemBasiMalMevcudu, donemSonuMalMevcudu, toplamSatisGeliri: yuvarla(toplamSatisGeliri), satisIadeleri: yuvarla(satisIadeToplami), toplamAlis: yuvarla(toplamAlis), alisIadeleri: yuvarla(alisIadeToplami), digerGelirler: toplam(digerGelirler, "tutar"), toplamGiderler: toplam(masraflar, "tutar") });
    const portfoySatirlari = portfoy.map(x => ({ tur: x.tur, belgeNo: x.belgeNo || "", musteri: ad(x.musteriId), vadeTarihi: x.vadeTarihi ? tarihYaz(x.vadeTarihi) : "", tutar: yuvarla(x.tutar) }));
    const stokDegerSatirlari = stoklar.map(x => ({ urunKodu: x.urunId?.kod || "", urun: x.urunId?.ad || "-", depo: x.depoId?.ad || "-", miktar: x.miktar, maliyet: x.maliyet, deger: yuvarla(x.miktar * x.maliyet) }));
    const satirEsleme = { donemBasiMalMevcudu: stokDegerSatirlari, donemIcindeAlinanMal: alisUrunSatirlari, donemIcindeSatilanMal: urunSatirlari, satilanMalinMaliyeti: urunSatirlari, donemSonuMalMevcudu: stokDegerSatirlari, toplamSatisGeliri: satislar, satisIadeleri, netSatislar: urunSatirlari, toplamAlis: alislar, alisIadeleri, digerGelirler, toplamGiderler: masraflar, brutKar: urunSatirlari, faaliyetKari: giderKategoriSatirlari, netKarZarar: giderKategoriSatirlari, kritikStoklar: kritikStokSatirlari, enCokSatanUrunler: [...urunSatirlari].sort((a, b) => b.netMiktar - a.netMiktar), enCokKarBirakanUrunler: [...urunSatirlari].sort((a, b) => b.kar - a.kar), musteriBazliSatis: musteriSatirlari, tedarikciBazliAlis: tedarikciSatirlari, satisTemsilcisiPerformansi: temsilciSatirlari, tahsilatRaporu: tahsilatlar, odemeRaporu: odemeler, giderKategoriRaporu: giderKategoriSatirlari, musteriAlacaklari: musteriAlacakSatirlari, tedarikciBorclari: tedarikciBorcSatirlari, kasaBakiyesi: kasaSatirlari, bankaBakiyesi: bankaSatirlari, cekSenetPortfoyu: portfoySatirlari, stokDegeri: stokDegerSatirlari };
    const toplamEsleme = { ...degerler, donemIcindeAlinanMal: degerler.toplamAlis, donemIcindeSatilanMal: degerler.toplamSatisGeliri, musteriAlacaklari: toplam(musteriAlacakSatirlari, "bakiye"), tedarikciBorclari: toplam(tedarikciBorcSatirlari, "bakiye"), kasaBakiyesi: toplam(kasaSatirlari, "bakiye"), bankaBakiyesi: toplam(bankaSatirlari, "bakiye"), cekSenetPortfoyu: toplam(portfoySatirlari, "tutar"), stokDegeri: donemSonuMalMevcudu, kritikStoklar: kritikStokSatirlari.length, enCokSatanUrunler: toplam(urunSatirlari, "netMiktar"), enCokKarBirakanUrunler: toplam(urunSatirlari, "kar"), musteriBazliSatis: degerler.netSatislar, tedarikciBazliAlis: degerler.netAlis, satisTemsilcisiPerformansi: degerler.netSatislar, tahsilatRaporu: toplam(tahsilatlar, "tutar"), odemeRaporu: toplam(odemeler, "tutar"), giderKategoriRaporu: degerler.toplamGiderler };
    const raporlar = Object.fromEntries(RAPORLAR.map(([kod, raporAdi]) => [kod, { kod, ad: raporAdi, toplam: yuvarla(toplamEsleme[kod]), satirlar: satirEsleme[kod] || [] }]));
    const ozet = { toplamSatis: degerler.toplamSatisGeliri, netSatis: degerler.netSatislar, toplamAlis: degerler.toplamAlis, tahsilat: toplamEsleme.tahsilatRaporu, odeme: toplamEsleme.odemeRaporu, gider: degerler.toplamGiderler, brutKar: degerler.brutKar, netKarZarar: degerler.netKarZarar, musteriAlacagi: toplamEsleme.musteriAlacaklari, tedarikciBorcu: toplamEsleme.tedarikciBorclari, kasa: toplamEsleme.kasaBakiyesi, banka: toplamEsleme.bankaBakiyesi, stokDegeri: donemSonuMalMevcudu };
    return { meta: { firmaAdi: tenant?.firmaBilgileri?.unvan || tenant?.name || "İşletme", raporAdi: "Profesyonel ERP Rapor Merkezi", donem: aralik, filtreler: { sube, depoId, musteriId, tedarikciId, urunId, marka: query.marka || "", kategori: query.kategori || "", temsilciId, odemeTipi }, olusturulmaTarihi: new Date(), degerlemeYontemi: "Kayıtlı stok ve stok hareketi birim maliyetleri; kârlılıkta KDV hariç net belge tutarları", subeNotu: sube ? "Şube filtresi kasa, banka, para hareketi ve gider hesaplarına uygulanmıştır; satış/alış belgelerinde şube alanı bulunmadığından bu belgelere uygulanmamıştır." : "" }, ozet, degerler, raporlar, donemRaporu: [{ ad: "Dönem Başı Mal Mevcudu", isaret: "", tutar: degerler.donemBasiMalMevcudu }, { ad: "Dönem İçi Net Alış", isaret: "+", tutar: degerler.netAlis }, { ad: "Satılabilir Mal Toplamı", isaret: "=", tutar: yuvarla(degerler.donemBasiMalMevcudu + degerler.netAlis) }, { ad: "Dönem Sonu Mal Mevcudu", isaret: "−", tutar: degerler.donemSonuMalMevcudu }, { ad: "Satılan Malın Maliyeti", isaret: "=", tutar: degerler.satilanMalinMaliyeti }, { ad: "Net Satış", isaret: "", tutar: degerler.netSatislar }, { ad: "Satılan Malın Maliyeti", isaret: "−", tutar: degerler.satilanMalinMaliyeti }, { ad: "Brüt Kâr", isaret: "=", tutar: degerler.brutKar }, { ad: "Diğer Gelirler", isaret: "+", tutar: degerler.digerGelirler }, { ad: "Giderler", isaret: "−", tutar: degerler.toplamGiderler }, { ad: "Net Kâr / Zarar", isaret: "=", tutar: degerler.netKarZarar }], grafikler: { gunluk: [...gunler.values()].sort((a, b) => a.tarih.localeCompare(b.tarih)).map(x => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, k === "tarih" ? v : yuvarla(v)]))), enCokSatan: [...urunSatirlari].sort((a, b) => b.netMiktar - a.netMiktar).slice(0, 10), enCokKar: [...urunSatirlari].sort((a, b) => b.kar - a.kar).slice(0, 10) } };
}

async function profesyonelRapor(tenantId, query = {}) {
    const aralik = tarihAraligi(query), oncekiDonem = karsilastirmaAraligi(query, aralik);
    const [mevcut, onceki] = await Promise.all([raporuHesapla(tenantId, query, aralik), raporuHesapla(tenantId, { ...query, donem: "OZEL", baslangic: undefined, bitis: undefined }, oncekiDonem)]);
    mevcut.karsilastirma = Object.fromEntries(Object.keys(mevcut.ozet).map(k => [k, degisim(mevcut.ozet[k], onceki.ozet[k])]));
    mevcut.karsilastirmaDonemi = onceki.meta.donem;
    return mevcut;
}

module.exports = { RAPORLAR, tarihAraligi, oncekiAralik, karsilastirmaAraligi, hesaplamalariTamamla, filtreSecenekleri, profesyonelRapor, raporuHesapla };
