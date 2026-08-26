const mongoose = require("mongoose");

const CariHareketSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            index: true
        },

        tarafTipi: {
            type: String,
            enum: ["MUSTERI", "TEDARIKCI"],
            required: true
        },

        tarafId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true
        },

        tip: {
            type: String,
            enum: [
                "BORC",
                "ALACAK",
                "TAHSILAT",
                "ODEME",
                "IADE",
                "DUZELTME"
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

        kullaniciId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Kullanici",
            default: null
        },

        tarih: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true
    }
);

CariHareketSchema.index({
    tenantId: 1,
    tarafTipi: 1,
    tarafId: 1,
    tarih: -1
});

module.exports = mongoose.model("CariHareket", CariHareketSchema);
