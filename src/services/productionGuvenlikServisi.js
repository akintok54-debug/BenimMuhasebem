function productionGuvenlikDogrula() {
    if (process.env.NODE_ENV !== "production") return { production: false };
    const hatalar = [], uri = String(process.env.MONGODB_URI || "");
    if (!(uri.startsWith("mongodb+srv://") || /[?&]tls=true(?:&|$)/i.test(uri))) hatalar.push("MongoDB TLS zorunlu olmalıdır.");
    if (String(process.env.JWT_SECRET || "").length < 32) hatalar.push("JWT_SECRET en az 32 karakter olmalıdır.");
    if (hatalar.length) throw new Error(`Production güvenlik kontrolü başarısız: ${hatalar.join(" ")}`);

    const opsiyonelEksikler = ["ENCRYPTION_KEY", "BACKUP_ENCRYPTION_KEY", "REDIS_URL", "SECURITY_ALERT_WEBHOOK", "CORS_ORIGINS"]
        .filter(key => !process.env[key]);
    if (opsiyonelEksikler.length) {
        console.warn(`PRODUCTION_GUVENLIK_UYARISI: Opsiyonel güvenlik ayarları eksik; ilgili özellikler güvenli fallback ile çalışacak: ${opsiyonelEksikler.join(", ")}`);
    }
    if (process.env.JWT_ALLOW_LEGACY !== "false") {
        console.warn("PRODUCTION_GUVENLIK_UYARISI: Eski Bearer JWT geçiş desteği açık. Geçiş tamamlanınca JWT_ALLOW_LEGACY=false yapın.");
    }

    return {
        production: true,
        tls: true,
        redis: !!process.env.REDIS_URL,
        securityAlertWebhook: !!process.env.SECURITY_ALERT_WEBHOOK,
        encryption: String(process.env.ENCRYPTION_KEY || "").length >= 32,
        backupEncryption: String(process.env.BACKUP_ENCRYPTION_KEY || "").length >= 32,
        legacyJwt: process.env.JWT_ALLOW_LEGACY !== "false"
    };
}
module.exports = { productionGuvenlikDogrula };
