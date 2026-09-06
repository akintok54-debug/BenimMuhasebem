const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const service = require("../src/services/platformBildirimServisi");
test("platform email uses configured recipient, excludes incident secrets and reports provider acceptance only", async () => {
    const env = { ...process.env }, oldFetch = global.fetch, oldState = mongoose.connection.readyState;
    const model = mongoose.models.PlatformAlertDelivery;
    const oldClaim = model.findOneAndUpdate, oldUpdate = model.updateOne;
    try {
        process.env.PLATFORM_ALERT_EMAIL = "owner@example.com";
        process.env.BREVO_API_KEY = "test-key";
        process.env.BREVO_SENDER_EMAIL = "sender@example.com";
        mongoose.connection.readyState = 1;
        model.findOneAndUpdate = async () => ({});
        const updates = []; model.updateOne = async (_, x) => updates.push(x);
        global.fetch = async (_, opts) => {
            const body = JSON.parse(opts.body);
            assert.deepEqual(body.to, [{ email: "owner@example.com" }]);
            assert.ok(!opts.body.includes("private-customer"));
            return { ok: true };
        };
        assert.deepEqual(await service.bildir({ category: "API_HATASI", severity: "KRITIK", details: { secret: "private-customer" } }), { status: "PROVIDER_ACCEPTED" });
        assert.equal(updates[0].$set.status, "PROVIDER_ACCEPTED");
        global.fetch = async () => ({ ok: false });
        assert.equal((await service.bildir({ category: "API_HATASI" })).status, "FAILED");
        model.findOneAndUpdate = async () => { throw Object.assign(new Error(), { code: 11000 }); };
        assert.equal((await service.bildir({ category: "API_HATASI" })).status, "THROTTLED");
        assert.equal((await service.bildir({ category: "TARAYICI_HATASI", details: { source: "ANONYMOUS_CLIENT_REPORTED" } })).status, "SKIPPED");
        assert.equal(service.durum().whatsappConfigured, false);
    } finally {
        process.env = env; global.fetch = oldFetch; mongoose.connection.readyState = oldState;
        model.findOneAndUpdate = oldClaim; model.updateOne = oldUpdate;
    }
});
