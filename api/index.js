const uygulama = require("../src/uygulama");
const mongoose = require("mongoose");
const veritabaniBaglan = require("../src/database/veritabani");

let baglantiSozu = null;

async function veritabaniHazirla() {
    if (mongoose.connection.readyState === 1) return;
    if (!baglantiSozu) {
        baglantiSozu = veritabaniBaglan().catch(error => {
            baglantiSozu = null;
            throw error;
        });
    }
    await baglantiSozu;
}

module.exports = async function handler(req, res) {
    try {
        if (String(req.url || "").split("?")[0] === "/api/assets/xlsx.js") {
            return uygulama(req, res);
        }
        await veritabaniHazirla();
        return uygulama(req, res);
    } catch (error) {
        console.error("VERCEL_MONGODB_BAGLANTI_HATASI", { message: error.message });
        return res.status(503).json({ basarili: false, mesaj: "Veritabanı bağlantısı geçici olarak kullanılamıyor." });
    }
};
