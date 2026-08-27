async function sifreSifirlamaEpostasiGonder({ email, adSoyad, resetUrl }) {
    const apiKey = String(process.env.RESEND_API_KEY || "").trim();
    const from = String(process.env.PASSWORD_RESET_EMAIL_FROM || "").trim();
    if (!apiKey || !from) return { gonderildi: false, neden: "EPOSTA_YAPILANDIRILMADI" };

    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            from,
            to: [email],
            subject: "BenimMuhasebe parola yenileme",
            html: `<p>Merhaba ${html(adSoyad || "")},</p><p>Parolanızı yenilemek için aşağıdaki bağlantıyı kullanın. Bağlantı 20 dakika geçerlidir ve yalnızca bir kez kullanılabilir.</p><p><a href="${html(resetUrl)}">Parolamı yenile</a></p><p>Bu isteği siz yapmadıysanız e-postayı dikkate almayın.</p>`
        })
    });
    if (!response.ok) throw new Error(`E-posta servisi ${response.status} yanıtı verdi.`);
    return { gonderildi: true };
}

function html(value) {
    return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

module.exports = { sifreSifirlamaEpostasiGonder };
