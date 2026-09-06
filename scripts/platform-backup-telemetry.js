const fs = require("node:fs");
const mongoose = require("mongoose");

// Called only after the existing backup pipeline has closed its encrypted output.
async function recordBackup(file) {
    const ownConnection = mongoose.connection.readyState === 0;
    try {
        if (ownConnection) await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
        await require("../src/modules/platform/models/PlatformAuditLog").create({
            action: "BACKUP_COMPLETED", resource: "backup", success: true,
            details: { encrypted: true, bytes: fs.statSync(file).size, restoreVerified: false }
        });
    } finally { if (ownConnection) await mongoose.disconnect(); }
}
module.exports = { recordBackup };
