const mongoose = require('mongoose');
const Icerik = require('../../models/BayiIcerik'), Urun = require('../../models/Urun'), Musteri = require('../../models/Musteri');
const Tedarikci = require('../../models/Tedarikci'), Satis = require('../../models/Satis'), Siparis = require('../../models/Siparis');
const Ledger = require('../../models/CariHareket'), Tenant = require('../platform/models/Tenant');
const f = require('../../services/fiyatServisi'), { hata, oid, metin } = require('./servis');
const run = fn => async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
function analiz(sales, pending, days, now = new Date()) {
    const start = +now - days * 86400000, products = new Map();let other = 0;
    for (const sale of sales) {
        if(sale.durum==='IPTAL'||+new Date(sale.tarih)<start)continue;
        if(sale.paraBirimi&&sale.paraBirimi!=='TRY'){other++;continue;}
        for(const line of sale.kalemler||[]) {
            const p=line.urunId;if(!p?._id)continue;const id=String(p._id);
            const row=products.get(id)||{urunId:id,kod:p.kod,ad:p.ad,birim:p.birim,miktar:0,tutar:0,sonAlis:null,sonMiktar:0,tarihler:[],siparisler:new Set()};
            row.miktar+=Number(line.miktar||0);row.tutar+=Number(line.toplam||0);row.siparisler.add(String(sale._id));
            if(!row.sonAlis||+new Date(sale.tarih)>=+new Date(row.sonAlis)){row.sonAlis=sale.tarih;row.sonMiktar=Number(line.miktar||0);}
            row.tarihler.push(+new Date(sale.tarih));products.set(id,row);
        }
    }
    const rows=[...products.values()].map(({tarihler,siparisler,...r})=>{
        const dates=[...new Set(tarihler)].sort((a,b)=>a-b),interval=dates.length>1?(dates.at(-1)-dates[0])/(dates.length-1):0;
        return {...r,tutar:f.yuvarla(r.tutar),belgeSayisi:siparisler.size,uzunSuredirAlinmayan:dates.length>=3&&+now-dates.at(-1)>Math.max(30*86400000,interval*1.5)};
    });
    return {gun:days,paraBirimi:'TRY',urunler:rows.sort((a,b)=>b.tutar-a.tutar),bekleyenSiparis:pending.length,digerParaBirimiBelge:other,
        aciklama:'Tamamlanan ERP satışlarının KDV dahil tutarlarıdır; iptal belgeleri hariçtir. Bekleyen siparişler satın alma toplamına eklenmez. İade tutarları bu brüt satın alma görünümünden düşülmez.'};
}
async function icerikDogrula(body,tenantId){
    const data={};
    if(!['YENI','INDIRIMLI','KAMPANYA','REKLAM'].includes(body.tur))throw hata('İçerik türü geçersiz.');data.tur=body.tur;
    data.baslik=metin(body.baslik,150);if(!data.baslik)throw hata('Başlık zorunludur.');
    if(typeof body.aktif!=='boolean')throw hata('Aktif/pasif seçimi zorunludur.');data.aktif=body.aktif;
    data.baslangic=new Date(body.baslangic);data.bitis=new Date(body.bitis);
    if(!Number.isFinite(+data.baslangic)||!Number.isFinite(+data.bitis)||data.baslangic>=data.bitis)throw hata('Başlangıç ve bitiş tarihi geçersiz.');
    for(const [key,Model]of [['urunIds',Urun],['musteriIds',Musteri]]){
        if(!Array.isArray(body[key])||body[key].length>500)throw hata('Seçim listesi geçersiz.');
        data[key]=[...new Set(body[key].map(oid))];
        if(data[key].length&&await Model.countDocuments({tenantId,_id:{$in:data[key]}})!==data[key].length)throw hata('Seçimde farklı firmaya ait veya bulunamayan kayıt var.');
    }
    for(const key of ['kategori','marka'])data[key]=metin(body[key]||'',150);
    if(!Array.isArray(body.fiyatTurleri)||!body.fiyatTurleri.length||body.fiyatTurleri.some(x=>!['SATIS','BAYI','PERAKENDE'].includes(x)))throw hata('Fiyat türü seçin.');
    data.fiyatTurleri=[...new Set(body.fiyatTurleri)];data.indirimOrani=f.sayi(body.indirimOrani??0,'İndirim',0,100);
    data.gorsel=metin(body.gorsel||'',2800000);data.hedef=metin(body.hedef||'',1000);
    if(data.gorsel&&!/^(https:\/\/|data:image\/(?:jpeg|png|webp);base64,)/i.test(data.gorsel))throw hata('Görsel adresi geçersiz.');
    if(data.hedef&&!/^(https:\/\/|\/[^/\\])/i.test(data.hedef))throw hata('Hedef yalnız HTTPS veya site içi adres olabilir.');
    data.tedarikciId=body.tedarikciId?oid(body.tedarikciId):null;
    if(data.tur==='REKLAM'&&!data.tedarikciId)throw hata('Reklam için tedarikçi seçin.');
    if(data.tedarikciId&&!await Tedarikci.exists({_id:data.tedarikciId,tenantId}))throw hata('Tedarikçi bulunamadı.');
    return data;
}
function kur(portal,admin){
    admin.get('/contents',run(async(req,res)=>{
        const [icerikler,tedarikciler,musteriler]=await Promise.all([
            Icerik.find({tenantId:req.tenantId}).sort({createdAt:-1}).limit(500).lean(),
            Tedarikci.find({tenantId:req.tenantId,aktif:true}).select('kod unvan adSoyad').lean(),
            Musteri.find({tenantId:req.tenantId,aktif:true,'b2b.aktif':true}).select('kod unvan adSoyad').lean()
        ]);res.json({basarili:true,icerikler,tedarikciler,musteriler});
    }));
    const save=run(async(req,res)=>{
        const data=await icerikDogrula(req.body,req.tenantId);
        const doc=req.params.id?await Icerik.findOneAndUpdate({_id:oid(req.params.id),tenantId:req.tenantId},{$set:data},{new:true,runValidators:true}):await Icerik.create({...data,tenantId:req.tenantId});
        if(!doc)throw hata('İçerik bulunamadı.',404);
        await require('../platform/services/auditServisi').kaydet({req,tenantId:req.tenantId,action:'B2B_CONTENT_UPDATED',resource:'BayiIcerik',resourceId:doc._id,details:{tur:doc.tur,aktif:doc.aktif}});
        res.json({basarili:true,icerik:doc});
    });admin.post('/contents',save);admin.patch('/contents/:id',save);
    portal.get('/contents',run(async(req,res)=>{
        const now=new Date(),rows=await f.kampanyalariOku(req.tenantId,null,now);
        const tur=req.bayi.b2b?.musteriTipi==='PERAKENDE'?'PERAKENDE':'BAYI';
        res.json({basarili:true,icerikler:rows.filter(c=>c.fiyatTurleri.includes(tur)&&(!c.musteriIds.length||c.musteriIds.some(id=>String(id)===String(req.bayi._id)))).map(c=>({_id:c._id,tur:c.tur,baslik:c.baslik,gorsel:c.gorsel,hedef:c.hedef,kategori:c.kategori,urunId:c.urunIds?.[0]||null,bitis:c.bitis}))});
    }));
    portal.get('/account-statement',run(async(req,res)=>{
        const movements=await Ledger.find({tenantId:req.tenantId,tarafId:req.bayi._id,tarafTipi:'MUSTERI'}).sort({tarih:1,createdAt:1,_id:1}).limit(20001).lean();
        if(movements.length>20000)throw hata('Ekstre 20.000 hareketi aşıyor. Ayrıntılı arşiv ekstresi için firmanızla görüşün.',422);
        const detay=await require('../../services/cariEkstreDetayServisi').detaylandir(req.tenantId,movements);
        const company=await Tenant.findById(req.tenantId).select('name firmaBilgileri').lean();
        const c=req.bayi;
        res.json({basarili:true,musteri:{kod:c.kod,unvan:c.unvan,adSoyad:c.adSoyad,bakiye:c.bakiye,cariAcilisBakiyesi:c.cariAcilisBakiyesi,adres:c.adres},firma:{unvan:company?.firmaBilgileri?.unvan||company?.name,adres:company?.firmaBilgileri?.adres},hareketler:detay.map(({_id,tarih,createdAt,tip,tutar,bakiyeDegisimi,oncekiBakiye,sonrakiBakiye,durum,belgeNo,aciklama,kaynak,kaynakId,sourceId,kalemler})=>({_id,tarih,createdAt,tip,tutar,bakiyeDegisimi,oncekiBakiye,sonrakiBakiye,durum,belgeNo,aciklama,kaynak,kaynakId,sourceId,kalemler}))});
    }));
    portal.get('/purchase-analysis',run(async(req,res)=>{
        const days=Number(req.query.gun||90);if(![30,90,180,365].includes(days))throw hata('Dönem geçersiz.');
        const scope={tenantId:req.tenantId,musteriId:req.bayi._id,durum:{$ne:'IPTAL'},tarih:{$gte:new Date(Date.now()-days*86400000)}};
        const sales=await Satis.find(scope).select('tarih kalemler paraBirimi durum').populate({path:'kalemler.urunId',match:{tenantId:req.tenantId},select:'kod ad birim'}).limit(10001).lean();
        if(sales.length>10000)throw hata('Analiz çok fazla belge içeriyor. Daha kısa dönem seçin.',422);
        const pending=await Siparis.find({...scope,satisId:null,durum:{$nin:['IPTAL','TAMAMLANDI']}}).select('_id').lean();
        res.json({basarili:true,...analiz(sales,pending,days)});
    }));
}
module.exports={kur,analiz,icerikDogrula};
