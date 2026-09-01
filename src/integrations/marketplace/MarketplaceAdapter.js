const { IntegrationError } = require("../errors");

class MarketplaceAdapter {
    constructor(connection, credentials = {}) { this.connection = connection; this.credentials = credentials; }
    unsupported(method) { throw new IntegrationError("PROVIDER_METHOD_NOT_IMPLEMENTED", `${this.connection.provider} için ${method} henüz desteklenmiyor.`, { status: 501 }); }
    testConnection() { return this.unsupported("testConnection"); }
    getCategories() { return this.unsupported("getCategories"); }
    getCategoryAttributes() { return this.unsupported("getCategoryAttributes"); }
    pushProducts() { return this.unsupported("pushProducts"); }
    updateProducts() { return this.unsupported("updateProducts"); }
    updateStock() { return this.unsupported("updateStock"); }
    updatePrices() { return this.unsupported("updatePrices"); }
    pullOrders() { return this.unsupported("pullOrders"); }
    getOrder() { return this.unsupported("getOrder"); }
    updateOrderStatus() { return this.unsupported("updateOrderStatus"); }
    pullReturns() { return this.unsupported("pullReturns"); }
    pullCancellations() { return this.unsupported("pullCancellations"); }
    getCargoCompanies() { return this.unsupported("getCargoCompanies"); }
    createShipment() { return this.unsupported("createShipment"); }
    getShippingLabel() { return this.unsupported("getShippingLabel"); }
    sendInvoice() { return this.unsupported("sendInvoice"); }
    pullSettlements() { return this.unsupported("pullSettlements"); }
    pullFinancialTransactions() { return this.unsupported("pullFinancialTransactions"); }
    pullCustomerQuestions() { return this.unsupported("pullCustomerQuestions"); }
    answerCustomerQuestion() { return this.unsupported("answerCustomerQuestion"); }
}
module.exports = MarketplaceAdapter;
