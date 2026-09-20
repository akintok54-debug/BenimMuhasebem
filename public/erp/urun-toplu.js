(function(root){
    'use strict';
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const labels={kod:'Ürün Kodu',barkod:'Barkod',ad:'Ürün Adı',kategori:'Kategori',marka:'Marka',model:'Model',birim:'Birim',kdv:'KDV',alisFiyati:'Alış Fiyatı',satisFiyati:'Satış Fiyatı',bayiFiyati:'Bayi Fiyatı',perakendeFiyati:'Perakende Fiyatı',iskonto:'İskonto',paraBirimi:'Para Birimi',minimumStok:'Minimum Stok',kritikStok:'Kritik Stok',gorsel:'Görsel URL',notlar:'Notlar',aktif:'Aktif'};
    const numeric=new Set(['kdv','alisFiyati','satisFiyati','bayiFiyati','perakendeFiyati','iskonto','minimumStok','kritikStok','stokMiktari']);
    const norm=v=>String(v).toLocaleLowerCase('tr-TR').replaceAll('ı','i').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
    function number(v){
        if(typeof v==='number'&&Number.isFinite(v))return v;
        let s=String(v).trim();
        if(!/^-?\d+(?:[.,]\d+)*$/.test(s))throw Error('Geçersiz sayı: '+s.slice(0,40));
        if(s.includes(',')&&s.includes('.'))s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replaceAll('.','').replace(',','.'):s.replaceAll(',','');
        else s=s.replace(',','.');
        const n=Number(s);if(!Number.isFinite(n))throw Error('Geçersiz sayı.');return n;
    }
    function excel(products,empty=false){
        if(!root.XLSX)throw Error('Excel bileşeni yüklenemedi.');
        const fields=Object.keys(labels),rows=[fields.map(k=>labels[k]),...products.map(p=>fields.map(k=>k==='gorsel'&&String(p[k]||'').startsWith('data:')?'':typeof p[k]==='string'?p[k].slice(0,32767):p[k]??''))];
        const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'Ürünler');
        XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Fiyatlar KDV hariçtir. Mevcut ürün SKU veya barkod ile eşleşir.'],['Boş hücreler mevcut alanı değiştirmez. Sıfır fiyat için 0 yazın.'],['Gömülü görseller Excel hücre sınırı nedeniyle dışa aktarılmaz; içe yüklemede mevcut görsel korunur.'],['Stok aktarımı için Stok Miktarı ve Depo Kodu kolonlarını açıkça ekleyin.']]),'Bilgi');
        XLSX.writeFile(wb,empty?'urun-sablonu.xlsx':'erp-urunler.xlsx',{compression:true});
    }
    function table(plan){
        const value=obj=>Object.entries(obj||{}).map(([k,v])=>(labels[k]||k)+': '+String(v??'').slice(0,110)).join(' · ');
        return `<p>${plan.eklenen} eklenecek · ${plan.guncellenen} güncellenecek · ${plan.hatalar.length} hatalı</p><div role="alert">${plan.hatalar.map(x=>esc(x.satir+'. satır: '+x.mesaj)).join('<br>')}</div><div class="bulk-scroll"><table class="bulk-table"><thead><tr><th>İşlem</th><th>Ürün</th><th>Eski değer</th><th>Yeni değer</th></tr></thead><tbody>${plan.satirlar.map(r=>`<tr><td data-label="İşlem">${esc(r.islem)}</td><td data-label="Ürün">${esc(r.kod)} · ${esc(r.ad)}</td><td data-label="Eski">${esc(value(r.eski))}</td><td data-label="Yeni">${esc(value(r.yeni))}${r.stok?'<br>Stok: '+r.stok.onceki+' → '+r.stok.miktar:''}</td></tr>`).join('')}</tbody></table></div>`;
    }
    async function preview(host,api,path,body,onComplete){
        host.textContent='Önizleme hazırlanıyor…';
        try{
            const result=await api(path,{method:'POST',body:JSON.stringify(body)});
            host.innerHTML=table(result)+(result.onay?'<button type="button" class="erp-primary-button" data-apply>Önizlemeyi Onayla ve Uygula</button>':'<p>Hataları düzeltmeden işlem uygulanamaz.</p>');
            const btn=host.querySelector('[data-apply]');
            if(btn)btn.onclick=async()=>{
                if(!confirm('Gösterilen '+result.satirlar.length+' ürün için bu değişiklikleri onaylıyor musunuz?'))return;
                btn.disabled=true;
                try{const done=await api(path,{method:'POST',body:JSON.stringify({...body,onay:result.onay,uygula:true})});host.textContent=done.mesaj;if(onComplete)await onComplete();}
                catch(e){host.insertAdjacentHTML('afterbegin',`<p role="alert">${esc(e.message)} Yeniden önizleme hazırlayın.</p>`);}
            };
        }catch(e){host.textContent=e.message;}
    }
    function mountBulk(host,{api,products,onComplete,initial={}}){
        const options=(values)=>'<option value="">Tümü</option>'+[...new Set(values.filter(Boolean))].sort().map(x=>`<option>${esc(x)}</option>`).join('');
        host.innerHTML=`<section class="dashboard-panel"><h2>Toplu Fiyat / İskonto / KDV Güncelleme</h2><p>Kart fiyatları KDV hariçtir. KDV oranı değişikliği net fiyatı korur. KDV ekle/çıkar seçeneği kayıtlı tutarı dönüştürür; yalnız gösterimi değiştirmez. Filtreler birlikte uygulanır; seçilmeyen ürünler değişmez.</p><form class="bulk-form"><label>Kategori<select name="kategori">${options(products.map(x=>x.kategori))}</select></label><label>Marka<select name="marka">${options(products.map(x=>x.marka))}</select></label><label>Fiyat türü<select name="alan"><option value="satisFiyati">Satış</option><option value="bayiFiyati">Bayi</option><option value="perakendeFiyati">Perakende</option><option value="kdv">KDV oranı</option><option value="iskonto">Ürün iskontosu</option></select></label><label>İşlem<select name="islem"><option value="ZAM">Zam</option><option value="INDIRIM">İndirim</option><option value="KDV_EKLE">KDV ekle: hariç → dahil tutar</option><option value="KDV_CIKAR">KDV çıkar: dahil → hariç tutar</option></select></label><label>Yüzde / yeni KDV oranı<input name="oran" type="number" min="0" max="1000" step="0.01" required></label><details class="full"><summary>Belirli ürünleri seç</summary><input type="search" data-search placeholder="Ürün kodu veya adı"><div class="bulk-selection">${products.map(x=>`<label data-choice><input type="checkbox" name="ids" value="${esc(x._id)}"> ${esc(x.kod)} · ${esc(x.ad)}</label>`).join('')}</div></details><button class="erp-primary-button">Eski → Yeni Önizle</button></form><div data-preview aria-live="polite"></div></section>`;
        host.querySelector('[data-search]').oninput=e=>host.querySelectorAll('[data-choice]').forEach(l=>l.hidden=!norm(l.textContent).includes(norm(e.target.value)));
        const form=host.querySelector('form');form.onchange=()=>{host.querySelector('[data-preview]').replaceChildren();const fixed=['kdv','iskonto'].includes(form.alan.value),convert=!fixed&&['KDV_EKLE','KDV_CIKAR'].includes(form.islem.value);form.islem.disabled=fixed;form.oran.disabled=convert;form.oran.required=!convert;form.oran.max=fixed||form.islem.value==='INDIRIM'?'100':'1000';};
        for(const key of ['kategori','marka','alan','islem','oran'])if(initial[key]!==undefined)form.elements[key].value=initial[key];
        if(initial.ids)form.querySelectorAll('[name="ids"]').forEach(x=>x.checked=initial.ids.includes(x.value));form.onchange();
        form.onsubmit=e=>{e.preventDefault();const fd=new FormData(form);const body=Object.fromEntries(fd);body.ids=fd.getAll('ids');body.oran=Number(body.oran);preview(host.querySelector('[data-preview]'),api,'/api/tenant/urunler/toplu-fiyat',body,onComplete);};
    }
    function mountImport(host,{api,products,alias,extractImages,onComplete}){
        host.innerHTML='<section class="dashboard-panel"><h2>Excel ile Güvenli Ürün Güncelleme</h2><p>Trendyol ve IdeaSoft kolonlarını otomatik tanır. SKU/barkod eşleşmesi sunucuda doğrulanır; hatalı dosya uygulanmaz. Boş hücreler korunur.</p><div class="bulk-actions"><button data-export>Ürünleri Excel’e Aktar</button><button data-template>Boş Şablon</button></div><label>Excel / CSV dosyası<input data-file type="file" accept=".xlsx,.xls,.csv"></label><label><input type="checkbox" data-tax>Dosyadaki fiyatlar KDV dahil (önizlemede hariçe çevrilir)</label><div data-preview aria-live="polite"></div></section>';
        host.querySelector('[data-export]').onclick=()=>excel(products);
        host.querySelector('[data-template]').onclick=()=>excel([],true);
        const read=async()=>{const area=host.querySelector('[data-preview]');try{
            const file=host.querySelector('[data-file]').files[0];if(!file)return;
            if(file.size>10*1024*1024)throw Error('Dosya en fazla 10 MB olabilir.');
            if(!root.XLSX)throw Error('Excel bileşeni yüklenemedi.');
            const buffer=await file.arrayBuffer(),wb=XLSX.read(buffer,{type:'array'}),raw=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:'',raw:false});
            const images=extractImages?await extractImages(buffer,wb.SheetNames[0]):new Map();
            if(raw.length>2000)throw Error('En fazla 2000 satır yükleyin.');
            const rows=raw.map((row,i)=>{const obj={};for(const [header,val]of Object.entries(row)){
                if(val==='')continue;const key=Object.keys(labels).find(k=>norm(k)===norm(header)||norm(labels[k])===norm(header))||alias?.(header);
                if(!key)continue;if(Object.hasOwn(obj,key)){if(key==='gorsel'){(obj.ekGorseller ||= []).push(val);continue;}throw Error('Aynı alan için birden fazla kolon var: '+header);}
                try{obj[key]=numeric.has(key)?number(val):key==='aktif'&&['true','false'].includes(String(val).toLowerCase())?String(val).toLowerCase():val;}catch(e){throw Error((i+2)+'. satır: '+e.message);}
            }const embedded=images.get(row.__rowNum__)||[];if(!obj.gorsel&&embedded.length)obj.gorsel=embedded[0].url;if(embedded.length>1)obj.ekGorseller=embedded.slice(1,3).map(x=>x.url);return obj;});
            await preview(area,api,'/api/tenant/urunler/toplu-aktar',{urunler:rows,kdvDahil:host.querySelector('[data-tax]').checked},onComplete);
        }catch(e){area.textContent=e.message;}};
        host.querySelector('[data-file]').onchange=read;host.querySelector('[data-tax]').onchange=read;
    }
    root.ERPToplu={mountBulk,mountImport,excel};
})(window);
