class IntegrationError extends Error {
    constructor(code, message, { status = 400, retryable = false, details = null } = {}) {
        super(message); this.name = "IntegrationError"; this.code = code; this.status = status; this.retryable = retryable; this.details = details;
    }
}
const notConfigured = provider => new IntegrationError("INTEGRATION_NOT_CONFIGURED", `${provider} entegrasyonu ayarlanmadı.`, { status: 409 });
module.exports = { IntegrationError, notConfigured };
