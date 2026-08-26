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

        sifre: {
            type: String,
            required: true
        },

        rol: {
            type: String,
            enum: [
                "SUPER_ADMIN",
                "ADMIN",
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
        }
    },
    {
        timestamps: true
    }
);

KullaniciSchema.index({ tenantId: 1, rol: 1 });

module.exports = mongoose.model("Kullanici", KullaniciSchema);
