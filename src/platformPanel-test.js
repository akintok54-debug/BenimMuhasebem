require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const uygulama = require("./uygulama");
const { tokenOlustur } = require("./services/tokenServisi");

async function testSunucusuAc() {
    return new Promise((resolve, reject) => {
        const instance = uygulama.listen(0, "127.0.0.1", () => resolve(instance));
        instance.once("error", reject);
    });
}

test("Login rol bazlı olarak SUPER_ADMIN'i platform paneline yönlendirir", () => {
    const loginJs = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "login.js"), "utf8");
    assert.match(loginJs, /data\.kullanici\?\.rol === "SUPER_ADMIN" \? "\/platform\/" : "\/erp\/"/);
});

test("Platform paneli ayrı layout ve zorunlu yönetim bölümlerini içerir", () => {
    const platformDir = path.join(__dirname, "..", "public", "platform");
    const html = fs.readFileSync(path.join(platformDir, "index.html"), "utf8");
    const js = fs.readFileSync(path.join(platformDir, "platform.js"), "utf8");
    for (const section of ["tenants", "users", "subscriptions", "errors", "security", "audit"]) assert.match(html, new RegExp(`data-section="${section}"`));
    for (const endpoint of ["/api/platform/tenants", "/api/platform/users", "/api/platform/subscriptions", "/api/platform/sistem-hatalari", "/api/platform/guvenlik-merkezi", "/api/platform/audit-kayitlari"]) assert.ok(js.includes(endpoint));
});

test("Tenant kullanıcısı platform API ve layout erişiminden 403 alır", async () => {
    const server = await testSunucusuAc();
    const tenantToken = tokenOlustur({ kullaniciId: "507f1f77bcf86cd799439011", email: "tenant@example.com", rol: "ADMIN", tenantId: "507f1f77bcf86cd799439012" });
    try {
        const base = `http://127.0.0.1:${server.address().port}`;
        for (const requestPath of ["/api/platform/durum", "/platform/"]) {
            const response = await fetch(base + requestPath, { headers: { Authorization: `Bearer ${tenantToken}` } });
            assert.equal(response.status, 403, requestPath);
        }
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test("SUPER_ADMIN platform API ve ayrı layout erişimine sahiptir", async () => {
    const server = await testSunucusuAc();
    const superToken = tokenOlustur({ kullaniciId: "507f1f77bcf86cd799439013", email: "super@example.com", rol: "SUPER_ADMIN", tenantId: null });
    try {
        const base = `http://127.0.0.1:${server.address().port}`;
        const apiResponse = await fetch(base + "/api/platform/durum", { headers: { Authorization: `Bearer ${superToken}` } });
        const apiData = await apiResponse.json();
        assert.equal(apiResponse.status, 200);
        assert.equal(apiData.rol, "SUPER_ADMIN");
        const pageResponse = await fetch(base + "/platform/", { headers: { Authorization: `Bearer ${superToken}` } });
        assert.equal(pageResponse.status, 200);
        assert.match(await pageResponse.text(), /Platform Yönetimi/);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});
