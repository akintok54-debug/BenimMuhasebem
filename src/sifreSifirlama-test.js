require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Parola sıfırlama rotaları kimliksiz kullanıma açıktır ve rate limitlidir", () => {
    const router = require("./modules/auth/routes/authRotasi");
    for (const routePath of ["/sifremi-unuttum", "/sifre-yenile"]) {
        const layer = router.stack.find(item => item.route?.path === routePath);
        assert.ok(layer, `${routePath} rotası bulunamadı`);
        assert.equal(layer.route.methods.post, true);
        assert.ok(layer.route.stack.length >= 2, `${routePath} rate limit ve controller içermeli`);
    }
});

test("Login ekranı şifremi unuttum bağlantısını ve reset sayfasını içerir", () => {
    const publicDir = path.join(__dirname, "..", "public", "erp");
    const loginHtml = fs.readFileSync(path.join(publicDir, "login.html"), "utf8");
    const loginJs = fs.readFileSync(path.join(publicDir, "login.js"), "utf8");
    const resetHtml = fs.readFileSync(path.join(publicDir, "sifre-yenile.html"), "utf8");
    assert.match(loginHtml, /Şifremi Unuttum/);
    assert.match(loginJs, /\/api\/auth\/sifremi-unuttum/);
    assert.match(resetHtml, /sifre-yenile\.js/);
});

test("E-posta yapılandırması yokken servis güvenli fallback döndürür", async () => {
    const oncekiBrevoKey = process.env.BREVO_API_KEY;
    const oncekiBrevoSender = process.env.BREVO_SENDER_EMAIL;
    const oncekiKey = process.env.RESEND_API_KEY;
    const oncekiFrom = process.env.PASSWORD_RESET_EMAIL_FROM;
    delete process.env.BREVO_API_KEY;
    delete process.env.BREVO_SENDER_EMAIL;
    delete process.env.RESEND_API_KEY;
    delete process.env.PASSWORD_RESET_EMAIL_FROM;
    try {
        const { sifreSifirlamaEpostasiGonder } = require("./services/epostaServisi");
        const result = await sifreSifirlamaEpostasiGonder({ email: "test@example.com", adSoyad: "Test", resetUrl: "https://example.com/reset" });
        assert.deepEqual(result, { gonderildi: false, neden: "EPOSTA_YAPILANDIRILMADI" });
    } finally {
        if (oncekiBrevoKey === undefined) delete process.env.BREVO_API_KEY; else process.env.BREVO_API_KEY = oncekiBrevoKey;
        if (oncekiBrevoSender === undefined) delete process.env.BREVO_SENDER_EMAIL; else process.env.BREVO_SENDER_EMAIL = oncekiBrevoSender;
        if (oncekiKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = oncekiKey;
        if (oncekiFrom === undefined) delete process.env.PASSWORD_RESET_EMAIL_FROM; else process.env.PASSWORD_RESET_EMAIL_FROM = oncekiFrom;
    }
});

test("Brevo yapılandırıldığında parola e-postası API v3 üzerinden güvenli gönderilir", async () => {
    const onceki = { key: process.env.BREVO_API_KEY, email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME, fetch: global.fetch };
    process.env.BREVO_API_KEY = "test-brevo-key";
    process.env.BREVO_SENDER_EMAIL = "noreply@benimmuhasebe.com";
    process.env.BREVO_SENDER_NAME = "BenimMuhasebe";
    let istek;
    global.fetch = async (url, options) => { istek = { url, options }; return { ok: true, status: 201 }; };
    try {
        const { sifreSifirlamaEpostasiGonder } = require("./services/epostaServisi");
        const result = await sifreSifirlamaEpostasiGonder({ email: "uye@example.com", adSoyad: "Test Üye", resetUrl: "https://www.benimmuhasebe.com/reset?token=x" });
        const body = JSON.parse(istek.options.body);
        assert.deepEqual(result, { gonderildi: true, saglayici: "BREVO" });
        assert.equal(istek.url, "https://api.brevo.com/v3/smtp/email");
        assert.equal(istek.options.headers["api-key"], "test-brevo-key");
        assert.equal(body.sender.email, "noreply@benimmuhasebe.com");
        assert.equal(body.to[0].email, "uye@example.com");
        assert.match(body.htmlContent, /Parolamı yenile/);
    } finally {
        global.fetch = onceki.fetch;
        if (onceki.key === undefined) delete process.env.BREVO_API_KEY; else process.env.BREVO_API_KEY = onceki.key;
        if (onceki.email === undefined) delete process.env.BREVO_SENDER_EMAIL; else process.env.BREVO_SENDER_EMAIL = onceki.email;
        if (onceki.name === undefined) delete process.env.BREVO_SENDER_NAME; else process.env.BREVO_SENDER_NAME = onceki.name;
    }
});
