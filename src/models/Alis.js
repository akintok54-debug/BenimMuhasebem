const mongoose = require("mongoose");

const AlisKalemSchema = new mongoose.Schema(
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

        araToplam: {
            type: Number,
            default: 0
        },

        kdvTutari: {
            type: Number,
            default: 0
        },

        toplam: {
            type: Number,
            default: 0
        }
    },
    {
        _id: true
    }
);

const AlisSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            index: true
        },

        belgeNo: {
            type: String,
            required: true,
            trim: true,
            uppercase: true
        },

        tarih: {
            type: Date,
            default: Date.now,
            required: true
        },

        tedarikciId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tedarikci",
            required: true,
            index: true
        },

        depoId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Depo",
            required: true
        },

        kalemler: {
            type: [AlisKalemSchema],
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

        odemeDurumu: {
            type: String,
            enum: [
                "ACIK",
                "KISMI",
                "ODENDI"
            ],
            default: "ACIK"
        },

        odemeTipi: {
            type: String,
            enum: [
                "NAKIT",
                "KART",
                "HAVALE_EFT",
                "SENET",
                "CEK"
            ],
            default: "NAKIT"
        },

        odenenTutar: {
            type: Number,
            default: 0,
            min: 0
        },

        kalanTutar: {
            type: Number,
            default: 0,
            min: 0
        },

        notlar: {
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

AlisSchema.index(
    { tenantId: 1, belgeNo: 1 },
    { unique: true }
);

AlisSchema.index({
    tenantId: 1,
    tarih: -1
});

AlisSchema.plugin(require("./plugins/transactionPlugin"));
module.exports = mongoose.model("Alis", AlisSchema);

