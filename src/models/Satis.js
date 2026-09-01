const mongoose = require("mongoose");

const SatisKalemSchema = new mongoose.Schema(
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

const SatisSchema = new mongoose.Schema(
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

        musteriId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Musteri",
            required: true,
            index: true
        },

        depoId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Depo",
            required: true
        },

        kalemler: {
            type: [SatisKalemSchema],
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
                "ACIK_HESAP",
                "NAKIT",
                "BANKA",
                "KART",
                "CEK",
                "SENET",
                "DIGER"
            ],
            default: "ACIK_HESAP"
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

        hesapTipi: {
            type: String,
            enum: [
                "KASA",
                "BANKA",
                null
            ],
            default: null
        },

        hesapId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null
        },
        durum: { type: String, enum: ["AKTIF", "DUZELTILIYOR", "IPTAL"], default: "AKTIF", index: true },
        revizyonNo: { type: Number, default: 0, min: 0 },
        sonDuzeltmeTarihi: { type: Date, default: null },
        sonDuzeltenKullaniciId: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", default: null },
        iptalTarihi: { type: Date, default: null },
        iptalNedeni: { type: String, trim: true, default: "" },
        iptalEdenKullaniciId: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", default: null },
        satisKanali: {
            type: String,
            enum: ["NORMAL", "PERAKENDE", "SAHA"],
            default: "NORMAL",
            index: true
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

SatisSchema.index(
    { tenantId: 1, belgeNo: 1 },
    { unique: true }
);

SatisSchema.index({
    tenantId: 1,
    tarih: -1
});

SatisSchema.plugin(require("./plugins/transactionPlugin"));
module.exports = mongoose.model("Satis", SatisSchema);

