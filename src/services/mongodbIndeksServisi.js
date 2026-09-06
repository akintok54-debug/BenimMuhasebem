const IslemKaydi = require("../models/IslemKaydi");
const Urun = require("../models/Urun");

async function indeksVarMi(collection, ad) {
    const indeksler = await collection.indexes();
    return indeksler.some((indeks) => indeks.name === ad);
}

async function indeksleriEsitle({ eskiBarkodIndeksiniKaldir = false } = {}) {
    if (eskiBarkodIndeksiniKaldir && await indeksVarMi(Urun.collection, "tenantId_1_barkod_1")) {
        await Urun.collection.dropIndex("tenantId_1_barkod_1");
    }
    await IslemKaydi.createIndexes();
    await Urun.createIndexes();
}

module.exports = { indeksVarMi, indeksleriEsitle };
