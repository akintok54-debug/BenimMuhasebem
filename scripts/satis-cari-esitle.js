require("dotenv").config({quiet:true});
const fs=require("fs"),path=require("path"),mongoose=require("mongoose");
const Satis=require("../src/models/Satis"),Cari=require("../src/models/CariHareket"),Musteri=require("../src/models/Musteri"),Audit=require("../src/modules/platform/models/PlatformAuditLog");
const {esitle,bakiyePlani}=require("../src/services/satisCariEsitlemeServisi");
async function main(){
 const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1],tenant=get("--tenant");
 if(!args.includes("--tenant")||!/^[a-f0-9]{24}$/i.test(tenant))throw Error("--tenant <ObjectId> zorunlu. Varsayılan dry-run.");
 const tenantId=new mongoose.Types.ObjectId(tenant),apply=args.includes("--apply");
 await mongoose.connect(process.env.MONGODB_URI,{autoIndex:false,serverSelectionTimeoutMS:10000});
 const saleId=args.includes("--sale")?get("--sale"):null;if(saleId&&!/^[a-f0-9]{24}$/i.test(saleId))throw Error("Geçersiz --sale kimliği.");
 const sales=await Satis.find({tenantId,...(saleId?{_id:saleId}:{})}).lean();const report={tenantId,mode:apply?"apply":"dry-run",date:new Date(),sales:sales.length,changes:[],blocked:[]};
 const destination=path.resolve("backups/delivery-audit");fs.mkdirSync(destination,{recursive:true});
 for(const sale of sales){
  const rows=await Cari.find({tenantId,tarafTipi:"MUSTERI",$or:[{sourceType:"SALE",sourceId:sale._id},{kaynak:"SATIS",kaynakId:sale._id,tip:"BORC"}]}).lean();
  if(rows.length!==1){report.blocked.push({saleId:sale._id,reason:rows.length?"DUPLICATE_SOURCE":"MISSING_SOURCE"});continue;}
  const row=rows[0],extras=await Cari.find({tenantId,kaynakId:sale._id,kaynak:{$in:["SATIS_DUZELTME","SATIS_IPTAL"]},durum:{$ne:"IPTAL"}}).lean();
  const expectedStatus=sale.durum==="IPTAL"?"IPTAL":"AKTIF";
  const changed=Number(row.tutar)!==Number(sale.genelToplam)||Number(row.bakiyeDegisimi)!==Number(sale.genelToplam)||String(row.tarafId)!==String(sale.musteriId)||row.sourceType!=="SALE"||String(row.sourceId)!==String(sale._id)||row.durum!==expectedStatus||extras.length;
  if(!changed)continue;
  const customerIds=[...new Set([String(row.tarafId),String(sale.musteriId)])],snapshots=[];let blocked=false;
  for(const id of customerIds){const customer=await Musteri.findOne({_id:id,tenantId}).lean(),ledger=await Cari.find({tenantId,tarafTipi:"MUSTERI",tarafId:id}).lean();try{if(!customer)throw Error("MISSING_CUSTOMER");bakiyePlani(customer,ledger);snapshots.push({customer,ledger});}catch(error){report.blocked.push({saleId:sale._id,reason:error.message});blocked=true;}}
  if(blocked)continue;
  const change={saleId:sale._id,movementId:row._id,oldAmount:row.tutar,oldBalanceChange:row.bakiyeDegisimi,newAmount:sale.genelToplam,legacyCorrections:extras.length};
  if(apply){const session=await mongoose.startSession();try{await session.withTransaction(async()=>{const current=await Satis.findOne({_id:sale._id,tenantId}).session(session);if(!current)throw Error("SALE_MISSING");if(String(current.updatedAt)!==String(sale.updatedAt))throw Error("SALE_CHANGED_RETRY_DRY_RUN");const transactionSnapshots=[];for(const id of customerIds){transactionSnapshots.push({customer:await Musteri.findOne({_id:id,tenantId}).session(session).lean(),ledger:await Cari.find({tenantId,tarafTipi:"MUSTERI",tarafId:id}).session(session).lean()});}fs.writeFileSync(path.join(destination,'before-'+sale._id+'-'+Date.now()+'.json'),JSON.stringify({sale:current.toObject(),snapshots:transactionSnapshots},null,2));const result=await esitle({satis:current,session});await Audit.create([{tenantId,actorUserId:null,action:"SALE_LEDGER_REPAIRED",resource:"Satis",resourceId:String(sale._id),category:"MUHASEBE_DUZELTME",severity:"UYARI",details:{...change,result}}],{session});});change.applied=true;}catch(error){report.blocked.push({saleId:sale._id,reason:error.message});change.applied=false;}finally{await session.endSession();}}
  report.changes.push(change);
 }
 fs.writeFileSync(path.join(destination,'sale-ledger-'+report.mode+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({mode:report.mode,sales:report.sales,changes:report.changes.length,blocked:report.blocked.length}));if(report.blocked.length)process.exitCode=2;
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>mongoose.disconnect());
module.exports={main};
