(function(root){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const date=v=>{const d=new Date(v);return Number.isFinite(+d)?new Date(+d-d.getTimezoneOffset()*60000).toISOString().slice(0,16):'';};
 async function mount(host,{api,products}){
  host.textContent='İçerikler yükleniyor…';
  try{
   const d=await api('/api/tenant/b2b/contents');
   host.innerHTML='<section class="dashboard-panel"><h2>Bayi Kampanya ve Reklam Yönetimi</h2><p>Başlangıç dahil, bitiş hariç tarih aralığında yayınlanır. Uygun kampanyalardan en avantajlı fiyat uygulanır; indirimler üst üste eklenmez.</p><button data-new>Yeni içerik</button><div data-list></div><div data-editor></div></section>';
   host.querySelector('[data-list]').innerHTML=d.icerikler.map(c=>'<div class="bulk-actions"><strong>'+esc(c.baslik)+'</strong><span>'+esc(c.tur)+' · '+(c.aktif?'Aktif':'Pasif')+' · '+new Date(c.bitis).toLocaleString('tr-TR')+'</span><button data-edit="'+esc(c._id)+'">Düzenle / yayını durdur</button></div>').join('');
   const editor=c=>{
    const options=(rows,ids=[])=>rows.map(x=>'<option value="'+esc(x._id)+'" '+(ids.map(String).includes(String(x._id))?'selected':'')+'>'+esc(x.kod)+' · '+esc(x.ad||x.unvan||x.adSoyad)+'</option>').join('');
    const target=host.querySelector('[data-editor]');
    target.innerHTML=`<form class="bulk-form"><label>Tür<select name="tur">${['YENI','INDIRIMLI','KAMPANYA','REKLAM'].map(t=>`<option ${c.tur===t?'selected':''}>${t}</option>`).join('')}</select></label><label>Başlık<input name="baslik" maxlength="150" required value="${esc(c.baslik)}"></label><label>Başlangıç<input name="baslangic" type="datetime-local" required value="${date(c.baslangic)}"></label><label>Bitiş<input name="bitis" type="datetime-local" required value="${date(c.bitis)}"></label><label><input name="aktif" type="checkbox" ${c.aktif?'checked':''}>Yayında</label><label>İndirim %<input name="indirimOrani" type="number" min="0" max="100" step="0.01" value="${c.indirimOrani||0}"></label><label>Fiyat türleri<select name="fiyatTurleri" multiple required>${['SATIS','BAYI','PERAKENDE'].map(t=>`<option ${(c.fiyatTurleri||['BAYI']).includes(t)?'selected':''}>${t}</option>`).join('')}</select></label><label>Ürünler (boş: tümü)<select name="urunIds" multiple>${options(products,c.urunIds)}</select></label><label>Müşteriler (boş: tümü)<select name="musteriIds" multiple>${options(d.musteriler,c.musteriIds)}</select></label><label>Kategori<input name="kategori" value="${esc(c.kategori)}"></label><label>Marka<input name="marka" value="${esc(c.marka)}"></label><label>Tedarikçi (reklamda zorunlu)<select name="tedarikciId"><option value="">Seçin</option>${options(d.tedarikciler,c.tedarikciId?[c.tedarikciId]:[])}</select></label><label>Görsel HTTPS adresi<input name="gorsel" value="${esc(c.gorsel)}"></label><label>Hedef ürün / kategori / site adresi<input name="hedef" placeholder="https://… veya /b2b/…" value="${esc(c.hedef)}"></label><button class="erp-primary-button">Kaydet</button><p data-result role="status"></p></form>`;
    target.querySelector('form').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,fd=new FormData(form),body=Object.fromEntries(fd),button=form.querySelector('button');for(const key of ['urunIds','musteriIds','fiyatTurleri'])body[key]=fd.getAll(key);body.aktif=form.aktif.checked;body.indirimOrani=Number(body.indirimOrani);body.baslangic=new Date(body.baslangic).toISOString();body.bitis=new Date(body.bitis).toISOString();button.disabled=true;try{await api('/api/tenant/b2b/contents'+(c._id?'/'+c._id:''),{method:c._id?'PATCH':'POST',body:JSON.stringify(body)});await mount(host,{api,products});}catch(err){target.querySelector('[data-result]').textContent=err.message;button.disabled=false;}};
   };
   host.querySelector('[data-new]').onclick=()=>editor({aktif:false,baslangic:new Date(),bitis:new Date(Date.now()+7*86400000)});
   host.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editor(d.icerikler.find(c=>String(c._id)===b.dataset.edit)));
  }catch(e){host.textContent=e.message;}
 }
 root.BayiIcerik={mount};
})(window);
