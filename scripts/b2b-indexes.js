require("dotenv").config({ quiet: true });
const mongoose = require("mongoose");
async function run() {
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI gerekli.");
    await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, serverSelectionTimeoutMS: 10000 });
    await require("../src/modules/b2b/models/BayiGrubu").createIndexes();
    await require("../src/models/Siparis").createIndexes();
    console.log("B2B grup ve mevcut sipariş indeksleri hazır; veri veya indeks silinmedi.");
}
run().catch(error => { console.error("B2B_INDEX_FAILED", error.code || error.name); process.exitCode = 1; }).finally(() => mongoose.disconnect());
