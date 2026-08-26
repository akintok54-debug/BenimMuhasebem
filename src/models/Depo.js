const mongoose = require("mongoose");

const DepoSchema = new mongoose.Schema(
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

        ad: {
            type: String,
            required: true,
            trim: true
        },

        adres: {
            type: String,
            trim: true,
            default: ""
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

DepoSchema.index(
    { tenantId: 1, kod: 1 },
    { unique: true }
);

module.exports = mongoose.model("Depo", DepoSchema);
