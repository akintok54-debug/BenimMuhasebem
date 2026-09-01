const MarketplaceAdapter = require("./MarketplaceAdapter");
const { notConfigured } = require("../errors");
class UnavailableProviderAdapter extends MarketplaceAdapter {
    testConnection() { throw notConfigured(this.connection.provider); }
}
module.exports = UnavailableProviderAdapter;
