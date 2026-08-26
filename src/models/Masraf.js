const mongoose = require("mongoose");

const MasrafSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            index: true
        },

        tarih: {
            type: Date,
            default: Date.now,
            required: true
        },

        kategori: {
            type: String,
            enum: [
                "KIRA",
                "ELEKTRIK",
                "SU",
                "INTERNET",
                "TELEFON",
                "KARGO",
                "AKARYAKIT",
                "PERSONEL",
                "VERGI",
                "SGK",
                "REKLAM",
                "OFIS",
                "DIGER"
            ],
            default: "DIGER",
            required: true
        },

        aciklama: {
            type: String,
            trim: true,
            required: true
        },

        tutar: {
            type: Number,
            required: true,
            min: 0
        },

        hesapTipi: {
            type: String,
            enum: ["KASA", "BANKA"],
            required: true
        },

        hesapId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true
        },

        odemeDurumu: {
            type: String,
            enum: [
                "ODENDI",
                "BEKLIYOR"
            ],
            default: "ODENDI"
        },

        kaynak: {
            type: String,
            default: "MANUEL"
        },

        kullaniciId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Kullanici",
            default: null
        },

        paraHareketId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ParaHareket",
            default: null
        }
    },
    {
        timestamps: true
    }
);

MasrafSchema.index({
    tenantId: 1,
    tarih: -1
});

module.exports = mongoose.model("Masraf", MasrafSchema);
