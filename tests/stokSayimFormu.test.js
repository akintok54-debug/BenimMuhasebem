const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/erp/erp.js'), 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('    function stokSayimKalemleriniOku('), source.indexOf('    function stokSayimPaneli(')), context);
function row(value) {
    const input = { value, focus() { this.focused = true; } };
    return { hidden: true, dataset: { urun: 'u1' }, cells: [{ textContent: 'URUN1' }], input, querySelector() { return input; } };
}
test('sayımda boş, negatif ve geçersiz miktar APIye gönderilmeden ürün adıyla reddedilir', () => {
    for (const value of ['', ' ', '-3', 'NaN']) {
        const r = row(value);
        assert.throws(() => context.stokSayimKalemleriniOku({ querySelectorAll: () => [r] }), /URUN1: Gerçek sayılan miktarı girin/);
        assert.equal(r.hidden, false);
        assert.equal(r.input.focused, true);
    }
});
test('sayımda açıkça girilen sıfır ve küsuratlı miktar korunur', () => {
    const result = context.stokSayimKalemleriniOku({ querySelectorAll: () => [row('0'), row('1.25')] });
    assert.equal(result[0].sayilanMiktar, 0);
    assert.equal(result[1].sayilanMiktar, 1.25);
});
