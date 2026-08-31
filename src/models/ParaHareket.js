const mongoose = require("mongoose");

const ParaHareketSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            index: true
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

        tip: {
            type: String,
            enum: [
                "GIRIS",
                "CIKIS",
                "TRANSFER"
            ],
            required: true
        },

        tutar: {
            type: Number,
            required: true,
            min: 0
        },

        paraBirimi: {
            type: String,
            enum: ["TRY", "USD", "EUR"],
            default: "TRY"
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
        orijinalHareketId: { type: mongoose.Schema.Types.ObjectId, ref: "ParaHareket", default: null },
        tersHareketId: { type: mongoose.Schema.Types.ObjectId, ref: "ParaHareket", default: null },

        belgeNo: { type: String, trim: true, default: "" },

        karsiHesapTipi: {
            type: String,
            enum: ["KASA", "BANKA", null],
            default: null
        },

        karsiHesapId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null
        },

        tarih: {
            type: Date,
            default: Date.now
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

ParaHareketSchema.index({
    tenantId: 1,
    hesapTipi: 1,
    hesapId: 1,
    tarih: -1
});

ParaHareketSchema.index({ tenantId: 1, islemAnahtari: 1 }, { unique: true, sparse: true });
ParaHareketSchema.pre("validate", function () {
    const transactionId = this.transactionId || require("../services/islemBaglami").aktifTransactionId();
    if (this.isNew && !this.islemAnahtari && transactionId) {
        this.islemAnahtari = ["TX", transactionId, "PARA", this.hesapTipi, this.hesapId, this.tip, this.kaynak].map(String).join(":");
    } else if (!this.islemAnahtari && this.kaynakId && this.kaynak && this.kaynak !== "MANUEL") {
        this.islemAnahtari = [this.hesapTipi, this.hesapId, this.tip, this.kaynak, this.kaynakId].map(String).join(":");
    }
});

ParaHareketSchema.plugin(require("./plugins/transactionPlugin"));
module.exports = mongoose.model(
    "ParaHareket",
    ParaHareketSchema
);
