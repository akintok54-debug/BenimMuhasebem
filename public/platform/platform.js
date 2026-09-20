(function () {
    "use strict";

    const content = document.getElementById("platformContent");
    const pageTitle = document.getElementById("pageTitle");
    const identity = document.getElementById("adminIdentity");
    let aktifBolum = "dashboard";
    let firmaFiltre = "", destekOturumu = null, sayfaIstek = null;
    const supportBanner = document.getElementById("supportBanner");

    const basliklar = {
        dashboard: "Genel Bakış",
        tenants: "Firma Yönetimi",
        users: "Kullanıcı Yönetimi",
        subscriptions: "Abonelik Yönetimi",
        errors: "Sistem Hataları",
        security: "Güvenlik Merkezi",
        audit: "Audit Log", integrations: "Entegrasyon Merkezi", health: "Sistem Sağlığı", support: "Güvenli Destek Modu"
    };

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, karakter => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[karakter]));
    }

    function etiket(value) {
        return ({ active:'Aktif', trial:'Deneme', suspended:'Askıda', cancelled:'İptal', expired:'Süresi doldu', past_due:'Gecikmiş', monthly:'Aylık', yearly:'Yıllık', unknown:'Bilinmiyor', paid:'Ödendi', unpaid:'Ödenmedi', CALISIYOR:'Çalışıyor', HATALI:'Hatalı', DOGRULANMADI:'Doğrulanmadı', YAPILANDIRILDI:'Yapılandırıldı', YAPILANDIRILMADI:'Yapılandırılmadı', KONTROL_GEREKLI:'Kontrol gerekli', ACIK_HATA_YOK:'Açık hata yok', KAYIT_VAR:'Kayıt var', BAGLI:'Bağlı', PASIF:'Pasif', CANLI_DOGRULAMA_YOK:'Canlı doğrulama yok' })[value] || value || '—';
    }
    function tarih(value) {
        if (!value) return "-";
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("tr-TR");
    }

    function durumSinifi(value) {
        const durum = String(value || "").toLowerCase();
        if (["active", "aktif", "success", "trial"].includes(durum)) return "green";
        if (["suspended", "passive", "cancelled", "expired", "false", "kritik"].includes(durum)) return "red";
        return "orange";
    }

    function csrfToken() {
        const cookie = document.cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('bm_platform_csrf='));
        return cookie ? decodeURIComponent(cookie.slice('bm_platform_csrf='.length)) : '';
    }

    async function api(url, options = {}) {
        const headers = { Accept: "application/json", "Content-Type": "application/json", ...(options.headers || {}) };
        if (options.method && !["GET", "HEAD"].includes(options.method.toUpperCase())) headers["X-CSRF-Token"] = csrfToken();
        const response = await fetch(url, { signal: options.method ? undefined : sayfaIstek?.signal, credentials: "same-origin", ...options, headers });
        const data = await response.json().catch(error => { if (error.name === "AbortError") throw error; return {}; });
        if (response.status === 401) {
            location.replace("/erp/login.html?next=platform");
            throw new Error("Platform oturumu gerekli.");
        }
        if (response.status === 403) {
            content.innerHTML = '<div class="card error-panel"><div class="card-title">Yetkisiz erişim</div><p>Bu alan yalnızca SUPER_ADMIN rolüne açıktır.</p></div>';
            throw new Error(data.mesaj || "Bu alan yalnızca SUPER_ADMIN rolüne açıktır.");
        }
        if (!response.ok || !data.basarili) throw new Error(data.mesaj || `API hatası: ${response.status}`);
        return data;
    }

    function yukleniyor() {
        content.innerHTML = '<div class="loading"><span></span>Platform verileri yükleniyor…</div>';
    }

    function hataGoster(error) {
        if (error.name === "AbortError" || content.querySelector(".error-panel")) return;
        content.innerHTML = `<div class="card error-panel"><div class="card-title">Veri alınamadı</div><p>${escapeHtml(error.message)}</p></div>`;
    }

    function tablo(basliklar, satirlar, bosMesaj) {
        if (!satirlar.length) return `<div class="empty">${escapeHtml(bosMesaj)}</div>`;
        return `<div class="table-wrap"><table class="data-table"><thead><tr>${basliklar.map(x => `<th>${escapeHtml(x)}</th>`).join("")}</tr></thead><tbody>${satirlar.map(row => { let column = 0; return row.replace(/<td>/g, () => `<td data-label="${escapeHtml(basliklar[column++] || "")}">`); }).join("")}</tbody></table></div>`;
    }

    function kart(label, value) { return '<div class="card"><div class="stat-label">'+escapeHtml(label)+'</div><div class="stat-value">'+escapeHtml(value ?? '—')+'</div></div>'; }
    function islem(action, id, title) { return '<button class="secondary-button" data-action="'+action+'" data-id="'+escapeHtml(id)+'">'+escapeHtml(title)+'</button>'; }
    function saglikHtml(data) {
        return '<div class="card"><div class="card-title">Servisler · '+tarih(data.checkedAt)+'</div>'+Object.entries(data.services).map(([name,x])=>'<div class="health-row"><span>'+escapeHtml(name)+'<small>'+escapeHtml(x.note || '')+'</small></span><span>'+escapeHtml(etiket(x.status))+(x.lastAt ? '<small>'+tarih(x.lastAt)+'</small>':'')+(x.openErrors != null ? '<small>Açık hata: '+x.openErrors+'</small>' : '')+'</span></div>').join('')+'</div>';
    }
    async function genelBakis() {
        const [data, durum, errors, health] = await Promise.all([api('/api/platform/dashboard'),api('/api/platform/durum'),api('/api/platform/sistem-hatalari?limit=1'),api('/api/platform/health')]);
        identity.textContent = durum.kullanici?.email || 'Platform yöneticisi';
        const d=data.dashboard,k=d.kiracilar,u=d.kullanicilar,a=d.abonelikler;
        content.innerHTML='<div class="stats">'+kart('Toplam firma',k.toplam)+kart('Aktif firma',k.aktif)+kart('Deneme firması',k.deneme)+kart('Askıya alınmış firma',k.askida)+kart('Toplam kullanıcı',u.toplam)+kart('Bugün giriş yapan kullanıcı',u.bugunAktif)+kart('Aktif abonelik',a.aktif)+kart('7 gün içinde bitecek abonelik',a.yaklasan)+kart('Son 24 saat sistem hatası',errors.son24SaatToplam)+'</div><div class="section-gap">'+saglikHtml(health)+'</div>';
    }
    async function firmalar() {
        const data=await api('/api/platform/tenants');
        const rows=data.tenants.map(x=>'<tr><td><strong>'+escapeHtml(x.name)+'</strong><small>'+escapeHtml(x._id)+'</small></td><td>'+escapeHtml(x.firmaBilgileri?.yetkili || '—')+'</td><td>'+escapeHtml(x.plan)+'</td><td>'+escapeHtml(etiket(x.status))+'</td><td>'+tarih(x.trialStartAt)+'<small>'+tarih(x.trialEndsAt)+'</small></td><td>'+escapeHtml(x.counts?.users ?? '—')+' / '+escapeHtml(x.counts?.subeler ?? '—')+' / '+escapeHtml(x.counts?.depolar ?? '—')+'<small>'+tarih(x.sonGiris)+'</small></td><td>'+islem('firma',x._id,'Yönet')+'</td></tr>');
        content.innerHTML='<div class="card"><div class="card-title">Firmalar · '+data.toplam+'</div>'+tablo(['Firma / tenantId','Yetkili','Paket','Durum','Trial başlangıç / bitiş','Kullanıcı / şube / depo · son giriş','İşlemler'],rows,'Firma bulunamadı.')+'</div>';
    }
    function kullaniciTablosu(users, tenantId) {
        return tablo(['Kullanıcı','Firma','Rol','Durum','MFA','Son giriş','İşlem'],users.map(x=>'<tr><td>'+escapeHtml(x.adSoyad)+'<small>'+escapeHtml(x.email)+'</small></td><td>'+escapeHtml(x.tenantId?.name || (tenantId ? 'Seçilen firma' : 'Platform'))+'</td><td>'+escapeHtml(x.rol)+'</td><td>'+(!x.aktif ? 'Pasif' : x.hesapDurumu === 'suspended' ? 'Askıda' : 'Aktif')+'</td><td>'+(x.ikiFaktor?.etkin?'Etkin':'Kapalı')+'</td><td>'+tarih(x.sonGirisTarihi)+'</td><td>'+((tenantId || x.tenantId?._id) && x.rol !== 'SUPER_ADMIN' ? '<button class="secondary-button" data-action="reset" data-id="'+escapeHtml(x._id)+'" data-tenant="'+escapeHtml(tenantId || x.tenantId._id)+'">Şifre sıfırla</button>' : '—')+'</td></tr>'),'Kullanıcı bulunamadı.');
    }
    async function kullanicilar() {
        const [data,tenants]=await Promise.all([api('/api/platform/users?limit=500'+(firmaFiltre?'&tenantId='+encodeURIComponent(firmaFiltre):'')),api('/api/platform/tenants')]);
        content.innerHTML='<div class="card"><div class="card-title">Kullanıcılar · '+data.toplam+' (en fazla 500)</div><label>Firma <select id="tenantFilter"><option value="">Tüm firmalar</option>'+tenants.tenants.map(x=>'<option value="'+escapeHtml(x._id)+'" '+(firmaFiltre===x._id?'selected':'')+'>'+escapeHtml(x.name)+'</option>').join('')+'</select></label>'+kullaniciTablosu(data.kullanicilar)+'<p class="muted">Gözlenen aktif oturumlar firma detayında listelenir. Son giriş, aktif oturum sayısı değildir.</p></div>';
        document.getElementById('tenantFilter').addEventListener('change',e=>{firmaFiltre=e.target.value;bolumAc('users');});
    }
    async function abonelikler() {
        const data=await api('/api/platform/subscriptions');
        const rows=data.subscriptions.map(x=>'<tr><td>'+escapeHtml(x.tenantId?.name || 'Silinmiş firma')+'</td><td>'+escapeHtml(x.planId?.name || '—')+'<small>'+escapeHtml(x.period || 'Belirtilmemiş')+'</small></td><td>'+escapeHtml(etiket(x.status))+'<small>Ödeme: '+escapeHtml(x.paymentStatus || 'Bilinmiyor')+'</small></td><td>'+tarih(x.startedAt)+'<small>'+tarih(x.status==='trial'?x.trialEndsAt:x.expiresAt)+'</small></td><td>'+escapeHtml(x.planId?.limits?.users ?? '—')+' / '+escapeHtml(x.planId?.limits?.branches ?? 'Tanımlı değil')+' / '+escapeHtml(x.planId?.limits?.warehouses ?? 'Tanımlı değil')+'<small>'+escapeHtml((x.planId?.modules || []).join(', '))+'</small></td><td>'+(x.tenantId?._id?islem('firma',x.tenantId._id,'Paketi / süreyi yönet'):'—')+'</td></tr>');
        content.innerHTML='<div class="card"><div class="card-title">Abonelikler</div>'+tablo(['Firma','Paket / dönem','Abonelik / ödeme','Başlangıç / bitiş','Kullanıcı / şube / depo limiti ve izinler','İşlem'],rows,'Abonelik bulunamadı.')+'</div>';
    }
    async function sistemHatalari() {
        const data=await api('/api/platform/sistem-hatalari?limit=200');
        const rows=data.hatalar.map(x=>'<tr><td>'+tarih(x.createdAt)+'</td><td>'+escapeHtml(x.tenantId?.name || 'Platform')+'<small>'+escapeHtml(x.actorUserId?.email || 'Sistem')+'</small></td><td>'+escapeHtml(x.action)+'<small>'+escapeHtml(x.resource)+' / '+escapeHtml(x.path)+'</small><details><summary>Kod / konum ayrıntısı</summary><pre>'+escapeHtml(JSON.stringify(x.details || {},null,2))+'</pre></details></td><td>'+escapeHtml(x.httpStatus ?? '—')+'<small>'+escapeHtml(x.requestId || '—')+'</small></td><td>'+escapeHtml(x.repeatCount)+' / son 24 saat</td><td>'+(x.resolution?.resolved?'Çözüldü':'Çözülmedi')+'<small>'+escapeHtml(x.resolution?.note || '')+'</small>'+islem(x.resolution?.resolved?'reopen':'resolve',x._id,x.resolution?.resolved?'Tekrar aç':'Çözüldü işaretle')+'</td></tr>');
        content.innerHTML='<div class="card"><div class="card-title">Hata Merkezi · Son 24 saat: '+data.son24SaatToplam+'</div>'+tablo(['Tarih','Firma / kullanıcı','Modül / endpoint','Kod / requestId','Tekrar','Çözüm'],rows,'Sistem hatası bulunamadı.')+'</div>';
    }

    async function guvenlik() {
        const data = await api("/api/platform/guvenlik-merkezi");
        const ozet = Object.fromEntries((data.ozet || []).map(x => [x._id, x]));
        const kart = (ad, kod) => `<div class="card"><div class="stat-label">${ad}</div><div class="stat-value">${escapeHtml(ozet[kod]?.toplam || 0)}</div><div class="stat-note">Başarısız: ${escapeHtml(ozet[kod]?.basarisiz || 0)}</div></div>`;
        const rows = (data.olaylar || []).map(x => `<tr><td>${tarih(x.createdAt)}</td><td>${escapeHtml(x.category)}</td><td>${escapeHtml(x.action)}</td><td>${escapeHtml(x.ip || "-")}</td><td><span class="badge ${x.success ? "green" : "red"}">${x.success ? "Başarılı" : "Başarısız"}</span></td></tr>`);
        content.innerHTML = `<div class="stats">${kart("Giriş Olayları", "GIRIS")}${kart("Şüpheli Giriş", "SUPHELI_GIRIS")}${kart("Yetkisiz Erişim", "YETKISIZ_ERISIM")}${kart("Kritik Hata", "API_HATASI")}</div><div class="card" style="margin-top:16px"><div class="card-title">Güvenlik Olayları</div>${tablo(["Tarih", "Kategori", "İşlem", "IP", "Sonuç"], rows, "Güvenlik olayı yok.")}</div>`;
    }

    async function audit() {
        const data=await api('/api/platform/audit-kayitlari?limit=200'+(firmaFiltre?'&tenantId='+encodeURIComponent(firmaFiltre):''));
        const rows=data.kayitlar.map(x=>'<tr><td>'+tarih(x.createdAt)+'</td><td>'+escapeHtml(x.actorUserId?.email || 'Sistem')+'<small>'+escapeHtml(x.tenantId?.name || 'Platform')+'</small></td><td>'+escapeHtml(x.action)+'<details><summary>Eski / yeni değer</summary><pre>'+escapeHtml(JSON.stringify(x.details,null,2))+'</pre></details></td><td>'+escapeHtml(x.ip || '—')+'<small>'+escapeHtml(x.requestId || '—')+'</small></td></tr>');
        content.innerHTML='<div class="card"><div class="card-title">Değiştirilemez Audit Log · Son 200 kayıt</div>'+(firmaFiltre?islem('audit-clear','','Tüm firmalar'):'')+tablo(['Tarih / saat','Kim / firma','İşlem ve değerler','IP / requestId'],rows,'Audit kaydı bulunamadı.')+'</div>';
    }
    async function health() { const data=await api('/api/platform/health'); content.innerHTML=saglikHtml(data)+'<div class="card section-gap"><div class="card-title">Son kritik hata</div>'+escapeHtml(data.lastCritical?.action || 'Kayıt bulunamadı')+' · '+tarih(data.lastCritical?.createdAt)+'</div>'; }
    async function integrations() {
        const [data, tenants]=await Promise.all([api('/api/platform/integrations'+(firmaFiltre?'?tenantId='+encodeURIComponent(firmaFiltre):'')),api('/api/platform/tenants')]);
        content.innerHTML='<div class="card"><div class="card-title">Entegrasyon Merkezi</div><label>Firma <select id="integrationTenant"><option value="">Tüm firmalar</option>'+tenants.tenants.map(x=>'<option value="'+escapeHtml(x._id)+'" '+(firmaFiltre===x._id?'selected':'')+'>'+escapeHtml(x.name)+'</option>').join('')+'</select></label>'+tablo(['Firma / mağaza','Sağlayıcı','Durum','Son senkronizasyon','Son hata','Bekleyen / eşleşmeyen','Token'],data.items.map(x=>'<tr><td>'+escapeHtml(x.tenantId?.name)+'<small>'+escapeHtml(x.storeName)+'</small></td><td>'+escapeHtml(x.provider)+'<small>'+escapeHtml(x.type)+'</small></td><td>'+escapeHtml(etiket(x.status))+'</td><td>'+tarih(x.lastSuccessfulSyncAt)+'</td><td>'+escapeHtml(x.lastError?.errorCode || '—')+'<small>'+tarih(x.lastError?.lastAttemptAt)+'</small></td><td>'+x.pending+' / '+x.unmatched+'</td><td>'+escapeHtml(etiket(x.tokenStatus))+'</td></tr>'),'Entegrasyon yapılandırılmamış.')+'<p class="muted">'+escapeHtml(data.note)+'</p>'+islem('health','','Mail / Cron sağlık durumunu aç')+'</div>';
        document.getElementById('integrationTenant').addEventListener('change',e=>{firmaFiltre=e.target.value;bolumAc('integrations');});
    }
    async function firmaAc(id) {
        sayfaIstek?.abort(); sayfaIstek = new AbortController();
        const [d,p]=await Promise.all([api('/api/platform/tenants/'+id+'/overview'),api('/api/platform/plans')]);
        const t=d.tenant, sub=d.subscription;
        content.innerHTML='<div class="card"><div class="card-title">'+escapeHtml(t.name)+'</div><p>'+escapeHtml(t._id)+' · '+escapeHtml(t.firmaBilgileri?.yetkili || 'Yetkili belirtilmemiş')+'</p><div class="stats">'+kart('Kullanıcı',d.counts.users)+kart('Depo',d.counts.depolar)+kart('Depolarda kayıtlı farklı şube',d.counts.subeler)+kart('Durum',etiket(t.status))+'</div><p>Son giriş: '+tarih(d.sonGiris)+'</p><div class="actions">'+islem('firma-audit',id,'Audit kayıtları')+islem('firma-integrations',id,'Entegrasyonlar')+islem('support-start',id,'Firmaya destek olarak geç')+'</div><h2>Abonelik / paket</h2><form id="subscriptionForm" class="platform-form"><label>Paket<select name="planId" required>'+p.plans.filter(x=>x.aktif).map(x=>'<option value="'+escapeHtml(x._id)+'" '+(String(sub?.planId?._id)===String(x._id)?'selected':'')+'>'+escapeHtml(x.name)+'</option>').join('')+'</select></label><label>Durum<select name="status">'+['trial','active','suspended','cancelled','expired'].map(x=>'<option value="'+x+'" '+(x===t.status?'selected':'')+'>'+etiket(x)+'</option>').join('')+'</select></label><label>Dönem<select name="period"><option value="monthly">Aylık</option><option value="yearly" '+(sub?.period==='yearly'?'selected':'')+'>Yıllık</option></select></label><label>Ödeme durumu<select name="paymentStatus">'+['unknown','paid','unpaid','past_due'].map(x=>'<option value="'+x+'" '+(x===sub?.paymentStatus?'selected':'')+'>'+etiket(x)+'</option>').join('')+'</select></label><label>Eklenecek gün<input type="number" name="days" min="0" max="3660" value="0" required></label><p>Başlangıç: '+tarih(sub?.startedAt)+' · Bitiş: '+tarih(sub?.status==='trial'?sub?.trialEndsAt:sub?.expiresAt)+'</p><label class="full"><input type="checkbox" name="confirmed" required> Bu firmanın paket, erişim ve süre değişikliğini onaylıyorum.</label><button class="secondary-button" type="submit">Değişiklikleri kaydet</button><p id="formMessage" role="status"></p></form><h2>Firma kullanıcıları</h2>'+kullaniciTablosu(d.users,id)+'<h2>Gözlenen aktif oturumlar</h2>'+tablo(['Kullanıcı','Son istek','Bitiş','IP / cihaz'],d.oturumlar.sessions.map(x=>'<tr><td>'+escapeHtml(d.users.find(u=>u._id===x.userId)?.email || x.userId)+'</td><td>'+tarih(x.lastSeenAt)+'</td><td>'+tarih(x.expiresAt)+'</td><td>'+escapeHtml(x.ip)+'<small>'+escapeHtml(x.userAgent)+'</small></td></tr>'),'Gözlenen aktif oturum yok.')+'<p class="muted">'+escapeHtml(d.oturumlar.mesaj)+'</p></div>';
        document.getElementById('subscriptionForm').addEventListener('submit',async e=>{
            e.preventDefault();const form=e.currentTarget, f=new FormData(form),button=form.querySelector('button');button.disabled=true;
            try { await api('/api/platform/tenants/'+id+'/subscription',{method:'PATCH',body:JSON.stringify({planId:f.get('planId'),status:f.get('status'),period:f.get('period'),paymentStatus:f.get('paymentStatus'),days:Number(f.get('days')),onay:'ONAYLIYORUM'})});if(document.getElementById("subscriptionForm")===form)await firmaAc(id); }
            catch(error){document.getElementById('formMessage').textContent=error.message;}finally{button.disabled=false;}
        });
    }
    async function support() {
        if (!destekOturumu) { content.innerHTML='<div class="card"><div class="card-title">Güvenli Destek Modu</div><p>Firmalar → Yönet → Firmaya destek olarak geç yoluyla gerekçeli, 30 dakikalık okuma erişimi açın. SUPER_ADMIN rolünüz korunur. Görüntülemeler audit kaydına yazılır.</p>'+islem('tenants','','Firma seç')+'</div>';return; }
        const d=await api('/api/platform/support/'+destekOturumu._id);
        content.innerHTML='<div class="card"><div class="card-title">Destek Modu · '+escapeHtml(d.tenant.name)+'</div><p>Salt okunur erişim · Bitiş: '+tarih(d.support.expiresAt)+'</p><p>'+escapeHtml(d.support.reason)+'</p><div class="stats">'+kart('Kullanıcı',d.counts.users)+kart('Depo',d.counts.depolar)+kart('Şube',d.counts.subeler)+'</div>'+tablo(['Kullanıcı','Rol','Son giriş'],d.users.map(x=>'<tr><td>'+escapeHtml(x.adSoyad)+'</td><td>'+escapeHtml(x.rol)+'</td><td>'+tarih(x.sonGirisTarihi)+'</td></tr>'),'Kullanıcı yok.')+'</div>';
    }
    function destekKapat() { destekOturumu=null;sessionStorage.removeItem('platformSupportId');supportBanner.hidden=true;bolumAc('dashboard'); }
    function destekBanner() { supportBanner.hidden=false;supportBanner.innerHTML='<strong>Destek Modu · salt okunur · SUPER_ADMIN</strong> · '+tarih(destekOturumu.expiresAt)+' '+islem('support-end','','Destek modunu kapat'); }
    setInterval(()=>{if(destekOturumu && Date.now()>=new Date(destekOturumu.expiresAt).getTime())destekKapat();},1000);
    document.addEventListener('click',async e=>{
        const button=e.target.closest('[data-action]');if(!button)return;const action=button.dataset.action,id=button.dataset.id;button.disabled=true;
        try {
            if(action==='firma')await firmaAc(id);
            else if(action==='firma-audit'){firmaFiltre=id;await bolumAc('audit');}
            else if(action==='firma-integrations'){firmaFiltre=id;await bolumAc('integrations');}
            else if(action==='audit-clear'){firmaFiltre='';await bolumAc('audit');}
            else if(['health','tenants'].includes(action))await bolumAc(action);
            else if(action==='reset') { if(!confirm('Seçilen kullanıcıya şifre yenileme e-postası gönderilsin mi?'))return;const d=await api('/api/platform/tenants/'+button.dataset.tenant+'/users/'+id+'/password-reset',{method:'POST',body:JSON.stringify({onay:'ONAYLIYORUM'})});alert(d.mesaj); }
            else if(action==='resolve'||action==='reopen'){const note=prompt('Çözüm / yeniden açma açıklaması (en az 5 karakter):');if(!note)return;await api('/api/platform/errors/'+id+'/resolution',{method:'PATCH',body:JSON.stringify({onay:'ONAYLIYORUM',resolved:action==='resolve',note})});await bolumAc('errors');}
            else if(action==='support-start'){const reason=prompt('30 dakikalık salt okunur destek erişimi için gerekçe (en az 10 karakter):');if(!reason)return;if(destekOturumu)await api('/api/platform/support/'+destekOturumu._id+'/close',{method:'POST',body:JSON.stringify({onay:'ONAYLIYORUM'})});const d=await api('/api/platform/support',{method:'POST',body:JSON.stringify({tenantId:id,reason,onay:'ONAYLIYORUM'})});destekOturumu=d.support;sessionStorage.setItem('platformSupportId',destekOturumu._id);destekBanner();await bolumAc('support');}
            else if(action==='support-end'){await api('/api/platform/support/'+destekOturumu._id+'/close',{method:'POST',body:JSON.stringify({onay:'ONAYLIYORUM'})});destekKapat();}
        }catch(error){if(error.name!=='AbortError')alert(error.message);}finally{button.disabled=false;}
    });

    const yukleyiciler = { dashboard: genelBakis, tenants: firmalar, users: kullanicilar, subscriptions: abonelikler, errors: sistemHatalari, security: guvenlik, audit, health, integrations, support };

    async function bolumAc(bolum) {
        sayfaIstek?.abort(); sayfaIstek = new AbortController();
        aktifBolum = yukleyiciler[bolum] ? bolum : "dashboard";
        pageTitle.textContent = basliklar[aktifBolum];
        document.querySelectorAll(".nav-item").forEach(x => x.classList.toggle("active", x.dataset.section === aktifBolum));
        yukleniyor();
        try { await yukleyiciler[aktifBolum](); } catch (error) { hataGoster(error); }
    }

    document.querySelectorAll(".nav-item").forEach(x => x.addEventListener("click", () => bolumAc(x.dataset.section)));
    document.getElementById("refreshButton").addEventListener("click", () => bolumAc(aktifBolum));
    document.getElementById("logoutButton").addEventListener("click", async () => {
        if (destekOturumu) { try { await api("/api/platform/support/"+destekOturumu._id+"/close", { method:"POST", body:JSON.stringify({ onay:"ONAYLIYORUM" }) }); } catch (_) {} }
        sessionStorage.removeItem("platformSupportId");
        try { await api("/api/auth/platform/logout", { method: "POST" }); } catch (_) { /* Oturum zaten kapanmış olabilir. */ }
        sessionStorage.removeItem("bmPlatformCsrfToken");
        location.replace("/erp/login.html?next=platform");
    });

    (async()=>{const id=sessionStorage.getItem('platformSupportId');if(id){try{const d=await api('/api/platform/support/'+encodeURIComponent(id));destekOturumu=d.support;destekBanner();}catch(_){sessionStorage.removeItem('platformSupportId');}}await bolumAc(destekOturumu?'support':'dashboard');})();
})();
