require("dotenv").config();
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Kullanici = require("./models/Kullanici");
const { telefonNormalize } = require("./utils/kullaniciKimligi");
const { izinVar, etkinYetkiler, YETKI_KATALOGU } = require("./middleware/yetkiKontrol");

async function istek(url, options = {}) {
    const uygulama = require("./uygulama"), server = uygulama.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    try { const { port } = server.address(); return await fetch(`http://127.0.0.1:${port}${url}`, { headers: { "Content-Type": "application/json" }, ...options }); }
    finally { await new Promise(resolve => server.close(resolve)); }
}

test("Kullanıcı yönetimi oluşturma, güncelleme, yetki ve parola uçlarını korur", async () => {
    const id = "507f1f77bcf86cd799439011";
    for (const [method, url] of [["GET", "/api/tenant/kullanicilar"], ["POST", "/api/tenant/kullanicilar"], ["PATCH", `/api/tenant/kullanicilar/${id}`], ["PATCH", `/api/tenant/kullanicilar/${id}/yetkiler`], ["POST", `/api/tenant/kullanicilar/${id}/sifre`]]) {
        const response = await istek(url, { method, body: method === "GET" ? undefined : "{}" }); assert.equal(response.status, 401);
    }
});

test("Telefon kimliği normalize edilir ve kullanıcı modeli kapsamlı özel yetkileri saklar", () => {
    assert.equal(telefonNormalize("0532 111 22 33"), "905321112233");
    assert.ok(Kullanici.schema.path("telefonNormalize"));
    assert.ok(Kullanici.schema.path("yetkiModu"));
    for (const kod of ["sales.read", "sales.write", "stock.read", "cash.write", "tenant.users", "balance.adjust", "field.settle"]) assert.ok(Kullanici.schema.path("ozelYetkiler").options.enum.includes(kod), kod);
});

test("Rol varsayılanı ve kutucukla belirlenen özel yetkiler birbirinden ayrıdır", () => {
    assert.equal(izinVar("SALES", "sales.write"), true);
    assert.equal(izinVar("SALES", "cash.read"), false);
    const izinler = etkinYetkiler({ rol: "SALES", yetkiModu: "OZEL", ozelYetkiler: ["sales.read"] });
    assert.deepEqual(izinler, ["sales.read"]);
    assert.ok(YETKI_KATALOGU.length >= 16);
});

test("Kullanıcı servisi tenant izolasyonu, sahip koruması ve bcrypt parola saklama uygular", () => {
    const kaynak = fs.readFileSync(path.join(__dirname, "controllers", "kullaniciYonetimController.js"), "utf8");
    assert.match(kaynak, /tenantId: tenantId\(req\)/);
    assert.match(kaynak, /kullanici\.rol === "OWNER"/);
    assert.match(kaynak, /bcrypt\.hash\(sifre, 12\)/);
    assert.match(kaynak, /Kendi rol ve yetkilerinizi/);
});

test("Giriş ve mobil kullanıcı ekranı e-posta veya telefon ile kutucuklu yetki yönetimi sunar", () => {
    const auth = fs.readFileSync(path.join(__dirname, "modules", "auth", "controllers", "authController.js"), "utf8"), login = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "login.html"), "utf8"), js = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "erp.js"), "utf8");
    assert.match(auth, /telefonNormalize/); assert.match(auth, /body\.kimlik/);
    assert.match(login, /E-posta veya cep telefonu/);
    for (const metin of ["Yeni Saha Kullanıcısı", "Modül ve İşlem Yetkileri", "Rol Önerisini Uygula", "Pasif — girişi engelle", "mobilYetkiMenusunuUygula"]) assert.ok(js.includes(metin), metin);
});

test("Eski tenant kurucusu OWNER rolüne güvenli ve auditli biçimde yükseltilir", () => {
    const middleware = fs.readFileSync(path.join(__dirname, "middleware", "tenantKontrol.js"), "utf8");
    const auth = fs.readFileSync(path.join(__dirname, "modules", "auth", "controllers", "authController.js"), "utf8");
    const controller = fs.readFileSync(path.join(__dirname, "controllers", "kullaniciYonetimController.js"), "utf8");
    const ui = fs.readFileSync(path.join(__dirname, "..", "public", "erp", "erp.js"), "utf8");
    assert.match(auth, /rol: "OWNER"/);
    assert.match(auth, /tenant\.createdBy = kullanici\._id/);
    assert.match(middleware, /Kullanici\.exists\(\{ tenantId, rol: "OWNER"/);
    assert.match(middleware, /tenant\.createdBy[\s\S]+ilkKullanici/);
    assert.match(middleware, /rol: "ADMIN"[\s\S]+\$set: \{ rol: "OWNER" \}/);
    assert.match(middleware, /LEGACY_TENANT_OWNER_REPAIR/);
    assert.match(controller, /aktifKullaniciRol: req\.currentUser\?\.rol/);
    assert.match(ui, /aktifRol === "ADMIN" && mevcut\.rol === "ADMIN"/);
});
