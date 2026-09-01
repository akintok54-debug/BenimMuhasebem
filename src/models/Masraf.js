const mongoose = require("mongoose");

const MasrafSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            index: true
        },

        tarih: {
            type: Date,
            default: Date.now,
            required: true
        },

        kategori: {
            type: String,
            enum: [
                "KIRA",
                "ELEKTRIK",
                "SU",
                "INTERNET",
                "TELEFON",
                "KARGO",
                "AKARYAKIT",
                "PERSONEL",
                "VERGI",
                "SGK",
                "REKLAM",
                "OFIS",
                "YEMEK",
                "SEYAHAT",
                "BAKIM",
                "TEMIZLIK",
                "SIGORTA",
                "PAZARYERI_KOMISYON",
                "PAZARYERI_HIZMET",
                "DIGER"
            ],
            default: "DIGER",
            required: true
        },

        aciklama: {
            type: String,
            trim: true,
            required: true
        },

        firma: { type: String, trim: true, default: "" },
        fisNo: { type: String, trim: true, default: "" },
        fisGorseli: { type: String, default: "" },
        notlar: { type: String, trim: true, default: "" },
        kdvOrani: { type: Number, min: 0, max: 100, default: 0 },
        kdvTutari: { type: Number, min: 0, default: 0 },
        aracPlaka: { type: String, trim: true, uppercase: true, default: "" },

        tutar: {
            type: Number,
            required: true,
            min: 0
        },

        hesapTipi: {
            type: String,
            enum: ["KASA", "BANKA"],
            required: true
        },

        hesapId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true
        },

        paraBirimi: {
            type: String,
            enum: ["TRY", "USD", "EUR"],
            default: "TRY"
        },

        odemeDurumu: {
            type: String,
            enum: [
                "ODENDI",
                "BEKLIYOR"
            ],
            default: "ODENDI"
        },

        durum: {
            type: String,
            enum: ["AKTIF", "IPTAL"],
            default: "AKTIF",
            index: true
        },

        iptalTarihi: { type: Date, default: null },
        iptalNedeni: { type: String, trim: true, default: "" },
        iptalEdenKullaniciId: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", default: null },
        iptalParaHareketId: { type: mongoose.Schema.Types.ObjectId, ref: "ParaHareket", default: null },

        kaynak: {
            type: String,
            default: "MANUEL"
        },

        kullaniciId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Kullanici",
            default: null
        },

        paraHareketId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ParaHareket",
            default: null
        },

        personelId: { type: mongoose.Schema.Types.ObjectId, ref: "Personel", default: null, index: true },
        personelFinansIslemId: { type: mongoose.Schema.Types.ObjectId, ref: "PersonelFinansIslem", default: null }
    },
    {
        timestamps: true
    }
);

MasrafSchema.index({
    tenantId: 1,
    tarih: -1
});

MasrafSchema.plugin(require("./plugins/transactionPlugin"));
module.exports = mongoose.model("Masraf", MasrafSchema);
