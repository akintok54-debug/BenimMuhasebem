const dns = require("node:dns").promises;
const net = require("node:net");
const MarketplaceAdapter = require("./MarketplaceAdapter");
const { IntegrationError, notConfigured } = require("../errors");
const IntegrationConnection = require("../../models/IntegrationConnection");
const { sifrele } = require("../../services/sifrelemeServisi");

function domainUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) throw notConfigured("IDEASOFT");
    let url;
    try { url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); }
    catch { throw new IntegrationError("VALIDATION_ERROR", "IdeaSoft mağaza domaini geçersiz.", { status: 400 }); }
    if (url.protocol !== "https:" || url.username || url.password || url.port) throw new IntegrationError("VALIDATION_ERROR", "IdeaSoft mağaza domaini HTTPS olmalıdır.", { status: 400 });
    const hostname = url.hostname.toLowerCase();
    if (!hostname.endsWith(".myideasoft.com") || hostname === ".myideasoft.com") throw new IntegrationError("VALIDATION_ERROR", "IdeaSoft mağaza domaini *.myideasoft.com uzantılı olmalıdır.", { status: 400 });
    url.pathname = "/"; url.search = ""; url.hash = "";
    return url;
}

function privateIp(address) {
    if (net.isIPv4(address)) {
        const p = address.split(".").map(Number);
        return p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168);
    }
    return net.isIPv6(address) && (/^(::1|fc|fd|fe80)/i.test(address));
}

class IdeaSoftAdapter extends MarketplaceAdapter {
    constructor(connection, credentials = {}) {
        super(connection, credentials);
        this.storeUrl = domainUrl(connection.apiBaseUrl || credentials.storeDomain);
    }
    async assertPublicStore() {
        if (["localhost", "0.0.0.0"].includes(this.storeUrl.hostname)) throw new IntegrationError("VALIDATION_ERROR", "IdeaSoft mağaza domaini geçersiz.", { status: 400 });
        let records;
        try { records = await dns.lookup(this.storeUrl.hostname, { all: true }); }
        catch { throw new IntegrationError("PROVIDER_UNAVAILABLE", "IdeaSoft mağaza domainine ulaşılamadı.", { status: 503, retryable: true }); }
        if (!records.length || records.some(x => privateIp(x.address))) throw new IntegrationError("VALIDATION_ERROR", "IdeaSoft mağaza domaini genel internette erişilebilir olmalıdır.", { status: 400 });
    }
    clientCredentials() {
        const clientId = this.credentials.clientId, clientSecret = this.credentials.clientSecret;
        if (!clientId || !clientSecret) throw notConfigured("IDEASOFT");
        return { clientId, clientSecret };
    }
    authorizationUrl({ redirectUri, state }) {
        const { clientId } = this.clientCredentials();
        if (!redirectUri || !state) throw new IntegrationError("VALIDATION_ERROR", "OAuth dönüş adresi ve state zorunludur.", { status: 400 });
        const url = new URL("/panel/auth", this.storeUrl);
        url.search = new URLSearchParams({ client_id: clientId, response_type: "code", state, redirect_uri: redirectUri }).toString();
        return url.toString();
    }
    async tokenRequest(params) {
        await this.assertPublicStore();
        const url = new URL("/oauth/v2/token", this.storeUrl);
        let response;
        try { response = await fetch(url, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params), redirect: "error", signal: AbortSignal.timeout(20000) }); }
        catch (error) { throw new IntegrationError("PROVIDER_UNAVAILABLE", "IdeaSoft yetkilendirme servisine ulaşılamadı.", { status: 503, retryable: true, details: { name: error.name } }); }
        const text = await response.text(); let data = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
        if (!response.ok || !data.access_token) throw new IntegrationError([400, 401, 403].includes(response.status) ? "INVALID_CREDENTIALS" : "PROVIDER_ERROR", [400, 401, 403].includes(response.status) ? "IdeaSoft yetkilendirmesi başarısız." : `IdeaSoft token isteği başarısız (${response.status}).`, { status: [400, 401, 403].includes(response.status) ? 401 : 502, retryable: response.status === 429 || response.status >= 500, details: { httpStatus: response.status, providerError: data.error || "" } });
        return data;
    }
    exchangeAuthorizationCode(code, redirectUri) {
        const { clientId, clientSecret } = this.clientCredentials();
        if (!code) throw new IntegrationError("INVALID_CREDENTIALS", "IdeaSoft yetkilendirme kodu eksik.", { status: 401 });
        return this.tokenRequest({ grant_type: "authorization_code", client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri });
    }
    refreshAccessToken() {
        const { clientId, clientSecret } = this.clientCredentials();
        if (!this.credentials.refreshToken) throw new IntegrationError("OAUTH_AUTHORIZATION_REQUIRED", "IdeaSoft mağaza yöneticisi yetkilendirmesi gerekli.", { status: 428 });
        return this.tokenRequest({ grant_type: "refresh_token", client_id: clientId, client_secret: clientSecret, refresh_token: this.credentials.refreshToken });
    }
    async refreshAndPersist() {
        const tokenData = await this.refreshAccessToken();
        this.credentials = { ...this.credentials, accessToken: tokenData.access_token, refreshToken: tokenData.refresh_token || this.credentials.refreshToken, tokenType: tokenData.token_type || "bearer", tokenExpiresAt: new Date(Date.now() + Math.max(60, Number(tokenData.expires_in || 86400)) * 1000).toISOString() };
        await IntegrationConnection.updateOne({ _id: this.connection._id, tenantId: this.connection.tenantId, provider: "IDEASOFT" }, { $set: { encryptedCredentials: sifrele(JSON.stringify(this.credentials)) } });
    }
    async request(path, { method = "GET", body, query, authRetry = true } = {}) {
        await this.assertPublicStore();
        const expiry = Date.parse(this.credentials.tokenExpiresAt || "");
        if ((!this.credentials.accessToken || (Number.isFinite(expiry) && expiry <= Date.now() + 60000)) && this.credentials.refreshToken) await this.refreshAndPersist();
        if (!this.credentials.accessToken) throw new IntegrationError("OAUTH_AUTHORIZATION_REQUIRED", "IdeaSoft mağaza yöneticisi yetkilendirmesi gerekli.", { status: 428 });
        const url = new URL(path, this.storeUrl);
        for (const [key, value] of Object.entries(query || {})) if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
        let response;
        try { response = await fetch(url, { method, headers: { Accept: "application/json", Authorization: `Bearer ${this.credentials.accessToken}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(20000) }); }
        catch (error) { throw new IntegrationError("PROVIDER_UNAVAILABLE", "IdeaSoft servisine ulaşılamadı.", { status: 503, retryable: true, details: { name: error.name } }); }
        const text = await response.text(); let data = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
        if (response.status === 401 && authRetry && this.credentials.refreshToken) { await this.refreshAndPersist(); return this.request(path, { method, body, query, authRetry: false }); }
        if (!response.ok) { const credential = [401, 403].includes(response.status), retryable = response.status === 429 || response.status >= 500; throw new IntegrationError(credential ? "INVALID_CREDENTIALS" : response.status === 429 ? "RATE_LIMITED" : "PROVIDER_ERROR", credential ? "IdeaSoft erişim anahtarı geçersiz veya süresi dolmuş." : `IdeaSoft isteği başarısız (${response.status}).`, { status: credential ? 401 : 502, retryable, details: { httpStatus: response.status } }); }
        return data;
    }
    async testConnection() { const products = await this.pullProducts({ limit: 1 }); return { connected: true, provider: "IDEASOFT", sampleCount: Array.isArray(products) ? products.length : 0 }; }
    pullProducts({ limit = 5, page = 1, sinceId } = {}) { return this.request("/admin-api/products", { query: { limit: Math.min(100, Math.max(1, Number(limit) || 5)), page: Math.max(1, Number(page) || 1), sinceId, sort: "id" } }); }
    async pushProducts(items) { if (!Array.isArray(items) || !items.length) throw new IntegrationError("VALIDATION_ERROR", "Gönderilecek IdeaSoft ürünü yok.", { status: 400 }); return Promise.all(items.map(item => this.request("/admin-api/products", { method: "POST", body: item }))); }
    updateProducts(items) { if (!Array.isArray(items)) throw new IntegrationError("VALIDATION_ERROR", "Güncellenecek IdeaSoft ürünü yok.", { status: 400 }); return Promise.all(items.map(item => this.updateProduct(item.externalProductId || item.id, item.changes || item))); }
    async updateProduct(id, changes) { if (!id) throw new IntegrationError("VALIDATION_ERROR", "IdeaSoft ürün kimliği zorunludur.", { status: 400 }); const current = await this.request(`/admin-api/products/${encodeURIComponent(id)}`); return this.request(`/admin-api/products/${encodeURIComponent(id)}`, { method: "PUT", body: { ...current, ...changes, id: Number(id) || current.id } }); }
    async updateStock(items) { if (!Array.isArray(items) || !items.length) return { skipped: true, reason: "UNCHANGED" }; return Promise.all(items.map(item => this.updateProduct(item.externalProductId, { stockAmount: Number(item.quantity) })) ); }
    updatePrice(items) { if (!Array.isArray(items) || !items.length) return Promise.resolve({ skipped: true, reason: "UNCHANGED" }); return Promise.all(items.map(item => this.updateProduct(item.externalProductId, { price1: Number(item.salePrice) })) ); }
    updatePrices(items) { return this.updatePrice(items); }
    pullOrders({ startDate, endDate, status, page = 1, limit = 20, size } = {}) { const toDate = value => value ? new Date(value).toISOString().slice(0, 10) : undefined; return this.request("/admin-api/orders", { query: { startCreatedAt: toDate(startDate), endCreatedAt: toDate(endDate), status, page: Math.max(1, Number(page) || 1), limit: Math.min(100, Math.max(1, Number(limit || size) || 20)), sort: "id" } }); }
    getOrder(id) { if (!id) throw new IntegrationError("VALIDATION_ERROR", "IdeaSoft sipariş kimliği zorunludur.", { status: 400 }); return this.request(`/admin-api/orders/${encodeURIComponent(id)}`); }
    async updateOrderStatus(id, status) { const allowed = ["waiting_for_approval", "approved", "fulfilled", "cancelled", "delivered", "on_accumulation", "waiting_for_payment", "being_prepared", "refunded", "personal_status_1", "personal_status_2", "personal_status_3"]; if (!allowed.includes(status)) throw new IntegrationError("VALIDATION_ERROR", "IdeaSoft sipariş durumu geçersiz.", { status: 400 }); const current = await this.getOrder(id); return this.request(`/admin-api/orders/${encodeURIComponent(id)}`, { method: "PUT", body: { ...current, status } }); }
    pullCustomers({ limit = 20, page = 1, sinceId } = {}) { return this.request("/admin-api/members", { query: { limit: Math.min(100, Math.max(1, Number(limit) || 20)), page: Math.max(1, Number(page) || 1), sinceId, sort: "id" } }); }
    pullCategories({ limit = 100, page = 1, sinceId } = {}) { return this.request("/admin-api/categories", { query: { limit: Math.min(100, Math.max(1, Number(limit) || 100)), page: Math.max(1, Number(page) || 1), sinceId, sort: "id" } }); }
    getCategories(options) { return this.pullCategories(options); }
}

module.exports = IdeaSoftAdapter;
module.exports.domainUrl = domainUrl;
