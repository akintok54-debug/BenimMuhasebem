const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("stok defteri onarımı dry-run, idempotent devir ve transaction kullanır", () => {
    const kaynak = fs.readFileSync(path.join(__dirname, "..", "scripts", "stok-defteri-onar.js"), "utf8");
    assert.match(kaynak, /process\.argv\.includes\("--apply"\)/);
    assert.match(kaynak, /withTransaction/);
    assert.match(kaynak, /islemAnahtari:\s*`stok-butunluk-v1:/);
    assert.match(kaynak, /\$setOnInsert/);
    assert.match(kaynak, /ORIJINAL_ALIS_HAREKETI/);
    assert.match(kaynak, /URUN_KARTI_ESLESMESI/);
});
