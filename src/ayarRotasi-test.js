require("dotenv").config();
const test = require("node:test");
const assert = require("node:assert/strict");
const uygulama = require("./uygulama");
const controller = require("./controllers/ayarController");

async function sunucuAc() {
    return new Promise((resolve, reject) => {
        const server = uygulama.listen(0, "127.0.0.1", () => resolve(server));
        server.once("error", reject);
    });
}

test("Ayarlar API kimliksiz erişimi reddeder", async () => {
    const server = await sunucuAc();
    try {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/tenant/ayarlar`);
        assert.equal(response.status, 401);
        assert.equal((await response.json()).basarili, false);
    } finally { await new Promise(resolve => server.close(resolve)); }
});

test("Üç profesyonel hazır belge şablonu vardır", () => {
    assert.deepEqual(controller.HAZIR_SABLONLAR.map(x => x.id), ["modern", "klasik", "kompakt"]);
});

test("Temel entegrasyon kategorilerinin tamamı tanımlıdır", () => {
    assert.deepEqual(controller.ENTEGRASYON_TIPLERI, ["E_FATURA", "E_IRSALIYE", "E_POSTA", "WHATSAPP", "E_TICARET", "KARGO", "ODEME", "MUHASEBE"]);
});
