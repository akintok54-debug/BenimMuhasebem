require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Kullanici = require("./models/Kullanici");
const { izinVar, etkinYetkiler, yetkiKontrol, YETKI_KATALOGU } = require("./middleware/yetkiKontrol");

async function middlewareSonucu(kullanici, gerekli) {
    let nextCalisti = false;
    let durum = 200;
    const req = { currentUser: kullanici, kullanici: {} };
    const res = {
        locals: {},
        status(kod) { durum = kod; return this; },
        json(veri) { this.veri = veri; return this; }
    };
    await yetkiKontrol(gerekli)(req, res, () => { nextCalisti = true; });
    return { nextCalisti, durum, veri: res.veri };
}

test("sales role can manage customers but cannot access suppliers, purchases or reports", () => {
    assert.equal(izinVar("SALES", "customer.read"), true);
    assert.equal(izinVar("SALES", "customer.write"), true);
    assert.equal(izinVar("SALES", "supplier.read"), false);
    assert.equal(izinVar("SALES", "supplier.write"), false);
    assert.equal(izinVar("SALES", "purchase.read"), false);
    assert.equal(izinVar("SALES", "reports.read"), false);

    for (const kod of ["customer.read", "customer.write", "supplier.read", "supplier.write"]) {
        assert.ok(Kullanici.schema.path("ozelYetkiler").options.enum.includes(kod), kod);
        assert.ok(YETKI_KATALOGU.some(x => x.kod === kod), kod);
    }
});

test("legacy party permission is customer-only for sales and remains compatible for other roles", () => {
    const satis = etkinYetkiler({ rol: "SALES", yetkiModu: "OZEL", ozelYetkiler: ["party.read"] });
    const yonetici = etkinYetkiler({ rol: "MANAGER", yetkiModu: "OZEL", ozelYetkiler: ["party.read"] });
    assert.deepEqual(satis.filter(x => ["customer.read", "supplier.read"].includes(x)), ["customer.read"]);
    assert.deepEqual(yonetici.filter(x => ["customer.read", "supplier.read"].includes(x)), ["customer.read", "supplier.read"]);
});

test("backend middleware rejects supplier access for sales with legacy party permission", async () => {
    const kullanici = { rol: "SALES", yetkiModu: "OZEL", ozelYetkiler: ["party.read", "party.write"] };
    const musteri = await middlewareSonucu(kullanici, "customer.read");
    const tedarikci = await middlewareSonucu(kullanici, "supplier.read");
    assert.equal(musteri.nextCalisti, true);
    assert.equal(tedarikci.nextCalisti, false);
    assert.equal(tedarikci.durum, 403);
});

test("supplier, purchase, current account and reports enforce split permissions on backend", () => {
    const oku = ad => fs.readFileSync(path.join(__dirname, ad), "utf8");
    const tedarikci = oku("routes/tedarikciRotasi.js");
    const alis = oku("routes/alisRotasi.js");
    const cariRotasi = oku("routes/cariRotasi.js");
    const cari = oku("controllers/cariController.js");
    const rapor = oku("controllers/raporController.js");

    assert.match(tedarikci, /yetkiKontrol\("supplier\.read"\)/);
    assert.match(tedarikci, /yetkiKontrol\("supplier\.write"\)/);
    assert.match(alis, /yetkiKontrol\("purchase\.read"\)/);
    assert.match(alis, /yetkiKontrol\("supplier\.read"\)/);
    assert.match(cariRotasi, /yetkiKontrol\("customer\.read", "supplier\.read"\)/);
    assert.match(cariRotasi, /yetkiKontrol\("supplier\.write"\)/);
    assert.match(cari, /erisim\.musteri \? "MUSTERI" : "TEDARIKCI"/);
    assert.match(rapor, /tedarikciGorebilir \? Alis\.find/);
});

test("field user form uses roomy responsive layout and supplier UI is permission gated", () => {
    const js = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "erp.js"), "utf8");
    const css = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "erp.css"), "utf8");
    assert.match(js, /classList\.add\("user-permission-modal"\)/);
    assert.match(js, /tedarikciErisimi \? api\("\/api\/tenant\/tedarikciler"\)/);
    assert.match(js, /button\.hidden = !sayfaErisimiVar/);
    assert.match(css, /\.user-permission-modal/);
    assert.match(css, /grid-template-columns: repeat\(2/);
});
