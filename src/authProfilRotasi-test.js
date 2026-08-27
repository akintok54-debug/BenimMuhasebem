require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const uygulama = require("./uygulama");

async function testSunucusuAc() {
    return new Promise((resolve, reject) => {
        const instance = uygulama.listen(0, "127.0.0.1", () => resolve(instance));
        instance.once("error", reject);
    });
}

for (const [method, path] of [
    ["GET", "/api/auth/profil"],
    ["PATCH", "/api/auth/profil"],
    ["POST", "/api/auth/sifre-degistir"],
    ["DELETE", "/api/auth/hesap"]
]) {
    test(`${method} ${path} kimliksiz erişimi reddeder`, async () => {
        const server = await testSunucusuAc();
        try {
            const address = server.address();
            const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
                method,
                headers: { "Content-Type": "application/json" },
                body: method === "GET" ? undefined : "{}"
            });
            const data = await response.json();
            assert.equal(response.status, 401);
            assert.equal(data.basarili, false);
        } finally {
            await new Promise(resolve => server.close(resolve));
        }
    });
}

test("Hesap kapatma rotası DELETE metoduyla sınırlıdır", () => {
    const router = require("./modules/auth/routes/authRotasi");
    const route = router.stack.find(item => item.route?.path === "/hesap");
    assert.ok(route);
    assert.equal(route.route.methods.delete, true);
    assert.equal(Boolean(route.route.methods.get), false);
});
