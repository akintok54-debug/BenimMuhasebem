const mongoose = require("mongoose");

const StokSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            index: true
        },

        urunId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Urun",
            required: true,
            index: true
        },

        depoId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Depo",
            required: true,
            index: true
        },

        miktar: {
            type: Number,
            default: 0,
            min: 0
        },

        maliyet: {
            type: Number,
            default: 0,
            min: 0
        },

        sonHareketTarihi: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

StokSchema.index(
    { tenantId: 1, urunId: 1, depoId: 1 },
    { unique: true }
);

module.exports = mongoose.model("Stok", StokSchema);
