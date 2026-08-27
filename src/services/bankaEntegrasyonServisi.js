class BankaEntegrasyonServisi {
    constructor(provider) { this.provider = provider; }
    yetkilendirmeAdresi() { throw new Error("Banka sağlayıcısı yapılandırılmadı."); }
    async koduTokenaCevir() { throw new Error("Banka sağlayıcısı yapılandırılmadı."); }
    async tokenYenile() { throw new Error("Banka sağlayıcısı yapılandırılmadı."); }
    async hesaplariGetir() { throw new Error("Banka sağlayıcısı yapılandırılmadı."); }
    async hareketleriGetir() { throw new Error("Banka sağlayıcısı yapılandırılmadı."); }
}

function bankaKimlikBilgisiDogrula(body = {}) {
    const yasak = ["kullaniciAdi", "username", "password", "parola", "internetBankaciligiSifresi"];
    if (yasak.some(key => body[key])) throw Object.assign(new Error("İnternet bankacılığı kullanıcı adı veya parolası kabul edilmez. OAuth/API yetkilendirmesi kullanın."), { status: 400 });
    return true;
}

module.exports = { BankaEntegrasyonServisi, bankaKimlikBilgisiDogrula };
