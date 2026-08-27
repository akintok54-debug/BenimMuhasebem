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
    const oncekiKey = process.env.RESEND_API_KEY;
    const oncekiFrom = process.env.PASSWORD_RESET_EMAIL_FROM;
    delete process.env.RESEND_API_KEY;
    delete process.env.PASSWORD_RESET_EMAIL_FROM;
    try {
        const { sifreSifirlamaEpostasiGonder } = require("./services/epostaServisi");
        const result = await sifreSifirlamaEpostasiGonder({ email: "test@example.com", adSoyad: "Test", resetUrl: "https://example.com/reset" });
        assert.deepEqual(result, { gonderildi: false, neden: "EPOSTA_YAPILANDIRILMADI" });
    } finally {
        if (oncekiKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = oncekiKey;
        if (oncekiFrom === undefined) delete process.env.PASSWORD_RESET_EMAIL_FROM; else process.env.PASSWORD_RESET_EMAIL_FROM = oncekiFrom;
    }
});
