const round = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const id = x => String(x?._id || x || "");
function cariEtki(h) {
    if (h.bakiyeDegisimi != null) return Number(h.bakiyeDegisimi);
    if (h.oncekiBakiye != null && h.sonrakiBakiye != null) return Number(h.sonrakiBakiye) - Number(h.oncekiBakiye);
    const yon = h.tarafTipi === "MUSTERI" ? { BORC: 1, ODEME: 1, TAHSILAT: -1, IADE: -1, ALACAK: -1 } : { ALACAK: 1, TAHSILAT: 1, ODEME: -1, IADE: -1, BORC: -1 };
    return (yon[h.tip] || 0) * Number(h.tutar || 0);
}
// Anchor to the same stored balance used by the customer/supplier screen.
// Rewind dated movements, including a cancellation's separate effective date.
function cariBakiyeSatirlari(kartlar, hareketler, tarafTipi, bitis) {
    const sonrasi = new Map();
    for (const h of hareketler) {
        if (h.tarafTipi !== tarafTipi) continue;
        const etki = cariEtki(h);
        let fark = new Date(h.tarih) > bitis ? etki : 0;
        if (h.durum === "IPTAL") {
            if (!h.iptalTarihi) continue;
            if (new Date(h.iptalTarihi) > bitis) fark -= etki;
        }
        sonrasi.set(id(h.tarafId), (sonrasi.get(id(h.tarafId)) || 0) + fark);
    }
    return kartlar.filter(x => !x.createdAt || new Date(x.createdAt) <= bitis).map(x => ({ tarafTipi, kod: x.kod || "", ad: x.unvan || x.adSoyad || "-", bakiye: round(Number(x.bakiye || 0) - (sonrasi.get(id(x)) || 0)) }));
}
function kalemNet(k) {
    if (k.araToplam != null) return Number(k.araToplam);
    if (k.toplam != null) return Number(k.toplam) / (1 + Number(k.kdv || 0) / 100);
    return Number(k.miktar || 0) * Number(k.birimFiyat || 0) * (1 - Number(k.iskonto || 0) / 100);
}
function belgeNet(b, kalemler, kisitli) {
    return !kisitli && b.araToplam != null ? Number(b.araToplam) : kalemler.reduce((n, k) => n + kalemNet(k), 0);
}
function stokTarihSatirlari(stoklar, hareketler, tarih, once = false, guvenilir = false) {
    const satirlar = new Map(stoklar.map(s => [`${id(s.urunId)}:${id(s.depoId)}`, { urunKodu: s.urunId?.kod || "", urun: s.urunId?.ad || "-", depo: s.depoId?.ad || "-", miktar: Number(s.miktar || 0), deger: 0 }]));
    for (const h of hareketler) {
        const key = `${id(h.urunId)}:${id(h.depoId)}`;
        if (!satirlar.has(key)) satirlar.set(key, { urunKodu: "", urun: id(h.urunId), depo: id(h.depoId), miktar: 0, deger: 0 });
        const s = satirlar.get(key), d = new Date(h.tarih || h.createdAt);
        const yon = ["GIRIS", "SAYIM_ARTI", "IADE_GIRIS", "TRANSFER_GIRIS", "DEVIR_GIRIS"].includes(h.tip) ? 1 : -1;
        const dahil = once ? d < tarih : d <= tarih;
        if (!dahil) s.miktar -= yon * Number(h.miktar || 0);
        else s.deger += yon * Number(h.miktar || 0) * Number(h.birimMaliyet || 0);
    }
    return [...satirlar.values()].map(s => ({ ...s, miktar: Math.round(s.miktar * 10000) / 10000, deger: guvenilir ? round(s.deger) : null }));
}
function raporKapsami(kod, bitis) {
    const stok = ["sube", "depoId", "urunId", "marka", "kategori"];
    const satis = [...stok, "musteriId", "temsilciId", "odemeTipi"];
    const alis = [...stok, "tedarikciId", "odemeTipi"];
    if (kod === "musteriAlacaklari" || kod === "tedarikciBorclari") return { filtreAlanlari: [kod === "musteriAlacaklari" ? "musteriId" : "tedarikciId"], aciklama: `${bitis} itibarıyla cari kart bakiyesi. Önceki dönem bakiyeleri dahildir; yalnızca pozitif alacak/borçlar listelenir. Avanslar diğer hesapların alacağından düşülmez.` };
    if (["kasaBakiyesi", "bankaBakiyesi"].includes(kod)) return { filtreAlanlari: ["sube"], aciklama: `${bitis} itibarıyla kayıtlı hesap bakiyesi; sonraki para hareketleri geri alınmıştır.` };
    if (kod === "cekSenetPortfoyu") return { filtreAlanlari: ["musteriId"], aciklama: "Güncel çek/senet portföyü. Kayıtlarda geçmiş durum zaman çizelgesi bulunmadığından güncel durum gösterilir." };
    if (kod === "tahsilatRaporu" || kod === "odemeRaporu") return { filtreAlanlari: [kod === "tahsilatRaporu" ? "musteriId" : "tedarikciId", ...(kod === "tahsilatRaporu" ? ["temsilciId"] : []), "odemeTipi"], aciklama: "Seçilen dönemdeki aktif cari tahsilat/ödeme kayıtları; iptal edilmiş işlemler hariçtir." };
    if (["stokMevcudu", "stokDegeri", "kritikStoklar"].includes(kod)) return { filtreAlanlari: stok, aciklama: "Güncel stok kartları. Tarih aralığından bağımsız mevcut miktarlar gösterilir; geçmiş için Dönem Başı/Sonu Stok raporunu kullanın." };
    if (["donemBasiMalMevcudu", "donemSonuMalMevcudu", "stokHareketleri"].includes(kod)) return { filtreAlanlari: stok, aciklama: "Seçilen tarihteki stok hareketleri ve kayıtlı işlem maliyetleri. Doğrulanamayan geçmiş değerler hesaplanamadı olarak gösterilir." };
    if (["toplamAlis", "alisIadeleri", "tedarikciBazliAlis", "donemIcindeAlinanMal"].includes(kod)) return { filtreAlanlari: kod === "alisIadeleri" ? alis.filter(x => x !== "odemeTipi") : alis, aciklama: "Aktif alış/iade belgelerinin kayıtlı KDV hariç net tutarı; ürün filtresinde yalnızca eşleşen kalemler." };
    if (["toplamGiderler", "giderKategoriRaporu", "digerGelirler", "faaliyetKari", "netKarZarar", "gelirGider", "donemRaporu"].includes(kod)) return { filtreAlanlari: ["sube"], aciklama: "Aktif dönem belgeleri, giderler ve manuel gelir kayıtları. Manuel kasa girişleri Diğer Gelirler kapsamındadır; kayıtların işlem niteliği kontrol edilmelidir." };
    return { filtreAlanlari: satis, aciklama: "Aktif satış/iade belgelerinin KDV hariç net tutarları ve aynı satışlara bağlı kayıtlı çıkış maliyetleri." };
}
module.exports = { cariEtki, cariBakiyeSatirlari, kalemNet, belgeNet, stokTarihSatirlari, raporKapsami };
