const mongoose = require("mongoose");

const MusteriSchema = new mongoose.Schema(
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
            trim: true,
            default: ""
        },

        unvan: {
            type: String,
            trim: true,
            default: ""
        },

        yetkili: {
            type: String,
            trim: true,
            default: ""
        },

        telefon: {
            type: String,
            trim: true,
            default: ""
        },

        whatsapp: {
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

        vergiDairesi: {
            type: String,
            trim: true,
            default: ""
        },

        vergiNo: {
            type: String,
            trim: true,
            default: ""
        },

        adres: {
            type: String,
            trim: true,
            default: ""
        },

        il: {
            type: String,
            trim: true,
            default: ""
        },

        ilce: {
            type: String,
            trim: true,
            default: ""
        },

        postaKodu: {
            type: String,
            trim: true,
            default: ""
        },

        vadeGun: {
            type: Number,
            default: 0,
            min: 0
        },

        limit: {
            type: Number,
            default: 0,
            min: 0
        },

        riskLimiti: {
            type: Number,
            default: 0,
            min: 0
        },

        bakiye: {
            type: Number,
            default: 0
        },

        notlar: {
            type: String,
            trim: true,
            default: ""
        },

        grup: {
            type: String,
            trim: true,
            default: "Genel",
            index: true
        },

        fotograf: {
            type: String,
            default: "",
            validate: {
                validator(value) {
                    return !value || /^data:image\/(png|jpe?g|webp);base64,/i.test(value);
                },
                message: "Müşteri fotoğrafı geçerli bir PNG, JPG veya WebP olmalıdır."
            }
        },

        aktif: {
            type: Boolean,
            default: true
        },

        temsilciId: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", default: null, index: true },
        olusturanKullaniciId: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", default: null },
        konum: {
            enlem: { type: Number, min: -90, max: 90, default: null },
            boylam: { type: Number, min: -180, max: 180, default: null },
            hassasiyet: { type: Number, min: 0, default: 0 },
            adres: { type: String, trim: true, maxlength: 500, default: "" },
            kayitTarihi: { type: Date, default: null }
        }
    },
    {
        timestamps: true
    }
);

MusteriSchema.index(
    { tenantId: 1, kod: 1 },
    { unique: true }
);

MusteriSchema.index({
    tenantId: 1,
    unvan: 1
});

MusteriSchema.index({
    tenantId: 1,
    telefon: 1
});

module.exports = mongoose.model("Musteri", MusteriSchema);
