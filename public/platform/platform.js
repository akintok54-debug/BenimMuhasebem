(function () {
    "use strict";

    const content = document.getElementById("platformContent");
    const pageTitle = document.getElementById("pageTitle");
    const identity = document.getElementById("adminIdentity");
    let aktifBolum = "dashboard";

    const basliklar = {
        dashboard: "Genel Bakış",
        tenants: "Firma Yönetimi",
        users: "Kullanıcı Yönetimi",
        subscriptions: "Abonelik Yönetimi",
        errors: "Sistem Hataları",
        security: "Güvenlik Merkezi",
        audit: "Audit Log"
    };

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, karakter => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[karakter]));
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
        const session = sessionStorage.getItem("bmCsrfToken");
        if (session) return session;
        const cookie = document.cookie.split(";").map(x => x.trim()).find(x => x.startsWith("bm_csrf="));
        return cookie ? decodeURIComponent(cookie.slice("bm_csrf=".length)) : "";
    }

    async function api(url, options = {}) {
        const headers = { Accept: "application/json", ...(options.headers || {}) };
        if (options.method && !["GET", "HEAD"].includes(options.method.toUpperCase())) headers["X-CSRF-Token"] = csrfToken();
        const response = await fetch(url, { credentials: "same-origin", ...options, headers });
        const data = await response.json().catch(() => ({}));
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
        if (content.querySelector(".error-panel")) return;
        content.innerHTML = `<div class="card error-panel"><div class="card-title">Veri alınamadı</div><p>${escapeHtml(error.message)}</p></div>`;
    }

    function tablo(basliklar, satirlar, bosMesaj) {
        if (!satirlar.length) return `<div class="empty">${escapeHtml(bosMesaj)}</div>`;
        return `<div class="table-wrap"><table class="data-table"><thead><tr>${basliklar.map(x => `<th>${escapeHtml(x)}</th>`).join("")}</tr></thead><tbody>${satirlar.join("")}</tbody></table></div>`;
    }

    async function genelBakis() {
        const [dashboard, durum, errors] = await Promise.all([
            api("/api/platform/dashboard"),
            api("/api/platform/durum"),
            api("/api/platform/sistem-hatalari?limit=5")
        ]);
        identity.textContent = durum.kullanici?.email || "Platform yöneticisi";
        const k = dashboard.dashboard?.kiracilar || {};
        const u = dashboard.dashboard?.kullanicilar || {};
        content.innerHTML = `
            <div class="stats">
                <div class="card"><div class="stat-label">Toplam Firma</div><div class="stat-value">${escapeHtml(k.toplam || 0)}</div><div class="stat-note">Platform kapsamı</div></div>
                <div class="card"><div class="stat-label">Aktif Firma</div><div class="stat-value">${escapeHtml(k.aktif || 0)}</div><div class="stat-note">Aktif abonelik</div></div>
                <div class="card"><div class="stat-label">Deneme Firması</div><div class="stat-value">${escapeHtml(k.deneme || 0)}</div><div class="stat-note">30 günlük deneme</div></div>
                <div class="card"><div class="stat-label">Kullanıcı</div><div class="stat-value">${escapeHtml(u.toplam || 0)}</div><div class="stat-note">Tüm roller</div></div>
            </div>
            <div class="grid-two">
                <div class="card"><div class="card-title">Platform Sağlığı</div><div class="health-list">
                    <div class="health-row"><span>API</span><span class="ok">ÇALIŞIYOR</span></div>
                    <div class="health-row"><span>Rol koruması</span><span class="ok">SUPER_ADMIN</span></div>
                    <div class="health-row"><span>Tenant izolasyonu</span><span class="ok">AKTİF</span></div>
                    <div class="health-row"><span>Audit sistemi</span><span class="ok">AKTİF</span></div>
                </div></div>
                <div class="card"><div class="card-title">Son 24 Saat</div><div class="stat-value">${escapeHtml(errors.son24SaatToplam || 0)}</div><div class="stat-label">Kaydedilen sistem hatası</div></div>
            </div>`;
    }

    async function firmalar() {
        const data = await api("/api/platform/tenants");
        const rows = (data.tenants || []).map(x => `<tr><td><strong>${escapeHtml(x.name)}</strong><small>${escapeHtml(x.slug)}</small></td><td>${escapeHtml(x.firmaBilgileri?.yetkili || "-")}</td><td>${escapeHtml(x.plan || "-")}</td><td><span class="badge ${durumSinifi(x.status)}">${escapeHtml(x.status)}</span></td><td>${tarih(x.createdAt)}</td></tr>`);
        content.innerHTML = `<div class="card"><div class="card-title">Firmalar · ${escapeHtml(data.toplam || 0)}</div>${tablo(["Firma", "Yetkili", "Plan", "Durum", "Kayıt"], rows, "Firma bulunamadı.")}</div>`;
    }

    async function kullanicilar() {
        const data = await api("/api/platform/users?limit=300");
        const rows = (data.kullanicilar || []).map(x => `<tr><td><strong>${escapeHtml(x.adSoyad)}</strong><small>${escapeHtml(x.email)}</small></td><td><span class="badge">${escapeHtml(x.rol)}</span></td><td>${escapeHtml(x.tenantId?.name || "Platform")}</td><td><span class="badge ${x.aktif ? "green" : "red"}">${x.aktif ? "Aktif" : "Pasif"}</span></td><td>${tarih(x.sonGirisTarihi)}</td></tr>`);
        content.innerHTML = `<div class="card"><div class="card-title">Kullanıcılar · ${escapeHtml(data.toplam || 0)}</div>${tablo(["Kullanıcı", "Rol", "Firma", "Durum", "Son Giriş"], rows, "Kullanıcı bulunamadı.")}</div>`;
    }

    async function abonelikler() {
        const data = await api("/api/platform/subscriptions");
        const rows = (data.subscriptions || []).map(x => `<tr><td><strong>${escapeHtml(x.tenantId?.name || "-")}</strong><small>${escapeHtml(x.tenantId?.slug || "")}</small></td><td>${escapeHtml(x.planId?.name || x.planId?.code || "-")}</td><td><span class="badge ${durumSinifi(x.status)}">${escapeHtml(x.status)}</span></td><td>${tarih(x.trialEndsAt || x.expiresAt)}</td><td>${escapeHtml(x.usage?.users || 0)} kullanıcı</td></tr>`);
        content.innerHTML = `<div class="card"><div class="card-title">Abonelikler · ${escapeHtml(data.toplam || 0)}</div>${tablo(["Firma", "Plan", "Durum", "Bitiş", "Kullanım"], rows, "Abonelik bulunamadı.")}</div>`;
    }

    async function sistemHatalari() {
        const data = await api("/api/platform/sistem-hatalari?limit=150");
        const rows = (data.hatalar || []).map(x => `<tr><td>${tarih(x.createdAt)}</td><td><strong>${escapeHtml(x.action)}</strong><small>${escapeHtml(x.path || x.resource || "-")}</small></td><td><span class="badge red">${escapeHtml(x.httpStatus || 500)}</span></td><td>${escapeHtml(x.tenantId?.name || "Sistem")}</td><td>${escapeHtml(x.requestId || "-")}</td></tr>`);
        content.innerHTML = `<div class="stats"><div class="card"><div class="stat-label">Son 24 saat</div><div class="stat-value">${escapeHtml(data.son24SaatToplam || 0)}</div></div><div class="card"><div class="stat-label">Listelenen hata</div><div class="stat-value">${escapeHtml(data.toplam || 0)}</div></div></div><div class="card" style="margin-top:16px"><div class="card-title">Sistem Hata Kayıtları</div>${tablo(["Tarih", "İşlem", "HTTP", "Firma", "Request ID"], rows, "Sistem hatası kaydı yok.")}</div>`;
    }

    async function guvenlik() {
        const data = await api("/api/platform/guvenlik-merkezi");
        const ozet = Object.fromEntries((data.ozet || []).map(x => [x._id, x]));
        const kart = (ad, kod) => `<div class="card"><div class="stat-label">${ad}</div><div class="stat-value">${escapeHtml(ozet[kod]?.toplam || 0)}</div><div class="stat-note">Başarısız: ${escapeHtml(ozet[kod]?.basarisiz || 0)}</div></div>`;
        const rows = (data.olaylar || []).map(x => `<tr><td>${tarih(x.createdAt)}</td><td>${escapeHtml(x.category)}</td><td>${escapeHtml(x.action)}</td><td>${escapeHtml(x.ip || "-")}</td><td><span class="badge ${x.success ? "green" : "red"}">${x.success ? "Başarılı" : "Başarısız"}</span></td></tr>`);
        content.innerHTML = `<div class="stats">${kart("Giriş Olayları", "GIRIS")}${kart("Şüpheli Giriş", "SUPHELI_GIRIS")}${kart("Yetkisiz Erişim", "YETKISIZ_ERISIM")}${kart("Kritik Hata", "API_HATASI")}</div><div class="card" style="margin-top:16px"><div class="card-title">Güvenlik Olayları</div>${tablo(["Tarih", "Kategori", "İşlem", "IP", "Sonuç"], rows, "Güvenlik olayı yok.")}</div>`;
    }

    async function audit() {
        const data = await api("/api/platform/audit-kayitlari?limit=200");
        const rows = (data.kayitlar || []).map(x => `<tr><td>${tarih(x.createdAt)}</td><td><strong>${escapeHtml(x.action)}</strong><small>${escapeHtml(x.category)}</small></td><td>${escapeHtml(x.actorUserId?.email || "Sistem")}</td><td>${escapeHtml(x.tenantId?.name || "Platform")}</td><td><span class="badge ${x.success ? "green" : "red"}">${x.success ? "Başarılı" : "Başarısız"}</span></td></tr>`);
        content.innerHTML = `<div class="card"><div class="card-title">Değiştirilemez Audit Kayıtları</div>${tablo(["Tarih", "İşlem", "Aktör", "Firma", "Sonuç"], rows, "Audit kaydı yok.")}</div>`;
    }

    const yukleyiciler = { dashboard: genelBakis, tenants: firmalar, users: kullanicilar, subscriptions: abonelikler, errors: sistemHatalari, security: guvenlik, audit };

    async function bolumAc(bolum) {
        aktifBolum = yukleyiciler[bolum] ? bolum : "dashboard";
        pageTitle.textContent = basliklar[aktifBolum];
        document.querySelectorAll(".nav-item").forEach(x => x.classList.toggle("active", x.dataset.section === aktifBolum));
        yukleniyor();
        try { await yukleyiciler[aktifBolum](); } catch (error) { hataGoster(error); }
    }

    document.querySelectorAll(".nav-item").forEach(x => x.addEventListener("click", () => bolumAc(x.dataset.section)));
    document.getElementById("refreshButton").addEventListener("click", () => bolumAc(aktifBolum));
    document.getElementById("logoutButton").addEventListener("click", async () => {
        try { await api("/api/auth/logout", { method: "POST" }); } catch (_) { /* Oturum zaten kapanmış olabilir. */ }
        sessionStorage.removeItem("bmCsrfToken");
        location.replace("/erp/login.html");
    });

    bolumAc("dashboard");
})();
