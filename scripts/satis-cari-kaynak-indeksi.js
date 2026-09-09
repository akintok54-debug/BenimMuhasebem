require('dotenv').config({quiet:true});
const mongoose=require('mongoose');
const Cari=require('../src/models/CariHareket');
async function main(){
 await mongoose.connect(process.env.MONGODB_URI,{autoIndex:false,serverSelectionTimeoutMS:10000});
 const duplicates=await Cari.aggregate([{$match:{sourceType:'SALE'}},{$group:{_id:{tenantId:'$tenantId',sourceId:'$sourceId'},count:{$sum:1}}},{$match:{count:{$gt:1}}},{$count:'count'}]);
 if(duplicates.length)throw Error('Mükerrer SALE kaynakları var; indeks oluşturulmadı.');
 if(!process.argv.includes('--apply')){console.log('Kaynak tekillik kontrolü geçti. İndeks oluşturmak için --apply kullanın.');return;}
 await Cari.collection.createIndex({tenantId:1,sourceType:1,sourceId:1},{unique:true,partialFilterExpression:{sourceType:'SALE'}});
 console.log('SALE kaynak benzersiz indeksi hazır; mevcut indeksler silinmedi.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>mongoose.disconnect());
