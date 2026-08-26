const mongoose = require("mongoose");

const TenantSubscriptionSchema = new mongoose.Schema({
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Tenant",
        required: true,
        index: true
    },

    planId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Plan",
        required: true
    },

    status: {
        type: String,
        enum: [
            "trial",
            "active",
            "past_due",
            "suspended",
            "cancelled",
            "expired"
        ],
        default: "trial"
    },

    startedAt: {
        type: Date,
        default: Date.now
    },

    expiresAt: {
        type: Date,
        default: null
    },

    autoRenew: {
        type: Boolean,
        default: true
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

        aiRequests: {
            type: Number,
            default: 0
        }
    }
}, {
    timestamps: true
});

TenantSubscriptionSchema.index({
    tenantId: 1,
    status: 1
});

module.exports = mongoose.model(
    "TenantSubscription",
    TenantSubscriptionSchema
);
