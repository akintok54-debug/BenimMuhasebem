const mongoose = require("mongoose");

const TedarikciSchema = new mongoose.Schema(
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

        adSoyad: {
            type: String,
            trim: true,
            default: ""
        },

        unvan: {
            type: String,
            trim: true,
            default: ""
        },

        yetkili: {
            type: String,
            trim: true,
            default: ""
        },

        telefon: {
            type: String,
            trim: true,
            default: ""
        },

        whatsapp: {
            type: String,
            trim: true,
            default: ""
        },

        email: {
            type: String,
            lowercase: true,
            trim: true,
            default: ""
        },

        vergiDairesi: {
            type: String,
            trim: true,
            default: ""
        },

        vergiNo: {
            type: String,
            trim: true,
            default: ""
        },

        adres: {
            type: String,
            trim: true,
            default: ""
        },

        il: {
            type: String,
            trim: true,
            default: ""
        },

        ilce: {
            type: String,
            trim: true,
            default: ""
        },

        postaKodu: {
            type: String,
            trim: true,
            default: ""
        },

        vadeGun: {
            type: Number,
            default: 0,
            min: 0
        },

        limit: {
            type: Number,
            default: 0,
            min: 0
        },

        bakiye: {
            type: Number,
            default: 0
        },

        notlar: {
            type: String,
            trim: true,
            default: ""
        },

        aktif: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true
    }
);

TedarikciSchema.index(
    { tenantId: 1, kod: 1 },
    { unique: true }
);

TedarikciSchema.index({
    tenantId: 1,
    unvan: 1
});

TedarikciSchema.index({
    tenantId: 1,
    telefon: 1
});

module.exports = mongoose.model("Tedarikci", TedarikciSchema);
