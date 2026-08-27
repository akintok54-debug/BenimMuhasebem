const crypto = require("crypto");

function anahtar() {
    const kaynak = process.env.ENCRYPTION_KEY || (process.env.NODE_ENV !== "production" ? process.env.JWT_SECRET : "");
    if (!kaynak || String(kaynak).length < 32) throw new Error("ENCRYPTION_KEY en az 32 karakter olmalıdır.");
    return crypto.createHash("sha256").update(String(kaynak)).digest();
}
function sifrele(value) { const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv("aes-256-gcm", anahtar(), iv); const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]); return `v1:${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${encrypted.toString("hex")}`; }
function coz(value) { const [version, iv, tag, encrypted] = String(value).split(":"); if (version !== "v1") throw new Error("Desteklenmeyen şifreli veri sürümü."); const decipher = crypto.createDecipheriv("aes-256-gcm", anahtar(), Buffer.from(iv, "hex")); decipher.setAuthTag(Buffer.from(tag, "hex")); return Buffer.concat([decipher.update(Buffer.from(encrypted, "hex")), decipher.final()]).toString("utf8"); }
module.exports = { sifrele, coz };
