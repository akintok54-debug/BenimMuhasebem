const sonGonderim = new Map();
async function alarmGonder(olay) {
    const url = process.env.SECURITY_ALERT_WEBHOOK;
    if (!url) return { gonderildi: false, neden: "yapilandirilmadi" };
    const key = String(olay.category || olay.severity), simdi = Date.now();
    if (simdi - (sonGonderim.get(key) || 0) < 5 * 60 * 1000) return { gonderildi: false, neden: "throttle" };
    sonGonderim.set(key, simdi);
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sistem: "BenimMuhasebe", kategori: olay.category, seviye: olay.severity, islem: olay.action, basarili: olay.success, httpStatus: olay.httpStatus, requestId: olay.requestId, tarih: new Date().toISOString() }), signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Alarm servisi HTTP ${response.status}`);
    return { gonderildi: true };
}
module.exports = { alarmGonder };
