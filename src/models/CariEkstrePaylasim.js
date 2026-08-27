const mongoose = require("mongoose");

const CariEkstrePaylasimSchema = new mongoose.Schema(
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
        token: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        sonGecerlilik: {
            type: Date,
            required: true,
            index: { expires: 0 }
        },
        olusturanKullaniciId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Kullanici",
            default: null
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("CariEkstrePaylasim", CariEkstrePaylasimSchema);
