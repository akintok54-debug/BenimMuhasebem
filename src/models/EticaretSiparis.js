const mongoose = require("mongoose");

const EticaretSiparisSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            index: true
        },

        platform: {
            type: String,
            required: true,
            trim: true,
            uppercase: true
        },

        platformSiparisNo: {
            type: String,
            required: true,
            trim: true
        },

        connectionId: { type: mongoose.Schema.Types.ObjectId, ref: "IntegrationConnection", default: null, index: true },
        externalOrderId: { type: String, trim: true, default: "" },
        packageId: { type: String, trim: true, default: "" },
        siparisTarihi: { type: Date, default: Date.now, index: true },
        paraBirimi: { type: String, enum: ["TRY", "USD", "EUR"], default: "TRY" },
        kargoTutari: { type: Number, min: 0, default: 0 },
        vergiTutari: { type: Number, min: 0, default: 0 },
        komisyonTutari: { type: Number, min: 0, default: 0 },
        iskontoTutari: { type: Number, min: 0, default: 0 },
        musteriBilgisi: {
            adSoyad: { type: String, default: "" }, email: { type: String, default: "" },
            telefon: { type: String, default: "" }, vergiNo: { type: String, default: "" }
        },
        teslimatAdresi: { type: mongoose.Schema.Types.Mixed, default: {} },
        kargo: {
            firma: { type: String, default: "" }, takipNo: { type: String, default: "" }, paketNo: { type: String, default: "" },
            etiketUrl: { type: String, default: "" }, desi: { type: Number, default: 0 }, durum: { type: String, default: "BEKLIYOR" }
        },
        erpSiparisId: { type: mongoose.Schema.Types.ObjectId, ref: "Siparis", default: null },
        faturaId: { type: mongoose.Schema.Types.ObjectId, default: null },
        providerInvoiceStatus: { type: String, default: "BEKLIYOR" },

        musteriId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Musteri",
            default: null
        },

        urunler: {
            type: [
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
                    externalSku: { type: String, default: "" },
                    externalBarcode: { type: String, default: "" },
                    iskonto: { type: Number, min: 0, default: 0 },
                    vergi: { type: Number, min: 0, default: 0 }
                }
            ],
            default: []
        },

        toplam: {
            type: Number,
            default: 0
        },

        durum: {
            type: String,
            enum: [
                "ALINDI",
                "ISLENIYOR",
                "SIPARISE_DONUSTU",
                "TAMAMLANDI",
                "IPTAL"
            ],
            default: "ALINDI"
        },

        hamVeri: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        }
    },
    {
        timestamps: true
    }
);

EticaretSiparisSchema.index(
    { tenantId: 1, platform: 1, platformSiparisNo: 1 },
    { unique: true }
);
EticaretSiparisSchema.index(
    { tenantId: 1, platform: 1, externalOrderId: 1 },
    { unique: true, partialFilterExpression: { externalOrderId: { $type: "string", $gt: "" } } }
);

module.exports = mongoose.model(
    "EticaretSiparis",
    EticaretSiparisSchema
);
