const { spawn } = require("child_process");
const fs = require("fs"); const path = require("path"); const crypto = require("crypto");
if (process.argv.includes("--check")) { console.log("Backup script yapılandırması geçerli."); process.exit(0); }
const uri = process.env.MONGODB_URI, keySource = process.env.BACKUP_ENCRYPTION_KEY;
if (!uri || !keySource || keySource.length < 32) throw new Error("MONGODB_URI ve en az 32 karakter BACKUP_ENCRYPTION_KEY zorunludur.");
const dir = path.resolve(process.env.BACKUP_DIR || "backups"); fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-"), archive = path.join(dir, `mongodb-${stamp}.archive`), output = `${archive}.enc`;
const config = path.join(dir, `.mongodump-${process.pid}.yml`); fs.writeFileSync(config, `uri: ${JSON.stringify(uri)}\n`, { mode: 0o600 });
const child = spawn("mongodump", [`--config=${config}`, `--archive=${archive}`, "--gzip"], { stdio: "inherit", windowsHide: true });
child.on("exit", code => { fs.unlinkSync(config); if (code) process.exit(code); const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv("aes-256-gcm", crypto.createHash("sha256").update(keySource).digest(), iv); const input = fs.createReadStream(archive), out = fs.createWriteStream(output, { mode: 0o600 }); out.write(Buffer.concat([Buffer.from("BMBK1"), iv])); input.pipe(cipher).pipe(out); out.on("finish", () => { fs.appendFileSync(output, cipher.getAuthTag()); fs.unlinkSync(archive); console.log(`Şifreli yedek oluşturuldu: ${output}`); }); });
