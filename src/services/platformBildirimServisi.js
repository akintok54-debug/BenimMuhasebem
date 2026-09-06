const mongoose = require("mongoose");
const schema = new mongoose.Schema({ _id: String, nextAt: Date, acceptedAt: Date, status: String }, { versionKey: false });
const Delivery = mongoose.models.PlatformAlertDelivery || mongoose.model("PlatformAlertDelivery", schema);

function durum() {
    return {
        emailConfigured: !!(process.env.PLATFORM_ALERT_EMAIL && process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL),
        whatsappRecipientSaved: !!process.env.PLATFORM_ALERT_WHATSAPP,
        whatsappConfigured: false
    };
}

async function bildir(olay) {
    if (!durum().emailConfigured || mongoose.connection.readyState !== 1) return { status: "NOT_CONFIGURED" };
    const categories = ["API_HATASI", "TARAYICI_HATASI", "VERI_TUTARLILIK", "SISTEM_CALISMA_HATASI", "SUPHELI_GIRIS", "SISTEM_GUVENLIK"];
    if (!categories.includes(olay.category) && olay.severity !== "KRITIK") return { status: "SKIPPED" };
    if (olay.details?.source === "ANONYMOUS_CLIENT_REPORTED") return { status: "SKIPPED" };
    // One shared database lease prevents notification storms across serverless instances.
    const now = new Date();
    try {
        const claim = await Delivery.findOneAndUpdate({ _id: "email", $or: [{ nextAt: { $lte: now } }, { nextAt: { $exists: false } }] },
            { $set: { nextAt: new Date(+now + 300000), status: "SENDING" } }, { upsert: true, new: true });
        if (!claim) return { status: "THROTTLED" };
    } catch (error) { if (error.code === 11000) return { status: "THROTTLED" }; throw error; }
    try {
        const response = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST", signal: AbortSignal.timeout(8000),
            headers: { "api-key": process.env.BREVO_API_KEY, "Content-Type": "application/json", accept: "application/json" },
            body: JSON.stringify({
                sender: { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || "BenimMuhasebe" },
                to: [{ email: process.env.PLATFORM_ALERT_EMAIL }], subject: "BenimMuhasebe sistem uyarısı",
                textContent: `Sistemde kontrol gerektiren bir olay kaydedildi.\nKategori: ${categories.includes(olay.category) ? olay.category : "KRITIK"}\nSeviye: ${olay.severity === "KRITIK" ? "KRITIK" : "UYARI"}\nTarih: ${now.toISOString()}\nAyrıntılar: https://www.benimmuhasebe.com/platform/\n\nGüvenlik için müşteri verileri ve hata ayrıntıları e-postaya eklenmez. Bildirimler en fazla 5 dakikada bir gönderilir; tüm kayıtları panelden kontrol edin.`,
                tags: ["platform-alert"]
            })
        });
        if (!response.ok) throw new Error("ALERT_PROVIDER_REJECTED");
        await Delivery.updateOne({ _id: "email" }, { $set: { status: "PROVIDER_ACCEPTED", acceptedAt: new Date() } });
        return { status: "PROVIDER_ACCEPTED" };
    } catch (_) {
        await Delivery.updateOne({ _id: "email" }, { $set: { status: "FAILED", nextAt: new Date(Date.now() + 60000) } });
        return { status: "FAILED" };
    }
}
module.exports = { bildir, durum };
