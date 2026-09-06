require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const { raporuHesapla } = require('../src/services/profesyonelRaporServisi');
const Musteri = require('../src/models/Musteri');
const Tedarikci = require('../src/models/Tedarikci');
const alanlar = { toplamSatisGeliri: 'netTutar', satisIadeleri: 'netTutar', toplamAlis: 'netTutar', alisIadeleri: 'netTutar', netSatislar: 'netSatis', musteriBazliSatis: 'netSatis', tedarikciBazliAlis: 'netAlis', satisTemsilcisiPerformansi: 'netSatis', musteriAlacaklari: 'bakiye', tedarikciBorclari: 'bakiye', kasaBakiyesi: 'bakiye', bankaBakiyesi: 'bakiye', tahsilatRaporu: 'tutar', odemeRaporu: 'tutar', toplamGiderler: 'tutar', digerGelirler: 'tutar', giderKategoriRaporu: 'toplam', satilanMalinMaliyeti: 'maliyet', brutKar: 'kar', enCokKarBirakanUrunler: 'kar', enCokSatanUrunler: 'netMiktar', stokMevcudu: 'miktar', stokDegeri: 'deger', donemBasiMalMevcudu: 'deger', donemSonuMalMevcudu: 'deger', cekSenetPortfoyu: 'tutar', faaliyetKari: 'tutar', netKarZarar: 'tutar', gelirGider: 'tutar', donemIcindeAlinanMal: 'alis', donemIcindeSatilanMal: 'netSatis' };
async function main() {
    const value = process.argv[2];
    if (!mongoose.Types.ObjectId.isValid(value || '')) throw new Error('Tenant kimliği zorunludur. Salt okunur çalışır.');
    const tenantId = new mongoose.Types.ObjectId(value);
    await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, serverSelectionTimeoutMS: 10000 });
    const rapor = await raporuHesapla(tenantId);
    const kontroller = Object.entries(rapor.raporlar).map(([kod, r]) => {
        if (r.toplam === null) return { kod, durum: 'EKSIK_KAYNAK', toplam: null };
        const alan = alanlar[kod];
        const satirToplami = alan ? r.satirlar.reduce((n, x) => n + Number(x[alan] || 0), 0) : r.satirlar.length;
        const fark = Math.round((r.toplam - satirToplami) * 100) / 100;
        return { kod, durum: Math.abs(fark) <= 0.02 ? 'UYUMLU' : 'UYUMSUZ', toplam: r.toplam, fark };
    });
    const kartKontrolleri = [];
    for (const [Model, kod] of [[Musteri, 'musteriAlacaklari'], [Tedarikci, 'tedarikciBorclari']]) {
        const kartlar = await Model.find({ tenantId }).select('bakiye').lean();
        const toplam = Math.round(kartlar.reduce((n, x) => n + Math.max(0, Math.round(Number(x.bakiye || 0) * 100) / 100), 0) * 100) / 100;
        kartKontrolleri.push({ kod, kartToplami: toplam, raporToplami: rapor.raporlar[kod].toplam, uyumlu: Math.abs(toplam - rapor.raporlar[kod].toplam) <= 0.02 });
    }
    console.log(JSON.stringify({ saltOkunur: true, tarih: new Date(), raporSayisi: kontroller.length, kontroller, kartKontrolleri, kaynakUyarilari: rapor.meta.maliyetDurumu.uyarilar }, null, 2));
    if (kontroller.some(x => x.durum === 'UYUMSUZ') || kartKontrolleri.some(x => !x.uyumlu)) process.exitCode = 2;
}
main().catch(e => { console.error(e.name, 'Rapor auditi tamamlanamadı.'); process.exitCode = 1; }).finally(() => mongoose.disconnect());
