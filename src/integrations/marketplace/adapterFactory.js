const { coz } = require("../../services/sifrelemeServisi");
const TrendyolAdapter = require("./TrendyolAdapter");
const IdeaSoftAdapter = require("./IdeaSoftAdapter");
const UnavailableProviderAdapter = require("./UnavailableProviderAdapter");
const { notConfigured } = require("../errors");

function credentialsOku(connection) {
    if (!connection?.encryptedCredentials) throw notConfigured(connection?.provider || "ENTEGRASYON");
    try { return JSON.parse(coz(connection.encryptedCredentials)); }
    catch { throw notConfigured(connection.provider); }
}
function marketplaceAdapter(connection) {
    if (!connection || !connection.active) throw notConfigured(connection?.provider || "ENTEGRASYON");
    const credentials = credentialsOku(connection);
    if (connection.provider === "TRENDYOL") return new TrendyolAdapter(connection, credentials);
    if (connection.provider === "IDEASOFT") return new IdeaSoftAdapter(connection, credentials);
    return new UnavailableProviderAdapter(connection, credentials);
}
module.exports = { marketplaceAdapter, credentialsOku };
