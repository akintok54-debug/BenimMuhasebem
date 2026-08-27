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

test("Ürün API kimliksiz erişimi reddeder", async () => {
    const server = await testSunucusuAc();

    try {
        const address = server.address();
        const response = await fetch(`http://127.0.0.1:${address.port}/api/tenant/urunler`);
        const data = await response.json();

        assert.equal(response.status, 401);
        assert.equal(data.basarili, false);
        assert.equal(data.mesaj, "Yetkilendirme tokenı gerekli.");
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test("Özel fiyat listesi API kimliksiz erişimi reddeder", async () => {
    const server = await testSunucusuAc();
    try {
        const address = server.address();
        const response = await fetch(`http://127.0.0.1:${address.port}/api/tenant/urunler/ozel-fiyatlar`);
        const data = await response.json();
        assert.equal(response.status, 401);
        assert.equal(data.basarili, false);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test("Özel fiyat silme rotası ana ürünü silen bir rota açmaz", () => {
    const router = require("./routes/urunRotasi");
    const yollar = router.stack.filter(x => x.route).map(x => ({ path: x.route.path, methods: x.route.methods }));
    assert.ok(yollar.some(x => x.path === "/ozel-fiyatlar/:id" && x.methods.delete));
    assert.equal(yollar.some(x => x.path === "/:id" && x.methods.delete), false);
});

test("Ürün kategori API kimliksiz erişimi reddeder", async () => {
    const server = await testSunucusuAc();

    try {
        const address = server.address();
        const response = await fetch(`http://127.0.0.1:${address.port}/api/tenant/urunler/kategoriler`);
        const data = await response.json();

        assert.equal(response.status, 401);
        assert.equal(data.basarili, false);
        assert.equal(data.mesaj, "Yetkilendirme tokenı gerekli.");
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});
