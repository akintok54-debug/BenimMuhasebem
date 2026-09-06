const audit = require("./auditServisi");
async function run(req) {
    const result = await require("../../../../scripts/muhasebe-butunluk-audit").run({ connect: false, output: false });
    const findings = [...result.hatalar, ...result.kopukReferanslar, ...result.yetimBelgeHareketleri];
    const groups = new Map();
    for (const finding of findings) {
        const tenantId = /^[a-f\d]{24}$/i.test(finding.tenantId || "") ? finding.tenantId : null;
        if (!groups.has(tenantId)) groups.set(tenantId, []);
        groups.get(tenantId).push(finding);
    }
    for (const [tenantId, items] of groups) await audit.kaydet({ req, tenantId, action: "ACCOUNTING_INTEGRITY_FINDINGS", resource: "accounting", category: "VERI_TUTARLILIK", severity: "UYARI", success: false,
        details: { findingCount: items.length, sample: items.slice(0,20), complete: result.tamTarama, automaticRepair: false } });
    if (!result.tamTarama) await audit.kaydet({ req, action: "INTEGRITY_SCAN_INCOMPLETE", resource: "accounting", category: "VERI_TUTARLILIK", severity: "UYARI", success: false, details: { reason: "QUERY_LIMIT_REACHED" } });
    await audit.kaydet({ req, action: "INTEGRITY_SCAN_COMPLETED", resource: "accounting", details: { complete: result.tamTarama, summary: result.ozet, scope: result.kapsam } });
    return { complete: result.tamTarama, summary: result.ozet };
}
module.exports = { run };
