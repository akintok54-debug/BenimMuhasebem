require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { guvenliAnahtarlar } = require("./middleware/guvenlikKatmani");
const { izinVar } = require("./middleware/yetkiKontrol");
const { tokenOlustur, tokenDogrula } = require("./services/tokenServisi");
const { bankaKimlikBilgisiDogrula } = require("./services/bankaEntegrasyonServisi");
const ikiFaktor = require("./services/ikiFaktorServisi");
const { sifrele, coz } = require("./services/sifrelemeServisi");
const { oturumCookieYaz } = require("./services/oturumGuvenligi");
const { artir } = require("./services/rateLimitStore");
const { alarmGonder } = require("./services/guvenlikAlarmServisi");
const { productionGuvenlikDogrula } = require("./services/productionGuvenlikServisi");

test("NoSQL operatör ve prototype anahtarları temizlenir", () => {
    const temiz = guvenliAnahtarlar({ email: "a@b.com", $where: "x", nested: { "a.b": 1, normal: true }, __proto__: { admin: true } });
    assert.equal(temiz.email, "a@b.com");
    assert.equal(temiz.$where, undefined);
    assert.deepEqual(temiz.nested, { normal: true });
    assert.equal({}.admin, undefined);
});

test("Eski ve yeni roller geriye uyumlu izinlere çevrilir", () => {
    assert.equal(izinVar("OWNER", "tenant.settings"), true);
    assert.equal(izinVar("ADMIN", "cash.write"), true);
    assert.equal(izinVar("MUHASEBE", "accounting.write"), true);
    assert.equal(izinVar("SATIS", "sales.write"), true);
    assert.equal(izinVar("CASHIER", "tenant.settings"), false);
});

test("Yeni JWT issuer ve audience ile doğrulanır; geçiş tokenı desteklenir", () => {
    const yeni = tokenOlustur({ kullaniciId: "507f1f77bcf86cd799439011", rol: "ADMIN", tenantId: "507f1f77bcf86cd799439012" });
    assert.equal(tokenDogrula(yeni).rol, "ADMIN");
    const eski = jwt.sign({ kullaniciId: "507f1f77bcf86cd799439011", rol: "ADMIN" }, process.env.JWT_SECRET, { expiresIn: "5m", algorithm: "HS256" });
    assert.equal(tokenDogrula(eski).rol, "ADMIN");
});

test("Banka servis sınırı internet bankacılığı parolasını reddeder", () => {
    assert.throws(() => bankaKimlikBilgisiDogrula({ username: "x", password: "y" }), /kabul edilmez/);
    assert.equal(bankaKimlikBilgisiDogrula({ oauthCode: "tek-kullanimlik-kod" }), true);
});

test("TOTP kodu doğrulanır ve kurtarma kodu hashlenir", () => {
    const secret = ikiFaktor.secretOlustur(), kod = ikiFaktor.kodOlustur(secret);
    assert.equal(ikiFaktor.kodDogrula(secret, kod), true);
    assert.equal(ikiFaktor.kodDogrula(secret, "000000"), kod === "000000");
    assert.equal(ikiFaktor.kodHash("ABCD-1234"), ikiFaktor.kodHash("abcd-1234"));
});

test("Hassas veri AES-GCM ile şifrelenip çözülebilir", () => {
    const encrypted = sifrele("gizli-deger");
    assert.notEqual(encrypted.includes("gizli-deger"), true);
    assert.equal(coz(encrypted), "gizli-deger");
});

test("Oturum cookie'si HttpOnly, SameSite ve production'da Secure olur", () => {
    const yazilan = [], res = { cookie: (ad, deger, secenek) => yazilan.push({ ad, deger, secenek }) };
    const eski = process.env.NODE_ENV; process.env.NODE_ENV = "production"; oturumCookieYaz(res, "jwt"); process.env.NODE_ENV = eski;
    assert.equal(yazilan[0].secenek.httpOnly, true); assert.equal(yazilan[0].secenek.secure, true); assert.equal(yazilan[0].secenek.sameSite, "strict");
    assert.equal(yazilan[1].secenek.httpOnly, false);
});

test("Redis ve alarm webhook'u yokken güvenli fallback çalışır", async () => {
    const eskiRedis = process.env.REDIS_URL, eskiWebhook = process.env.SECURITY_ALERT_WEBHOOK;
    delete process.env.REDIS_URL; delete process.env.SECURITY_ALERT_WEBHOOK;
    try {
        assert.equal((await artir(`test:${Date.now()}`, 1000)).kaynak, "memory");
        assert.deepEqual(await alarmGonder({ category: "TEST", severity: "UYARI" }), { gonderildi: false, neden: "yapilandirilmadi" });
    } finally {
        if (eskiRedis === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = eskiRedis;
        if (eskiWebhook === undefined) delete process.env.SECURITY_ALERT_WEBHOOK; else process.env.SECURITY_ALERT_WEBHOOK = eskiWebhook;
    }
});

test("Production başlangıcı opsiyonel yeni secret'lar olmadan normal ERP'yi engellemez", () => {
    const anahtarlar = ["NODE_ENV", "MONGODB_URI", "JWT_SECRET", "ENCRYPTION_KEY", "BACKUP_ENCRYPTION_KEY", "REDIS_URL", "SECURITY_ALERT_WEBHOOK", "CORS_ORIGINS", "JWT_ALLOW_LEGACY"];
    const eski = Object.fromEntries(anahtarlar.map(key => [key, process.env[key]]));
    Object.assign(process.env, { NODE_ENV: "production", MONGODB_URI: "mongodb+srv://example.invalid/erp", JWT_SECRET: "j".repeat(32) });
    for (const key of ["ENCRYPTION_KEY", "BACKUP_ENCRYPTION_KEY", "REDIS_URL", "SECURITY_ALERT_WEBHOOK", "CORS_ORIGINS", "JWT_ALLOW_LEGACY"]) delete process.env[key];
    try {
        const sonuc = productionGuvenlikDogrula();
        assert.equal(sonuc.production, true);
        assert.equal(sonuc.redis, false);
        assert.equal(sonuc.securityAlertWebhook, false);
        assert.equal(sonuc.encryption, false);
        assert.equal(sonuc.backupEncryption, false);
        assert.equal(sonuc.legacyJwt, true);
    } finally {
        for (const key of anahtarlar) if (eski[key] === undefined) delete process.env[key]; else process.env[key] = eski[key];
    }
});
