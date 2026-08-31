const { aktifTransactionId } = require("../../services/islemBaglami");

module.exports = function transactionPlugin(schema) {
    schema.add({ transactionId: { type: String, trim: true, maxlength: 160, default: undefined, index: true } });
    schema.pre("validate", function transactionIdAta() {
        if (this.isNew && !this.transactionId) this.transactionId = aktifTransactionId() || undefined;
    });
};
