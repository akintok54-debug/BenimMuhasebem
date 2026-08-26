const mongoose = require("mongoose");

const EticaretSiparisSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            index: true
        },

        platform: {
            type: String,
            required: true,
            trim: true,
            uppercase: true
        },

        platformSiparisNo: {
            type: String,
            required: true,
            trim: true
        },

        musteriId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Musteri",
            default: null
        },

        urunler: {
            type: [
                {
                    urunId: {
                        type: mongoose.Schema.Types.ObjectId,
                        ref: "Urun",
                        required: true
                    },

                    miktar: {
                        type: Number,
                        required: true,
                        min: 0.0001
                    },

                    birimFiyat: {
                        type: Number,
                        required: true,
                        min: 0
                    }
                }
            ],
            default: []
        },

        toplam: {
            type: Number,
            default: 0
        },

        durum: {
            type: String,
            enum: [
                "ALINDI",
                "ISLENIYOR",
                "SIPARISE_DONUSTU",
                "TAMAMLANDI",
                "IPTAL"
            ],
            default: "ALINDI"
        },

        hamVeri: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        }
    },
    {
        timestamps: true
    }
);

EticaretSiparisSchema.index(
    { tenantId: 1, platform: 1, platformSiparisNo: 1 },
    { unique: true }
);

module.exports = mongoose.model(
    "EticaretSiparis",
    EticaretSiparisSchema
);
