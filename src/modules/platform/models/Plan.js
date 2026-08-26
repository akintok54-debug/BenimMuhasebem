const mongoose = require("mongoose");

const PlanSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },

    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },

    description: {
        type: String,
        default: ""
    },

    monthlyPrice: {
        type: Number,
        default: 0,
        min: 0
    },

    yearlyPrice: {
        type: Number,
        default: 0,
        min: 0
    },

    modules: {
        type: [String],
        default: []
    },

    limits: {
        users: {
            type: Number,
            default: 1
        },

        products: {
            type: Number,
            default: 100
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

    aktif: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model("Plan", PlanSchema);
