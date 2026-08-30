require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const uygulama = require("./uygulama");
const { firmaSlugOlustur } = require("./modules/auth/controllers/authController");
const { TAM_OTUZ_GUN_MS, trialTarihleri, abonelikDurumuHesapla } = require("./services/abonelikServisi");

async function testSunucusuAc() {
    return new Promise((resolve, reject) => {
        const instance = uygulama.listen(0, "127.0.0.1", () => resolve(instance));
        instance.once("error", reject);
    });
}

test("Kayıt rotası kimliksiz kullanıma açık ve rate limitlidir", () => {
    const router = require("./modules/auth/routes/authRotasi");
    const route = router.stack.find(item => item.route?.path === "/kayit");
    assert.ok(route);
    assert.equal(route.route.methods.post, true);
    assert.ok(route.route.stack.length >= 2);
});

test("Kayıt ekranı üye ol formunu ve kayıt API bağlantısını içerir", () => {
    const publicDir = path.join(__dirname, "..", "public", "erp");
    const html = fs.readFileSync(path.join(publicDir, "login.html"), "utf8");
    const js = fs.readFileSync(path.join(publicDir, "login.js"), "utf8");
    assert.match(html, /id="registerTab"/);
    assert.match(html, /id="registerForm"/);
    assert.match(html, /30 Gün Ücretsiz Başla/);
    assert.match(js, /\/api\/auth\/kayit/);
});

test("Firma slug değeri URL güvenli ve çakışmaya dayanıklı üretilir", () => {
    const ilk = firmaSlugOlustur("Bahadır Şirketi & Ticaret");
    const ikinci = firmaSlugOlustur("Bahadır Şirketi & Ticaret");
    assert.match(ilk, /^bahadir-sirketi-ticaret-[a-f0-9]{6}$/);
    assert.notEqual(ilk, ikinci);
});

test("Deneme hesabı tam 30 gün sürer ve süresi dolunca expired olur", () => {
    const baslangic = new Date("2026-08-30T00:00:00.000Z");
    const tarihler = trialTarihleri(baslangic);
    assert.equal(tarihler.trialEndsAt.getTime() - tarihler.trialStartAt.getTime(), TAM_OTUZ_GUN_MS);
    assert.equal(abonelikDurumuHesapla({ status: "trial", trialEndsAt: tarihler.trialEndsAt }, new Date(tarihler.trialEndsAt.getTime() - 1)), "trial");
    assert.equal(abonelikDurumuHesapla({ status: "trial", trialEndsAt: tarihler.trialEndsAt }, tarihler.trialEndsAt), "expired");
});

test("Kayıt API eksik alanları veritabanına gitmeden reddeder", async () => {
    const server = await testSunucusuAc();
    try {
        const address = server.address();
        const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/kayit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ firmaAdi: "A" })
        });
        const data = await response.json();
        assert.equal(response.status, 400);
        assert.equal(data.basarili, false);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});
