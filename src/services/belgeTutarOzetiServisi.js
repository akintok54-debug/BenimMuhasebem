// Read-only decomposition of the saved document, never the current product price.
// Document and line totals remain authoritative; no VAT is added to a saved total.
const sayi = x => x !== null && x !== undefined && x !== "" && Number.isFinite(Number(x)) ? Number(x) : null;
const yuvarla = x => Math.round((x + Number.EPSILON) * 100) / 100;

function belgeTutarOzeti(belge) {
    const kalemler = belge.kalemler || [];
    if (!kalemler.length || sayi(belge.genelToplam) === null) return null;
    const gruplar = new Map();
    let brut = 0, net = 0, vergi = 0, brutBiliniyor = true, vergiBiliniyor = true;
    for (const k of kalemler) {
        const oran = sayi(k.kdv), toplam = sayi(k.toplam);
        let matrah = sayi(k.araToplam), kdv = sayi(k.kdvTutari);
        // Older returns store only VAT-inclusive line totals and the applied rate.
        if (matrah === null && toplam !== null && kdv !== null) matrah = toplam - kdv;
        if (matrah === null && toplam !== null && oran !== null) matrah = toplam / (1 + oran / 100);
        if (kdv === null && toplam !== null && matrah !== null) kdv = toplam - matrah;
        if (matrah === null || kdv === null || oran === null) { vergiBiliniyor = false; continue; }
        const miktar = sayi(k.miktar), fiyat = sayi(k.birimFiyat);
        let kalemBrut = sayi(k.brutToplam);
        if (kalemBrut === null && sayi(k.iskontoTutari) !== null) kalemBrut = matrah + Number(k.iskontoTutari);
        if (kalemBrut === null && miktar !== null && fiyat !== null) {
            // Existing ERP stores unit prices exclusive of VAT, including sales
            // entered in VAT-inclusive mode (converted before persistence).
            kalemBrut = miktar * fiyat;
            if (k.kdvDahil === true || belge.kdvDahil === true) kalemBrut /= 1 + oran / 100;
        }
        if (kalemBrut === null) brutBiliniyor = false;
        else brut += kalemBrut;
        net += matrah; vergi += kdv;
        const grup = gruplar.get(oran) || { oran, matrah: 0, tutar: 0 };
        grup.matrah += matrah; grup.tutar += kdv; gruplar.set(oran, grup);
    }
    const araToplam = sayi(belge.araToplam) ?? (vergiBiliniyor ? net : null);
    const kdvTutari = sayi(belge.toplamKdv) ?? (vergiBiliniyor ? vergi : null);
    const genelToplam = Number(belge.genelToplam);
    const tutarli = vergiBiliniyor && Math.abs(net + vergi - genelToplam) < 0.02 &&
        (araToplam === null || Math.abs(net - araToplam) < 0.02) &&
        (kdvTutari === null || Math.abs(vergi - kdvTutari) < 0.02);
    return {
        brutToplam: brutBiliniyor && vergiBiliniyor ? yuvarla(brut) : null,
        toplamIskonto: brutBiliniyor && araToplam !== null && vergiBiliniyor ? yuvarla(brut - araToplam) : null,
        araToplam, kdvMatrahi: araToplam, kdvTutari, genelToplam,
        kdvGruplari: tutarli ? [...gruplar.values()].sort((a, b) => a.oran - b.oran).map(g => ({ oran: g.oran, matrah: yuvarla(g.matrah), tutar: yuvarla(g.tutar) })) : [],
        detayDogrulandi: tutarli
    };
}

function belgeOzetleriniEkle(value) {
    if (!value || typeof value !== "object" || value instanceof Date || Buffer.isBuffer(value)) return value;
    if (Array.isArray(value)) return value.map(belgeOzetleriniEkle);
    if (typeof value.toHexString === "function") return value;
    const obj = typeof value.toJSON === "function" ? value.toJSON() : value;
    const sonuc = Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, belgeOzetleriniEkle(v)]));
    if (Array.isArray(obj.kalemler) && sayi(obj.genelToplam) !== null) sonuc.tutarOzeti = belgeTutarOzeti(obj);
    return sonuc;
}

function belgeSunumMiddleware(req, res, next) {
    if (req.method === "GET" && /^\/api\/(?:paylasim(?:\/|$)|tenant\/(?:satis|siparisler|teklifler|musteriler|tedarikciler|saha|alis)(?:\/|$))/.test(req.originalUrl)) {
        const json = res.json;
        res.json = function (body) { return json.call(this, belgeOzetleriniEkle(body)); };
    }
    next();
}

module.exports = { belgeTutarOzeti, belgeOzetleriniEkle, belgeSunumMiddleware };
