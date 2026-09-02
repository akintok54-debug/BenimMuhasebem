const IntegrationSyncJob = require("../models/IntegrationSyncJob");
const IntegrationConnection = require("../models/IntegrationConnection");
const IntegrationErrorKaydi = require("../models/IntegrationError");
const MarketplaceProductMapping = require("../models/MarketplaceProductMapping");
const Stok = require("../models/Stok");
const Urun = require("../models/Urun");
const EticaretSiparis = require("../models/EticaretSiparis");
const Siparis = require("../models/Siparis");
const Musteri = require("../models/Musteri");
const Depo = require("../models/Depo");
const MarketplaceCustomerQuestion = require("../models/MarketplaceCustomerQuestion");
const { marketplaceAdapter } = require("../integrations/marketplace/adapterFactory");

const BEKLEME_MS = [400, 1200, 3000];
const hassasAlanlar = /secret|token|password|authorization|credential|api.?key/i;
function guvenliDetay(value) {
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.slice(0, 20).map(guvenliDetay);
    return Object.fromEntries(Object.entries(value).filter(([key]) => !hassasAlanlar.test(key)).map(([key, val]) => [key, guvenliDetay(val)]));
}
function yanitSatirlari(value, keys = []) {
    if (Array.isArray(value)) return value;
    for (const key of [...keys, "items", "data", "content", "results"]) if (Array.isArray(value?.[key])) return value[key];
    return [];
}
function ilkDeger(...values) { return values.find(value => value !== undefined && value !== null && String(value).trim() !== ""); }
function ideasoftSiparisSatirlariniNormalizeEt(order) {
    const rows = yanitSatirlari(order, ["orderItems", "products", "lines"]);
    return rows.map(line => {
        const product = line.product || line.productInfo || {}, variant = line.variant || product.variant || {};
        return {
            raw: line,
            externalSku: String(ilkDeger(line.merchantSku, line.productSku, line.stockCode, line.sku, product.stockCode, product.sku, product.productCode, variant.stockCode, variant.sku) || "").trim(),
            externalBarcode: String(ilkDeger(line.barcode, line.productBarcode, product.barcode, product.ean, variant.barcode) || "").trim(),
            externalProductId: String(ilkDeger(line.productId, product.id, variant.productId) || "").trim(),
            miktar: Math.max(0, Number(ilkDeger(line.quantity, line.productQuantity, line.amountQuantity, 1)) || 0),
            birimFiyat: Math.max(0, Number(ilkDeger(line.unitPrice, line.productPrice, line.price, line.salePrice, line.amount, product.price1, 0)) || 0),
            iskonto: Math.max(0, Number(ilkDeger(line.discount, line.productDiscount, line.discountAmount, 0)) || 0),
            vergi: Math.max(0, Number(ilkDeger(line.taxRate, line.vatRate, line.tax, line.productTax, product.tax, 0)) || 0)
        };
    }).filter(line => line.miktar > 0);
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
        const urun = mapping.productId; if (!urun || (connection.provider === "IDEASOFT" ? !mapping.externalProductId : !mapping.externalBarcode)) continue;
        const quantity = Math.max(0, Math.floor((stokMap.get(String(urun._id)) || 0) - Number(mapping.reservedStock || 0) - Number(mapping.safetyStock || 0)));
        const salePrice = Number(urun.satisFiyati || 0), stockChanged = Number(mapping.lastStockSent) !== quantity, priceChanged = Number(mapping.lastPriceSent) !== salePrice;
        if ((job.type === "STOCK_PUSH" && !stockChanged) || (job.type === "PRICE_PUSH" && !priceChanged)) continue;
        items.push({ externalProductId: mapping.externalProductId, barcode: mapping.externalBarcode, quantity, salePrice, listPrice: Math.max(salePrice, Number(urun.perakendeFiyati || salePrice)) });
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
    const options = arguments[3] || {}, endDate = options.endDate || Date.now(), startDate = options.startDate || endDate - 14 * 86400000, response = await tekrarDene(() => adapter.pullOrders({ startDate, endDate, size: options.limit || 200, limit: options.limit || 200 })), packages = yanitSatirlari(response, ["orders"]);
    let success = 0, errors = 0, duplicates = 0, pending = 0; const errorDetails = [];
    for (const pkg of packages) {
        const externalOrderId = String(pkg.orderNumber || pkg.id || ""); if (!externalOrderId) { errors++; continue; }
        const existingOrder = await EticaretSiparis.findOne({ tenantId: job.tenantId, platform: connection.provider, externalOrderId });
        if (existingOrder && existingOrder.durum !== "ESLESME_BEKLIYOR") {
            // Pazaryerinde iptal edilen bir sipariş sonraki senkronizasyonda ERP tarafına da yansır.
            if (["Cancelled", "UnSupplied", "cancelled", "refunded"].includes(pkg.status) && existingOrder.durum !== "IPTAL") {
                await EticaretSiparis.updateOne({ _id: existingOrder._id, tenantId: job.tenantId }, { $set: { durum: "IPTAL" } });
                if (existingOrder.erpSiparisId) await Siparis.updateOne({ _id: existingOrder.erpSiparisId, tenantId: job.tenantId, durum: { $ne: "TAMAMLANDI" } }, { $set: { durum: "IPTAL" } });
            }
            duplicates++; continue;
        }
        const lines = [], missing = [];
        const normalizedLines = connection.provider === "IDEASOFT" ? ideasoftSiparisSatirlariniNormalizeEt(pkg) : ideasoftSiparisSatirlariniNormalizeEt({ lines: pkg.lines || pkg.orderItems || [] });
        for (const line of normalizedLines) { const barcode = line.externalBarcode, sku = line.externalSku, externalProductId = line.externalProductId, externalFilters = [...(externalProductId ? [{ externalProductId }] : []), ...(barcode ? [{ externalBarcode: barcode }] : []), ...(sku ? [{ externalSku: sku }] : [])], productFilters = [...(barcode ? [{ barkod: barcode }] : []), ...(sku ? [{ kod: sku.toUpperCase() }] : [])]; if (!externalFilters.length && !productFilters.length) { missing.push(String(line.raw?.id || "BARKOD_SKU_YOK")); lines.push({ ...line, urunId: null }); continue; } const mapping = externalFilters.length ? await MarketplaceProductMapping.findOne({ tenantId: job.tenantId, storeConnectionId: connection._id, $or: externalFilters }).lean() : null; let product = mapping?.productId ? await Urun.findOne({ _id: mapping.productId, tenantId: job.tenantId }).lean() : productFilters.length ? await Urun.findOne({ tenantId: job.tenantId, $or: productFilters }).lean() : null; if (!product && connection.provider === "IDEASOFT" && (barcode || sku)) { const kod = (sku || barcode || `IDEA-${externalProductId}`).toUpperCase().slice(0, 60), fiyat = Math.max(0, Number(line.birimFiyat || 0)); try { product = await Urun.findOneAndUpdate({ tenantId: job.tenantId, kod }, { $setOnInsert: { tenantId: job.tenantId, kod, barkod: barcode, ad: `IdeaSoft Ürün ${sku || barcode}`, satisFiyati: fiyat, perakendeFiyati: fiyat, kdv: Math.max(0, Number(line.vergi || 20)), notlar: "IdeaSoft siparişinden otomatik oluşturuldu" } }, { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }).lean(); } catch (error) { product = null; } } if (!product) { missing.push(barcode || sku || externalProductId || String(line.raw?.id || "")); lines.push({ ...line, urunId: null }); continue; } lines.push({ urunId: product._id, miktar: line.miktar, birimFiyat: line.birimFiyat, externalSku: sku, externalBarcode: barcode, iskonto: line.iskonto, vergi: line.vergi }); }
        const firstName = pkg.customerFirstName || pkg.customerFirstname || pkg.member?.firstName || pkg.member?.firstname || "", lastName = pkg.customerLastName || pkg.customerSurname || pkg.member?.lastName || pkg.member?.surname || "", email = String(pkg.customerEmail || pkg.member?.email || "").trim().toLowerCase(), phone = String(pkg.customerPhone || pkg.member?.phone || pkg.shipmentAddress?.phone || pkg.shippingAddress?.mobilePhoneNumber || "").trim(), taxNo = String(pkg.invoiceAddress?.taxNumber || pkg.billingAddress?.taxNumber || "").trim(), currencyRaw = pkg.currency?.code || pkg.currency?.abbr || pkg.currency || pkg.currencyCode || "TRY", currency = currencyRaw === "TL" ? "TRY" : String(currencyRaw).toUpperCase(), orderDate = pkg.orderDate || pkg.createdAt || new Date(), total = Number(ilkDeger(pkg.generalAmount, pkg.totalPrice, pkg.totalAmount, pkg.total, lines.reduce((n,x)=>n+x.miktar*x.birimFiyat,0))) || 0;
        const publicOrder = { tenantId: job.tenantId, connectionId: connection._id, platform: connection.provider, platformSiparisNo: externalOrderId, externalOrderId, packageId: String(pkg.id || ""), siparisTarihi: new Date(orderDate), paraBirimi: ["TRY","USD","EUR"].includes(currency) ? currency : "TRY", musteriBilgisi: { adSoyad: [firstName,lastName].filter(Boolean).join(" "), email, telefon: phone, vergiNo: taxNo }, teslimatAdresi: pkg.shipmentAddress || pkg.shippingAddress || {}, kargo: { firma: pkg.cargoProviderName || pkg.shippingCompany?.name || pkg.shippingCompany || "", takipNo: String(pkg.cargoTrackingNumber || pkg.cargoTrackingCode || ""), paketNo: String(pkg.id || ""), desi: Number(pkg.dimensionalWeight || 0), durum: pkg.status || "BEKLIYOR" }, urunler: lines.map(({ raw, externalProductId, ...line }) => line), toplam: total, hamVeri: pkg };
        if (!normalizedLines.length || missing.length) { await EticaretSiparis.findOneAndUpdate({ tenantId: job.tenantId, platform: connection.provider, externalOrderId }, { $set: { ...publicOrder, durum: "ESLESME_BEKLIYOR" } }, { upsert: true, new: true, runValidators: true }); errors++; pending++; errorDetails.push({ externalOrderId, code: normalizedLines.length ? "PRODUCT_MAPPING_REQUIRED" : "ORDER_LINES_MISSING", missing: missing.slice(0, 20) }); continue; }
        if (connection.provider !== "IDEASOFT") {
            try { const total = lines.reduce((n,x)=>n+x.miktar*x.birimFiyat,0), order = await EticaretSiparis.create({ tenantId: job.tenantId, connectionId: connection._id, platform: connection.provider, platformSiparisNo: externalOrderId, externalOrderId, packageId: String(pkg.id || ""), siparisTarihi: pkg.orderDate ? new Date(pkg.orderDate) : new Date(), paraBirimi: pkg.currencyCode || "TRY", musteriBilgisi: { adSoyad: [pkg.customerFirstName,pkg.customerLastName].filter(Boolean).join(" "), email: pkg.customerEmail || "", telefon: pkg.shipmentAddress?.phone || "", vergiNo: pkg.invoiceAddress?.taxNumber || pkg.invoiceAddress?.identityNumber || "" }, teslimatAdresi: pkg.shipmentAddress || {}, kargo: { firma: pkg.cargoProviderName || "", takipNo: String(pkg.cargoTrackingNumber || ""), paketNo: String(pkg.id || ""), desi: Number(pkg.dimensionalWeight || 0), durum: pkg.status || "BEKLIYOR" }, urunler: lines, toplam: total, durum: ["Cancelled","UnSupplied"].includes(pkg.status) ? "IPTAL" : "ALINDI", hamVeri: pkg }); await Promise.all(lines.map(line => MarketplaceProductMapping.updateOne({ tenantId: job.tenantId, storeConnectionId: connection._id, productId: line.urunId }, { $inc: { reservedStock: line.miktar } }))); if (order) success++; }
            catch (error) { if (error.code !== 11000) errors++; }
            continue;
        }
        try {
            const customerFilters = [...(taxNo ? [{ vergiNo: taxNo }] : []), ...(email ? [{ email }] : []), ...(phone ? [{ telefon: phone }] : [])];
            let customer = customerFilters.length ? await Musteri.findOne({ tenantId: job.tenantId, $or: customerFilters }) : null;
            if (!customer) { const code = `IDEA-${String(pkg.member?.id || externalOrderId).replace(/[^a-z0-9]/gi, "").slice(-24)}`.toUpperCase(); customer = await Musteri.findOneAndUpdate({ tenantId: job.tenantId, kod: code }, { $setOnInsert: { tenantId: job.tenantId, kod: code, adSoyad: [firstName, lastName].filter(Boolean).join(" ") || `IdeaSoft Müşteri ${externalOrderId}`, telefon: phone, email, vergiNo: taxNo, adres: pkg.shippingAddress?.address || "", il: pkg.shippingAddress?.locationName || "", ilce: pkg.shippingAddress?.district || "", postaKodu: pkg.shippingAddress?.zipCode || "", grup: "IdeaSoft" } }, { upsert: true, new: true, runValidators: true }); }
            const depot = await Depo.findOne({ tenantId: job.tenantId, aktif: true }).sort({ createdAt: 1 }).lean(); if (!depot) { await EticaretSiparis.findOneAndUpdate({ tenantId: job.tenantId, platform: connection.provider, externalOrderId }, { $set: { ...publicOrder, durum: "ESLESME_BEKLIYOR" } }, { upsert: true, new: true, runValidators: true }); errors++; pending++; errorDetails.push({ externalOrderId, code: "ACTIVE_WAREHOUSE_REQUIRED", message: "ERP siparişine aktarım için aktif depo gerekli." }); continue; }
            const erpNo = `IDEASOFT-${externalOrderId}`.toUpperCase();
            const erpLines = lines.map(x => { const brut = x.miktar * x.birimFiyat, rate = Math.max(0, Number(x.vergi || 0)), net = rate ? brut / (1 + rate / 100) : brut; return { urunId: x.urunId, miktar: x.miktar, birimFiyat: x.birimFiyat, kdv: rate, iskonto: 0, araToplam: net, kdvTutari: brut - net, toplam: brut }; });
            const erpOrder = await Siparis.findOneAndUpdate({ tenantId: job.tenantId, siparisNo: erpNo }, { $setOnInsert: { tenantId: job.tenantId, siparisNo: erpNo, tarih: orderDate, musteriId: customer._id, depoId: depot._id, kalemler: erpLines, araToplam: erpLines.reduce((n,x)=>n+x.araToplam,0), toplamKdv: erpLines.reduce((n,x)=>n+x.kdvTutari,0), genelToplam: total, paraBirimi: ["TRY","USD","EUR"].includes(currency) ? currency : "TRY", sevkAdresi: [pkg.shippingAddress?.address, pkg.shippingAddress?.district, pkg.shippingAddress?.locationName].filter(Boolean).join(" · "), durum: pkg.status === "cancelled" ? "IPTAL" : "ONAYLANDI", notlar: `IdeaSoft siparişi ${externalOrderId}` } }, { upsert: true, new: true, runValidators: true });
            const order = await EticaretSiparis.findOneAndUpdate({ tenantId: job.tenantId, platform: connection.provider, externalOrderId }, { $set: { ...publicOrder, musteriId: customer._id, erpSiparisId: erpOrder._id, durum: ["Cancelled","UnSupplied","cancelled","refunded"].includes(pkg.status) ? "IPTAL" : "SIPARISE_DONUSTU" } }, { upsert: true, new: true, runValidators: true });
            await Promise.all(lines.map(line => MarketplaceProductMapping.updateOne({ tenantId: job.tenantId, storeConnectionId: connection._id, productId: line.urunId }, { $inc: { reservedStock: line.miktar } }))); if (order) success++;
        }
        catch (error) { if (error.code !== 11000) { await EticaretSiparis.findOneAndUpdate({ tenantId: job.tenantId, platform: connection.provider, externalOrderId }, { $set: { ...publicOrder, durum: "ESLESME_BEKLIYOR" } }, { upsert: true, new: true, runValidators: true }).catch(() => {}); errors++; pending++; errorDetails.push({ externalOrderId, code: error.code || "ORDER_IMPORT_FAILED", message: error.message }); } }
    }
    return { processed: packages.length, success, errors, duplicates, pending, errorDetails };
}

async function urunleriAl(job, connection, adapter, { limit = 100, maxPages = 100 } = {}) {
    let processed = 0, success = 0, created = 0, unmatched = 0; const unmatchedProducts = [];
    for (let page = 1; page <= maxPages; page++) {
        const response = await tekrarDene(() => adapter.pullProducts({ limit, page })), products = yanitSatirlari(response, ["products"]);
        for (const external of products) {
            const externalProductId = String(external.id || ""); if (!externalProductId) continue;
            const externalSku = String(external.sku || external.stockCode || external.productCode || "").trim(), externalBarcode = String(external.barcode || external.ean || "").trim(), filters = [...(externalBarcode ? [{ barkod: externalBarcode }] : []), ...(externalSku ? [{ kod: externalSku.toUpperCase() }] : [])];
            let product = filters.length ? await Urun.findOne({ tenantId: job.tenantId, $or: filters }) : null;
            const name = String(external.name || external.fullName || external.title || `IdeaSoft Ürün ${externalProductId}`).trim().slice(0, 200);
            if (!product) {
                if (!externalSku && !externalBarcode) { unmatched++; if (unmatchedProducts.length < 100) unmatchedProducts.push({ externalProductId, externalSku, externalBarcode, name }); processed++; continue; }
                const kod = (externalSku || externalBarcode || `IDEA-${externalProductId}`).toUpperCase().slice(0, 60);
                const satisFiyati = Math.max(0, Number(external.price1 ?? external.salePrice ?? external.price ?? 0) || 0);
                const kdv = Math.max(0, Number(external.taxRate ?? external.vatRate ?? external.tax ?? 20) || 0);
                try {
                    product = await Urun.findOneAndUpdate({ tenantId: job.tenantId, kod }, { $setOnInsert: { tenantId: job.tenantId, kod, barkod: externalBarcode, ad: name, satisFiyati, perakendeFiyati: satisFiyati, kdv, notlar: `IdeaSoft ürünü #${externalProductId}` } }, { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true });
                    created++;
                } catch (error) { unmatched++; if (unmatchedProducts.length < 100) unmatchedProducts.push({ externalProductId, externalSku, externalBarcode, name }); processed++; continue; }
            }
            let mapping = await MarketplaceProductMapping.findOne({ tenantId: job.tenantId, storeConnectionId: connection._id, externalProductId });
            if (!mapping && product) mapping = await MarketplaceProductMapping.findOne({ tenantId: job.tenantId, storeConnectionId: connection._id, productId: product._id });
            if (!mapping) mapping = new MarketplaceProductMapping({ tenantId: job.tenantId, provider: connection.provider, storeConnectionId: connection._id, connectionId: connection._id, externalProductId });
            mapping.connectionId = connection._id; mapping.productId = product._id; mapping.externalSku = externalSku; mapping.externalBarcode = externalBarcode; mapping.syncStatus = "SYNCED"; mapping.lastSyncedAt = new Date(); mapping.lastError = ""; await mapping.save();
            processed++; success++;
        }
        if (products.length < limit) break;
    }
    return { processed, success, created, unmatched, unmatchedProducts, errors: 0 };
}

async function ideasoftPilotTest({ tenantId, connection, userId }) {
    if (!connection || connection.provider !== "IDEASOFT" || String(connection.tenantId) !== String(tenantId)) throw Object.assign(new Error("IdeaSoft bağlantısı bulunamadı."), { code: "INTEGRATION_NOT_CONFIGURED", status: 409 });
    const secured = await IntegrationConnection.findOne({ _id: connection._id, tenantId, active: true }).select("+encryptedCredentials"); if (!secured) throw Object.assign(new Error("IdeaSoft bağlantısı bulunamadı."), { code: "INTEGRATION_NOT_CONFIGURED", status: 409 });
    const adapter = marketplaceAdapter(secured), job = { tenantId, connectionId: secured._id, provider: "IDEASOFT", type: "PILOT", createdBy: userId || null }, stages = [];
    const claimed = await IntegrationConnection.findOneAndUpdate({ _id: secured._id, tenantId, pilotStatus: { $ne: "RUNNING" } }, { $set: { pilotStatus: "RUNNING", pilotResults: null } }, { new: true });
    if (!claimed) throw Object.assign(new Error("IdeaSoft küçük testi zaten çalışıyor."), { code: "PILOT_ALREADY_RUNNING", status: 409 });
    try {
        const connectionResult = await adapter.testConnection(); stages.push({ step: "CONNECTION", success: connectionResult.connected === true });
        const productResult = await urunleriAl(job, secured, adapter, { limit: 5, maxPages: 1 }); stages.push({ step: "PRODUCT_PULL_5", success: productResult.processed <= 5, ...productResult }); stages.push({ step: "SKU_BARCODE_MATCH", success: productResult.success > 0, matched: productResult.success, unmatched: productResult.unmatched });
        const mapping = await MarketplaceProductMapping.findOne({ tenantId, storeConnectionId: secured._id, productId: { $ne: null }, externalProductId: { $ne: "" } }).populate("productId").lean();
        if (mapping?.productId) { const stockRows = await Stok.aggregate([{ $match: { tenantId, urunId: mapping.productId._id } }, { $group: { _id: null, quantity: { $sum: "$miktar" } } }]), quantity = Math.max(0, Math.floor(Number(stockRows[0]?.quantity || 0))), salePrice = Number(mapping.productId.satisFiyati || 0); await adapter.updateStock([{ externalProductId: mapping.externalProductId, quantity }]); stages.push({ step: "STOCK_UPDATE_ONE", success: true }); await adapter.updatePrice([{ externalProductId: mapping.externalProductId, salePrice }]); stages.push({ step: "PRICE_UPDATE_ONE", success: true }); }
        else { stages.push({ step: "STOCK_UPDATE_ONE", success: false, reason: "MATCHED_PRODUCT_REQUIRED" }, { step: "PRICE_UPDATE_ONE", success: false, reason: "MATCHED_PRODUCT_REQUIRED" }); }
        const firstOrders = await siparisleriAl(job, secured, adapter, { limit: 5 }), secondOrders = await siparisleriAl(job, secured, adapter, { limit: 5 }); stages.push({ step: "ORDER_PULL", success: firstOrders.errors === 0, ...firstOrders }); stages.push({ step: "DUPLICATE_ORDER", success: secondOrders.success === 0, duplicates: secondOrders.duplicates });
        const [foreignMappings, foreignOrders] = await Promise.all([MarketplaceProductMapping.countDocuments({ storeConnectionId: secured._id, tenantId: { $ne: tenantId } }), EticaretSiparis.countDocuments({ connectionId: secured._id, tenantId: { $ne: tenantId } })]); stages.push({ step: "TENANT_ISOLATION", success: foreignMappings === 0 && foreignOrders === 0 });
        const required = stages.filter(x => !x.success), status = required.length ? (stages.some(x => x.success) ? "PARTIAL" : "FAILED") : "SUCCESS", result = { status, stages };
        await IntegrationConnection.updateOne({ _id: secured._id, tenantId }, { $set: { pilotStatus: status, pilotCompletedAt: new Date(), pilotResults: result } }); return result;
    } catch (error) { const result = { status: "FAILED", stages, error: { code: error.code || "PILOT_FAILED", message: error.message } }; await IntegrationConnection.updateOne({ _id: secured._id, tenantId }, { $set: { pilotStatus: "FAILED", pilotCompletedAt: new Date(), pilotResults: result } }); throw error; }
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
        else if (job.type === "PRODUCT_PUSH") { if (connection.provider === "IDEASOFT") throw Object.assign(new Error("IdeaSoft ürün oluşturma, zorunlu kategori ve kur alanları kullanıcı tarafından eşlenmeden çalıştırılmaz."), { code: "USER_MAPPING_REQUIRED", status: 409 }); sonuc = await urunGonder(job, connection, adapter); }
        else if (job.type === "ORDER_PULL") sonuc = await siparisleriAl(job, connection, adapter);
        else if (job.type === "QUESTION_PULL") sonuc = await sorulariAl(job, connection, adapter);
        else if (job.type === "PRODUCT_PULL") sonuc = connection.provider === "IDEASOFT" ? await urunleriAl(job, connection, adapter) : (() => { throw Object.assign(new Error("Bu sağlayıcı için ürün çekme akışı yapılandırılmadı."), { code: "PROVIDER_METHOD_NOT_IMPLEMENTED", status: 501 }); })();
        else throw Object.assign(new Error(`${job.type} için doğrulanmış sağlayıcı akışı henüz yapılandırılmadı.`), { code: "PROVIDER_METHOD_NOT_IMPLEMENTED", status: 501 });
        job.processedCount = sonuc.processed || 0; job.successCount = sonuc.success || 0; job.errorCount = sonuc.errors || 0; job.errors = guvenliDetay(sonuc.errorDetails || []); job.status = sonuc.errors ? (sonuc.success ? "PARTIAL" : "FAILED") : "SUCCESS";
        if (job.status !== "FAILED") await IntegrationConnection.updateOne({ _id: connection._id, tenantId: job.tenantId }, { $set: { lastSuccessfulSyncAt: new Date(), lastError: "" } });
    } catch (error) {
        job.status = "FAILED"; job.errorCount = 1; job.errors = [{ code: error.code || "SYNC_FAILED", message: error.message }];
        await IntegrationErrorKaydi.create({ tenantId: job.tenantId, connectionId: job.connectionId, provider: job.provider, operation: job.type, entityType: "SYNC_JOB", entityId: String(job._id), errorCode: error.code || "SYNC_FAILED", errorMessage: error.message, technicalDetails: guvenliDetay(error.details || {}), retryable: Boolean(error.retryable) });
        await IntegrationConnection.updateOne({ _id: job.connectionId, tenantId: job.tenantId }, { $set: { lastErrorAt: new Date(), lastError: error.message } });
    } finally { job.finishedAt = new Date(); await job.save(); }
}
async function sirayaAl({ tenantId, connection, type, userId, hemenCalistir = false }) {
    const activeJob = await IntegrationSyncJob.findOne({ tenantId, connectionId: connection._id, type, status: { $in: ["QUEUED", "RUNNING"] } }).sort({ createdAt: -1 });
    if (activeJob) { if (hemenCalistir && activeJob.status === "QUEUED") await isiCalistir(activeJob._id); return IntegrationSyncJob.findById(activeJob._id); }
    const job = await IntegrationSyncJob.create({ tenantId, provider: connection.provider, connectionId: connection._id, type, createdBy: userId || null });
    if (hemenCalistir) { await isiCalistir(job._id); return IntegrationSyncJob.findById(job._id); }
    setImmediate(() => isiCalistir(job._id).catch(error => console.error("ETICARET_SYNC_HATASI", { jobId: String(job._id), message: error.message })));
    return job;
}
async function ideasoftSiparisleriniOtomatikSirayaAl() {
    const allowedTenantId = String(process.env.IDEASOFT_AKN_TENANT_ID || "6a8dc53a3ff8c8a32ff9545b").trim();
    const connections = await IntegrationConnection.find({ tenantId: allowedTenantId, provider: "IDEASOFT", type: "MARKETPLACE", active: true, pilotStatus: { $in: ["SUCCESS", "PARTIAL"] } }).select("tenantId provider").lean();
    for (const connection of connections) await sirayaAl({ tenantId: connection.tenantId, connection, type: "ORDER_PULL", userId: null, hemenCalistir: Boolean(process.env.VERCEL) });
    return connections.length;
}
function ideasoftOtomatikSenkronizasyonBaslat() {
    if (String(process.env.IDEASOFT_AUTO_SYNC || "true").toLowerCase() === "false") return null;
    const intervalMs = Math.max(60000, Math.min(3600000, Number(process.env.IDEASOFT_ORDER_SYNC_INTERVAL_MS || 300000) || 300000));
    const run = () => ideasoftSiparisleriniOtomatikSirayaAl().catch(error => console.error("IDEASOFT_OTOMATIK_SIPARIS_HATASI", { name: error.name, message: error.message }));
    const firstRun = setTimeout(run, 10000); firstRun.unref?.();
    const timer = setInterval(run, intervalMs); timer.unref?.();
    return timer;
}
module.exports = { sirayaAl, isiCalistir, tekrarDene, guvenliDetay, stokFiyatGonder, urunGonder, siparisleriAl, sorulariAl, urunleriAl, ideasoftPilotTest, yanitSatirlari, ideasoftSiparisSatirlariniNormalizeEt, ideasoftSiparisleriniOtomatikSirayaAl, ideasoftOtomatikSenkronizasyonBaslat };
