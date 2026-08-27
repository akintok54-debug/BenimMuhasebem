const mongoose = require("mongoose");

async function veritabaniBaglan() {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
        throw new Error("MONGODB_URI tanımlı değil.");
    }

    await mongoose.connect(uri, {
        serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 10000),
        autoIndex: process.env.NODE_ENV !== "production"
    });

    console.log("MongoDB bağlantısı başarılı.");
}

module.exports = veritabaniBaglan;
