const mongoose = require("mongoose");

const BankaSchema = new mongoose.Schema(
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

        bankaAdi: {
            type: String,
            required: true,
            trim: true
        },

        sube: {
            type: String,
            trim: true,
            default: ""
        },

        iban: {
            type: String,
            trim: true,
            default: ""
        },

        hesapNo: {
            type: String,
            trim: true,
            default: ""
        },

        bakiye: {
            type: Number,
            default: 0
        },

        aktif: {
            type: Boolean,
            default: true
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

BankaSchema.index(
    { tenantId: 1, kod: 1 },
    { unique: true }
);

module.exports = mongoose.model("Banka", BankaSchema);
