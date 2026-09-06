const monitor = require("../modules/platform/services/hataIzlemeServisi");
module.exports = function hataIzlemeMiddleware(req, res, next) {
    const json = res.json;
    res.json = function (body) {
        if (res.statusCode < 500 || res.locals.platformErrorSaved) return json.call(this, body);
        res.locals.platformErrorSaved = true;
        const status = res.statusCode;
        monitor.serverError(req, status, res.locals.platformError)
            .catch(() => console.error("PLATFORM_ERROR_CAPTURE_FAILED", { requestId: req.id }))
            .finally(() => { if (!res.headersSent && !res.destroyed) json.call(res, body); });
        return res;
    };
    next();
};
