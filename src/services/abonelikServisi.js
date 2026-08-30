const Tenant = require("../modules/platform/models/Tenant");
const TenantSubscription = require("../modules/platform/models/TenantSubscription");
const Kullanici = require("../models/Kullanici");

const TAM_OTUZ_GUN_MS = 30 * 24 * 60 * 60 * 1000;

function trialTarihleri(baslangic = new Date()) {
    const trialStartAt = new Date(baslangic);
    return { trialStartAt, trialEndsAt: new Date(trialStartAt.getTime() + TAM_OTUZ_GUN_MS) };
}

function abonelikDurumuHesapla(tenant, simdi = new Date()) {
    const durum = String(tenant?.status || "suspended").toLowerCase();
    if (durum === "trial" && tenant?.trialEndsAt && new Date(tenant.trialEndsAt).getTime() <= new Date(simdi).getTime()) return "expired";
    return ["trial", "active", "expired", "suspended", "cancelled"].includes(durum) ? durum : "suspended";
}

function guvenliAbonelikCiktisi(tenant, simdi = new Date()) {
    const durum = abonelikDurumuHesapla(tenant, simdi);
    const kalanMs = durum === "trial" && tenant?.trialEndsAt ? Math.max(0, new Date(tenant.trialEndsAt).getTime() - new Date(simdi).getTime()) : 0;
    return { durum, trialStartAt: tenant?.trialStartAt || null, trialEndsAt: tenant?.trialEndsAt || null, kalanGun: durum === "trial" ? Math.ceil(kalanMs / 86400000) : 0 };
}

async function tenantAboneliginiKontrolEt(tenantId, simdi = new Date()) {
    const tenant = await Tenant.findById(tenantId).select("name status trialStartAt trialEndsAt");
    if (!tenant) return { erisim: false, httpStatus: 403, kod: "ACCOUNT_UNAVAILABLE", mesaj: "İşletme hesabına erişilemiyor." };
    let durum = abonelikDurumuHesapla(tenant, simdi);
    if (durum === "expired" && tenant.status !== "expired") {
        tenant.status = "expired";
        await tenant.save();
        await Promise.all([
            TenantSubscription.updateMany({ tenantId: tenant._id, status: "trial" }, { $set: { status: "expired" } }),
            Kullanici.updateMany({ tenantId: tenant._id, hesapDurumu: "trial" }, { $set: { hesapDurumu: "expired" } })
        ]);
    }
    const abonelik = guvenliAbonelikCiktisi({ ...tenant.toObject(), status: durum }, simdi);
    if (durum === "expired") return { erisim: false, httpStatus: 402, kod: "SUBSCRIPTION_EXPIRED", mesaj: "Ücretsiz deneme süreniz sona erdi. Devam etmek için aboneliğinizi etkinleştirin.", abonelik };
    if (["suspended", "cancelled"].includes(durum)) return { erisim: false, httpStatus: 403, kod: "ACCOUNT_SUSPENDED", mesaj: "İşletme hesabınız kullanıma kapalıdır. Destek ekibiyle iletişime geçin.", abonelik };
    return { erisim: true, tenant, abonelik };
}

module.exports = { TAM_OTUZ_GUN_MS, trialTarihleri, abonelikDurumuHesapla, guvenliAbonelikCiktisi, tenantAboneliginiKontrolEt };
