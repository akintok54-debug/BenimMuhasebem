function ibanGecerli(value) {
    const iban = String(value || '').replace(/\s/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban) || iban.startsWith('TR') && iban.length !== 26) return false;
    let remainder = 0;
    for (const char of iban.slice(4) + iban.slice(0,4)) {
        const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
        for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
    }
    return remainder === 1;
}
function yayinlanabilir(bank) {
    return Boolean(bank && bank.aktif !== false && bank.demo !== true && ibanGecerli(bank.iban)
        && !/^(test|demo|örnek|ornek|sahte)(?:\s|$)/i.test(String(bank.bankaAdi || '').trim()));
}
module.exports = { ibanGecerli, yayinlanabilir };
