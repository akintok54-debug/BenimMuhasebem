// Older pilot results accidentally overwrote a boolean success with a count.
// Only reinterpret a complete, recorded pilot; never infer missing stages.
function pilotDurumu(connection) {
    if (connection.pilotStatus !== 'PARTIAL') return connection.pilotStatus;
    const stages = connection.pilotResults?.stages;
    const required = ['CONNECTION', 'PRODUCT_PULL_5', 'SKU_BARCODE_MATCH', 'STOCK_UPDATE_ONE', 'PRICE_UPDATE_ONE', 'ORDER_PULL', 'DUPLICATE_ORDER', 'TENANT_ISOLATION'];
    if (!Array.isArray(stages) || connection.pilotResults?.error) return connection.pilotStatus;
    const ok = required.every(step => {
        const x = stages.find(s => s.step === step);
        if (!x) return false;
        if (step === 'ORDER_PULL') return x.errors === 0 && Number.isFinite(x.processed) && x.processed >= 0 && !x.pending;
        if (step === 'PRODUCT_PULL_5') return x.errors === 0 && x.processed > 0 && x.processed <= 5 && Number(x.success) > 0 && !x.unmatched;
        return x.success === true;
    });
    return ok ? 'SUCCESS' : connection.pilotStatus;
}
module.exports = { pilotDurumu };
