const crypto = require("crypto");
const ALFABE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Encode(buffer) { let bits = "", out = ""; for (const b of buffer) bits += b.toString(2).padStart(8, "0"); for (let i = 0; i < bits.length; i += 5) out += ALFABE[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)]; return out; }
function base32Decode(value) { let bits = ""; for (const c of String(value).replace(/=|\s/g, "").toUpperCase()) { const i = ALFABE.indexOf(c); if (i < 0) throw new Error("Geçersiz TOTP secret."); bits += i.toString(2).padStart(5, "0"); } const bytes = []; for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(bytes); }
function secretOlustur() { return base32Encode(crypto.randomBytes(20)); }
function kodOlustur(secret, zaman = Date.now()) { const counter = Math.floor(zaman / 30000), buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter)); const hash = crypto.createHmac("sha1", base32Decode(secret)).update(buf).digest(), offset = hash[19] & 15; return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, "0"); }
function kodDogrula(secret, kod) { const temiz = String(kod || "").replace(/\D/g, ""); if (temiz.length !== 6) return false; return [-1, 0, 1].some(fark => { const beklenen = kodOlustur(secret, Date.now() + fark * 30000); return crypto.timingSafeEqual(Buffer.from(temiz), Buffer.from(beklenen)); }); }
function kurtarmaKodlariOlustur() { return Array.from({ length: 10 }, () => crypto.randomBytes(5).toString("hex").toUpperCase()); }
function kodHash(kod) { return crypto.createHash("sha256").update(String(kod).trim().toUpperCase()).digest("hex"); }
function otpauthUri(secret, email) { return `otpauth://totp/${encodeURIComponent(`BenimMuhasebe:${email}`)}?secret=${secret}&issuer=${encodeURIComponent("BenimMuhasebe")}&algorithm=SHA1&digits=6&period=30`; }
module.exports = { secretOlustur, kodOlustur, kodDogrula, kurtarmaKodlariOlustur, kodHash, otpauthUri };
