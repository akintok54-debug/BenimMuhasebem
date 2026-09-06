const mongoose = require("mongoose");
const crypto = require("crypto");
const Tenant = require("../models/Tenant");
const Subscription = require("../models/TenantSubscription");
const Plan = require("../models/Plan");
const User = require("../../../models/Kullanici");
const Depo = require("../../../models/Depo");
const Connection = require("../../../models/IntegrationConnection");
const Job = require("../../../models/IntegrationSyncJob");
const Mapping = require("../../../models/MarketplaceProductMapping");
const IntegrationError = require("../../../models/IntegrationError");
const Audit = require("../models/PlatformAuditLog");
const Support = require("../models/PlatformSupportSession");
const Session = require("../models/PlatformSession");
const Resolution = require("../models/PlatformErrorResolution");
const { kimlik, maskele } = require("../services/platformGuvenligi");
const { kaydet } = require("../services/auditServisi");
const { sifreSifirlamaEpostasiGonder } = require("../../../services/epostaServisi");

const endpoint = fn => async (req, res, next) => {
    try { res.set("Cache-Control", "private, no-store"); await fn(req, res); }
    catch (error) { if (error.status) return res.status(error.status).json({ basarili: false, mesaj: error.message }); next(error); }
};
function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
const actor = req => req.currentUser._id;

async function firmaDetayi(id) {
    const [tenant, subscription, users, depolar, sessions] = await Promise.all([
        Tenant.findById(id).lean(), Subscription.findOne({ tenantId: id }).sort({ createdAt: -1 }).populate("planId").lean(),
        User.find({ tenantId: id, silinmeTarihi: null }).select("adSoyad email rol aktif hesapDurumu sonGirisTarihi ikiFaktor.etkin").lean(),
        Depo.find({ tenantId: id }).select("ad kod sube aktif").lean(),
        Session.find({ tenantId: id, closedAt: null, expiresAt: { $gt: new Date() } }).select("userId expiresAt lastSeenAt ip userAgent").sort({ lastSeenAt: -1 }).limit(200).lean()
    ]);
    if (!tenant) fail("Firma bulunamadı.", 404);
    return { tenant, subscription, users, depolar, counts: { users: users.length, depolar: depolar.length,
        subeler: new Set(depolar.map(x => x.sube?.trim()).filter(Boolean)).size },
        sonGiris: users.reduce((date, x) => x.sonGirisTarihi > date ? x.sonGirisTarihi : date, null),
        oturumlar: { durum: "GOZLENEN", sessions, mesaj: "Bu sürümden itibaren girişte veya doğrulanmış istekte gözlenen, çıkış kaydı olmayan ve süresi dolmamış oturumlar. Eski, henüz kullanılmamış tokenlar listelenmez." } };
}

exports.firma = endpoint(async (req, res) => res.json({ basarili: true, ...await firmaDetayi(kimlik(req.params.id)) }));

exports.health = endpoint(async (req, res) => {
    let db = "HATALI";
    try { if (mongoose.connection.readyState === 1) { await mongoose.connection.db.command({ ping: 1 }, { maxTimeMS: 3000 }); db = "CALISIYOR"; } } catch (_) { /* Health must report failure, not fabricate success. */ }
    const [lastCritical, lastBackup, lastCron, integrations] = db === "CALISIYOR" ? await Promise.all([
        Audit.findOne({ severity: "KRITIK" }).sort({ createdAt: -1 }).select("action createdAt requestId").lean(),
        Audit.findOne({ action: "BACKUP_COMPLETED", success: true }).sort({ createdAt: -1 }).select("createdAt requestId").lean(),
        Audit.findOne({ action: "CRON_COMPLETED" }).sort({ createdAt: -1 }).select("createdAt success").lean(),
        IntegrationError.countDocuments({ status: { $in: ["OPEN", "RETRYING"] } })
    ]) : [null, null, null, null];
    res.json({ basarili: true, checkedAt: new Date(), services: {
        API: { status: "CALISIYOR" }, MongoDB: { status: db },
        Mail: { status: (process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL) || (process.env.RESEND_API_KEY && process.env.PASSWORD_RESET_EMAIL_FROM) ? "YAPILANDIRILDI" : "YAPILANDIRILMADI", note: "Yapılandırma kontrolü; teslimat testi yapılmadı." },
        Cron: { status: lastCron ? (lastCron.success && Date.now() - new Date(lastCron.createdAt) < 26 * 3600000 ? "CALISIYOR" : "KONTROL_GEREKLI") : "DOGRULANMADI", lastAt: lastCron?.createdAt || null },
        Entegrasyonlar: { status: integrations === null ? "DOGRULANMADI" : integrations ? "KONTROL_GEREKLI" : "ACIK_HATA_YOK", openErrors: integrations },
        Backup: { status: lastBackup ? "KAYIT_VAR" : "DOGRULANMADI", lastAt: lastBackup?.createdAt || null }
    }, lastCritical });
});

exports.integrations = endpoint(async (req, res) => {
    const filter = req.query.tenantId ? { tenantId: kimlik(req.query.tenantId) } : {};
    const connections = await Connection.find(filter).select("tenantId type provider storeName active environment lastSuccessfulSyncAt lastErrorAt").populate("tenantId", "name").lean();
    const items = await Promise.all(connections.map(async x => {
        const tenantId = x.tenantId?._id;
        const [pending, unmatched, lastError] = await Promise.all([
            Job.countDocuments({ tenantId, connectionId: x._id, status: { $in: ["QUEUED", "RUNNING"] } }),
            Mapping.countDocuments({ tenantId, storeConnectionId: x._id, syncStatus: "NOT_LINKED" }),
            IntegrationError.findOne({ tenantId, connectionId: x._id, status: { $in: ["OPEN", "RETRYING"] } }).sort({ lastAttemptAt: -1 }).select("errorCode operation lastAttemptAt attemptCount").lean()
        ]);
        return { ...x, pending, unmatched, lastError, status: !x.active ? "PASIF" : lastError ? "HATALI" : x.lastSuccessfulSyncAt ? "BAGLI" : "DOGRULANMADI",
            tokenStatus: lastError && /AUTH|TOKEN|401|403|CREDENTIAL/i.test(lastError.errorCode) ? "HATALI" : "CANLI_DOGRULAMA_YOK" };
    }));
    res.json({ basarili: true, items, note: "Son başarılı senkronizasyon geçmiş kayıtları gösterir. Token değerleri okunmaz. Mail ve Cron ortak sistem servisleridir." });
});

exports.subscriptionUpdate = endpoint(async (req, res) => {
    const tenantId = kimlik(req.params.id), b = req.body;
    if (!Number.isInteger(b.days) || b.days < 0 || b.days > 3660) fail("Süre 0–3660 tam gün olmalıdır.");
    if (!["trial", "active", "suspended", "cancelled", "expired"].includes(b.status)) fail("Geçersiz abonelik durumu.");
    if (!["monthly", "yearly"].includes(b.period)) fail("Aylık veya yıllık dönem seçin.");
    if (!["unknown", "paid", "unpaid", "past_due"].includes(b.paymentStatus)) fail("Geçersiz ödeme durumu.");
    const planId = kimlik(b.planId);
    // A transaction prevents the tenant access state and subscription record from diverging.
    await mongoose.connection.transaction(async session => {
        const tenant = await Tenant.findById(tenantId).session(session);
        const plan = await Plan.findOne({ _id: planId, aktif: true }).session(session);
        if (!tenant || !plan) fail("Firma veya aktif paket bulunamadı.", 404);
        if (!["starter", "professional", "business", "enterprise"].includes(plan.code.toLowerCase())) fail("Paket kodu mevcut firma paket yapısıyla uyumlu değil.");
        let sub = await Subscription.findOne({ tenantId }).sort({ createdAt: -1 }).session(session);
        const before = { tenant: tenant.toObject(), subscription: sub?.toObject() || null };
        if (!sub) sub = new Subscription({ tenantId, planId });
        sub.planId = planId; sub.status = b.status; sub.period = b.period; sub.paymentStatus = b.paymentStatus;
        const field = b.status === "trial" ? "trialEndsAt" : "expiresAt";
        if (b.days) sub[field] = new Date(Math.max(Date.now(), new Date(sub[field] || tenant[field] || 0).getTime()) + b.days * 86400000);
        if (b.status === "trial" && (!sub.trialEndsAt || new Date(sub.trialEndsAt) <= new Date())) fail("Deneme için ileri tarihli bitiş oluşturacak bir süre ekleyin.");
        if (b.status === "trial" && !sub.trialStartAt) sub.trialStartAt = tenant.trialStartAt || new Date();
        tenant.status = b.status; tenant.plan = plan.code.toLowerCase(); tenant.modules = plan.modules; tenant.limits = plan.limits.toObject ? plan.limits.toObject() : plan.limits;
        if (b.status === "trial") { tenant.trialStartAt = sub.trialStartAt; tenant.trialEndsAt = sub.trialEndsAt; }
        await tenant.save({ session }); await sub.save({ session });
        await Audit.create([{ actorUserId: actor(req), tenantId, action: "PLATFORM_SUBSCRIPTION_CHANGE", resource: "tenant_subscription", resourceId: String(sub._id),
            ip: req.ip, requestId: req.id || "", method: req.method, path: req.originalUrl.split("?")[0],
            details: maskele({ before: { status: before.tenant.status, plan: before.tenant.plan, subscription: before.subscription }, after: sub.toObject() }) }], { session });
    });
    res.json({ basarili: true });
});

exports.passwordReset = endpoint(async (req, res) => {
    const tenantId = kimlik(req.params.id), userId = kimlik(req.params.userId);
    const user = await User.findOne({ _id: userId, tenantId, rol: { $ne: "SUPER_ADMIN" }, silinmeTarihi: null });
    if (!user || !user.aktif) fail("Aktif firma kullanıcısı bulunamadı.", 404);
    const origin = process.env.PUBLIC_APP_URL;
    if (!origin || !/^https:\/\//.test(origin)) fail("Güvenli PUBLIC_APP_URL yapılandırılmalı.", 503);
    const token = crypto.randomBytes(32).toString("hex");
    await kaydet({ req, action: "PLATFORM_PASSWORD_RESET_REQUEST", resource: "user", resourceId: String(userId), tenantId, details: { email: user.email } });
    user.sifreSifirlama = { tokenHash: crypto.createHash("sha256").update(token).digest("hex"), sonKullanmaTarihi: new Date(Date.now() + 1200000) };
    await user.save();
    const result = await sifreSifirlamaEpostasiGonder({ email: user.email, adSoyad: user.adSoyad, resetUrl: `${origin.replace(/\/$/, "")}/erp/sifre-yenile.html?token=${token}` });
    if (!result.gonderildi) fail("E-posta gönderilemedi; mail yapılandırmasını kontrol edin.", 503);
    await kaydet({ req, action: "PLATFORM_PASSWORD_RESET_SENT", resource: "user", resourceId: String(userId), tenantId });
    res.json({ basarili: true, mesaj: "Parola yenileme bağlantısı kullanıcıya gönderildi." });
});

exports.supportStart = endpoint(async (req, res) => {
    const tenantId = kimlik(req.body.tenantId), reason = String(req.body.reason || "").trim();
    if (reason.length < 10 || reason.length > 500) fail("Destek gerekçesi 10–500 karakter olmalıdır.");
    if (!await Tenant.exists({ _id: tenantId })) fail("Firma bulunamadı.", 404);
    await kaydet({ req, action: "SUPPORT_START", resource: "support", tenantId, details: { reason, durationMinutes: 30, mode: "READ_ONLY" } });
    const support = await Support.create({ actorId: actor(req), tenantId, reason, expiresAt: new Date(Date.now() + 1800000) });
    res.json({ basarili: true, support });
});
async function destek(req) {
    const support = await Support.findOne({ _id: kimlik(req.params.id), actorId: actor(req), closedAt: null, expiresAt: { $gt: new Date() } }).lean();
    if (!support) fail("Destek oturumu kapalı veya süresi dolmuş.", 403);
    return support;
}
exports.supportRead = endpoint(async (req, res) => {
    const support = await destek(req);
    await kaydet({ req, action: "SUPPORT_VIEW", resource: "support", resourceId: String(support._id), tenantId: support.tenantId });
    res.json({ basarili: true, support, ...await firmaDetayi(support.tenantId) });
});
exports.supportEnd = endpoint(async (req, res) => {
    const support = await Support.findOne({ _id: kimlik(req.params.id), actorId: actor(req), closedAt: null });
    if (support) {
        await kaydet({ req, action: "SUPPORT_END", resource: "support", resourceId: String(support._id), tenantId: support.tenantId });
        support.closedAt = new Date(); await support.save();
    }
    res.json({ basarili: true });
});
exports.errorResolve = endpoint(async (req, res) => {
    const auditId = kimlik(req.params.id), note = String(req.body.note || "").trim();
    if (typeof req.body.resolved !== "boolean" || note.length < 5 || note.length > 1000) fail("Çözüm durumu ve 5–1000 karakter açıklama gerekli.");
    const audit = await Audit.findOne({ _id: auditId, $or: [{ category: "API_HATASI" }, { httpStatus: { $gte: 500 } }] }).lean();
    if (!audit) fail("Hata kaydı bulunamadı.", 404);
    await kaydet({ req, action: "ERROR_RESOLUTION", resource: "platform_error", resourceId: String(auditId), tenantId: audit.tenantId, details: { resolved: req.body.resolved, note } });
    await Resolution.findOneAndUpdate({ auditId }, { resolved: req.body.resolved, note, actorId: actor(req) }, { upsert: true, runValidators: true });
    res.json({ basarili: true });
});
exports.firmaDetayi = firmaDetayi;
