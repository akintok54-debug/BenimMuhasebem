const mongoose = require("mongoose");

const PersonelSchema = new mongoose.Schema(
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
            required: true,
            trim: true
        },

        telefon: {
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

        gorev: {
            type: String,
            trim: true,
            default: ""
        },

        departman: {
            type: String,
            trim: true,
            default: ""
        },

        iseGirisTarihi: {
            type: Date,
            default: null
        },

        maas: {
            type: Number,
            default: 0,
            min: 0
        },

        aktif: {
            type: Boolean,
            default: true
        },

        notlar: {
            type: String,
            trim: true,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

PersonelSchema.index(
    { tenantId: 1, kod: 1 },
    { unique: true }
);

PersonelSchema.index({
    tenantId: 1,
    adSoyad: 1
});

module.exports = mongoose.model("Personel", PersonelSchema);
