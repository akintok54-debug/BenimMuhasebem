const crypto = require("node:crypto");
const mongoose = require("mongoose");
const Order = require("../../models/Siparis");
const Payment = require("./models/MagazaOdeme");
const Customer = require("../../models/Musteri");
const Bank = require("../../models/Banka");
const Cash = require("../../models/Kasa");
const { hareketKaydet } = require("../../services/cariHesapServisi");
const { coz } = require("../../services/sifrelemeServisi");
const shop = require("./magazaServisi");
function origin() {
    try { const url = new URL(process.env.PUBLIC_APP_URL); if (url.protocol === "https:") return url.origin; } catch (_) {}
    return "https://www.benimmuhasebe.com";
}
const signature = (value, key) => crypto.createHmac("sha256", key).update(value).digest("base64");
function hashDogrula(body, secret) {
    if (!/^[a-f\d]{24}$/.test(String(body.merchant_oid || "")) || !["success", "failed"].includes(body.status) || !/^\d+$/.test(String(body.total_amount || ""))) return false;
    const expected = signature(body.merchant_oid + secret.salt + body.status + body.total_amount, secret.key);
    const actual = String(body.hash || "");
    return Buffer.byteLength(actual) === Buffer.byteLength(expected) && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
async function baslat(req, orderId) {
    const order = await Order.findOne({ _id: orderId, tenantId: req.tenantId, musteriId: req.bayi._id, musteriTipi: "PERAKENDE", magazaOdemeYontemi: "KART", durum: { $ne: "IPTAL" }, satisId: null }).lean();
    if (!order) throw shop.fail("Ödenebilir sipariş bulunamadı.", 404);
    if (order.magazaOdemeDurumu === "ODENDI") return { odendi: true };
    const settings = await shop.ayarOku(req.tenantId);
    if (!(await shop.odemeSecenekleri(settings, req.tenantId)).some(x => x.kod === "KART")) throw shop.fail("Kart ödemesi şu anda kullanılamıyor.", 409);
    let payment = await Payment.findById(orderId).select("+secret +iframeToken");
    if (!payment) {
        try {
            payment = await Payment.create({ _id: order._id, tenantId: req.tenantId, musteriId: req.bayi._id, bankaId: settings.bankaId, tutarKurus: Math.round(order.genelToplam * 100), secret: settings.paytrSecret, merchantId: settings.paytrMerchantId, test: settings.paytrTest });
        } catch (e) {
            if (e.code !== 11000) throw e;
            payment = await Payment.findById(orderId).select("+secret +iframeToken");
        }
    }
    if (payment.durum === "ODENDI") return { odendi: true };
    if (payment.durum !== "BEKLIYOR") throw shop.fail("Bu ödeme denemesi kapanmış. Yeni sipariş oluşturun.", 409);
    if (payment.iframeToken) return { iframeUrl: "https://www.paytr.com/odeme/guvenli/" + payment.iframeToken };
    const secret = JSON.parse(coz(payment.secret));
    const customer = await Customer.findOne({ _id: req.bayi._id, tenantId: req.tenantId }).lean();
    const basket = Buffer.from(JSON.stringify([[order.siparisNo, (payment.tutarKurus / 100).toFixed(2), 1]])).toString("base64");
    const fields = {
        merchant_id: payment.merchantId, user_ip: String(req.ip || "").replace(/^::ffff:/, ""),
        merchant_oid: String(order._id), email: req.currentUser.email, payment_amount: String(payment.tutarKurus), user_basket: basket,
        no_installment: "1", max_installment: "0", currency: "TL", test_mode: payment.test ? "1" : "0",
        user_name: customer.adSoyad, user_address: order.sevkAdresi, user_phone: customer.telefon,
        merchant_ok_url: origin() + "/b2b/?odeme=sonuc", merchant_fail_url: origin() + "/b2b/?odeme=basarisiz",
        timeout_limit: "30", debug_on: "0"
    };
    fields.paytr_token = signature(fields.merchant_id + fields.user_ip + fields.merchant_oid + fields.email + fields.payment_amount + basket + fields.no_installment + fields.max_installment + fields.currency + fields.test_mode + secret.salt, secret.key);
    const response = await fetch("https://www.paytr.com/odeme/api/get-token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields), signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    if (!response.ok || data.status !== "success" || !/^[a-zA-Z0-9_-]+$/.test(data.token || "")) throw shop.fail("Kart ödeme ekranı açılamadı. Siparişlerim ekranından tekrar deneyin.", 502);
    await Payment.updateOne({ _id: payment._id, durum: "BEKLIYOR" }, { $set: { iframeToken: data.token } });
    return { iframeUrl: "https://www.paytr.com/odeme/guvenli/" + data.token };
}
async function tahsilat(order, account, method, session, userId = null) {
    if (order.magazaTahsilatId) return order.magazaTahsilatId;
    const result = await hareketKaydet({
        tenantId: order.tenantId, tarafTipi: "MUSTERI", tarafId: order.musteriId,
        tip: "TAHSILAT", tutar: order.genelToplam, bakiyeDegisimi: -order.genelToplam,
        kaynak: "TAHSILAT", kaynakId: order._id, belgeNo: order.siparisNo,
        aciklama: "Mağaza sipariş ödemesi " + order.siparisNo,
        odemeYontemi: method, hesap: account, paraTipi: "GIRIS", session, kullaniciId: userId,
        islemAnahtari: "MAGAZA:TAHSILAT:" + order._id
    });
    order.magazaTahsilatId = result.cariHareket._id;
    order.magazaOdemeDurumu = "ODENDI";
    await order.save({ session });
    return result.cariHareket._id;
}
async function callback(body) {
    const payment = /^[a-f\d]{24}$/.test(String(body.merchant_oid || "")) ? await Payment.findById(body.merchant_oid).select("+secret").lean() : null;
    if (!payment || !hashDogrula(body, JSON.parse(coz(payment.secret)))) throw shop.fail("Ödeme bildirimi doğrulanamadı.", 400);
    if (body.status === "success" && Number(body.total_amount) !== payment.tutarKurus) throw shop.fail("Ödeme tutarı eşleşmiyor.", 400);
    if (String(body.test_mode || "0") !== (payment.test ? "1" : "0")) throw shop.fail("Ödeme test modu eşleşmiyor.", 400);
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const current = await Payment.findById(payment._id).session(session);
            if (current.durum !== "BEKLIYOR") return;
            const order = await Order.findOne({ _id: payment._id, tenantId: payment.tenantId, musteriId: payment.musteriId, magazaOdemeYontemi: "KART" }).session(session);
            if (!order) throw shop.fail("Ödeme siparişi bulunamadı.", 409);
            if (body.status === "failed") {
                current.durum = "BASARISIZ"; order.magazaOdemeDurumu = "BASARISIZ"; order.durum = "IPTAL";
                await order.save({ session });
            } else if (payment.test) {
                current.durum = "TEST"; order.magazaOdemeDurumu = "TEST"; order.durum = "IPTAL";
                await order.save({ session });
            } else {
                const bank = await Bank.findOne({ _id: payment.bankaId, tenantId: payment.tenantId, paraBirimi: "TRY" }).session(session);
                if (!bank) throw shop.fail("Tahsilat hesabı bulunamadı.", 409);
                current.cariHareketId = await tahsilat(order, bank, "KREDI_KARTI", session);
                current.durum = "ODENDI";
            }
            await current.save({ session });
        });
    } finally { await session.endSession(); }
}
async function manuelOnay(req, orderId) {
    if (req.body.onay !== true) throw shop.fail("Gerçek tahsilatı kontrol ettiğinizi onaylayın.");
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const order = await Order.findOne({ _id: orderId, tenantId: req.tenantId, kaynakKanal: "B2B", musteriTipi: "PERAKENDE", durum: { $ne: "IPTAL" } }).session(session);
            if (!order || !["HAVALE", "KAPIDA"].includes(order.magazaOdemeYontemi)) throw shop.fail("Manuel tahsilat onayına uygun sipariş bulunamadı.", 404);
            if (order.magazaTahsilatId) return;
            const settings = await AyarOkuOnay(req.tenantId, session);
            const cash = order.magazaOdemeYontemi === "KAPIDA";
            const Model = cash ? Cash : Bank;
            const account = await Model.findOne({ _id: cash ? settings.kasaId : settings.bankaId, tenantId: req.tenantId, aktif: true, paraBirimi: "TRY" }).session(session);
            if (!account) throw shop.fail("Mağaza ayarlarından aktif TL tahsilat hesabını seçin.", 409);
            await tahsilat(order, account, cash ? "NAKIT" : "IBAN", session, req.currentUser._id);
        });
    } finally { await session.endSession(); }
}
async function AyarOkuOnay(tenantId, session) {
    const value = await require("./models/MagazaAyar").findById(tenantId).session(session).lean();
    if (!value) throw shop.fail("Mağaza tahsilat ayarları bulunamadı.", 409);
    return value;
}
module.exports = { baslat, callback, manuelOnay, hashDogrula };
