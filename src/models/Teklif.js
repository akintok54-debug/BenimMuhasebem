const mongoose = require("mongoose");

const TeklifKalemSchema = new mongoose.Schema(
    {
        urunId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Urun",
            required: true
        },

        miktar: {
            type: Number,
            required: true,
            min: 0.0001
        },

        birimFiyat: {
            type: Number,
            required: true,
            min: 0
        },

        kdv: {
            type: Number,
            default: 20,
            min: 0
        },

        iskonto: {
            type: Number,
            default: 0,
            min: 0
        },

        araToplam: Number,
        kdvTutari: Number,
        toplam: Number
    },
    { _id: true }
);

const TeklifSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            index: true
        },

        teklifNo: {
            type: String,
            required: true,
            trim: true,
            uppercase: true
        },

        tarih: {
            type: Date,
            default: Date.now
        },

        gecerlilikTarihi: {
            type: Date,
            default: null
        },

        musteriId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Musteri",
            required: true,
            index: true
        },

        kalemler: {
            type: [TeklifKalemSchema],
            required: true
        },

        araToplam: {
            type: Number,
            default: 0
        },

        toplamKdv: {
            type: Number,
            default: 0
        },

        genelToplam: {
            type: Number,
            default: 0
        },

        durum: {
            type: String,
            enum: [
                "TASLAK",
                "GONDERILDI",
                "ONAYLANDI",
                "REDDEDILDI",
                "IPTAL"
            ],
            default: "TASLAK"
        },

        notlar: {
            type: String,
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

TeklifSchema.index(
    { tenantId: 1, teklifNo: 1 },
    { unique: true }
);

module.exports = mongoose.model("Teklif", TeklifSchema);
