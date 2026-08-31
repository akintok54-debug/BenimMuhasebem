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

        islemAnahtari: { type: String, default: undefined, select: false },

        belgeNo: { type: String, trim: true, default: "" },

        odemeYontemi: {
            type: String,
            enum: ["NAKIT", "KREDI_KARTI", "IBAN", "SENET", "CEK", null],
            default: null
        },

        bakiyeDegisimi: { type: Number, default: null },
        oncekiBakiye: { type: Number, default: null },
        sonrakiBakiye: { type: Number, default: null },
        durum: { type: String, enum: ["AKTIF", "IPTAL"], default: "AKTIF", index: true },
        iptalTarihi: { type: Date, default: null },
        iptalNedeni: { type: String, trim: true, default: "" },
        iptalEdenKullaniciId: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", default: null },
        iptalParaHareketId: { type: mongoose.Schema.Types.ObjectId, ref: "ParaHareket", default: null },

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

CariHareketSchema.index({ tenantId: 1, islemAnahtari: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("CariHareket", CariHareketSchema);
