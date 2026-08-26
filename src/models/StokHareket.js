const mongoose = require("mongoose");

const StokHareketSchema = new mongoose.Schema(
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

        tip: {
            type: String,
            enum: [
                "GIRIS",
                "CIKIS",
                "SAYIM_ARTI",
                "SAYIM_EKSI",
                "IADE_GIRIS",
                "IADE_CIKIS",
                "TRANSFER_GIRIS",
                "TRANSFER_CIKIS"
            ],
            required: true
        },

        miktar: {
            type: Number,
            required: true,
            min: 0
        },

        birimMaliyet: {
            type: Number,
            default: 0,
            min: 0
        },

        kaynak: {
            type: String,
            default: "MANUEL"
        },

        kaynakId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null
        },

        aciklama: {
            type: String,
            trim: true,
            default: ""
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

StokHareketSchema.index({
    tenantId: 1,
    urunId: 1,
    createdAt: -1
});

module.exports = mongoose.model("StokHareket", StokHareketSchema);
