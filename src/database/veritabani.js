const mongoose = require("mongoose");

async function veritabaniBaglan() {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
        throw new Error("MONGODB_URI tanımlı değil.");
    }

    await mongoose.connect(uri);

    console.log("MongoDB bağlantısı başarılı.");
}

module.exports = veritabaniBaglan;
