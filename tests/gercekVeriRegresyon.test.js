const test = require('node:test');
const assert = require('node:assert/strict');
const tenantId = '6a8dc53a3ff8c8a32ff9545b';
test('yeni sipariş sıfır olsa da kaydedilmiş mükerrer sipariş kontrolü başarılıdır', () => {
    const { pilotDurumu } = require('../src/services/entegrasyonDogrulamaServisi');
    const stages = ['CONNECTION', 'SKU_BARCODE_MATCH', 'STOCK_UPDATE_ONE', 'PRICE_UPDATE_ONE', 'DUPLICATE_ORDER', 'TENANT_ISOLATION'].map(step => ({ step, success: true }));
    stages.push({ step: 'PRODUCT_PULL_5', success: 5, processed: 5, errors: 0, unmatched: 0 }, { step: 'ORDER_PULL', success: 0, processed: 2, duplicates: 2, errors: 0 });
    const connection = { pilotStatus: 'PARTIAL', pilotResults: { stages } };
    assert.equal(pilotDurumu(connection), 'SUCCESS');
    stages.find(x => x.step === 'ORDER_PULL').errors = 1;
    assert.equal(pilotDurumu(connection), 'PARTIAL');
});
function sorgu(value) { return { select() { return this; }, populate() { return this; }, lean: async () => value }; }
test('iptal pazaryeri siparişi ciroya girmez; hakediş verisi yoksa tutar üretilmez', async () => {
    const replacements = [];
    const set = (name, method, fn) => { const model = require('../src/models/' + name); replacements.push(() => model[method] = eski); const eski = model[method]; model[method] = fn; };
    try {
        set('EticaretSiparis', 'find', () => sorgu([{ durum: 'IPTAL', toplam: 1100 }, { durum: 'ALINDI', toplam: 200 }]));
        set('EticaretSiparis', 'countDocuments', async () => 0);
        for (const n of ['MarketplaceReturn', 'MarketplaceFinanceTransaction', 'IncomingDocument']) set(n, 'find', () => sorgu([]));
        for (const n of ['IntegrationError', 'IntegrationConnection']) set(n, 'countDocuments', async () => 0);
        let result;
        await require('../src/controllers/eticaretMerkeziController').dashboard({ query: {}, tenantId, user: { tenantId } }, { json: x => result = x }, e => { throw e; });
        assert.equal(result.cards.pazaryeriCirosu, 200);
        assert.equal(result.cards.netHakedis, null);
        assert.equal(result.cards.pazaryeriKomisyonlari, null);
    } finally { replacements.reverse().forEach(f => f()); }
});
test('IdeaSoft geçersiz ürün yanıtını başarılı bağlantı saymaz', async () => {
    const Adapter = require('../src/integrations/marketplace/IdeaSoftAdapter');
    const a = new Adapter({ apiBaseUrl: 'https://example.myideasoft.com' }, {});
    a.pullProducts = async () => ({});
    await assert.rejects(a.testConnection(), { code: 'PROVIDER_ERROR' });
    a.pullProducts = async () => [];
    assert.equal((await a.testConnection()).connected, true);
});
test('saha teslim hesabı sıfır ödemeyi ve banka masrafını nakit saymaz', async () => {
    const replacements = [];
    const set = (name, method, value) => { const model = require('../src/models/' + name), eski = model[method]; replacements.push(() => model[method] = eski); model[method] = () => sorgu(value); };
    try {
        set('SahaGun', 'findOne', null);
        set('Satis', 'find', [{ genelToplam: 100, odenenTutar: 0, odemeTipi: 'NAKIT' }, { genelToplam: 500, odenenTutar: 500, odemeTipi: 'NAKIT' }]);
        set('SatisIade', 'find', []);
        set('Masraf', 'find', [{ tutar: 50, hesapTipi: 'KASA' }, { tutar: 200, hesapTipi: 'BANKA' }]);
        set('CariHareket', 'find', []);
        const sonuc = await require('../src/controllers/sahaController').tesellumHesapla({ tenantId, currentUser: { _id: tenantId } }, tenantId, '2026-09-06');
        assert.equal(sonuc.nakit, 500);
        assert.equal(sonuc.teslimEdilmesiGereken, 450);
        assert.equal(sonuc.masraflar.toplam, 250);
    } finally { replacements.reverse().forEach(f => f()); }
});
