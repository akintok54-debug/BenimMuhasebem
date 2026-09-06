const marker = Symbol.for("bm.runtime.monitor");
if (!process[marker]) {
    process[marker] = true;
    // Observe fatal errors without suppressing Node's default crash/restart behavior.
    process.on("uncaughtExceptionMonitor", (error, origin) => {
        const details = require("./hataIzlemeServisi").errorDetails(error);
        console.error("RUNTIME_FATAL", { origin, ...details });
        require("./auditServisi").kaydet({ action: "RUNTIME_FATAL", resource: "runtime", category: "SISTEM_CALISMA_HATASI", severity: "KRITIK", success: false, details: { origin, ...details } }).catch(() => {});
    });
}
