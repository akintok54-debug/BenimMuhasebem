const mongoose = require("mongoose");

const SiparisKalemSchema = new mongoose.Schema(
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
            min: 0,
            max: 100
        },

        araToplam: Number,
        kdvTutari: Number,
        toplam: Number
    },
    { _id: true }
);

const SiparisSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            index: true
        },

        siparisNo: {
            type: String,
            required: true,
            trim: true,
            uppercase: true
        },

        tarih: {
            type: Date,
            default: Date.now
        },

        musteriId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Musteri",
            required: true,
            index: true
        },

        teklifId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Teklif",
            default: null
        },

        depoId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Depo",
            required: true
        },

        kalemler: {
            type: [SiparisKalemSchema],
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

        paraBirimi: { type: String, enum: ["TRY", "USD", "EUR"], default: "TRY" },
        teslimTarihi: { type: Date, default: null },
        sevkAdresi: { type: String, trim: true, maxlength: 700, default: "" },
        odemeKosullari: { type: String, trim: true, maxlength: 500, default: "" },

        durum: {
            type: String,
            enum: [
                "TASLAK",
                "ONAYLANDI",
                "HAZIRLANIYOR",
                "KISMI_SEVK",
                "SEVK_EDILDI",
                "TAMAMLANDI",
                "IPTAL"
            ],
            default: "TASLAK"
        },

        satisId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Satis",
            default: null
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

SiparisSchema.index(
    { tenantId: 1, siparisNo: 1 },
    { unique: true }
);

module.exports = mongoose.model("Siparis", SiparisSchema);
