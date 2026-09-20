(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ERPFiyat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const alanlar = { SATIS: 'satisFiyati', BAYI: 'bayiFiyati', PERAKENDE: 'perakendeFiyati', ALIS: 'alisFiyati' };
    const hata = message => Object.assign(new Error(message), { status: 400 });
    function sayi(value, name, min = 0, max = 1e12) {
        if (value === null || value === '' || typeof value === 'boolean') throw hata(name + ' geçersiz.');
        const n = Number(value);
        if (!Number.isFinite(n) || n < min || n > max) throw hata(name + ' geçersiz.');
        return n;
    }
    const yuvarla = n => Math.round((n + Number.EPSILON) * 100) / 100;
    function fiyatSec(urun, tur = 'SATIS') {
        if (!alanlar[tur]) throw hata('Fiyat türü geçersiz.');
        const value = sayi(urun[alanlar[tur]] ?? 0, 'Fiyat');
        return ['BAYI', 'PERAKENDE'].includes(tur) && value === 0 ? sayi(urun.satisFiyati ?? 0, 'Satış fiyatı') : value;
    }
    function kdvHaric(tutar, oran) { return sayi(tutar, 'Fiyat') / (1 + sayi(oran, 'KDV', 0, 100) / 100); }
    function kdvDahil(tutar, oran) { return yuvarla(sayi(tutar, 'Fiyat') * (1 + sayi(oran, 'KDV', 0, 100) / 100)); }
    function kalem(k) {
        const miktar = sayi(k.miktar, 'Miktar', 0.000001, 1e9), kdv = sayi(k.kdv ?? 20, 'KDV', 0, 100);
        const iskonto = sayi(k.iskonto ?? 0, 'İskonto', 0, 100);
        const birimFiyat = k.kdvDahil === true ? kdvHaric(k.birimFiyat, kdv) : sayi(k.birimFiyat === undefined ? 0 : k.birimFiyat, 'Birim fiyat');
        const brutToplam = yuvarla(miktar * birimFiyat), araToplam = yuvarla(miktar * birimFiyat * (1 - iskonto / 100));
        const kdvTutari = yuvarla(araToplam * kdv / 100);
        return { ...k, miktar, birimFiyat, kdv, iskonto, kdvDahil: false, brutToplam, iskontoTutari: yuvarla(brutToplam - araToplam), araToplam, kdvTutari, toplam: yuvarla(araToplam + kdvTutari) };
    }
    function hesapla(kalemler) {
        const rows = kalemler.map(kalem);
        const sum = field => yuvarla(rows.reduce((n, r) => n + r[field], 0));
        return { kalemler: rows, araToplam: sum('araToplam'), toplamKdv: sum('kdvTutari'), genelToplam: sum('toplam') };
    }
    function aktif(c, now = new Date()) { return c.aktif === true && +new Date(c.baslangic) <= +now && +now < +new Date(c.bitis); }
    function fiyatlandir(urun, musteri = {}, grup = null, kampanyalar = [], now = new Date(), tur) {
        tur ||= musteri.b2b?.musteriTipi === 'PERAKENDE' ? 'PERAKENDE' : 'BAYI';
        let net = fiyatSec(urun, tur), kaynak = alanlar[tur];
        if (tur === 'BAYI') {
            const ozel = musteri.b2b?.fiyatlar?.find(x => String(x.urunId) === String(urun._id));
            const grupOzel = grup?.fiyatlar?.find(x => String(x.urunId) === String(urun._id));
            if (ozel || grupOzel) { net = sayi((ozel || grupOzel).fiyat, 'Özel fiyat'); kaynak = ozel ? 'MUSTERI' : 'GRUP'; }
            else { net = yuvarla(net * (1 - sayi(grup?.iskonto ?? 0, 'Grup iskontosu', 0, 100) / 100)); }
        }
        const onceki = net, etiketler = new Set(); let kampanya = null;
        for (const c of kampanyalar) {
            if (!aktif(c, now) || c.tur === 'REKLAM' || !(c.fiyatTurleri || ['BAYI']).includes(tur)) continue;
            if (c.musteriIds?.length && !c.musteriIds.some(id => String(id) === String(musteri._id))) continue;
            if (c.urunIds?.length && !c.urunIds.some(id => String(id) === String(urun._id))) continue;
            if (c.kategori && c.kategori !== urun.kategori || c.marka && c.marka !== urun.marka) continue;
            etiketler.add(c.tur);
            const yeni = yuvarla(onceki * (1 - sayi(c.indirimOrani ?? 0, 'Kampanya indirimi', 0, 100) / 100));
            if (yeni < net) { net = yeni; kampanya = { id: String(c._id), baslik: c.baslik, bitis: c.bitis }; }
        }
        if (net < onceki) etiketler.add('INDIRIMLI');
        return { netFiyat: net, kdvDahilFiyat: kdvDahil(net, urun.kdv ?? 20), eskiFiyat: net < onceki ? onceki : null,
            eskiKdvDahilFiyat: net < onceki ? kdvDahil(onceki, urun.kdv ?? 20) : null,
            kdv: Number(urun.kdv ?? 20), fiyatKdvDahil: false, fiyatTuru: tur, fiyatKaynagi: kaynak, kampanya, etiketler: [...etiketler] };
    }
    return { alanlar, sayi, yuvarla, fiyatSec, kdvHaric, kdvDahil, kalem, hesapla, aktif, fiyatlandir };
});
