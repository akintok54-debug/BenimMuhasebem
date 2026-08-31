const mongoose = require("mongoose");

const KasaSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            index: true
        },

        kod: {
            type: String,
            required: true,
            trim: true,
            uppercase: true
        },

        ad: {
            type: String,
            required: true,
            trim: true
        },

        bakiye: {
            type: Number,
            default: 0
        },

        acilisBakiyesi: {
            type: Number,
            default: 0
        },

        acilisTarihi: {
            type: Date,
            default: Date.now
        },

        paraBirimi: {
            type: String,
            enum: ["TRY", "USD", "EUR"],
            default: "TRY"
        },

        kasaTuru: {
            type: String,
            enum: ["NAKIT", "DIGER"],
            default: "NAKIT"
        },

        aktif: {
            type: Boolean,
            default: true
        },

        sorumlu: {
            type: String,
            trim: true,
            default: ""
        },

        sorumluKullaniciId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Kullanici",
            default: null,
            index: true
        },

        sahaKasasi: {
            type: Boolean,
            default: false,
            index: true
        },

        sube: {
            type: String,
            trim: true,
            default: ""
        },

        aciklama: {
            type: String,
            trim: true,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

KasaSchema.index(
    { tenantId: 1, kod: 1 },
    { unique: true }
);

KasaSchema.index(
    { tenantId: 1, sorumluKullaniciId: 1 },
    { unique: true, partialFilterExpression: { sahaKasasi: true } }
);

module.exports = mongoose.model("Kasa", KasaSchema);
