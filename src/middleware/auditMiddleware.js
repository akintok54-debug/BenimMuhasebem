const { kaydet } = require("../modules/platform/services/auditServisi");
const { alarmGonder } = require("../services/guvenlikAlarmServisi");

const kritikParcalar = ["/login", "/users", "/satis", "/alis", "/cari", "/finans", "/stok", "/hesap", "/ayarlar", "/teklif", "/siparis", "/paylasim", "/subscriptions", "/tenant-yetki", "/personel"];
function auditMiddleware(req, res, next) {
    const baslangic = Date.now();
    res.on("finish", () => {
        const path = req.originalUrl.split("?")[0];
        const guvenlik = res.locals.guvenlikOlayi;
        const kaydaDeger = guvenlik || res.statusCode >= 500 || res.statusCode === 401 || res.statusCode === 403 || req.method === "DELETE" || (req.method !== "GET" && kritikParcalar.some(x => path.includes(x)));
        if (!kaydaDeger) return;
        const category = guvenlik?.kategori || (path.includes("/login") && res.statusCode === 429 ? "SUPHELI_GIRIS" : path.includes("/login") ? "GIRIS" : res.statusCode >= 500 ? "API_HATASI" : res.statusCode === 401 || res.statusCode === 403 ? "YETKISIZ_ERISIM" : "KRITIK_ISLEM");
        const olay = {
            req,
            action: `${req.method} ${path}`,
            resource: path.split("/").filter(Boolean).slice(-2, -1)[0] || "system",
            resourceId: req.params?.id || req.params?.musteriId || null,
            category,
            severity: guvenlik?.seviye || (res.statusCode >= 500 ? "KRITIK" : res.statusCode >= 400 ? "UYARI" : "BILGI"),
            success: res.statusCode < 400,
            httpStatus: res.statusCode,
            details: { sureMs: Date.now() - baslangic }
        };
        setImmediate(async () => { try { await kaydet(olay); if (olay.severity === "KRITIK" || ["SUPHELI_GIRIS", "BANKA_ENTEGRASYON", "SISTEM_GUVENLIK"].includes(olay.category)) await alarmGonder({ ...olay, requestId: req.id }); } catch (error) { console.error("AUDIT_ALARM_HATASI", { requestId: req.id, message: error.message }); } });
    });
    next();
}

module.exports = auditMiddleware;
