const mongoose = require("mongoose");

const ParaHareketSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            index: true
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

        tip: {
            type: String,
            enum: [
                "GIRIS",
                "CIKIS",
                "TRANSFER"
            ],
            required: true
        },

        tutar: {
            type: Number,
            required: true,
            min: 0
        },

        aciklama: {
            type: String,
            trim: true,
            default: ""
        },

        kaynak: {
            type: String,
            default: "MANUEL"
        },

        kaynakId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null
        },

        belgeNo: { type: String, trim: true, default: "" },

        karsiHesapTipi: {
            type: String,
            enum: ["KASA", "BANKA", null],
            default: null
        },

        karsiHesapId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null
        },

        tarih: {
            type: Date,
            default: Date.now
        },

        kullaniciId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Kullanici",
            default: null
        }
    },
    {
        timestamps: true
    }
);

ParaHareketSchema.index({
    tenantId: 1,
    hesapTipi: 1,
    hesapId: 1,
    tarih: -1
});

module.exports = mongoose.model(
    "ParaHareket",
    ParaHareketSchema
);
