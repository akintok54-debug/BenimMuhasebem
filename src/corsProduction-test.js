require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const uygulama = require("./uygulama");

async function istek(origin) {
    const server = await new Promise((resolve, reject) => {
        const instance = uygulama.listen(0, "127.0.0.1", () => resolve(instance));
        instance.once("error", reject);
    });
    try {
        const { port } = server.address();
        return await fetch(`http://127.0.0.1:${port}/api/saglik`, { headers: { Origin: origin } });
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}

for (const origin of ["https://www.benimmuhasebe.com"]) {
    test(`${origin} mobil/web origin erişimine izin verilir`, async () => {
        const response = await istek(origin);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("access-control-allow-origin"), origin);
        assert.equal(response.headers.get("access-control-allow-credentials"), "true");
    });
}

test("www olmayan production origin erişimine izin verilmez", async () => {
    const response = await istek("https://benimmuhasebe.com");
    assert.equal(response.status, 403);
});
