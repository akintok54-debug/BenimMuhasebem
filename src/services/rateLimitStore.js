const { createClient } = require("redis");

const bellek = new Map();
let client = null, baglanti = null;

async function redisClient() {
    if (!process.env.REDIS_URL) return null;
    if (client?.isReady) return client;
    if (!client) {
        client = createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 3000, reconnectStrategy: retries => Math.min(retries * 200, 2000) } });
        client.on("error", error => console.error("REDIS_HATASI", { message: error.message }));
    }
    if (!baglanti) baglanti = client.connect().catch(error => { baglanti = null; console.error("REDIS_BAGLANTI_HATASI", { message: error.message }); return null; });
    await baglanti;
    return client.isReady ? client : null;
}

async function artir(key, pencereMs) {
    const redis = await redisClient();
    if (redis) {
        const redisKey = `bm:ratelimit:${key}`;
        const adet = await redis.incr(redisKey);
        if (adet === 1) await redis.pExpire(redisKey, pencereMs);
        const ttl = await redis.pTTL(redisKey);
        return { adet, son: Date.now() + Math.max(ttl, 0), kaynak: "redis" };
    }
    const simdi = Date.now(); let kova = bellek.get(key);
    if (!kova || kova.son <= simdi) kova = { adet: 0, son: simdi + pencereMs };
    kova.adet += 1; bellek.set(key, kova);
    return { ...kova, kaynak: "memory" };
}

module.exports = { artir, redisClient };
