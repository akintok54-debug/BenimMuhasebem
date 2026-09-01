const MarketplaceAdapter = require("./MarketplaceAdapter");
const { IntegrationError, notConfigured } = require("../errors");

class TrendyolAdapter extends MarketplaceAdapter {
    baseUrl() { return this.connection.environment === "STAGE" ? "https://stageapigw.trendyol.com" : "https://apigw.trendyol.com"; }
    auth() {
        const apiKey = this.credentials.apiKey, apiSecret = this.credentials.apiSecret, sellerId = this.connection.sellerId || this.credentials.sellerId;
        if (!apiKey || !apiSecret || !sellerId) throw notConfigured("TRENDYOL");
        return { sellerId, headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`, "User-Agent": this.credentials.userAgent || "benimmuhasebe.com", "Content-Type": "application/json" } };
    }
    async request(path, { method = "GET", body, query } = {}) {
        const { headers } = this.auth(), url = new URL(path, this.baseUrl());
        for (const [key, value] of Object.entries(query || {})) if (value !== undefined && value !== "") url.searchParams.set(key, value);
        let response;
        try { response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) }); }
        catch (error) { throw new IntegrationError("PROVIDER_UNAVAILABLE", "Trendyol servisine ulaşılamadı.", { status: 503, retryable: true, details: { name: error.name } }); }
        const text = await response.text(); let data = null; try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text.slice(0, 1000) }; }
        if (!response.ok) {
            const credential = [401, 403].includes(response.status), retryable = response.status === 429 || response.status >= 500;
            throw new IntegrationError(credential ? "INVALID_CREDENTIALS" : response.status === 429 ? "RATE_LIMITED" : "PROVIDER_ERROR", credential ? "Trendyol bağlantı bilgileri geçersiz." : `Trendyol isteği başarısız (${response.status}).`, { status: credential ? 401 : 502, retryable, details: { httpStatus: response.status, providerResponse: data } });
        }
        return data;
    }
    async testConnection() { const data = await this.getCategories({ page: 0, size: 1 }); return { connected: true, provider: "TRENDYOL", sampleCount: Array.isArray(data?.categories) ? data.categories.length : 0 }; }
    getCategories({ page = 0, size = 1000 } = {}) { return this.request("/integration/product/product-categories", { query: { page, size } }); }
    getCategoryAttributes(categoryId) { if (!categoryId) throw new IntegrationError("VALIDATION_ERROR", "Kategori kimliği zorunludur."); return this.request(`/integration/product/categories/${encodeURIComponent(categoryId)}/attributes`); }
    pushProducts(items) { const { sellerId } = this.auth(); if (!Array.isArray(items) || !items.length) throw new IntegrationError("VALIDATION_ERROR", "Gönderilecek ürün yok."); return this.request(`/integration/product/sellers/${encodeURIComponent(sellerId)}/v2/products`, { method: "POST", body: { items } }); }
    updateStock(items) { const { sellerId } = this.auth(); if (!Array.isArray(items) || !items.length) return { skipped: true, reason: "UNCHANGED" }; return this.request(`/integration/inventory/sellers/${encodeURIComponent(sellerId)}/products/price-and-inventory`, { method: "POST", body: { items } }); }
    updatePrices(items) { return this.updateStock(items); }
    pullOrders({ startDate, endDate, status, page = 0, size = 200 } = {}) { const { sellerId } = this.auth(); return this.request(`/integration/order/sellers/${encodeURIComponent(sellerId)}/v2/orders`, { query: { startDate, endDate, status, page, size, orderByField: "PackageLastModifiedDate", orderByDirection: "DESC" } }); }
    getOrder(orderNumber) { return this.pullOrders({ orderNumber, size: 200 }); }
    pullSettlements({ transactionType, startDate, endDate, page = 0, size = 500 } = {}) { const { sellerId } = this.auth(); if (!transactionType || !startDate || !endDate) throw new IntegrationError("VALIDATION_ERROR", "Finans hareket türü ve tarih aralığı zorunludur."); return this.request(`/integration/finance/che/sellers/${encodeURIComponent(sellerId)}/settlements`, { query: { transactionType, startDate, endDate, page, size } }); }
    pullCustomerQuestions({ startDate, endDate, status = "WAITING_FOR_ANSWER", page = 0, size = 100 } = {}) { const { sellerId } = this.auth(); return this.request(`/integration/qna/sellers/${encodeURIComponent(sellerId)}/questions/filter`, { query: { startDate, endDate, status, page, size } }); }
    answerCustomerQuestion(questionId, text) { const { sellerId } = this.auth(); if (!questionId || String(text || "").length < 10 || String(text).length > 2000) throw new IntegrationError("VALIDATION_ERROR", "Cevap 10-2000 karakter olmalıdır."); return this.request(`/integration/qna/sellers/${encodeURIComponent(sellerId)}/questions/${encodeURIComponent(questionId)}/answers`, { method: "POST", body: { text } }); }
}
module.exports = TrendyolAdapter;
