const { AsyncLocalStorage } = require("node:async_hooks");

const storage = new AsyncLocalStorage();

function islemBaglamindaCalistir(transactionId, callback) {
    return storage.run({ transactionId }, callback);
}

function aktifTransactionId() {
    return storage.getStore()?.transactionId || null;
}

module.exports = { islemBaglamindaCalistir, aktifTransactionId };
