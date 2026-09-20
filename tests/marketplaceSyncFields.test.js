const test=require('node:test'),assert=require('node:assert/strict');
const Mapping=require('../src/models/MarketplaceProductMapping'),Stock=require('../src/models/Stok');
const {stokFiyatGonder}=require('../src/services/eticaretSyncServisi');
test('Trendyol stock-only requests cannot overwrite price and price-only requests cannot overwrite stock',async()=>{
 const Adapter=require('../src/integrations/marketplace/trendyolAdapter');
 const adapter=Object.create(Adapter.prototype);adapter.auth=()=>({sellerId:'store'});adapter.request=async(path,body)=>body;
 const items=[{barcode:'code',quantity:7,salePrice:100,listPrice:120}];
 assert.deepEqual((await adapter.updateStock(items)).body.items,[{barcode:'code',quantity:7}]);
 assert.deepEqual((await adapter.updatePrices(items)).body.items,[{barcode:'code',salePrice:100,listPrice:120}]);
});
test('Stock and price jobs only acknowledge fields actually sent; inactive products send zero stock',async t=>{
 const tenantId='000000000000000000000001',productId='000000000000000000000002';
 let sent,updated;
 t.mock.method(Mapping,'find',filter=>{assert.equal(filter.tenantId,tenantId);return {populate(options){assert.equal(options.match.tenantId,tenantId);return this;},lean:async()=>[{_id:'mapping',externalProductId:'external',productId:{_id:productId,aktif:false,satisFiyati:100},lastStockSent:5,lastPriceSent:80}]};});
 t.mock.method(Stock,'aggregate',async()=>[{_id:productId,miktar:10}]);
 t.mock.method(Mapping,'updateOne',async(filter,update)=>{assert.equal(filter.tenantId,tenantId);updated=update.$set;});
 const adapter={updateStock:async items=>{sent=items;},updatePrices:async items=>{sent=items;}};
 await stokFiyatGonder({tenantId,type:'STOCK_PUSH'},{_id:'store',provider:'IDEASOFT'},adapter);
 assert.equal(sent[0].quantity,0);assert.equal(updated.lastStockSent,0);assert.ok(!('lastPriceSent' in updated));
 await stokFiyatGonder({tenantId,type:'PRICE_PUSH'},{_id:'store',provider:'IDEASOFT'},adapter);
 assert.equal(updated.lastPriceSent,100);assert.ok(!('lastStockSent' in updated));
});
test('VAT-only changes resend prices; provider batch acceptance is not marked as completed',async t=>{
 let product={_id:'p',satisFiyati:100,perakendeFiyati:150,kdv:20},mapping={_id:'m',externalBarcode:'b',productId:product,lastPriceSent:120},updated,sent;
 t.mock.method(Mapping,'find',()=>({populate(){return this;},lean:async()=>[mapping]}));t.mock.method(Stock,'aggregate',async()=>[]);
 t.mock.method(Mapping,'updateOne',async(f,u)=>{updated=u.$set;Object.assign(mapping,u.$set);});t.mock.method(Mapping,'updateMany',async(f,u)=>{updated=u.$set;});
 const adapter={updatePrices:async items=>{sent=items;return {};}};
 await stokFiyatGonder({tenantId:'t',type:'PRICE_PUSH'},{_id:'c',provider:'TRENDYOL'},adapter);assert.equal(sent[0].salePrice,120);const signature=mapping.lastPriceSignature;
 product.kdv=10;await stokFiyatGonder({tenantId:'t',type:'PRICE_PUSH'},{_id:'c',provider:'TRENDYOL'},adapter);assert.equal(sent[0].salePrice,110);assert.notEqual(mapping.lastPriceSignature,signature);
 product.kdv=1;adapter.updatePrices=async()=>({batchRequestId:'batch'});const result=await stokFiyatGonder({tenantId:'t',type:'PRICE_PUSH'},{_id:'c',provider:'TRENDYOL'},adapter);assert.equal(result.success,0);assert.equal(result.pending,1);assert.equal(updated.syncStatus,'PENDING');assert.equal(mapping.lastPriceSent,110);
});
