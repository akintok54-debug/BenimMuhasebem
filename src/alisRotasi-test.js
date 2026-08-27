require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const uygulama = require("./uygulama");

function testSunucusuAc() {
    return new Promise((resolve, reject) => {
        const server = uygulama.listen(0, "127.0.0.1", () => resolve(server));
        server.once("error", reject);
    });
}

for (const [method, endpoint] of [["GET", "/api/tenant/alis"], ["GET", "/api/tenant/alis/iade"], ["POST", "/api/tenant/alis"], ["POST", "/api/tenant/alis/iade"]]) {
    test(`${method} ${endpoint} kimliksiz erişimi reddeder`, async () => {
        const server = await testSunucusuAc();
        try {
            const response = await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`, { method, headers: { "Content-Type": "application/json" }, body: method === "POST" ? "{}" : undefined });
            const data = await response.json();
            assert.equal(response.status, 401);
            assert.equal(data.basarili, false);
        } finally { await new Promise(resolve => server.close(resolve)); }
    });
}
