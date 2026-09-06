const { kaydet } = require("./auditServisi");
const { maskele } = require("./platformGuvenligi");
const ERROR_CATEGORIES = ["API_HATASI", "TARAYICI_HATASI", "VERI_TUTARLILIK", "SISTEM_CALISMA_HATASI"];
const errorFilter = () => ({ $or: [{ category: { $in: ERROR_CATEGORIES } }, { httpStatus: { $gte: 500 } }] });
function safePath(value) {
    try { return new URL(String(value || "/"), "https://local.invalid").pathname.slice(0, 400); }
    catch (_) { return "/"; }
}
function errorDetails(error) {
    const name = /^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(error?.name || "") ? error.name : "Error";
    // Do not retain exception messages: these may contain SQL, credentials or user-entered values.
    const frames = String(error?.stack || "").split("\n").filter(x => /^\s*at\s/.test(x)).slice(0, 12)
        .map(x => maskele(x.replace(/\?[^\s)]+/g, "")).slice(0, 400));
    return { name, frames };
}
async function serverError(req, status, error) {
    return kaydet({ req, action: `${req.method} ${safePath(req.originalUrl)}`, resource: "server", category: "API_HATASI",
        severity: "KRITIK", success: false, httpStatus: status,
        details: { error: errorDetails(error), release: require("../../../../package.json").version } });
}
module.exports = { ERROR_CATEGORIES, errorFilter, safePath, errorDetails, serverError };
