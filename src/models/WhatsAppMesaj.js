const mongoose = require("mongoose");

const WhatsAppMesajSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            index: true
        },

        musteriId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Musteri",
            required: true,
            index: true
        },

        telefon: {
            type: String,
            required: true,
            trim: true
        },

        mesaj: {
            type: String,
            required: true,
            trim: true
        },

        tip: {
            type: String,
            enum: [
                "GENEL",
                "SIPARIS",
                "TAHSILAT",
                "ODEME",
                "STOK",
                "BILGILENDIRME"
            ],
            default: "GENEL"
        },

        durum: {
            type: String,
            enum: [
                "BEKLIYOR",
                "GONDERILDI",
                "BASARISIZ"
            ],
            default: "BEKLIYOR"
        },

        provider: {
            type: String,
            default: "YOK"
        },

        providerId: {
            type: String,
            default: ""
        },

        hata: {
            type: String,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

WhatsAppMesajSchema.index({
    tenantId: 1,
    createdAt: -1
});

module.exports = mongoose.model(
    "WhatsAppMesaj",
    WhatsAppMesajSchema
);
