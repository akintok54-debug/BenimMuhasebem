const Cari = require("../models/CariHareket");
const Musteri = require("../models/Musteri");
const fail = message => Object.assign(new Error(message), {status:409});
const para = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
function degisim(row) {
    if (row.durum === "IPTAL") return 0;
    if (row.durum === "IPTAL_ISLENIYOR") throw fail("Cari iptal işlemi sürüyor; mutabakat ertelendi.");
    if (row.bakiyeDegisimi != null && Number.isFinite(Number(row.bakiyeDegisimi))) return Number(row.bakiyeDegisimi);
    const signs = {BORC:1,ALACAK:-1,TAHSILAT:-1,ODEME:1,IADE:-1};
    if (!(row.tip in signs) || !Number.isFinite(Number(row.tutar))) throw fail("Yönü/tutarı belirsiz eski cari hareket var; manuel inceleme gerekli.");
    return signs[row.tip] * Number(row.tutar);
}
function bakiyePlani(customer, rows) {
    let opening = customer.cariAcilisBakiyesi;
    if (opening == null) {
        const ordered = [...rows].sort((a,b) => String(a._id).localeCompare(String(b._id)));
        const anchorIndex = ordered.findIndex(row => row.oncekiBakiye != null);
        const prefix = ordered.slice(0, anchorIndex);
        // A recorded balance snapshot can anchor older movements lacking snapshots.
        // Cancelled prefix rows cannot prove their historical effect at that instant.
        if (anchorIndex >= 0 && !prefix.some(row => row.durum === "IPTAL" || row.durum === "IPTAL_ISLENIYOR")) opening = Number(ordered[anchorIndex].oncekiBakiye) - prefix.reduce((sum,row)=>sum+degisim(row),0);
        else if (!rows.length && Number(customer.bakiye || 0) === 0) opening = 0;
        else throw fail("Cari açılış bakiyesi kayıtlarla doğrulanamıyor; otomatik işlem durduruldu.");
    }
    if (!Number.isFinite(Number(opening))) throw fail("Cari açılış bakiyesi geçersiz.");
    return {opening:Number(opening), balance:para(rows.reduce((sum,row)=>sum+degisim(row),Number(opening)))};
}
async function capture(tenantId, customerId, session) {
    const customer = await Musteri.findOne({_id:customerId,tenantId}).session(session);
    if (!customer) throw fail("Satışın cari hesabı bulunamadı veya firmaya ait değil.");
    const rows = await Cari.find({tenantId,tarafTipi:"MUSTERI",tarafId:customerId}).session(session).lean();
    const plan = bakiyePlani(customer, rows);
    if (customer.cariAcilisBakiyesi == null) await Musteri.updateOne({_id:customerId,tenantId},{$set:{cariAcilisBakiyesi:plan.opening}},{session});
    return plan.opening;
}
async function rebuild(tenantId, customerId, opening, session) {
    const rows = await Cari.find({tenantId,tarafTipi:"MUSTERI",tarafId:customerId}).sort({tarih:1,_id:1}).session(session).lean();
    let balance=opening;const writes=[];
    for(const row of rows){const before=balance;balance=para(balance+degisim(row));writes.push({updateOne:{filter:{_id:row._id,tenantId,tarafId:customerId},update:{$set:{oncekiBakiye:before,sonrakiBakiye:balance}}}});}
    if(writes.length)await Cari.bulkWrite(writes,{session});
    await Musteri.updateOne({_id:customerId,tenantId},{$set:{bakiye:balance,cariAcilisBakiyesi:opening}},{session});
    return balance;
}
async function esitle({satis,session}) {
    if(!session)throw fail("Satış-cari eşitlemesi transaction gerektirir.");
    const tenantId=satis.tenantId;
    const sources=await Cari.find({tenantId,tarafTipi:"MUSTERI",$or:[{sourceType:"SALE",sourceId:satis._id},{kaynak:"SATIS",kaynakId:satis._id,tip:"BORC"}]}).session(session).lean();
    if(sources.length!==1)throw fail("Satışa bağlı tek cari hareket bulunamadı; eksik/mükerrer kayıt incelemesi gerekli.");
    const source=sources[0],customerIds=[...new Set([String(source.tarafId),String(satis.musteriId)])].sort();
    if(source.tip!=="BORC" || (source.kaynakId && String(source.kaynakId)!==String(satis._id))) throw fail("Satış kaynak bağlantısı çelişkili.");
    const related=await Cari.find({tenantId,kaynakId:satis._id,kaynak:{$in:["SATIS_DUZELTME","SATIS_IPTAL","SATIS_TAHSILAT"]}}).session(session).lean();
    if(related.some(row=>row.tarafTipi!=="MUSTERI" || !customerIds.includes(String(row.tarafId)))) throw fail("Satışın bağlı hareketlerinde farklı cari hesap var; inceleme gerekli.");
    const openings=new Map();for(const id of customerIds)openings.set(id,await capture(tenantId,id,session));
    const total=Number(satis.genelToplam);if(!Number.isFinite(total)||total<0)throw fail("Satış toplamı geçersiz.");
    await Cari.updateOne({_id:source._id,tenantId},{$set:{sourceType:"SALE",sourceId:satis._id,kaynak:"SATIS",kaynakId:satis._id,tarafId:satis.musteriId,tutar:total,bakiyeDegisimi:total,belgeNo:satis.belgeNo,tarih:satis.tarih,durum:satis.durum==="IPTAL"?"IPTAL":"AKTIF"}},{session,runValidators:true});
    // Old delta rows must no longer affect the now-updated original SALE row.
    await Cari.updateMany({tenantId,kaynakId:satis._id,kaynak:{$in:["SATIS_DUZELTME","SATIS_IPTAL"]},durum:{$ne:"IPTAL"}},{$set:{durum:"IPTAL",iptalTarihi:new Date(),iptalNedeni:"Ana satış hareketi ile tekil mutabakat"}},{session});
    if(String(source.tarafId)!==String(satis.musteriId))await Cari.updateMany({tenantId,kaynak:"SATIS_TAHSILAT",kaynakId:satis._id,tarafTipi:"MUSTERI",tarafId:source.tarafId},{$set:{tarafId:satis.musteriId}},{session});
    const balances={};for(const id of customerIds)balances[id]=await rebuild(tenantId,id,openings.get(id),session);
    return {hareketId:source._id,balances,musteriBakiye:balances[String(satis.musteriId)]};
}
module.exports={esitle,bakiyePlani,degisim};
