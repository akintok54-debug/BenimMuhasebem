const mongoose = require("mongoose");

const PersonelSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            index: true
        },

        kod: {
            type: String,
            required: true,
            trim: true,
            uppercase: true
        },

        adSoyad: {
            type: String,
            required: true,
            trim: true
        },

        telefon: {
            type: String,
            trim: true,
            default: ""
        },

        email: {
            type: String,
            lowercase: true,
            trim: true,
            default: ""
        },

        gorev: {
            type: String,
            trim: true,
            default: ""
        },

        departman: {
            type: String,
            trim: true,
            default: ""
        },

        yonetici: { type: String, trim: true, default: "" },
        lokasyon: { type: String, trim: true, default: "" },
        istihdamTuru: {
            type: String,
            enum: ["TAM_ZAMANLI", "YARI_ZAMANLI", "STAJYER", "DONEMSEL"],
            default: "TAM_ZAMANLI"
        },
        calismaDurumu: {
            type: String,
            enum: ["AKTIF", "IZINLI", "ASKIDA", "AYRILDI"],
            default: "AKTIF",
            index: true
        },

        iseGirisTarihi: {
            type: Date,
            default: null
        },
        cikisTarihi: { type: Date, default: null },
        dogumTarihi: { type: Date, default: null },

        maas: {
            type: Number,
            default: 0,
            min: 0
        },
        maasParaBirimi: { type: String, enum: ["TRY", "USD", "EUR"], default: "TRY" },
        iban: { type: String, trim: true, uppercase: true, default: "" },
        sgkMeslekKodu: { type: String, trim: true, default: "" },
        yillikIzinHakki: { type: Number, default: 14, min: 0, max: 365 },

        adres: {
            acikAdres: { type: String, trim: true, default: "" },
            il: { type: String, trim: true, default: "" },
            ilce: { type: String, trim: true, default: "" }
        },
        acilDurum: {
            adSoyad: { type: String, trim: true, default: "" },
            yakinlik: { type: String, trim: true, default: "" },
            telefon: { type: String, trim: true, default: "" }
        },

        aktif: {
            type: Boolean,
            default: true
        },

        notlar: {
            type: String,
            trim: true,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

PersonelSchema.index(
    { tenantId: 1, kod: 1 },
    { unique: true }
);

PersonelSchema.index({
    tenantId: 1,
    adSoyad: 1
});
PersonelSchema.index({ tenantId: 1, departman: 1, calismaDurumu: 1 });

module.exports = mongoose.model("Personel", PersonelSchema);
