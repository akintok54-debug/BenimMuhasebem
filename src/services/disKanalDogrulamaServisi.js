const Mapping=require('../models/MarketplaceProductMapping');
const fiyat=require('./disKanalFiyatServisi');
async function fiyatKontrol(tenantId,connection,adapter,offset=0){
 if(connection.provider!=='IDEASOFT')throw Object.assign(new Error('Bu sağlayıcı için canlı fiyat okuma doğrulaması tanımlı değil.'),{status:409});
 if(!Number.isInteger(offset)||offset<0||offset>50000)throw Object.assign(new Error('Sayfa geçersiz.'),{status:400});
 const filter={tenantId,storeConnectionId:connection._id};
 const total=await Mapping.countDocuments(filter),mappings=await Mapping.find(filter).populate({path:'productId',match:{tenantId}}).sort({_id:1}).skip(offset).limit(10).lean(),rows=[];
 for(const mapping of mappings){
  if(!mapping.productId||!mapping.externalProductId){rows.push({id:String(mapping._id),status:'ESLESME_EKSIK'});continue;}
  try{const remote=await adapter.request('/admin-api/products/'+encodeURIComponent(mapping.externalProductId)),external=fiyat.ideasoftNet(remote),expected=fiyat.kanalFiyati(mapping.productId,'IDEASOFT');
   rows.push({id:String(mapping._id),kod:mapping.productId.kod,externalProductId:mapping.externalProductId,erpNet:expected.salePrice,disNet:external.net,erpKdv:expected.vatRate,disKdv:external.kdv,disKdvDahil:fiyat.dahil(remote.taxIncluded),disIndirim:remote.discount??0,disIndirimTuru:remote.discountType??null,status:Math.abs(expected.salePrice-external.net)<0.011&&expected.vatRate===external.kdv?'UYUMLU':'FARK_VAR'});
  }catch(e){rows.push({id:String(mapping._id),status:'DOGRULANAMADI',code:e.code||'PROVIDER_ERROR',message:e.code==='EXTERNAL_PRICE_VALIDATION'?e.message:'Dış ürün fiyatı okunamadı.'});}
 }
 return {saltOkunur:true,kapsam:'Ürün kartı net fiyat ve KDV; kanal kampanyaları ayrı uygulanır.',total,offset,checked:rows.length,nextOffset:offset+rows.length<total?offset+rows.length:null,rows};
}
module.exports={fiyatKontrol};
