require("dotenv").config();
const mongoose = require("mongoose");
const { indeksleriEsitle } = require("../src/services/mongodbIndeksServisi");

async function calistir() {
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI tanımlı değil.");
    const eskiIndeksiKaldir = process.argv.includes("--drop-legacy-barcode-index");
    await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
    await indeksleriEsitle({ eskiBarkodIndeksiniKaldir: eskiIndeksiKaldir });
    console.log(`MongoDB indeksleri eşitlendi${eskiIndeksiKaldir ? "; eski barkod indeksi kaldırıldı" : ""}.`);
}

calistir()
    .catch((error) => {
        console.error("MongoDB indeks eşitleme hatası:", error.message);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
