const mongoose = require("mongoose");

const UrunSchema = new mongoose.Schema(
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

        barkod: {
            type: String,
            trim: true,
            default: ""
        },

        ad: {
            type: String,
            required: true,
            trim: true
        },

        kategori: {
            type: String,
            trim: true,
            default: ""
        },

        marka: {
            type: String,
            trim: true,
            default: ""
        },

        model: {
            type: String,
            trim: true,
            default: ""
        },

        uyumluluk: {
            type: [String],
            default: []
        },

        birim: {
            type: String,
            trim: true,
            default: "ADET"
        },

        kdv: {
            type: Number,
            default: 20,
            min: 0
        },

        alisFiyati: {
            type: Number,
            default: 0,
            min: 0
        },

        satisFiyati: {
            type: Number,
            default: 0,
            min: 0
        },

        bayiFiyati: {
            type: Number,
            default: 0,
            min: 0
        },

        perakendeFiyati: {
            type: Number,
            default: 0,
            min: 0
        },

        iskonto: {
            type: Number,
            default: 0,
            min: 0,
            max: 100
        },

        paraBirimi: {
            type: String,
            enum: ["TRY", "USD", "EUR"],
            default: "TRY"
        },

        gorsel: {
            type: String,
            default: ""
        },

        ekGorseller: {
            type: [String],
            default: [],
            validate: {
                validator: value => !Array.isArray(value) || value.length <= 2,
                message: "En fazla 2 ek görsel eklenebilir."
            }
        },

        minimumStok: {
            type: Number,
            default: 0,
            min: 0
        },

        kritikStok: {
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

UrunSchema.index(
    { tenantId: 1, kod: 1 },
    { unique: true }
);

UrunSchema.index({
    tenantId: 1,
    barkod: 1
});

UrunSchema.index({
    tenantId: 1,
    ad: 1
});

module.exports = mongoose.model("Urun", UrunSchema);
