async function tenantAsistan({
    tenantId,
    kullaniciId,
    mesaj,
    context = {}
}) {
    if (!tenantId) {
        throw new Error("tenantId zorunludur.");
    }

    if (!mesaj || !mesaj.trim()) {
        throw new Error("AI mesajı boş olamaz.");
    }

    /*
     * AI sağlayıcısı burada bağlanacaktır.
     *
     * Kritik güvenlik kuralı:
     * AI hiçbir zaman doğrudan veritabanına sınırsız erişmeyecek.
     * Önce yetki kontrolü ve tenant izolasyonu yapılacak.
     */

    return {
        tenantId,
        kullaniciId,
        cevap: "AI asistan altyapısı hazır. AI sağlayıcısı yapılandırılması bekleniyor.",
        context
    };
}

module.exports = { tenantAsistan };
