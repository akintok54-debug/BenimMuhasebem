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

test("Stok API kimliksiz erişimi reddeder", async () => {
    const server = await testSunucusuAc();

    try {
        const address = server.address();
        const response = await fetch(`http://127.0.0.1:${address.port}/api/tenant/stok`);
        const data = await response.json();

        assert.equal(response.status, 401);
        assert.equal(data.basarili, false);
        assert.equal(data.mesaj, "Yetkilendirme tokenı gerekli.");
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test("Stok transfer API kimliksiz erişimi reddeder", async () => {
    const server = await testSunucusuAc();

    try {
        const address = server.address();
        const response = await fetch(`http://127.0.0.1:${address.port}/api/tenant/stok/transfer`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
        });
        const data = await response.json();

        assert.equal(response.status, 401);
        assert.equal(data.basarili, false);
        assert.equal(data.mesaj, "Yetkilendirme tokenı gerekli.");
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

for (const endpoint of ["/api/tenant/stok/transferler", "/api/tenant/stok/sayimlar"]) {
    test(`${endpoint} kimliksiz erişimi reddeder`, async () => {
        const server = await testSunucusuAc();
        try {
            const response = await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`);
            const data = await response.json();
            assert.equal(response.status, 401);
            assert.equal(data.basarili, false);
        } finally { await new Promise(resolve => server.close(resolve)); }
    });
}

test("Stok sayım API kimliksiz erişimi reddeder", async () => {
    const server = await testSunucusuAc();
    try {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/tenant/stok/sayim`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
        });
        const data = await response.json();
        assert.equal(response.status, 401);
        assert.equal(data.basarili, false);
    } finally { await new Promise(resolve => server.close(resolve)); }
});
