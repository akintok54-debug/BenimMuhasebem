const mongoose = require("mongoose");

const KullaniciSchema = new mongoose.Schema(
    {
        adSoyad: {
            type: String,
            required: true,
            trim: true
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },

        telefon: { type: String, trim: true, default: "" },
        unvan: { type: String, trim: true, default: "" },

        sifre: {
            type: String,
            required: true
        },

        rol: {
            type: String,
            enum: [
                "SUPER_ADMIN",
                "OWNER",
                "ADMIN",
                "MANAGER",
                "SALES",
                "CASHIER",
                "ACCOUNTING",
                "SATIS",
                "DEPO",
                "MUHASEBE",
                "ETICARET"
            ],
            default: "ETICARET"
        },

        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            default: null,
            index: true
        },

        aktif: {
            type: Boolean,
            default: true
        },
        hesapDurumu: {
            type: String,
            enum: ["trial", "active", "expired", "suspended"],
            default: "active",
            index: true
        },
        ozelYetkiler: {
            type: [String],
            enum: ["balance.adjust"],
            default: []
        },

        sonGirisTarihi: { type: Date, default: null },
        sifreSifirlama: {
            tokenHash: { type: String, default: "", select: false },
            sonKullanmaTarihi: { type: Date, default: null, select: false }
        },
        geciciSifre: { type: Boolean, default: false },
        silinmeTarihi: { type: Date, default: null }
        ,
        ikiFaktor: {
            etkin: { type: Boolean, default: false },
            yontem: { type: String, enum: ["TOTP", "EMAIL", "NONE"], default: "NONE" },
            gizliAnahtar: { type: String, default: "", select: false },
            kurtarmaKodlariHash: { type: [String], default: [], select: false },
            dogrulamaTarihi: { type: Date, default: null }
        }
    },
    {
        timestamps: true
    }
);

KullaniciSchema.index({ tenantId: 1, rol: 1 });

module.exports = mongoose.model("Kullanici", KullaniciSchema);
