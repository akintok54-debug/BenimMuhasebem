(function () {
    "use strict";
    const button = document.getElementById("notificationButton"), panel = document.getElementById("notificationPanel"), alert = document.getElementById("notificationAlert");
    if (!button || !panel || !alert) return;
    let stopped = false, busy = false, previous = "";
    const text = x => String(x ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
    const date = x => x ? new Date(x).toLocaleString("tr-TR") : "Kayıt yok";
    function openSection(section) {
        panel.hidden = true; button.setAttribute("aria-expanded", "false");
        document.querySelector('[data-section="' + section + '"]')?.click();
    }
    button.addEventListener("click", () => { panel.hidden = !panel.hidden; button.setAttribute("aria-expanded", String(!panel.hidden)); alert.hidden = true; });
    panel.addEventListener("click", e => { const target = e.target.closest("[data-notification-section]"); if (target) openSection(target.dataset.notificationSection); });
    document.getElementById("logoutButton")?.addEventListener("click", () => { stopped = true; }, true);
    async function poll() {
        if (stopped || busy || document.hidden) return;
        busy = true;
        try {
            const response = await fetch("/api/platform/notifications", { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(15000) });
            if ([401,403].includes(response.status)) { stopped = true; button.textContent = "Uyarılar: oturum gerekli"; return; }
            if (!response.ok) throw new Error("unavailable");
            const d = await response.json(); if (!d.basarili) throw new Error("unavailable");
            const c = d.counts, total = c.errors + c.integrations + c.accounts + c.disabledUsers + c.services;
            button.textContent = "Uyarılar " + total;
            const summary = `${c.errors} açık hata · ${c.integrations} entegrasyon sorunu · ${c.accounts} askıda/süresi dolmuş firma · ${c.disabledUsers} pasif kullanıcı · ${c.services} servis uyarısı`;
            const signature = JSON.stringify([c, d.latest[0]?._id, d.integrations[0]?._id, d.integrations[0]?.lastAttemptAt]);
            if (total && signature !== previous) { alert.textContent = "Kontrol gerektiren kayıtlar var: " + summary + ". Ayrıntılar için Uyarılar düğmesini açın."; alert.hidden = false; }
            if (!total) alert.hidden = true;
            previous = signature;
            panel.innerHTML = '<h2>Sistem uyarıları</h2><p>'+text(summary)+'</p><p>Son kontrol: '+text(date(d.checkedAt))+' · Panel açıkken 30 saniyede bir yenilenir.</p>'+
                '<div class="actions"><button class="secondary-button" data-notification-section="errors">Hata Merkezi</button><button class="secondary-button" data-notification-section="integrations">Entegrasyonlar</button><button class="secondary-button" data-notification-section="tenants">Firmalar</button><button class="secondary-button" data-notification-section="users">Kullanıcılar</button><button class="secondary-button" data-notification-section="health">Sistem Sağlığı</button></div>'+
                '<h3>Son açık hatalar (son 30 gün)</h3>'+ (d.latest.map(x=>'<p><strong>'+text(x.action)+'</strong> · '+text(date(x.createdAt))+'<br>Firma: '+text(x.tenantId?.name || x.tenantId || 'Platform')+' · Kullanıcı: '+text(x.actorUserId?.email || x.actorUserId || 'Sistem')+'<br>'+text(x.path)+' · requestId: '+text(x.requestId)+'</p>').join('') || '<p>Açık hata kaydı yok.</p>')+
                '<h3>Entegrasyon sorunları</h3>'+(d.integrations.map(x=>'<p>'+text(x.tenantId?.name || x.tenantId)+' · '+text(x.provider)+' · '+text(x.operation)+' · '+text(x.errorCode)+'</p>').join('') || '<p>Açık entegrasyon hatası yok.</p>')+
                '<h3>Servis uyarıları</h3>'+d.services.map(x=>'<p>'+text(x.message)+' Son kayıt: '+text(date(x.lastAt))+'</p>').join('')+
                '<p class="muted">Pasif kullanıcı veya süresi dolan firma tek başına kod hatası değildir. Harici alarm kanalı: '+(d.delivery.webhookConfigured?'Yapılandırılmış; teslimat ayrıca doğrulanmalı.':'Yapılandırılmamış. Panel uyarıları çalışır.')+'</p>';
        } catch (_) { button.textContent = "Uyarılar: bağlantı kontrol edilmeli"; alert.textContent = "Uyarı servisine erişilemiyor. Sonuçlar güncel olmayabilir."; alert.hidden = false; }
        finally { busy = false; }
    }
    setInterval(poll, 30000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
    poll();
})();
