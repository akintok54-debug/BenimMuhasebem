// Existing ERP order convention: unit prices exclude VAT.
function hesapla(kalemler) {
    let araToplam = 0, toplamKdv = 0, genelToplam = 0;
    const sonuc = kalemler.map(k => {
        const brut = k.miktar * k.birimFiyat;
        const net = brut - brut * k.iskonto / 100;
        const kdvTutari = net * k.kdv / 100;
        araToplam += net; toplamKdv += kdvTutari; genelToplam += net + kdvTutari;
        return { ...k, araToplam: net, kdvTutari, toplam: net + kdvTutari };
    });
    return { kalemler: sonuc, araToplam, toplamKdv, genelToplam };
}
module.exports = { hesapla };
