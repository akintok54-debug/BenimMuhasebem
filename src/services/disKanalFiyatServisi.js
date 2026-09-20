const f=require('./fiyatServisi');
const fail=message=>Object.assign(new Error(message),{code:'EXTERNAL_PRICE_VALIDATION',status:409});
function dahil(value){if([true,1,'1','true'].includes(value))return true;if([false,0,'0','false'].includes(value))return false;throw fail('Dış ürünün KDV dahil/hariç bilgisi eksik; fiyat gönderilmedi.');}
function ideasoftNet(product){const kdv=f.sayi(product.tax??product.taxRate??product.vatRate,'KDV',0,100);const price=f.sayi(product.price1,'Dış fiyat');return {kdv,net:dahil(product.taxIncluded)?f.yuvarla(f.kdvHaric(price,kdv)):price};}
function ideasoftDegisiklik(current,item){const kdv=f.sayi(item.vatRate??current.tax,'KDV',0,100),net=f.sayi(item.salePrice,'Net fiyat');return {price1:dahil(current.taxIncluded)?f.kdvDahil(net,kdv):net,tax:kdv};}
function kanalFiyati(product,provider){const kdv=f.sayi(product.kdv??20,'KDV',0,100),net=f.sayi(product.satisFiyati??0,'Satış fiyatı'),liste=Math.max(net,f.sayi(product.perakendeFiyati??net,'Liste fiyatı'));return {salePrice:provider==='TRENDYOL'?f.kdvDahil(net,kdv):net,listPrice:provider==='TRENDYOL'?f.kdvDahil(liste,kdv):liste,vatRate:kdv};}
function siparisHesapla(lines,total){
 const expected=f.yuvarla(f.sayi(total,'Dış sipariş toplamı'));
 for(const fallback of [true,false]){
  const result=f.hesapla(lines.map(x=>({urunId:x.urunId,miktar:x.miktar,birimFiyat:x.birimFiyat,kdv:x.vergi,kdvDahil:x.kdvDahil===undefined?fallback:x.kdvDahil,iskonto:0})));
  if(Math.abs(result.genelToplam-expected)<0.011)return result;
 }
 throw fail('Dış sipariş toplamı kalem/KDV toplamıyla eşleşmiyor. Kargo ve indirim farkı uzlaştırılmadan ERP siparişi oluşturulmadı.');
}
module.exports={dahil,ideasoftNet,ideasoftDegisiklik,kanalFiyati,siparisHesapla};
