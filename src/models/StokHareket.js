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
                "TRANSFER_CIKIS",
                "DEVIR_GIRIS",
                "DEVIR_CIKIS"
            ],
            required: true
        },

        miktar: {
            type: Number,
            required: true,
            min: 0
        },

        tarih: {
            type: Date,
            default: Date.now,
            index: true
        },

        birimMaliyet: {
            type: Number,
            default: 0,
            min: 0
        },

        maliyetDogrulandi: {
            type: Boolean,
            default: false
        },

        maliyetKaynagi: {
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

        islemAnahtari: { type: String, default: undefined, select: false },
        durum: { type: String, enum: ["AKTIF", "IPTAL_ISLENIYOR", "IPTAL"], default: "AKTIF", index: true },
        iptalTarihi: { type: Date, default: null },
        iptalNedeni: { type: String, trim: true, default: "" },
        iptalEdenKullaniciId: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", default: null },
        tersHareketId: { type: mongoose.Schema.Types.ObjectId, ref: "StokHareket", default: null },

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

StokHareketSchema.index({ tenantId: 1, islemAnahtari: 1 }, { unique: true, sparse: true });
StokHareketSchema.index({ tenantId: 1, tarih: -1, depoId: 1 });

StokHareketSchema.plugin(require("./plugins/transactionPlugin"));
module.exports = mongoose.model("StokHareket", StokHareketSchema);
