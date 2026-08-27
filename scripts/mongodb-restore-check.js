const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path"); const crypto = require("crypto");
if (process.argv.includes("--check")) { console.log("Restore script yapılandırması geçerli. Production hedefi reddedilir."); process.exit(0); }
const input = path.resolve(process.argv[2] || ""), uri = process.env.RESTORE_TEST_MONGODB_URI, keySource = process.env.BACKUP_ENCRYPTION_KEY;
if (process.env.NODE_ENV === "production" || !uri || /prod/i.test(uri)) throw new Error("Restore yalnızca açıkça tanımlanmış izole test veritabanında çalıştırılabilir.");
if (!fs.existsSync(input) || !keySource || keySource.length < 32) throw new Error("Şifreli yedek dosyası ve BACKUP_ENCRYPTION_KEY zorunludur.");
const size = fs.statSync(input).size, header = Buffer.alloc(17), fd = fs.openSync(input, "r"); fs.readSync(fd, header, 0, 17, 0); const tag = Buffer.alloc(16); fs.readSync(fd, tag, 0, 16, size - 16); fs.closeSync(fd);
if (header.subarray(0, 5).toString() !== "BMBK1") throw new Error("Geçersiz yedek formatı.");
const temp = path.join(path.dirname(input), `.restore-${process.pid}.archive`), decipher = crypto.createDecipheriv("aes-256-gcm", crypto.createHash("sha256").update(keySource).digest(), header.subarray(5)); decipher.setAuthTag(tag);
const config = path.join(path.dirname(input), `.mongorestore-${process.pid}.yml`); fs.writeFileSync(config, `uri: ${JSON.stringify(uri)}\n`, { mode: 0o600 });
fs.createReadStream(input, { start: 17, end: size - 17 }).pipe(decipher).pipe(fs.createWriteStream(temp, { mode: 0o600 })).on("finish", () => { const child = spawn("mongorestore", [`--config=${config}`, `--archive=${temp}`, "--gzip", "--drop"], { stdio: "inherit", windowsHide: true }); child.on("exit", code => { fs.unlinkSync(temp); fs.unlinkSync(config); process.exit(code || 0); }); });
