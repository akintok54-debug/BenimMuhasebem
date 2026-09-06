(function () {
    "use strict";
    if (window.__bmErrorMonitoring) return;
    window.__bmErrorMonitoring = true;
    const originalFetch = window.fetch.bind(window), seen = new Map();
    let sent = 0, windowStart = Date.now();
    function path(value) { try { return new URL(value || location.href, location.href).pathname; } catch (_) { return "/"; } }
    function report(kind, file, line, column, name) {
        if (Date.now() - windowStart > 60000) { sent = 0; seen.clear(); windowStart = Date.now(); }
        const key = [kind, path(file), line, column, name].join(":");
        if (sent >= 10 || seen.has(key)) return;
        seen.set(key, true); sent++;
        const csrf = document.cookie.split(";").map(x => x.trim()).find(x => x.startsWith("bm_csrf="));
        // No request bodies, messages, token, storage contents or query strings are collected.
        originalFetch("/api/telemetry/client-error", { method: "POST", credentials: "same-origin", keepalive: true,
            headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf ? decodeURIComponent(csrf.slice(8)) : "" },
            body: JSON.stringify({ kind, page: path(location.href), file: path(file), line, column, name })
        }).catch(() => {});
    }
    window.addEventListener("error", event => {
        if (event.target && event.target !== window) {
            if (["SCRIPT", "LINK"].includes(event.target.tagName)) report("RESOURCE", event.target.src || event.target.href, null, null, "Error");
        } else report("JAVASCRIPT", event.filename, event.lineno, event.colno, event.error?.name);
    }, true);
    window.addEventListener("unhandledrejection", event => report("PROMISE", location.href, null, null, event.reason?.name));
    window.fetch = function (input, init) {
        const url = typeof input === "string" ? input : input?.url;
        return originalFetch(input, init).catch(error => {
            if (error?.name !== "AbortError" && path(url) !== "/api/telemetry/client-error") report("NETWORK", url, null, null, "NetworkError");
            throw error;
        });
    };
})();
