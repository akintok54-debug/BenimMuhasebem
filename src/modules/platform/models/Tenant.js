const mongoose = require("mongoose");

const TenantSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        slug: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },

        domain: {
            type: String,
            default: null,
            lowercase: true,
            trim: true
        },

        plan: {
            type: String,
            enum: [
                "starter",
                "professional",
                "business",
                "enterprise"
            ],
            default: "starter"
        },

        status: {
            type: String,
            enum: [
                "trial",
                "active",
                "suspended",
                "cancelled"
            ],
            default: "trial"
        },

        modules: {
            type: [String],
            default: []
        },

        limits: {
            users: {
                type: Number,
                default: 3
            },

            products: {
                type: Number,
                default: 1000
            },

            storageMb: {
                type: Number,
                default: 1024
            },

            aiRequestsMonthly: {
                type: Number,
                default: 100
            }
        },

        usage: {
            users: {
                type: Number,
                default: 0
            },

            products: {
                type: Number,
                default: 0
            },

            storageMb: {
                type: Number,
                default: 0
            },

            aiRequestsMonthly: {
                type: Number,
                default: 0
            }
        },


        firmaBilgileri: {
            unvan: {
                type: String,
                default: ""
            },

            yetkili: {
                type: String,
                default: ""
            },

            vergiDairesi: {
                type: String,
                default: ""
            },

            vergiNo: {
                type: String,
                default: ""
            },

            telefon: {
                type: String,
                default: ""
            },

            email: { type: String, default: "", trim: true, lowercase: true },
            mersisNo: { type: String, default: "", trim: true },
            ticaretSicilNo: { type: String, default: "", trim: true },
            iban: { type: String, default: "", trim: true, uppercase: true },
            eFaturaMukellefi: { type: Boolean, default: false },

            adres: {
                type: String,
                default: ""
            },

            il: {
                type: String,
                default: ""
            },

            ilce: {
                type: String,
                default: ""
            },

            postaKodu: {
                type: String,
                default: ""
            },

            web: {
                type: String,
                default: ""
            }

        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Kullanici",
            default: null
        }
    },
    {
        timestamps: true
    }
);

TenantSchema.index({ status: 1 });
TenantSchema.index({ plan: 1 });
TenantSchema.index({ domain: 1 });

module.exports = mongoose.model("Tenant", TenantSchema);

