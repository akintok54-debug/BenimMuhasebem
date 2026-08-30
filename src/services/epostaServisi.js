function html(value) {
    return String(value).replace(/[&<>"']/g, karakter => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[karakter]));
}

function parolaEpostasiHtml(adSoyad, resetUrl) {
    return `<p>Merhaba ${html(adSoyad || "")},</p><p>Parolanızı yenilemek için aşağıdaki bağlantıyı kullanın. Bağlantı 20 dakika geçerlidir ve yalnızca bir kez kullanılabilir.</p><p><a href="${html(resetUrl)}">Parolamı yenile</a></p><p>Bu isteği siz yapmadıysanız e-postayı dikkate almayın.</p>`;
}

async function brevoIleGonder({ email, adSoyad, resetUrl, apiKey }) {
    const senderEmail = String(process.env.BREVO_SENDER_EMAIL || "").trim();
    const senderName = String(process.env.BREVO_SENDER_NAME || "BenimMuhasebe").trim();
    if (!senderEmail) return { gonderildi: false, neden: "BREVO_GONDEREN_EKSIK" };
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": apiKey, accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({
            sender: { name: senderName, email: senderEmail },
            to: [{ email, name: adSoyad || undefined }],
            subject: "BenimMuhasebe parola yenileme",
            htmlContent: parolaEpostasiHtml(adSoyad, resetUrl),
            tags: ["password-reset"]
        })
    });
    if (!response.ok) throw new Error(`Brevo e-posta servisi ${response.status} yanıtı verdi.`);
    return { gonderildi: true, saglayici: "BREVO" };
}

async function resendIleGonder({ email, adSoyad, resetUrl, apiKey, from }) {
    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [email], subject: "BenimMuhasebe parola yenileme", html: parolaEpostasiHtml(adSoyad, resetUrl) })
    });
    if (!response.ok) throw new Error(`Resend e-posta servisi ${response.status} yanıtı verdi.`);
    return { gonderildi: true, saglayici: "RESEND" };
}

async function sifreSifirlamaEpostasiGonder({ email, adSoyad, resetUrl }) {
    const brevoApiKey = String(process.env.BREVO_API_KEY || "").trim();
    if (brevoApiKey) return brevoIleGonder({ email, adSoyad, resetUrl, apiKey: brevoApiKey });
    const resendApiKey = String(process.env.RESEND_API_KEY || "").trim();
    const from = String(process.env.PASSWORD_RESET_EMAIL_FROM || "").trim();
    if (resendApiKey && from) return resendIleGonder({ email, adSoyad, resetUrl, apiKey: resendApiKey, from });
    return { gonderildi: false, neden: "EPOSTA_YAPILANDIRILMADI" };
}

module.exports = { sifreSifirlamaEpostasiGonder, parolaEpostasiHtml };
