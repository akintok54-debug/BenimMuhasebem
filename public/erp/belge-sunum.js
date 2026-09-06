(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.BelgeSunum = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    const esc = x => String(x ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    function para(value, currency = "TRY") {
        if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
        const birim = { TRY: "TL", TL: "TL", USD: "USD", EUR: "EUR", GBP: "GBP" }[currency] || "TL";
        return `${new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))} ${birim}`;
    }
    function miktar(value, birim = "") {
        const n = Number(value);
        if (!Number.isFinite(n)) return "—";
        // Suppress floating point / four-decimal import residue next to integers.
        const rounded = Math.abs(n - Math.round(n)) <= 0.00010001 ? Math.round(n) : n;
        const unit = String(birim).toLocaleUpperCase("tr-TR") === "ADET" ? "Adet" : birim;
        return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 4 }).format(rounded)}${unit ? ` ${unit}` : ""}`;
    }
    function tutarOzeti(belge = {}, secenekler = {}) {
        const o = belge.tutarOzeti, currency = belge.paraBirimi || "TRY";
        const satir = (etiket, tutar, sinif = "") => `<div class="belge-ozet-satir ${sinif}"><span>${esc(etiket)}</span><strong>${esc(para(tutar, currency))}</strong></div>`;
        let html = "";
        if (o) {
            html += satir("Brüt Toplam", o.brutToplam);
            html += satir("Toplam İskonto", o.toplamIskonto === null ? null : -o.toplamIskonto);
            html += satir("Ara Toplam", o.araToplam);
            html += satir("KDV Matrahı", o.kdvMatrahi);
            html += satir("KDV Tutarı", o.kdvTutari);
            for (const g of o.kdvGruplari || []) html += satir(`KDV %${miktar(g.oran)} · Matrah ${para(g.matrah, currency)}`, g.tutar, "belge-kdv-detay");
        }
        for (const [etiket, tutar] of secenekler.satirlar || []) html += satir(etiket, tutar);
        html += satir(secenekler.toplamEtiketi || (o ? "GENEL TOPLAM (Vergiler Dahil)" : "TOPLAM"), o?.genelToplam ?? belge.genelToplam ?? belge.tutar, "belge-ozet-genel");
        return `<section class="belge-tutar-ozeti" aria-label="Tutar Özeti"><h3>Tutar Özeti</h3>${html}</section>`;
    }
    return { para, miktar, tutarOzeti };
});
