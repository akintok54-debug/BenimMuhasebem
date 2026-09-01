const IntegrationSyncJob = require("../models/IntegrationSyncJob");
const IntegrationConnection = require("../models/IntegrationConnection");
const IntegrationErrorKaydi = require("../models/IntegrationError");
const MarketplaceProductMapping = require("../models/MarketplaceProductMapping");
const Stok = require("../models/Stok");
const Urun = require("../models/Urun");
const EticaretSiparis = require("../models/EticaretSiparis");
const MarketplaceCustomerQuestion = require("../models/MarketplaceCustomerQuestion");
const { marketplaceAdapter } = require("../integrations/marketplace/adapterFactory");

const BEKLEME_MS = [400, 1200, 3000];
const hassasAlanlar = /secret|token|password|authorization|credential|api.?key/i;
function guvenliDetay(value) {
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.slice(0, 20).map(guvenliDetay);
    return Object.fromEntries(Object.entries(value).filter(([key]) => !hassasAlanlar.test(key)).map(([key, val]) => [key, guvenliDetay(val)]));
}
async function tekrarDene(fn) {
    let sonHata;
    for (let deneme = 0; deneme <= BEKLEME_MS.length; deneme++) {
        try { return await fn(); } catch (error) {
            sonHata = error;
            if (!error.retryable || deneme === BEKLEME_MS.length || ["INVALID_CREDENTIALS", "INTEGRATION_NOT_CONFIGURED"].includes(error.code)) throw error;
            await new Promise(resolve => setTimeout(resolve, BEKLEME_MS[deneme]));
        }
    }
    throw sonHata;
}
async function stokFiyatGonder(job, connection, adapter) {
    const mappings = await MarketplaceProductMapping.find({ tenantId: job.tenantId, storeConnectionId: connection._id }).populate("productId").lean();
    const productIds = mappings.map(x => x.productId?._id).filter(Boolean), stoklar = await Stok.aggregate([{ $match: { tenantId: job.tenantId, urunId: { $in: productIds } } }, { $group: { _id: "$urunId", miktar: { $sum: "$miktar" } } }]);
    const stokMap = new Map(stoklar.map(x => [String(x._id), Number(x.miktar || 0)])), items = [], degisen = [];
    for (const mapping of mappings) {
        const urun = mapping.productId; if (!urun || !mapping.externalBarcode) continue;
        const quantity = Math.max(0, Math.floor((stokMap.get(String(urun._id)) || 0) - Number(mapping.reservedStock || 0) - Number(mapping.safetyStock || 0)));
        const salePrice = Number(urun.satisFiyati || 0), stockChanged = Number(mapping.lastStockSent) !== quantity, priceChanged = Number(mapping.lastPriceSent) !== salePrice;
        if ((job.type === "STOCK_PUSH" && !stockChanged) || (job.type === "PRICE_PUSH" && !priceChanged)) continue;
        items.push({ barcode: mapping.externalBarcode, quantity, salePrice, listPrice: Math.max(salePrice, Number(urun.perakendeFiyati || salePrice)) });
        degisen.push({ mapping, quantity, salePrice });
    }
    if (!items.length) return { processed: mappings.length, success: 0, skipped: mappings.length };
    await tekrarDene(() => job.type === "PRICE_PUSH" ? adapter.updatePrices(items) : adapter.updateStock(items));
    await Promise.all(degisen.map(({ mapping, quantity, salePrice }) => MarketplaceProductMapping.updateOne({ _id: mapping._id, tenantId: job.tenantId }, { $set: { lastStockSent: quantity, lastPriceSent: salePrice, lastSyncedAt: new Date(), syncStatus: "SYNCED", lastError: "" } })));
    return { processed: mappings.length, success: items.length, skipped: mappings.length - items.length };
}
async function urunGonder(job, connection, adapter) {
    const mappings = await MarketplaceProductMapping.find({ tenantId: job.tenantId, storeConnectionId: connection._id }).populate("productId").lean(), productIds = mappings.map(x => x.productId?._id).filter(Boolean);
    const stocks = await Stok.aggregate([{ $match: { tenantId: job.tenantId, urunId: { $in: productIds } } }, { $group: { _id: "$urunId", quantity: { $sum: "$miktar" } } }]), stockMap = new Map(stocks.map(x => [String(x._id), Number(x.quantity || 0)]));
    const items = mappings.map(mapping => {
        const product = mapping.productId, brandId = Number(mapping.categoryAttributes?.brandId), categoryId = Number(mapping.externalCategoryId);
        if (!product || !mapping.externalBarcode || !brandId || !categoryId || !product.gorsel) return null;
        const salePrice = Number(product.satisFiyati || 0), quantity = Math.max(0, Math.floor((stockMap.get(String(product._id)) || 0) - Number(mapping.reservedStock || 0) - Number(mapping.safetyStock || 0)));
        const attributes = Object.entries(mapping.categoryAttributes || {}).filter(([key]) => key !== "brandId").map(([attributeId, value]) => Number.isFinite(Number(value)) ? { attributeId: Number(attributeId), attributeValueId: Number(value) } : { attributeId: Number(attributeId), customAttributeValue: String(value) }).filter(x => Number.isFinite(x.attributeId));
        return { barcode: mapping.externalBarcode, title: String(product.ad).slice(0,100), description: product.notlar || product.ad, productMainId: String(product.kod).slice(0,40), brandId, categoryId, quantity, stockCode: product.kod, dimensionalWeight: Number(mapping.categoryAttributes?.dimensionalWeight || 0), origin: mapping.categoryAttributes?.origin || undefined, listPrice: Math.max(salePrice, Number(product.perakendeFiyati || salePrice)), salePrice, vatRate: Number(product.kdv || 0), images: [{ url: product.gorsel }], attributes };
    }).filter(Boolean);
    if (!items.length) return { processed: mappings.length, success: 0, skipped: mappings.length };
    await tekrarDene(() => adapter.pushProducts(items));
    await MarketplaceProductMapping.updateMany({ _id: { $in: mappings.filter(x => items.some(i => i.barcode === x.externalBarcode)).map(x => x._id) }, tenantId: job.tenantId }, { $set: { syncStatus: "PENDING", lastSyncedAt: new Date(), lastError: "" } });
    return { processed: mappings.length, success: items.length, skipped: mappings.length - items.length };
}
async function siparisleriAl(job, connection, adapter) {
    const endDate = Date.now(), startDate = endDate - 14 * 86400000, response = await tekrarDene(() => adapter.pullOrders({ startDate, endDate, size: 200 })), packages = response?.content || [];
    let success = 0, errors = 0;
    for (const pkg of packages) {
        const externalOrderId = String(pkg.orderNumber || pkg.id || ""); if (!externalOrderId) { errors++; continue; }
        if (await EticaretSiparis.exists({ tenantId: job.tenantId, platform: connection.provider, externalOrderId })) continue;
        const lines = [], missing = [];
        for (const line of pkg.lines || []) { const barcode = String(line.barcode || ""), mapping = await MarketplaceProductMapping.findOne({ tenantId: job.tenantId, storeConnectionId: connection._id, externalBarcode: barcode }).lean(), product = mapping ? await Urun.findOne({ _id: mapping.productId, tenantId: job.tenantId }).lean() : await Urun.findOne({ tenantId: job.tenantId, barkod: barcode }).lean(); if (!product) { missing.push(barcode); continue; } lines.push({ urunId: product._id, miktar: Number(line.quantity || 1), birimFiyat: Number(line.price || line.amount || 0), externalSku: String(line.merchantSku || ""), externalBarcode: barcode, iskonto: Number(line.discount || 0), vergi: Number(line.vatBaseAmount || 0) }); }
        if (!lines.length || missing.length) { errors++; continue; }
        try { const total = lines.reduce((n,x)=>n+x.miktar*x.birimFiyat,0), order = await EticaretSiparis.create({ tenantId: job.tenantId, connectionId: connection._id, platform: connection.provider, platformSiparisNo: externalOrderId, externalOrderId, packageId: String(pkg.id || ""), siparisTarihi: pkg.orderDate ? new Date(pkg.orderDate) : new Date(), paraBirimi: pkg.currencyCode || "TRY", musteriBilgisi: { adSoyad: [pkg.customerFirstName,pkg.customerLastName].filter(Boolean).join(" "), email: pkg.customerEmail || "", telefon: pkg.shipmentAddress?.phone || "", vergiNo: pkg.invoiceAddress?.taxNumber || pkg.invoiceAddress?.identityNumber || "" }, teslimatAdresi: pkg.shipmentAddress || {}, kargo: { firma: pkg.cargoProviderName || "", takipNo: String(pkg.cargoTrackingNumber || ""), paketNo: String(pkg.id || ""), desi: Number(pkg.dimensionalWeight || 0), durum: pkg.status || "BEKLIYOR" }, urunler: lines, toplam: total, durum: ["Cancelled","UnSupplied"].includes(pkg.status) ? "IPTAL" : "ALINDI", hamVeri: pkg }); await Promise.all(lines.map(line => MarketplaceProductMapping.updateOne({ tenantId: job.tenantId, storeConnectionId: connection._id, productId: line.urunId }, { $inc: { reservedStock: line.miktar } }))); if (order) success++; }
        catch (error) { if (error.code !== 11000) errors++; }
    }
    return { processed: packages.length, success, errors };
}
async function sorulariAl(job, connection, adapter) {
    const endDate=Date.now(), startDate=endDate-14*86400000, response=await tekrarDene(()=>adapter.pullCustomerQuestions({startDate,endDate})), rows=response?.content||[], operations=[];
    for(const q of rows){if(!q.id||!q.text)continue;operations.push(MarketplaceCustomerQuestion.updateOne({tenantId:job.tenantId,provider:connection.provider,externalQuestionId:String(q.id)},{$setOnInsert:{connectionId:connection._id,productId:null,externalBarcode:String(q.product?.barcode||q.barcode||""),customerName:q.userName||"",question:q.text,questionDate:q.creationDate?new Date(q.creationDate):new Date(),status:q.status||"WAITING_FOR_ANSWER"}},{upsert:true}));} await Promise.all(operations);return{processed:rows.length,success:operations.length};
}
async function isiCalistir(jobId) {
    const job = await IntegrationSyncJob.findById(jobId); if (!job || job.status !== "QUEUED") return;
    job.status = "RUNNING"; job.startedAt = new Date(); await job.save();
    try {
        const connection = await IntegrationConnection.findOne({ _id: job.connectionId, tenantId: job.tenantId, active: true }).select("+encryptedCredentials");
        if (!connection) throw Object.assign(new Error("Entegrasyon bağlantısı bulunamadı."), { code: "INTEGRATION_NOT_CONFIGURED", status: 409 });
        const adapter = marketplaceAdapter(connection); let sonuc;
        if (["STOCK_PUSH", "PRICE_PUSH"].includes(job.type)) sonuc = await stokFiyatGonder(job, connection, adapter);
        else if (job.type === "PRODUCT_PUSH") sonuc = await urunGonder(job, connection, adapter);
        else if (job.type === "ORDER_PULL") sonuc = await siparisleriAl(job, connection, adapter);
        else if (job.type === "QUESTION_PULL") sonuc = await sorulariAl(job, connection, adapter);
        else if (job.type === "PRODUCT_PULL") { const data = await tekrarDene(() => adapter.getCategories()); sonuc = { processed: Number(data?.categories?.length || 0), success: Number(data?.categories?.length || 0) }; }
        else throw Object.assign(new Error(`${job.type} için doğrulanmış sağlayıcı akışı henüz yapılandırılmadı.`), { code: "PROVIDER_METHOD_NOT_IMPLEMENTED", status: 501 });
        job.processedCount = sonuc.processed || 0; job.successCount = sonuc.success || 0; job.errorCount = sonuc.errors || 0; job.status = sonuc.errors ? (sonuc.success ? "PARTIAL" : "FAILED") : "SUCCESS";
        await IntegrationConnection.updateOne({ _id: connection._id, tenantId: job.tenantId }, { $set: { lastSuccessfulSyncAt: new Date(), lastError: "" } });
    } catch (error) {
        job.status = "FAILED"; job.errorCount = 1; job.errors = [{ code: error.code || "SYNC_FAILED", message: error.message }];
        await IntegrationErrorKaydi.create({ tenantId: job.tenantId, connectionId: job.connectionId, provider: job.provider, operation: job.type, entityType: "SYNC_JOB", entityId: String(job._id), errorCode: error.code || "SYNC_FAILED", errorMessage: error.message, technicalDetails: guvenliDetay(error.details || {}), retryable: Boolean(error.retryable) });
        await IntegrationConnection.updateOne({ _id: job.connectionId, tenantId: job.tenantId }, { $set: { lastErrorAt: new Date(), lastError: error.message } });
    } finally { job.finishedAt = new Date(); await job.save(); }
}
async function sirayaAl({ tenantId, connection, type, userId }) {
    const job = await IntegrationSyncJob.create({ tenantId, provider: connection.provider, connectionId: connection._id, type, createdBy: userId || null });
    setImmediate(() => isiCalistir(job._id).catch(error => console.error("ETICARET_SYNC_HATASI", { jobId: String(job._id), message: error.message })));
    return job;
}
module.exports = { sirayaAl, isiCalistir, tekrarDene, guvenliDetay, stokFiyatGonder, urunGonder, siparisleriAl, sorulariAl };
