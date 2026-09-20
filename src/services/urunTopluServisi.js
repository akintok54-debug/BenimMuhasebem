const crypto = require('node:crypto');
const mongoose = require('mongoose');
const Urun = require('../models/Urun'), Depo = require('../models/Depo'), Stok = require('../models/Stok'), Hareket = require('../models/StokHareket');
const Audit = require('../modules/platform/models/PlatformAuditLog');
const { sayi, yuvarla, kdvHaric } = require('./fiyatServisi');
const hata = (message, status = 400) => Object.assign(new Error(message), { status });
const numeric = ['kdv','alisFiyati','satisFiyati','bayiFiyati','perakendeFiyati','iskonto','minimumStok','kritikStok'];
const fields = ['kod','barkod','ad','kategori','marka','model','birim','paraBirimi','notlar','aktif','gorsel','ekGorseller','uyumluluk',...numeric];
const text = x => String(x ?? '').trim();
const id = value => { if (!mongoose.isValidObjectId(value)) throw hata('Geçersiz ürün kimliği.'); return String(value); };
function temizle(row) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw hata('Ürün satırı geçersiz.');
    const out = {};
    for (const key of fields) {
        const value = row[key];
        // Empty Excel cells never erase existing values or turn a missing price into zero.
        if (value === undefined || value === null || value === '') continue;
        if (numeric.includes(key)) out[key] = sayi(value, key, 0, ['kdv','iskonto'].includes(key) ? 100 : 1e12);
        else if (key === 'aktif') {
            if (![true,false,'true','false','1','0',1,0].includes(value)) throw hata('Aktif alanı doğru/yanlış olmalıdır.');
            out[key] = [true,'true','1',1].includes(value);
        } else if (['uyumluluk','ekGorseller'].includes(key)) out[key] = (Array.isArray(value) ? value : text(value).split(/[,;|]/)).map(text).filter(Boolean);
        else out[key] = text(value);
    }
    if (out.kod) out.kod = out.kod.toUpperCase();
    if (out.paraBirimi && !['TRY','USD','EUR'].includes(out.paraBirimi)) throw hata('Para birimi geçersiz.');
    for (const image of [out.gorsel, ...(out.ekGorseller || [])].filter(Boolean)) {
        if (!/^(https:\/\/|data:image\/(?:jpeg|png|webp);base64,)/i.test(image) || image.length > 2800000) throw hata('Ürün görseli geçersiz.');
    }
    if (out.ekGorseller?.length > 2) throw hata('En fazla iki ek görsel olabilir.');
    return out;
}
function aktarimPlani(rows, mevcutlar, depolar = [], stoklar = [], kdvDahil = false) {
    if (!Array.isArray(rows) || !rows.length || rows.length > 2000) throw hata('Dosya 1-2000 ürün içermelidir.');
    const codes = new Map(mevcutlar.map(x=>[x.kod,x])), bars = new Map(mevcutlar.filter(x=>x.barkod).map(x=>[x.barkod,x]));
    const seenIds = new Set(), seenCodes = new Set(), seenBars = new Set(), plan = [], errors = [];
    rows.forEach((raw, index) => {
        try {
            const data = temizle(raw), byCode = data.kod && codes.get(data.kod), byBar = data.barkod && bars.get(data.barkod);
            if (!data.kod && !data.barkod) throw hata('SKU veya barkod zorunludur.');
            if (byCode && byBar && String(byCode._id) !== String(byBar._id)) throw hata('SKU ve barkod farklı ürünlerle eşleşiyor.');
            const existing = byCode || byBar;
            if (existing && seenIds.has(String(existing._id)) || data.kod && seenCodes.has(data.kod) || data.barkod && seenBars.has(data.barkod)) throw hata('Aynı ürün dosyada birden çok kez yer alıyor.');
            if (!existing && (!data.kod || !data.ad)) throw hata('Yeni ürün için SKU ve ürün adı zorunludur.');
            const merged = { ...existing, ...data };
            if (kdvDahil) for (const key of ['alisFiyati','satisFiyati','bayiFiyati','perakendeFiyati']) if (data[key] !== undefined) data[key] = yuvarla(kdvHaric(data[key], merged.kdv ?? 20));
            const candidate = new Urun({ ...existing, ...data, tenantId: existing?.tenantId || new mongoose.Types.ObjectId() });
            const validation = candidate.validateSync(); if (validation) throw hata(Object.values(validation.errors)[0].message);
            let stock = null;
            if (raw.stokMiktari !== undefined && raw.stokMiktari !== '') {
                const miktar = sayi(raw.stokMiktari, 'Stok miktarı');
                const depot = raw.depoKodu ? depolar.find(x=>x.kod===text(raw.depoKodu).toUpperCase()) : depolar.length === 1 ? depolar[0] : null;
                if (!depot) throw hata('Stok aktarımında firmaya ait aktif Depo Kodu seçin.');
                const old = existing && stoklar.find(x=>String(x.urunId)===String(existing._id)&&String(x.depoId)===String(depot._id));
                stock = { depoId: String(depot._id), miktar, onceki: Number(old?.miktar || 0) };
            }
            if (existing) seenIds.add(String(existing._id)); if(data.kod) seenCodes.add(data.kod); if(data.barkod) seenBars.add(data.barkod);
            plan.push({ satir:index+2, islem:existing?'GUNCELLE':'EKLE', urunId:existing?String(existing._id):null,
                kod:data.kod||existing.kod, ad:data.ad||existing.ad, eski:existing?Object.fromEntries(Object.keys(data).map(k=>[k,existing[k]??null])):null,
                yeni:data, stok:stock, surum:existing?.updatedAt || null });
        } catch (e) { errors.push({ satir:index+2, mesaj:e.message }); }
    });
    return { satirlar:plan, hatalar:errors, eklenen:plan.filter(x=>x.islem==='EKLE').length, guncellenen:plan.filter(x=>x.islem==='GUNCELLE').length };
}
function filtre(body) {
    const f = {};
    if(body.kategori) f.kategori = text(body.kategori);
    if(body.marka) f.marka = text(body.marka);
    if(body.ids?.length) { if(!Array.isArray(body.ids)||body.ids.length>2000) throw hata('En fazla 2000 ürün seçilebilir.'); f._id = { $in:[...new Set(body.ids.map(id))] }; }
    if(!Object.keys(f).length) throw hata('Kategori, marka veya ürün seçin.');
    return f;
}
function fiyatPlani(products, body) {
    if(!['satisFiyati','bayiFiyati','perakendeFiyati','kdv','iskonto'].includes(body.alan)) throw hata('Toplu değişiklik alanı geçersiz.');
    const sabit=['kdv','iskonto'].includes(body.alan),donusum=['KDV_EKLE','KDV_CIKAR'].includes(body.islem);
    if(!sabit&&!['ZAM','INDIRIM','KDV_EKLE','KDV_CIKAR'].includes(body.islem)) throw hata('Fiyat güncelleme işlemi seçin.');
    const oran=donusum&&!sabit?0:sayi(body.oran,'Oran',0,sabit||body.islem==='INDIRIM'?100:1000);
    const yeniFiyat=p=>{const eski=sayi(p[body.alan]??0,'Mevcut fiyat');if(sabit)return oran;if(body.islem==='KDV_CIKAR')return yuvarla(kdvHaric(eski,p.kdv??20));if(body.islem==='KDV_EKLE')return require('./fiyatServisi').kdvDahil(eski,p.kdv??20);return yuvarla(eski*(1+(body.islem==='ZAM'?1:-1)*oran/100));};
    if(!products.length||products.length>2000) throw hata('Seçim 1-2000 ürün içermelidir.');
    return { hatalar:[], eklenen:0, guncellenen:products.length, satirlar:products.map(p=>({
        urunId:String(p._id),kod:p.kod,ad:p.ad,islem:'GUNCELLE',surum:p.updatedAt,
        eski:{[body.alan]:Number(p[body.alan]||0)},yeni:{[body.alan]:yeniFiyat(p)}
    })) };
}
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const auditValues = value => value && Object.fromEntries(Object.entries(value).map(([key,v])=>[key,['gorsel','ekGorseller'].includes(key)?{sha256:digest(v)}:v]));
function onayOlustur(tenantId, operation, body, plan) {
    if(!process.env.JWT_SECRET) throw hata('Önizleme imzalama anahtarı yapılandırılmamış.',503);
    const payload=Buffer.from(JSON.stringify({t:String(tenantId),o:operation,h:digest({body,plan}),exp:Date.now()+15*60000})).toString('base64url');
    return payload+'.'+crypto.createHmac('sha256',process.env.JWT_SECRET).update(payload).digest('base64url');
}
function onayDogrula(token, tenantId, operation, body, plan) {
    try {
        if(typeof token!=='string'||token.length>2000)throw Error();
        const [payload,sig]=token.split('.'),expected=crypto.createHmac('sha256',process.env.JWT_SECRET).update(payload).digest();
        const actual=Buffer.from(sig||'','base64url');
        if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))throw Error();
        const p=JSON.parse(Buffer.from(payload,'base64url'));
        if(p.t!==String(tenantId)||p.o!==operation||p.h!==digest({body,plan})||p.exp<Date.now())throw Error();
    } catch { throw hata('Önizleme değişti veya süresi doldu. Yeniden önizleyin.',409); }
}
async function planOku(tenantId, operation, body, session=null) {
    if(operation==='FIYAT') {
        const products=await Urun.find({tenantId,...filtre(body)}).sort({_id:1}).limit(2001).session(session).lean();
        if(body.ids?.length && !body.kategori && !body.marka && products.length!==new Set(body.ids).size) throw hata('Seçimde bulunamayan veya farklı firmaya ait ürün var.');
        return fiyatPlani(products,body);
    }
    const products=await Urun.find({tenantId}).sort({_id:1}).session(session).lean();
    const depots=await Depo.find({tenantId,aktif:true}).session(session).lean();
    const stocks=body.urunler?.some(x=>x?.stokMiktari!==undefined&&x.stokMiktari!=='')?await Stok.find({tenantId}).session(session).lean():[];
    return aktarimPlani(body.urunler,products,depots,stocks,body.kdvDahil===true);
}
async function calistir(req, operation) {
    const {onay,uygula,...body}=req.body||{};
    if(uygula!==true) {
        const plan=await planOku(req.tenantId,operation,body);
        return {basarili:true,...plan,onay:plan.hatalar.length?null:onayOlustur(req.tenantId,operation,body,plan),uygulandi:false};
    }
    let result;
    await mongoose.connection.transaction(async session=>{
        const plan=await planOku(req.tenantId,operation,body,session);
        if(plan.hatalar.length)throw hata('Dosyada hatalı satır var; hiçbir ürün değiştirilmedi.');
        onayDogrula(onay,req.tenantId,operation,body,plan);
        for(const row of plan.satirlar) {
            let product;
            if(row.urunId) {
                product=await Urun.findOne({_id:row.urunId,tenantId:req.tenantId}).session(session);
                if(!product)throw hata('Ürün değişti; yeniden önizleyin.',409);
                product.set(row.yeni); await product.save({session});
            } else { [product]=await Urun.create([{...row.yeni,tenantId:req.tenantId}],{session}); }
            if(row.stok) {
                const stock=row.stok, fark=stock.miktar-stock.onceki;
                await Stok.findOneAndUpdate({tenantId:req.tenantId,urunId:product._id,depoId:stock.depoId},{$set:{miktar:stock.miktar,maliyet:product.alisFiyati,sonHareketTarihi:new Date()}},{session,upsert:true,runValidators:true});
                if(fark)await Hareket.create([{tenantId:req.tenantId,urunId:product._id,depoId:stock.depoId,tip:fark>0?'SAYIM_ARTI':'SAYIM_EKSI',miktar:Math.abs(fark),birimMaliyet:product.alisFiyati,maliyetDogrulandi:product.alisFiyati>0,maliyetKaynagi:'URUN_EXCEL',kaynak:'URUN_EXCEL',aciklama:'Onaylı Excel stok aktarımı',kullaniciId:req.currentUser?._id}],{session});
            }
        }
        await Audit.create([{tenantId:req.tenantId,actorUserId:req.currentUser?._id,action:'PRODUCT_BULK_'+operation,resource:'Urun',details:{adet:plan.satirlar.length,degisiklikler:plan.satirlar.map(r=>({urunId:r.urunId,kod:r.kod,eski:auditValues(r.eski),yeni:auditValues(r.yeni),stok:r.stok}))}}],{session});
        result={basarili:true,uygulandi:true,eklenen:plan.eklenen,guncellenen:plan.guncellenen,atlanan:0,hatalar:[],mesaj:`${plan.eklenen} ürün eklendi, ${plan.guncellenen} ürün güncellendi. İşlem tek transaction içinde tamamlandı.`};
    });
    return result;
}
module.exports={temizle,aktarimPlani,filtre,fiyatPlani,onayOlustur,onayDogrula,calistir};
