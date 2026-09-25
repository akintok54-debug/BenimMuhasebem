require("../src/modules/platform/services/runtimeIzleme");
const uygulama = require("../src/uygulama");
const mongoose = require("mongoose");
const veritabaniBaglan = require("../src/database/veritabani");
const { productionGuvenlikDogrula } = require("../src/services/productionGuvenlikServisi");
let baglantiSozu = null;

async function veritabaniHazirla() {
    if (mongoose.connection.readyState === 1) return;
    if (!baglantiSozu) {
        baglantiSozu = Promise.resolve().then(() => {
            productionGuvenlikDogrula();
            return veritabaniBaglan();
        }).finally(() => { baglantiSozu = null; });
    }
    await baglantiSozu;
}
module.exports = async function handler(req, res) {
    try {
        if (["/api/assets/xlsx.js", "/api/assets/jszip.js"].includes(String(req.url || "").split("?")[0])) {
            return uygulama(req, res);
        }
        await veritabaniHazirla();
        return uygulama(req, res);
    } catch (_) {
        // Driver messages may contain connection details. Never log the URI or credentials.
        console.error("VERCEL_MONGODB_BAGLANTI_HATASI");
        return res.status(503).json({ basarili: false, mesaj: "Veritabanı bağlantısı geçici olarak kullanılamıyor." });
    }
};
