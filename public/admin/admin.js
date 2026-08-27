const content = document.getElementById("content");
const pageTitle = document.getElementById("pageTitle");
/* =========================================================
   ADMIN LOGIN
   ========================================================= */

function getAdminToken() {
    return (
        localStorage.getItem("token") ||
        localStorage.getItem("accessToken") ||
        localStorage.getItem("adminToken") ||
        ""
    );
}

function setAdminToken(token) {
    localStorage.setItem("token", token);
    localStorage.setItem("adminToken", token);
}

function clearAdminToken() {
    localStorage.removeItem("token");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("adminToken");
}

function loginEkrani(mesaj = "") {
    document.body.innerHTML = `
        <div style="
            min-height:100vh;
            display:flex;
            align-items:center;
            justify-content:center;
            background:#f5f7fb;
            font-family:Arial,sans-serif;
            padding:20px;
        ">
            <div style="
                width:100%;
                max-width:420px;
                background:#fff;
                border-radius:18px;
                padding:32px;
                box-shadow:0 20px 60px rgba(0,0,0,.08);
            ">
                <div style="font-size:28px;font-weight:800;margin-bottom:6px;">
                    BenimMuhasebe
                </div>

                <div style="color:#64748b;margin-bottom:28px;">
                    Süper Admin Girişi
                </div>

                <form id="adminLoginForm">
                    <label style="display:block;margin-bottom:7px;font-size:13px;font-weight:700;">
                        E-posta
                    </label>

                    <input
                        id="adminEmail"
                        type="email"
                        autocomplete="username"
                        value=""
                        required
                        style="
                            width:100%;
                            box-sizing:border-box;
                            padding:13px;
                            border:1px solid #dbe1ea;
                            border-radius:9px;
                            margin-bottom:16px;
                        "
                    />

                    <label style="display:block;margin-bottom:7px;font-size:13px;font-weight:700;">
                        Şifre
                    </label>

                    <input
                        id="adminPassword"
                        type="password"
                        autocomplete="current-password"
                        required
                        style="
                            width:100%;
                            box-sizing:border-box;
                            padding:13px;
                            border:1px solid #dbe1ea;
                            border-radius:9px;
                            margin-bottom:16px;
                        "
                    />

                    <button
                        type="submit"
                        id="adminLoginButton"
                        style="
                            width:100%;
                            padding:13px;
                            border:0;
                            border-radius:9px;
                            background:#111827;
                            color:#fff;
                            font-weight:700;
                            cursor:pointer;
                        "
                    >
                        Giriş Yap
                    </button>

                    <div
                        id="adminLoginMessage"
                        style="
                            margin-top:14px;
                            color:#dc2626;
                            font-size:13px;
                            min-height:20px;
                        "
                    >${escapeHtml(mesaj)}</div>
                </form>
            </div>
        </div>
    `;

    const form = document.getElementById("adminLoginForm");

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const email = document.getElementById("adminEmail").value.trim();
        const sifre = document.getElementById("adminPassword").value;
        const button = document.getElementById("adminLoginButton");
        const message = document.getElementById("adminLoginMessage");

        button.disabled = true;
        button.textContent = "Giriş yapılıyor...";
        message.textContent = "";

        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify({
                    email,
                    sifre
                })
            });

            let data = await response.json();

            if (response.ok && data.ikiFaktorGerekli) {
                const kod = window.prompt("6 haneli doğrulama kodunu veya kurtarma kodunu girin:");
                if (!kod) throw new Error("İki faktörlü doğrulama gerekli.");
                const ikinci = await fetch("/api/auth/2fa-dogrula", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify({ challengeToken: data.challengeToken, kod }) });
                data = await ikinci.json();
                if (!ikinci.ok) throw new Error(data.mesaj || "İki faktörlü doğrulama başarısız.");
            }

            if (!response.ok || !data.basarili) {
                throw new Error(
                    data.mesaj ||
                    data.message ||
                    "Giriş başarısız."
                );
            }

            if (
                data.kullanici &&
                data.kullanici.rol &&
                data.kullanici.rol !== "SUPER_ADMIN"
            ) {
                throw new Error("Bu panel yalnızca SUPER_ADMIN içindir.");
            }

            clearAdminToken();
            if (data.csrfToken) sessionStorage.setItem("bmCsrfToken", data.csrfToken);

            window.location.reload();

        } catch (error) {
            message.textContent = error.message;
            button.disabled = false;
            button.textContent = "Giriş Yap";
        }
    });
}

async function logoutAdmin() {
    try { await fetch("/api/auth/logout", { method: "POST", headers: { "X-CSRF-Token": sessionStorage.getItem("bmCsrfToken") || "" } }); } catch (_) {}
    clearAdminToken();
    sessionStorage.removeItem("bmCsrfToken");
    window.location.reload();
}

/* =========================================================
   AUTH KONTROLLU API GET
   ========================================================= */

const eskiApiGet = apiGet;

async function apiGetAuth(url) {
    const token = getAdminToken();

    const headers = {
        "Accept": "application/json"
    };
    if (token) headers.Authorization = token.startsWith("Bearer ") ? token : "Bearer " + token;

    const response = await fetch(url, {
        method: "GET",
        headers
    });

    const text = await response.text();

    let data;

    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(`API geçersiz cevap verdi: ${response.status}`);
    }

    if (response.status === 401) {
        clearAdminToken();
        loginEkrani(
            data.mesaj ||
            "Oturum süresi doldu. Tekrar giriş yapın."
        );
        throw new Error("Oturum gerekli.");
    }

    if (!response.ok) {
        throw new Error(
            data.mesaj ||
            data.message ||
            `API hatası: ${response.status}`
        );
    }

    return data;
}


let dashboardData = null;

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function apiGet(url) { return apiGetAuth(url); }

function loading() {

    content.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <span>Veriler yükleniyor...</span>
        </div>
    `;
}

function hataGoster(error) {

    content.innerHTML = `
        <div class="card" style="border-left:4px solid #ef4444">
            <div class="card-title">Panel verisi alınamadı</div>

            <div style="color:#64748b;font-size:13px">
                ${escapeHtml(error.message)}
            </div>

            <div style="margin-top:15px;color:#94a3b8;font-size:11px">
                API: /api/platform/dashboard
            </div>
        </div>
    `;
}

async function dashboard() {

    pageTitle.textContent = "Sistem Dashboard";

    loading();

    try {

        dashboardData =
            await apiGet("/api/platform/dashboard");

        const d = dashboardData;

        /*
         * Backend dashboard verisi:
         * d.dashboard.kiracilar
         * d.dashboard.kullanicilar
         *
         * Eski ve yeni response yapilarini da destekle.
         */
        const dashboardStats = d.dashboard || d;

        const kiraciStats =
            dashboardStats.kiracilar ||
            dashboardStats.tenants ||
            {};

        const kullaniciStats =
            dashboardStats.kullanicilar ||
            dashboardStats.users ||
            {};

        const toplamTenant =
            kiraciStats.toplam ??
            d.toplamTenant ??
            d.tenantSayisi ??
            0;

        const aktifTenant =
            kiraciStats.aktif ??
            d.aktifTenant ??
            d.aktifKiraci ??
            0;

        const pasifTenant =
            kiraciStats.pasif ??
            d.pasifTenant ??
            d.pasifKiraci ??
            0;

        const toplamKullanici =
            kullaniciStats.toplam ??
            d.toplamKullanici ??
            d.kullaniciSayisi ??
            0;

        content.innerHTML = `

            <div class="stats">

                <div class="card stat-card">
                    <div class="stat-label">
                        Toplam Kiracı
                    </div>

                    <div class="stat-value">
                        ${escapeHtml(toplamTenant)}
                    </div>

                    <div class="stat-info">
                        Platform kayıtları
                    </div>
                </div>

                <div class="card stat-card">
                    <div class="stat-label">
                        Aktif Kiracı
                    </div>

                    <div class="stat-value">
                        ${escapeHtml(aktifTenant)}
                    </div>

                    <div class="stat-info">
                        Sistem aktif
                    </div>
                </div>

                <div class="card stat-card">
                    <div class="stat-label">
                        Pasif / Askıda
                    </div>

                    <div class="stat-value">
                        ${escapeHtml(pasifTenant)}
                    </div>

                    <div class="stat-info">
                        Kontrol gerekli
                    </div>
                </div>

                <div class="card stat-card">
                    <div class="stat-label">
                        Kullanıcı
                    </div>

                    <div class="stat-value">
                        ${escapeHtml(toplamKullanici)}
                    </div>

                    <div class="stat-info">
                        Platform kullanıcıları
                    </div>
                </div>

            </div>

            <div class="dashboard-grid">

                <div class="card">

                    <div class="card-title">
                        Platform Özeti
                    </div>

                    <div class="health-row">
                        <span class="health-name">
                            API
                        </span>

                        <span class="health-status">
                            ● ÇALIŞIYOR
                        </span>
                    </div>

                    <div class="health-row">
                        <span class="health-name">
                            Tenant izolasyonu
                        </span>

                        <span class="health-status">
                            ● AKTF
                        </span>
                    </div>

                    <div class="health-row">
                        <span class="health-name">
                            Yetkilendirme
                        </span>

                        <span class="health-status">
                            ● AKTF
                        </span>
                    </div>

                    <div class="health-row">
                        <span class="health-name">
                            Audit sistemi
                        </span>

                        <span class="health-status">
                            ● AKTF
                        </span>
                    </div>

                    <div class="health-row">
                        <span class="health-name">
                            AI güvenlik katmanı
                        </span>

                        <span class="health-status">
                            ● AKTF
                        </span>
                    </div>

                </div>

                <div class="card">

                    <div class="card-title">
                        Platform
                    </div>

                    <div style="font-size:25px;font-weight:800">
                        BenimMuhasebe
                    </div>

                    <div style="color:#7a8497;font-size:12px;margin-top:7px">
                        Çok kiracılı ERP platformu
                    </div>

                    <div style="
                        margin-top:25px;
                        padding:13px;
                        border-radius:9px;
                        background:#f5f3ff;
                        color:#5b21b6;
                        font-size:12px;
                        font-weight:700;
                    ">
                        benimmuhasebe.com
                    </div>

                </div>

            </div>

            <div class="card" style="margin-top:18px">

                <div class="card-title">
                    Kiracı Özeti
                </div>

                ${
                    renderTenants(
                        d.tenants ||
                        d.kiracilar ||
                        []
                    )
                }

            </div>
        `;

    } catch (error) {

        hataGoster(error);

    }
}

function renderTenants(tenants) {

    if (!Array.isArray(tenants) || tenants.length === 0) {

        return `
            <div style="
                padding:25px;
                text-align:center;
                color:#94a3b8;
                font-size:12px;
            ">
                Henüz gösterilecek kiracı bulunmuyor.
            </div>
        `;
    }

    return `
        <table class="tenant-table">

            <thead>
                <tr>
                    <th>FRMA</th>
                    <th>PLAN</th>
                    <th>DURUM</th>
                </tr>
            </thead>

            <tbody>

                ${tenants.slice(0,10).map(t => {

                    const status =
                        t.status ||
                        t.durum ||
                        "unknown";

                    let cls = "orange";

                    if (
                        status === "active" ||
                        status === "aktif"
                    ) {
                        cls = "green";
                    }

                    if (
                        status === "suspended" ||
                        status === "pasif"
                    ) {
                        cls = "red";
                    }

                    return `
                        <tr>

                            <td>
                                ${escapeHtml(
                                    t.name ||
                                    t.ad ||
                                    t.unvan ||
                                    "-"
                                )}
                            </td>

                            <td>
                                ${escapeHtml(
                                    t.plan ||
                                    "-"
                                )}
                            </td>

                            <td>
                                <span class="badge ${cls}">
                                    ${escapeHtml(status)}
                                </span>
                            </td>

                        </tr>
                    `;

                }).join("")}

            </tbody>

        </table>
    `;
}

async function tenants() {

    pageTitle.textContent = "Kiracı Yönetimi";

    loading();

    try {

        const data =
            await apiGet("/api/platform/tenants");

        const list =
            data.tenants ||
            data.kiracilar ||
            [];

        content.innerHTML = `

            <div class="card">

                <div class="card-title">
                    Tüm Kiracılar
                </div>

                ${renderTenants(list)}

            </div>
        `;

    } catch (error) {

        hataGoster(error);

    }
}

async function securityCenter() {
    pageTitle.textContent = "Güvenlik Merkezi";
    loading();
    try {
        const data = await apiGet("/api/platform/guvenlik-merkezi");
        const map = Object.fromEntries((data.ozet || []).map(x => [x._id, x]));
        const kart = (baslik, kategori) => `<div class="card stat-card"><div class="stat-label">${escapeHtml(baslik)}</div><div class="stat-value">${escapeHtml(map[kategori]?.toplam || 0)}</div><div class="stat-info">Başarısız: ${escapeHtml(map[kategori]?.basarisiz || 0)}</div></div>`;
        content.innerHTML = `<div class="stats">${kart("Başarısız Girişler", "GIRIS")}${kart("Şüpheli Girişler", "SUPHELI_GIRIS")}${kart("Yetkisiz Denemeler", "YETKISIZ_ERISIM")}${kart("Kritik API Hataları", "API_HATASI")}${kart("Banka Entegrasyonu", "BANKA_ENTEGRASYON")}</div><div class="card"><div class="card-title">Son Güvenlik Olayları</div><div style="overflow:auto"><table class="tenant-table"><thead><tr><th>TARİH</th><th>KATEGORİ</th><th>İŞLEM</th><th>IP</th><th>SONUÇ</th><th>HTTP</th></tr></thead><tbody>${(data.olaylar || []).map(x => `<tr><td>${new Date(x.createdAt).toLocaleString("tr-TR")}</td><td>${escapeHtml(x.category)}</td><td>${escapeHtml(x.action)}</td><td>${escapeHtml(x.ip || "-")}</td><td><span class="badge ${x.success ? "green" : "red"}">${x.success ? "Başarılı" : "Başarısız"}</span></td><td>${escapeHtml(x.httpStatus || "-")}</td></tr>`).join("") || '<tr><td colspan="6">Henüz güvenlik olayı yok.</td></tr>'}</tbody></table></div></div>`;
    } catch (error) { hataGoster(error); }
}

async function auditPage() {
    pageTitle.textContent = "Audit Kayıtları";
    loading();
    try {
        const data = await apiGet("/api/platform/audit-kayitlari?limit=100");
        content.innerHTML = `<div class="card"><div class="card-title">Değiştirilemez İşlem Kayıtları</div><div style="overflow:auto"><table class="tenant-table"><thead><tr><th>TARİH</th><th>İŞLEM</th><th>KAYNAK</th><th>FİRMA</th><th>SONUÇ</th></tr></thead><tbody>${(data.kayitlar || []).map(x => `<tr><td>${new Date(x.createdAt).toLocaleString("tr-TR")}</td><td>${escapeHtml(x.action)}</td><td>${escapeHtml(x.resource)}</td><td>${escapeHtml(x.tenantId || "Sistem")}</td><td>${x.success ? "Başarılı" : "Başarısız"}</td></tr>`).join("") || '<tr><td colspan="5">Kayıt yok.</td></tr>'}</tbody></table></div></div>`;
    } catch (error) { hataGoster(error); }
}

function simplePage(title, description) {

    pageTitle.textContent = title;

    content.innerHTML = `
        <div class="card">

            <div class="card-title">
                ${escapeHtml(title)}
            </div>

            <div style="
                color:#64748b;
                font-size:13px;
                line-height:1.7;
            ">
                ${escapeHtml(description)}
            </div>

        </div>
    `;
}

function panelYenile() {

    const active =
        document.querySelector(".nav-item.active");

    if (!active) {
        dashboard();
        return;
    }

    const page =
        active.dataset.page;

    sayfaAc(page);
}

async function sayfaAc(page) {

    document.querySelectorAll(".nav-item")
        .forEach(item => {

            item.classList.toggle(
                "active",
                item.dataset.page === page
            );

        });

    if (page === "dashboard") {
        return dashboard();
    }

    if (page === "tenants") {
        return tenants();
    }

    if (page === "subscriptions") {
        return simplePage(
            "Abonelikler",
            "Planlar, abonelik durumları, dönemler ve lisans yönetimi burada yönetilecek."
        );
    }

    if (page === "modules") {
        return simplePage(
            "Modül Yönetimi",
            "Kiracılara hangi ERP ve e-ticaret modüllerinin açık olduğunu buradan yöneteceğiz."
        );
    }

    if (page === "users") {
        return simplePage(
            "Kullanıcı Yönetimi",
            "Platform ve kiracı kullanıcıları, roller ve yetkiler burada yönetilecek."
        );
    }

    if (page === "ai") {
        return simplePage(
            "AI Merkezi",
            "Kiracılara yardımcı olacak yapay zeka servisleri, kullanım ve güvenlik kontrolleri burada yönetilecek."
        );
    }

    if (page === "audit") {
        return auditPage();
    }

    if (page === "security") {
        return securityCenter();
    }

    if (page === "system") {
        return simplePage(
            "Sistem Yönetimi",
            "Platform sağlığı, servisler, güvenlik ve sistem yapılandırmaları burada yönetilecek."
        );
    }
}

document.querySelectorAll(".nav-item")
    .forEach(item => {

        item.addEventListener(
            "click",
            () => sayfaAc(item.dataset.page)
        );

    });

dashboard();


