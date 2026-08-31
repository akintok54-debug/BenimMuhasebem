const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env");
const envText = fs.readFileSync(envPath, "utf8");
const match = envText.match(/^BACKUP_ENCRYPTION_KEY=(.+)$/m);

if (match && match[1].trim().length >= 32) {
    console.log("BACKUP_ENCRYPTION_KEY zaten geçerli; değiştirilmedi.");
    process.exit(0);
}

const key = crypto.randomBytes(48).toString("base64url");
const next = match
    ? envText.replace(/^BACKUP_ENCRYPTION_KEY=.*$/m, `BACKUP_ENCRYPTION_KEY=${key}`)
    : `${envText.replace(/\s*$/, "")}\nBACKUP_ENCRYPTION_KEY=${key}\n`;

fs.writeFileSync(envPath, next, { mode: 0o600 });
const keyDir = path.join(root, "private-backup-keys");
fs.mkdirSync(keyDir, { recursive: true });
const recoveryPath = path.join(keyDir, "BACKUP-ENCRYPTION-KEY.txt");
fs.writeFileSync(recoveryPath, `BACKUP_ENCRYPTION_KEY=${key}\n`, { mode: 0o600 });
console.log(`Yedek anahtarı oluşturuldu. Kurtarma dosyası: ${recoveryPath}`);
