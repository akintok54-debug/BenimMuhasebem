require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const uygulama = require("./uygulama");

test("BAHADIR ERP sağlık endpointi çalışır", async () => {
    const server = await new Promise((resolve, reject) => {
        const instance = uygulama.listen(0, "127.0.0.1", () => resolve(instance));
        instance.once("error", reject);
    });

    try {
        const address = server.address();
        const response = await fetch(`http://127.0.0.1:${address.port}/api/saglik`);
        const data = await response.json();
        assert.equal(response.status, 200);
        assert.equal(data.basarili, true);
        assert.equal(data.durum, "CALISIYOR");
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});
