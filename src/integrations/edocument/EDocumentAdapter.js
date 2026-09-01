const { IntegrationError } = require("../errors");
class EDocumentAdapter {
    constructor(connection, credentials = {}) { this.connection = connection; this.credentials = credentials; }
    unsupported(method) { throw new IntegrationError("EDOCUMENT_PROVIDER_NOT_CONFIGURED", `E-belge sağlayıcısı ${method} işlemi için ayarlanmadı.`, { status: 409 }); }
    testConnection() { return this.unsupported("testConnection"); } checkTaxpayer() { return this.unsupported("checkTaxpayer"); }
    pullIncomingInvoices() { return this.unsupported("pullIncomingInvoices"); } pullIncomingDespatches() { return this.unsupported("pullIncomingDespatches"); }
    createInvoice() { return this.unsupported("createInvoice"); } createArchiveInvoice() { return this.unsupported("createArchiveInvoice"); } createDespatch() { return this.unsupported("createDespatch"); }
    sendDocument() { return this.unsupported("sendDocument"); } getDocumentStatus() { return this.unsupported("getDocumentStatus"); } getPdf() { return this.unsupported("getPdf"); } getXml() { return this.unsupported("getXml"); }
    acceptCommercialInvoice() { return this.unsupported("acceptCommercialInvoice"); } rejectCommercialInvoice() { return this.unsupported("rejectCommercialInvoice"); } cancelDocument() { return this.unsupported("cancelDocument"); }
}
module.exports = EDocumentAdapter;
