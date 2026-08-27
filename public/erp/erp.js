(() => {
    "use strict";

    const content = document.getElementById("content");
    const pageTitle = document.getElementById("pageTitle");

    function token() {
        return (
            localStorage.getItem("tenantToken") ||
            localStorage.getItem("token") ||
            localStorage.getItem("accessToken") ||
            ""
        );
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function para(value) {
        return new Intl.NumberFormat("tr-TR", {
            style: "currency",
            currency: "TRY",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(Number(value || 0));
    }

    async function api(url, options = {}) {
        const headers = {
            Accept: "application/json",
            ...(options.headers || {})
        };

        if (options.body && !headers["Content-Type"]) {
            headers["Content-Type"] = "application/json";
        }

        if (!["GET", "HEAD", "OPTIONS"].includes(String(options.method || "GET").toUpperCase())) {
            const csrf = sessionStorage.getItem("bmCsrfToken");
            if (csrf) headers["X-CSRF-Token"] = csrf;
        }

        const t = token();
        if (t) {
            headers.Authorization = t.startsWith("Bearer ")
                ? t
                : `Bearer ${t}`;
        }

        const response = await fetch(url, {
            ...options,
            headers,
            credentials: "include"
        });

        const text = await response.text();
        let data = null;

        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            data = { message: text };
        }

        if (!response.ok) {
            throw new Error(
                data?.mesaj ||
                data?.message ||
                `API hatası: ${response.status}`
            );
        }

        return data;
    }

    function loading(text = "Yükleniyor...") {
        content.innerHTML = `
            <div class="dashboard-loading">
                ${escapeHtml(text)}
            </div>
        `;
    }

    function errorBox(error) {
        content.innerHTML = `
            <div class="error">
                <strong>Veri alınamadı.</strong>
                <div style="margin-top:8px">
                    ${escapeHtml(error?.message || "Bilinmeyen hata")}
                </div>
            </div>
        `;
    }

    function setTitle(title) {
        if (pageTitle) pageTitle.textContent = title;
    }

    function card(title, value, info = "") {
        return `
            <div class="dashboard-card">
                <div class="dashboard-card-title">${escapeHtml(title)}</div>
                <div class="dashboard-card-value">${value}</div>
                <div class="dashboard-card-info">${escapeHtml(info)}</div>
            </div>
        `;
    }

    function table(title, rows, columns) {
        const list = Array.isArray(rows) ? rows : [];

        if (!list.length) {
            return `
                <div class="dashboard-panel">
                    <h2>${escapeHtml(title)}</h2>
                    <div class="empty-state">Henüz kayıt yok.</div>
                </div>
            `;
        }

        return `
            <div class="dashboard-panel">
                <div class="panel-heading">
                    <div>
                        <h2>${escapeHtml(title)}</h2>
                        <p>${list.length} kayıt</p>
                    </div>
                </div>
                <div class="table-scroll">
                    <table>
                        <thead>
                            <tr>
                                ${columns.map(c => `<th>${escapeHtml(c.label)}</th>`).join("")}
                            </tr>
                        </thead>
                        <tbody>
                            ${list.map(row => `
                                <tr>
                                    ${columns.map(c => `
                                        <td>${escapeHtml(
            typeof c.value === "function"
                ? c.value(row)
                : row[c.value] ?? "-"
        )}</td>
                                    `).join("")}
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    function dashboardDetayKapat() {
        const el = document.getElementById("dashboardDetayOverlay");

        if (el) {
            el.remove();
        }
    }

    function dashboardDetayModal(baslik, icerik) {
        dashboardDetayKapat();

        const overlay = document.createElement("div");

        overlay.id = "dashboardDetayOverlay";
        overlay.className = "erp-modal-overlay";

        overlay.innerHTML = `
            <div class="erp-modal" style="max-width:1000px;width:95%;">
                <div class="erp-modal-header">
                    <div>
                        <h2>${escapeHtml(baslik)}</h2>
                        <p>Dashboard detay görünümü</p>
                    </div>

                    <button
                        type="button"
                        class="erp-modal-close"
                        id="dashboardDetayKapat"
                    >
                        ×
                    </button>
                </div>

                <div style="max-height:65vh;overflow:auto;">
                    ${icerik}
                </div>

                <div class="erp-modal-footer">
                    <button
                        type="button"
                        class="erp-small-button secondary"
                        id="dashboardDetayKapatAlt"
                    >
                        Kapat
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        document
            .getElementById("dashboardDetayKapat")
            ?.addEventListener(
                "click",
                dashboardDetayKapat
            );

        document
            .getElementById("dashboardDetayKapatAlt")
            ?.addEventListener(
                "click",
                dashboardDetayKapat
            );
    }

    async function dashboardKasaDetay() {
        try {
            const data = await api(
                "/api/tenant/finans/para-hareketleri?hesapTipi=KASA"
            );

            const hareketler =
                Array.isArray(data.hareketler)
                    ? data.hareketler
                    : [];

            const simdi = new Date();

            const gunBaslangic = new Date(
                simdi.getFullYear(),
                simdi.getMonth(),
                simdi.getDate()
            );

            const yarin = new Date(
                simdi.getFullYear(),
                simdi.getMonth(),
                simdi.getDate() + 1
            );

            const bugun = hareketler.filter(item => {
                const tarih = new Date(
                    item.tarih || item.createdAt
                );

                return tarih >= gunBaslangic &&
                    tarih < yarin;
            });

            const toplamGiris =
                bugun
                    .filter(x => x.tip === "GIRIS")
                    .reduce(
                        (sum, x) =>
                            sum + Number(x.tutar || 0),
                        0
                    );

            const toplamCikis =
                bugun
                    .filter(x => x.tip === "CIKIS")
                    .reduce(
                        (sum, x) =>
                            sum + Number(x.tutar || 0),
                        0
                    );

            const net =
                toplamGiris - toplamCikis;

            const rows = bugun.length
                ? bugun.map(item => `
                    <tr>
                        <td>
                            ${new Date(
                    item.tarih || item.createdAt
                ).toLocaleString("tr-TR")}
                        </td>

                        <td>
                            ${item.tip === "GIRIS"
                        ? "Giriş"
                        : "Çıkış"}
                        </td>

                        <td>
                            ${escapeHtml(
                            item.aciklama || "-"
                        )}
                        </td>

                        <td>
                            <strong>
                                ${para(item.tutar)}
                            </strong>
                        </td>
                    </tr>
                `).join("")
                : `
                    <tr>
                        <td colspan="4">
                            Bugün kasa hareketi yok.
                        </td>
                    </tr>
                `;

            dashboardDetayModal(
                "Bugünkü Kasa Hareketleri",
                `
                    <div class="dashboard-grid">

                        ${card(
                    "Toplam Giriş",
                    para(toplamGiris),
                    "Bugünkü kasa girişleri"
                )}

                        ${card(
                    "Toplam Çıkış",
                    para(toplamCikis),
                    "Bugünkü kasa çıkışları"
                )}

                        ${card(
                    "Net Hareket",
                    para(net),
                    "Giriş - çıkış"
                )}
                    </div>

                    <div class="dashboard-panel">
                        <h3>Bugünkü Hareketler</h3>

                        <div style="overflow:auto;">
                            <table class="erp-table">
                                <thead>
                                    <tr>
                                        <th>Tarih</th>
                                        <th>Tip</th>
                                        <th>Açıklama</th>
                                        <th>Tutar</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    ${rows}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `
            );

        } catch (error) {
            errorBox(error);
        }
    }

    async function dashboardSatisDetay(tip) {
        try {
            const data = await api(
                "/api/tenant/satis"
            );

            const satislar =
                Array.isArray(data.satislar)
                    ? data.satislar
                    : [];

            const simdi = new Date();

            const bugunBaslangic = new Date(
                simdi.getFullYear(),
                simdi.getMonth(),
                simdi.getDate()
            );

            const yarin = new Date(
                simdi.getFullYear(),
                simdi.getMonth(),
                simdi.getDate() + 1
            );

            const ayBaslangic = new Date(
                simdi.getFullYear(),
                simdi.getMonth(),
                1
            );

            const gelecekAy = new Date(
                simdi.getFullYear(),
                simdi.getMonth() + 1,
                1
            );

            const filtreli =
                tip === "bugun"
                    ? satislar.filter(item => {
                        const tarih =
                            new Date(item.tarih);

                        return tarih >= bugunBaslangic &&
                            tarih < yarin;
                    })
                    : satislar.filter(item => {
                        const tarih =
                            new Date(item.tarih);

                        return tarih >= ayBaslangic &&
                            tarih < gelecekAy;
                    });

            const toplam =
                filtreli.reduce(
                    (sum, item) =>
                        sum + Number(
                            item.genelToplam || 0
                        ),
                    0
                );

            const rows = filtreli.length
                ? filtreli.map(item => `
                    <tr>
                        <td>
                            ${new Date(
                    item.tarih
                ).toLocaleString("tr-TR")}
                        </td>

                        <td>
                            ${escapeHtml(
                    item.belgeNo || "-"
                )}
                        </td>

                        <td>
                            ${escapeHtml(
                    item.musteriId?.unvan ||
                    item.musteriId?.adSoyad ||
                    "-"
                )}
                        </td>

                        <td>
                            <strong>
                                ${para(
                    item.genelToplam
                )}
                            </strong>
                        </td>

                        <td>
                            ${escapeHtml(
                    item.odemeDurumu || "-"
                )}
                        </td>
                    </tr>
                `).join("")
                : `
                    <tr>
                        <td colspan="5">
                            Bu dönemde satış bulunamadı.
                        </td>
                    </tr>
                `;

            dashboardDetayModal(
                tip === "bugun"
                    ? "Bugünkü Satışlar"
                    : "Bu Ayın Satışları",
                `
                    <div class="dashboard-grid">

                        ${card(
                    "Satış Adedi",
                    String(filtreli.length),
                    "Satış belgesi"
                )}

                        ${card(
                    "Toplam Ciro",
                    para(toplam),
                    tip === "bugun"
                        ? "Bugünkü satış"
                        : "Bu ayki satış"
                )}
                    </div>

                    <div class="dashboard-panel">
                        <h3>Satış Listesi</h3>

                        <div style="overflow:auto;">
                            <table class="erp-table">
                                <thead>
                                    <tr>
                                        <th>Tarih</th>
                                        <th>Belge</th>
                                        <th>Müşteri</th>
                                        <th>Tutar</th>
                                        <th>Ödeme</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    ${rows}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `
            );

        } catch (error) {
            errorBox(error);
        }
    }

    async function dashboardCariDetay(tip) {
        try {
            if (tip === "musteri") {
                await sayfaYukle("cari");
                return;
            }

            if (tip === "tedarikci") {
                await sayfaYukle("cari");
                return;
            }

            await sayfaYukle("cari");

        } catch (error) {
            errorBox(error);
        }
    }

    async function dashboardKartAc(baslik) {

        switch (baslik) {

            case "Günlük Kasa":
                await dashboardKasaDetay();
                return;

            case "Aylık Ciro":
                await dashboardSatisDetay("ay");
                return;

            case "Bugünkü Satış":
                await dashboardSatisDetay("bugun");
                return;

            case "Toplam Nakit":
                await sayfaYukle("finans");
                return;

            case "Müşteri Alacağı":
                await dashboardCariDetay("musteri");
                return;

            case "Tedarikçi Borcu":
                await dashboardCariDetay("tedarikci");
                return;

            case "Net Cari":
                await sayfaYukle("cari");
                return;

            case "Toplam Masraf":
                await sayfaYukle("masraflar");
                return;

            case "Stok":
                await sayfaYukle("stok");
                return;

            case "Tahsilat":
            case "Ödeme":
                await sayfaYukle("cari");
                return;

            case "Aktif Personel":
                await sayfaYukle("personeller");
                return;
        }
    }

    function dashboardKartlariniBagla() {

        document
            .querySelectorAll(".dashboard-card")
            .forEach(cardEl => {

                const baslikEl =
                    cardEl.querySelector(
                        ".dashboard-card-title"
                    );

                if (!baslikEl) {
                    return;
                }

                const baslik =
                    baslikEl.textContent.trim();

                const aktifKartlar = [
                    "Günlük Kasa",
                    "Aylık Ciro",
                    "Bugünkü Satış",
                    "Toplam Nakit",
                    "Müşteri Alacağı",
                    "Tedarikçi Borcu",
                    "Net Cari",
                    "Toplam Masraf",
                    "Stok",
                    "Tahsilat",
                    "Ödeme",
                    "Aktif Personel"
                ];

                if (!aktifKartlar.includes(baslik)) {
                    return;
                }

                cardEl.style.cursor = "pointer";
                cardEl.title =
                    `${baslik} detaylarını aç`;

                cardEl.addEventListener(
                    "click",
                    () => {
                        dashboardKartAc(baslik);
                    }
                );
            });
    }
    async function dashboardYukle() {
        setTitle("Ana Sayfa");
        loading();

        try {
            const [finans, rapor, satisData, masrafData, cari] =
                await Promise.all([
                    api("/api/tenant/finans/ozet"),
                    api("/api/tenant/raporlar/genel"),
                    api("/api/tenant/satis"),
                    api("/api/tenant/masraflar/ozet"),
                    api("/api/tenant/cari/ozet")
                ]);

            const satislar = Array.isArray(satisData.satislar)
                ? satisData.satislar
                : [];

            const simdi = new Date();

            const bugunBaslangic = new Date(
                simdi.getFullYear(),
                simdi.getMonth(),
                simdi.getDate()
            );

            const yarinBaslangic = new Date(
                simdi.getFullYear(),
                simdi.getMonth(),
                simdi.getDate() + 1
            );

            const ayBaslangic = new Date(
                simdi.getFullYear(),
                simdi.getMonth(),
                1
            );

            const gelecekAyBaslangic = new Date(
                simdi.getFullYear(),
                simdi.getMonth() + 1,
                1
            );

            const bugunSatislari = satislar.filter(item => {
                const tarih = new Date(item.tarih);
                return tarih >= bugunBaslangic &&
                    tarih < yarinBaslangic;
            });

            const buAySatislari = satislar.filter(item => {
                const tarih = new Date(item.tarih);
                return tarih >= ayBaslangic &&
                    tarih < gelecekAyBaslangic;
            });

            const gunlukSatis =
                bugunSatislari.reduce(
                    (toplam, item) =>
                        toplam + Number(item.genelToplam || 0),
                    0
                );

            const aylikCiro =
                buAySatislari.reduce(
                    (toplam, item) =>
                        toplam + Number(item.genelToplam || 0),
                    0
                );

            const gunlukSatisAdedi =
                bugunSatislari.length;

            const aylikSatisAdedi =
                buAySatislari.length;

            const kasa =
                Number(finans.kasaToplam || 0);

            const banka =
                Number(finans.bankaToplam || 0);

            const toplamNakit =
                Number(finans.toplamNakit || 0);

            const toplamMasraf =
                Number(masrafData.toplam || 0);

            const stokAdedi =
                Number(
                    rapor?.rapor?.stok?.toplamAdet || 0
                );

            const tahsilat =
                Number(
                    rapor?.rapor?.cari?.tahsilat || 0
                );

            const odeme =
                Number(
                    rapor?.rapor?.cari?.odeme || 0
                );

            const aktifPersonel =
                Number(
                    rapor?.rapor?.personel?.aktif || 0
                );

            /*
             * GÜNLÜK KUR
             * Frankfurter + TCMB sağlayıcısı.
             */
            let kur = {
                usd: null,
                eur: null
            };

            try {
                const [usdResponse, eurResponse] =
                    await Promise.all([
                        fetch(
                            "https://api.frankfurter.dev/v2/rate/USD/TRY?providers=TCMB"
                        ),
                        fetch(
                            "https://api.frankfurter.dev/v2/rate/EUR/TRY?providers=TCMB"
                        )
                    ]);

                if (usdResponse.ok && eurResponse.ok) {
                    const [usdData, eurData] =
                        await Promise.all([
                            usdResponse.json(),
                            eurResponse.json()
                        ]);

                    kur.usd =
                        Number(usdData?.rate || 0);

                    kur.eur =
                        Number(eurData?.rate || 0);
                }
            } catch {
                kur.usd = null;
                kur.eur = null;
            }


            const formatKur = value => {
                if (!value || !Number.isFinite(value)) {
                    return "Alınamadı";
                }

                return Number(value).toLocaleString(
                    "tr-TR",
                    {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    }
                );
            };

            /*
             * KULLANICIYA ÖRETC ÖNERLER
             */
            const oneriler = [];

            if (cari.musteriAlacak > 0) {
                oneriler.push(
                    "Tahsil edilmemiş müşteri bakiyelerini kontrol et."
                );
            }

            if (cari.tedarikciBorc > 0) {
                oneriler.push(
                    "Vadesi yaklaşan tedarikçi borçlarını kontrol et."
                );
            }

            if (stokAdedi <= 20) {
                oneriler.push(
                    "Stok seviyelerini kontrol et; kritik ürün olabilir."
                );
            }

            if (gunlukSatisAdedi === 0) {
                oneriler.push(
                    "Bugün satış kaydı yok. Müşteri ve teklif takibini gözden geçir."
                );
            } else {
                oneriler.push(
                    `${gunlukSatisAdedi} satış kaydı oluştu; açık hesapları kontrol et.`
                );
            }

            if (toplamMasraf > 0) {
                oneriler.push(
                    "Masrafları kategori bazında inceleyerek gereksiz giderleri takip et."
                );
            }

            const tenantInfo =
                document.getElementById("tenantInfo");

            if (tenantInfo) {
                tenantInfo.textContent =
                    "Tenant bağlantısı aktif";
            }

            content.innerHTML = `
                <div class="welcome-banner">

                    <div>
                        <div class="eyebrow">
                            BEN&#304;MMUHASEBE ERP
                        </div>

                        <h2>Kontrol Paneli</h2>

                        <p>
                            &#304;&#351;letmenizin günlük,
                            aylık ve finansal durumunu
                            tek ekrandan yönetin.
                        </p>
                    </div>

                    <div class="welcome-actions">

                        <div class="dashboard-hero-actions">
                            <button class="dashboard-action dashboard-action-blue" data-dashboard-page="satis">+ Yeni Satış</button>
                            <button class="dashboard-action dashboard-action-green" data-dashboard-page="musteriler">+ Yeni Müşteri</button>
                            <button class="dashboard-action dashboard-action-purple" data-dashboard-page="teklifler">+ Yeni Teklif</button>
                        </div>

                        <div class="live-time">
                            ${simdi.toLocaleString("tr-TR")}
                        </div>

                        <div class="dashboard-card-info">
                            ${simdi.toLocaleDateString(
                "tr-TR",
                {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric"
                }
            )}
                        </div>

                    </div>

                </div>

                <div class="dashboard-shortcuts" aria-label="Hızlı işlemler">
                    <button class="dashboard-shortcut shortcut-blue" data-dashboard-page="satis"><span>₺</span><b>Satış Yap</b><small>Yeni satış belgesi oluştur</small></button>
                    <button class="dashboard-shortcut shortcut-green" data-dashboard-page="musteriler"><span>◎</span><b>Müşteri Merkezi</b><small>Cari, tahsilat ve belgeler</small></button>
                    <button class="dashboard-shortcut shortcut-purple" data-dashboard-page="siparisler"><span>▣</span><b>Sipariş Oluştur</b><small>Sipariş kalemlerini hazırla</small></button>
                    <button class="dashboard-shortcut shortcut-orange" data-dashboard-page="alis"><span>↙</span><b>Alış / İade</b><small>Stok giriş işlemleri</small></button>
                    <button class="dashboard-shortcut shortcut-cyan" data-dashboard-page="finans"><span>◈</span><b>Kasa / Banka</b><small>Nakit hareketlerini yönet</small></button>
                    <button class="dashboard-shortcut shortcut-rose" data-dashboard-page="raporlar"><span>▥</span><b>Rapor Merkezi</b><small>İşletme sonuçlarını incele</small></button>
                </div>

                <!-- GÜNLÜK KUR -->

                <div class="dashboard-panel">

                    <div class="panel-heading">

                        <div>
                            <h2>Günlük Kur</h2>
                            <p>Harici kur servisi üzerinden alınır</p>
                        </div>

                        <div class="dashboard-card-info">
                            ${simdi.toLocaleTimeString("tr-TR")}
                        </div>

                    </div>

                    <div class="dashboard-grid">

                        <div class="dashboard-card">

                            <div class="dashboard-card-title">
                                USD / TRY
                            </div>

                            <div class="dashboard-card-value">
                                ${formatKur(kur.usd)}
                            </div>

                            <div class="dashboard-card-info">
                                1 USD
                            </div>

                        </div>

                        <div class="dashboard-card">

                            <div class="dashboard-card-title">
                                EUR / TRY
                            </div>

                            <div class="dashboard-card-value">
                                ${formatKur(kur.eur)}
                            </div>

                            <div class="dashboard-card-info">
                                1 EUR
                            </div>

                        </div>

                    </div>

                </div>

                <!-- ANA GÖSTERGELER -->

                <div class="dashboard-grid">

                    <div class="dashboard-card">

                        <div class="dashboard-card-title">
                            Günlük Kasa
                        </div>

                        <div class="dashboard-card-value">
                            ${para(kasa)}
                        </div>

                        <div class="dashboard-card-info">
                            Aktif kasa bakiyesi
                        </div>

                    </div>

                    <div class="dashboard-card">

                        <div class="dashboard-card-title">
                            Aylık Ciro
                        </div>

                        <div class="dashboard-card-value">
                            ${para(aylikCiro)}
                        </div>

                        <div class="dashboard-card-info">
                            ${aylikSatisAdedi} satış belgesi
                        </div>

                    </div>

                    <div class="dashboard-card">

                        <div class="dashboard-card-title">
                            Bugünkü Satış
                        </div>

                        <div class="dashboard-card-value">
                            ${para(gunlukSatis)}
                        </div>

                        <div class="dashboard-card-info">
                            ${gunlukSatisAdedi} satış
                        </div>

                    </div>

                    <div class="dashboard-card">

                        <div class="dashboard-card-title">
                            Toplam Nakit
                        </div>

                        <div class="dashboard-card-value">
                            ${para(toplamNakit)}
                        </div>

                        <div class="dashboard-card-info">
                            Kasa + banka
                        </div>

                    </div>

                </div>

                <!-- CARI -->

                <div class="dashboard-grid">

                    <div class="dashboard-card">

                        <div class="dashboard-card-title">
                            Müşteri Alacağı
                        </div>

                        <div class="dashboard-card-value">
                            ${para(cari.musteriAlacak)}
                        </div>

                        <div class="dashboard-card-info">
                            Tahsil edilmemiş
                        </div>

                    </div>

                    <div class="dashboard-card">

                        <div class="dashboard-card-title">
                            Tedarikçi Borcu
                        </div>

                        <div class="dashboard-card-value">
                            ${para(cari.tedarikciBorc)}
                        </div>

                        <div class="dashboard-card-info">
                            Ödenmemiş
                        </div>

                    </div>

                    <div class="dashboard-card positive">

                        <div class="dashboard-card-title">
                            Net Cari
                        </div>

                        <div class="dashboard-card-value">
                            ${para(cari.netCari)}
                        </div>

                        <div class="dashboard-card-info">
                            Alacak - borç
                        </div>

                    </div>

                    <div class="dashboard-card">

                        <div class="dashboard-card-title">
                            Toplam Masraf
                        </div>

                        <div class="dashboard-card-value">
                            ${para(toplamMasraf)}
                        </div>

                        <div class="dashboard-card-info">
                            Masraf özeti
                        </div>

                    </div>

                </div>

                <!-- OPERASYON -->

                <div class="dashboard-grid">

                    <div class="dashboard-card">

                        <div class="dashboard-card-title">
                            Stok
                        </div>

                        <div class="dashboard-card-value">
                            ${stokAdedi}
                        </div>

                        <div class="dashboard-card-info">
                            Toplam stok adedi
                        </div>

                    </div>

                    <div class="dashboard-card">

                        <div class="dashboard-card-title">
                            Tahsilat
                        </div>

                        <div class="dashboard-card-value">
                            ${para(tahsilat)}
                        </div>

                        <div class="dashboard-card-info">
                            Cari tahsilat
                        </div>

                    </div>

                    <div class="dashboard-card">

                        <div class="dashboard-card-title">
                            Ödeme
                        </div>

                        <div class="dashboard-card-value">
                            ${para(odeme)}
                        </div>

                        <div class="dashboard-card-info">
                            Cari ödeme
                        </div>

                    </div>

                    <div class="dashboard-card">

                        <div class="dashboard-card-title">
                            Aktif Personel
                        </div>

                        <div class="dashboard-card-value">
                            ${aktifPersonel}
                        </div>

                        <div class="dashboard-card-info">
                            &#199;al&#305;&#351;an personel
                        </div>

                    </div>

                </div>

                <!-- YÖNETC ÖZET -->

                <div class="dashboard-two-column">

                    <div class="dashboard-panel">

                        <div class="panel-heading">

                            <div>
                                <h2>Bugün Ne Yapmalıyım?</h2>
                                <p>
                                    ERP'nin sana yardımcı olması için
                                    önemli kontrol noktaları
                                </p>
                            </div>

                        </div>

                        <div class="category-list">

                            ${oneriler
                    .slice(0, 5)
                    .map(
                        (item, index) => `
                                            <div class="category-row">
                                                <span>
                                                    ${index + 1}.
                                                    ${escapeHtml(item)}
                                                </span>
                                            </div>
                                        `
                    )
                    .join("")
                }

                        </div>

                    </div>

                    <div class="dashboard-panel">

                        <div class="panel-heading">

                            <div>
                                <h2>Hızlı Yönetim</h2>
                                <p>
                                    ERP'yi daha verimli kullan
                                </p>
                            </div>

                        </div>

                        <div class="category-list">

                            <div class="category-row">
                                <span>
                                    Müşteriler
                                </span>
                                <b>
                                    Cari ve tahsilatlarını takip et
                                </b>
                            </div>

                            <div class="category-row">
                                <span>
                                    Stok
                                </span>
                                <b>
                                    Kritik stokları kontrol et
                                </b>
                            </div>

                            <div class="category-row">
                                <span>
                                    Satış
                                </span>
                                <b>
                                    Günlük satışlarını kaydet
                                </b>
                            </div>

                            <div class="category-row">
                                <span>
                                    Masraflar
                                </span>
                                <b>
                                    Giderleri anlık kaydet
                                </b>
                            </div>

                            <div class="category-row">
                                <span>
                                    Raporlar
                                </span>
                                <b>
                                    &#304;&#351;letmenin genel durumunu incele
                                </b>
                            </div>

                        </div>

                    </div>

                </div>

                <!-- BENIMMUHASEBE REKLAM -->

                <div class="benimmuhasebe-promo">

                    <div>

                        <div class="eyebrow">
                            BEN&#304;MMUHASEBE
                        </div>

                        <h2>
                            &#304;&#351;letmeni tek ekrandan yönet.
                        </h2>

                        <p>
                            Müşteri, stok, satış, cari,
                            kasa, banka, personel ve raporlarını
                            tek sistemde takip et.
                        </p>

                    </div>

                    <div class="welcome-actions">

                        <a
                            href="https://www.benimmuhasebe.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="erp-primary-button"
                        >
                            www.benimmuhasebe.com
                        </a>

                    </div>

                </div>

                <!-- ALT BLG -->

                <div class="dashboard-panel">

                    <div class="panel-heading">

                        <div>
                            <h2>Sistem Durumu</h2>
                            <p>
                                Son güncelleme:
                                ${simdi.toLocaleString("tr-TR")}
                            </p>
                        </div>

                        <strong>
                            AKT&#304;F
                        </strong>

                    </div>

                </div>
            `;

            dashboardKartlariniBagla();
            document.querySelectorAll("[data-dashboard-page]").forEach(button => {
                button.addEventListener("click", () => sayfaYukle(button.dataset.dashboardPage));
            });
            const hizliSayfalar = { "Müşteriler": "musteriler", "Stok": "stok", "Satış": "satis", "Masraflar": "masraflar", "Raporlar": "raporlar" };
            document.querySelectorAll(".category-row").forEach(row => {
                const sayfa = hizliSayfalar[row.querySelector("span")?.textContent.trim()];
                if (!sayfa) return;
                row.classList.add("dashboard-nav-row");
                row.tabIndex = 0;
                row.setAttribute("role", "button");
                row.addEventListener("click", () => sayfaYukle(sayfa));
                row.addEventListener("keydown", event => {
                    if (event.key === "Enter" || event.key === " ") sayfaYukle(sayfa);
                });
            });

        } catch (error) {

            const tenantInfo =
                document.getElementById("tenantInfo");

            if (tenantInfo) {
                tenantInfo.textContent =
                    "Panel verisi alınamadı";
            }

            errorBox(error);
        }
    }

    const configs = {
        musteriler: {
            title: "Müşteriler",
            url: "/api/tenant/musteriler",
            key: "musteriler",
            columns: [
                { label: "Kod", value: "kod" },
                { label: "Ünvan", value: r => r.unvan || r.adSoyad || "-" },
                { label: "Yetkili", value: "yetkili" },
                { label: "Telefon", value: r => r.whatsapp || r.telefon || "-" },
                { label: "Bakiye", value: r => para(r.bakiye) }
            ]
        },
        tedarikciler: {
            title: "Tedarikçiler",
            url: "/api/tenant/tedarikciler",
            key: "tedarikciler",
            columns: [
                { label: "Kod", value: "kod" },
                { label: "Ünvan", value: r => r.unvan || r.adSoyad || "-" },
                { label: "Yetkili", value: "yetkili" },
                { label: "Telefon", value: r => r.whatsapp || r.telefon || "-" },
                { label: "Bakiye", value: r => para(r.bakiye) }
            ]
        },
        urunler: {
            title: "Ürünler",
            url: "/api/tenant/urunler",
            key: "urunler",
            columns: [
                { label: "Kod", value: "kod" },
                { label: "Barkod", value: "barkod" },
                { label: "Ürün", value: "ad" },
                { label: "Birim", value: "birim" },
                { label: "Alış", value: r => para(r.alisFiyati) },
                { label: "Satış", value: r => para(r.satisFiyati) }
            ]
        },
        stok: {
            title: "Stok",
            url: "/api/tenant/stok",
            key: "stoklar",
            columns: [
                { label: "Ürün", value: r => r.urunId?.kod || "-" },
                { label: "Ürün Adı", value: r => r.urunId?.ad || "-" },
                { label: "Depo", value: r => r.depoId?.ad || "-" },
                { label: "Miktar", value: "miktar" },
                { label: "Maliyet", value: r => para(r.maliyet) }
            ]
        },
        alis: {
            title: "Alış",
            url: "/api/tenant/alis",
            key: "alislar",
            columns: [
                { label: "Belge", value: "belgeNo" },
                { label: "Tarih", value: r => r.tarih ? new Date(r.tarih).toLocaleDateString("tr-TR") : "-" },
                { label: "Tedarikçi", value: r => r.tedarikciId?.unvan || "-" },
                { label: "Depo", value: r => r.depoId?.ad || "-" },
                { label: "Genel Toplam", value: r => para(r.genelToplam) }
            ]
        },
        satis: {
            title: "Satış",
            url: "/api/tenant/satis",
            key: "satislar",
            columns: [
                { label: "Belge", value: "belgeNo" },
                { label: "Tarih", value: r => r.tarih ? new Date(r.tarih).toLocaleDateString("tr-TR") : "-" },
                { label: "Müşteri", value: r => r.musteriId?.unvan || "-" },
                { label: "Ödeme", value: r => r.odemeTipi || "-" },
                { label: "Genel Toplam", value: r => para(r.genelToplam) }
            ]
        },
        siparisler: {
            title: "Siparişler",
            url: "/api/tenant/siparisler",
            key: "siparisler",
            columns: [
                { label: "Sipariş No", value: "siparisNo" },
                { label: "Tarih", value: r => r.tarih ? new Date(r.tarih).toLocaleDateString("tr-TR") : "-" },
                { label: "Müşteri", value: r => r.musteriId?.unvan || r.musteriId?.adSoyad || "-" },
                { label: "Durum", value: r => r.durum || "-" },
                { label: "Genel Toplam", value: r => para(r.genelToplam) }
            ]
        },
        teklifler: {
            title: "Teklifler",
            url: "/api/tenant/teklifler",
            key: "teklifler",
            columns: [
                { label: "Teklif No", value: "teklifNo" },
                { label: "Tarih", value: r => r.tarih ? new Date(r.tarih).toLocaleDateString("tr-TR") : "-" },
                { label: "Müşteri", value: r => r.musteriId?.unvan || r.musteriId?.adSoyad || "-" },
                { label: "Durum", value: r => r.durum || "-" },
                { label: "Genel Toplam", value: r => para(r.genelToplam) }
            ]
        }
    };

    async function basitSayfa(page) {
        const cfg = configs[page];

        if (!cfg) {
            setTitle(page);
            content.innerHTML = `
                <div class="dashboard-panel">
                    <h2>${escapeHtml(page)}</h2>
                    <div class="empty-state">
                        Bu modül için arayüz yeniden kuruluyor.
                    </div>
                </div>
            `;
            return;
        }

        setTitle(cfg.title);
        loading();

        try {
            const data = await api(cfg.url);

            content.innerHTML = table(
                cfg.title,
                data[cfg.key] || [],
                cfg.columns
            );
        } catch (error) {
            errorBox(error);
        }
    }

    let musteriFormAdim = 1;

    function musteriPanelKapat() {
        const overlay =
            document.getElementById("musteriFormOverlay");

        if (overlay) {
            overlay.remove();
        }
    }

    async function musteriFotografHazirla(dosya) {
        if (!dosya || !/^image\/(png|jpe?g|webp)$/i.test(dosya.type)) throw new Error("PNG, JPG veya WebP fotoğraf seçin.");
        const veriUrl = await new Promise((resolve, reject) => {
            const okuyucu = new FileReader(); okuyucu.onload = () => resolve(okuyucu.result);
            okuyucu.onerror = () => reject(new Error("Fotoğraf okunamadı.")); okuyucu.readAsDataURL(dosya);
        });
        const resim = await new Promise((resolve, reject) => {
            const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error("Fotoğraf açılamadı.")); img.src = veriUrl;
        });
        const enBuyuk = 1280;
        const oran = Math.min(1, enBuyuk / Math.max(resim.width, resim.height));
        const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(resim.width * oran)); canvas.height = Math.max(1, Math.round(resim.height * oran));
        canvas.getContext("2d").drawImage(resim, 0, 0, canvas.width, canvas.height);
        const sonuc = canvas.toDataURL("image/jpeg", 0.82);
        if (sonuc.length > 2 * 1024 * 1024) throw new Error("Fotoğraf küçültüldükten sonra hâlâ çok büyük.");
        return sonuc;
    }

    function musteriFormVerisi(form) {
        const fd = new FormData(form);

        return {
            kod: String(fd.get("kod") || "").trim(),
            adSoyad: String(fd.get("adSoyad") || "").trim(),
            unvan: String(fd.get("unvan") || "").trim(),
            yetkili: String(fd.get("yetkili") || "").trim(),
            telefon: String(fd.get("telefon") || "").trim(),
            whatsapp: String(fd.get("whatsapp") || "").trim(),
            email: String(fd.get("email") || "").trim(),
            vergiDairesi: String(fd.get("vergiDairesi") || "").trim(),
            vergiNo: String(fd.get("vergiNo") || "").trim(),
            adres: String(fd.get("adres") || "").trim(),
            il: String(fd.get("il") || "").trim(),
            ilce: String(fd.get("ilce") || "").trim(),
            postaKodu: String(fd.get("postaKodu") || "").trim(),
            vadeGun: Number(fd.get("vadeGun") || 0),
            limit: Number(fd.get("limit") || 0),
            riskLimiti: Number(fd.get("riskLimiti") || 0),
            notlar: String(fd.get("notlar") || "").trim(),
            grup: String(fd.get("grup") || "Genel").trim() || "Genel",
            aktif: true
        };
    }

    function musteriPanelRenderAdim(adim) {
        const form =
            document.getElementById("musteriForm");

        if (!form) {
            return;
        }

        const adimlar =
            form.querySelectorAll("[data-musteri-adim]");

        adimlar.forEach(el => {
            el.style.display =
                String(el.dataset.musteriAdim) ===
                    String(adim)
                    ? ""
                    : "none";
        });

        form.querySelectorAll(
            "[data-musteri-step]"
        ).forEach(btn => {
            btn.classList.toggle(
                "active",
                Number(btn.dataset.musteriStep) === adim
            );
        });

        const geri =
            document.getElementById("musteriGeri");

        const ileri =
            document.getElementById("musteriIleri");

        const kaydet =
            document.getElementById("musteriKaydet");

        if (geri) {
            geri.style.display =
                adim > 1 ? "" : "none";
        }

        if (ileri) {
            ileri.style.display =
                adim < 3 ? "" : "none";
        }

        if (kaydet) {
            kaydet.style.display =
                adim === 3 ? "" : "none";
        }

        musteriFormAdim = adim;
    }

    function yeniMusteriPaneli() {

        musteriPanelKapat();

        const overlay = document.createElement("div");

        overlay.id = "musteriFormOverlay";
        overlay.className = "erp-modal-overlay";

        overlay.innerHTML = `
            <div
                class="erp-modal"
                style="
                    max-width:980px;
                    width:96%;
                "
            >

                <div class="erp-modal-header">

                    <div>
                        <h2>Yeni Müşteri</h2>
                        <p>
                            Müşteri kartı bilgilerini girin.
                        </p>
                    </div>

                    <button
                        type="button"
                        class="erp-modal-close"
                        id="musteriFormKapat"
                    >
                        ×
                    </button>

                </div>

                <form id="musteriForm">

                    <div style="display:flex;gap:8px;margin-bottom:14px"><button type="button" class="erp-small-button" data-musteri-step="1">1. Temel</button><button type="button" class="erp-small-button" data-musteri-step="2">2. Vergi / Adres</button><button type="button" class="erp-small-button" data-musteri-step="3">3. Ticari</button></div>

                    <div class="dashboard-panel" data-musteri-adim="1">

                        <div class="panel-heading">
                            <div>
                                <h3>Temel Bilgiler</h3>
                                <p>
                                    Müşterinin temel kart bilgileri.
                                </p>
                            </div>
                        </div>

                        <div class="erp-form-grid">

                            <label>
                                Müşteri Kodu
                                <input
                                    name="kod"
                                    required
                                    maxlength="50"
                                    placeholder="Örn. M0003"
                                >
                            </label>

                            <label>
                                Müşteri Adı
                                <input
                                    name="adSoyad"
                                    maxlength="150"
                                    placeholder="Ad Soyad"
                                >
                            </label>

                            <label>
                                Ünvan
                                <input
                                    name="unvan"
                                    maxlength="200"
                                    placeholder="Firma / Ünvan"
                                >
                            </label>

                            <label>
                                Yetkili
                                <input
                                    name="yetkili"
                                    maxlength="150"
                                    placeholder="Yetkili kişi"
                                >
                            </label>

                        </div>

                    </div>

                    <div class="dashboard-panel" data-musteri-adim="1">

                        <div class="panel-heading">
                            <div>
                                <h3>letişim</h3>
                                <p>
                                    Telefon, WhatsApp ve e-posta bilgileri.
                                </p>
                            </div>
                        </div>

                        <div class="erp-form-grid">

                            <label>
                                Telefon
                                <input
                                    name="telefon"
                                    type="tel"
                                    placeholder="Telefon"
                                >
                            </label>

                            <label>
                                WhatsApp
                                <input
                                    name="whatsapp"
                                    type="tel"
                                    placeholder="WhatsApp"
                                >
                            </label>

                            <label class="full">
                                E-posta
                                <input
                                    name="email"
                                    type="email"
                                    placeholder="ornek@firma.com"
                                >
                            </label>

                        </div>

                    </div>

                    <div class="dashboard-panel" data-musteri-adim="2">

                        <div class="panel-heading">
                            <div>
                                <h3>Vergi Bilgileri</h3>
                                <p>
                                    Vergi bilgilerini girin.
                                </p>
                            </div>
                        </div>

                        <div class="erp-form-grid">

                            <label>
                                Vergi Dairesi
                                <input
                                    name="vergiDairesi"
                                    placeholder="Vergi dairesi"
                                >
                            </label>

                            <label>
                                Vergi Numarası
                                <input
                                    name="vergiNo"
                                    placeholder="Vergi numarası"
                                >
                            </label>

                        </div>

                    </div>

                    <div class="dashboard-panel" data-musteri-adim="2">

                        <div class="panel-heading">
                            <div>
                                <h3>Adres</h3>
                                <p>
                                    Müşteri adres bilgileri.
                                </p>
                            </div>
                        </div>

                        <div class="erp-form-grid">

                            <label class="full">
                                Adres
                                <textarea
                                    name="adres"
                                    rows="3"
                                    placeholder="Açık adres"
                                ></textarea>
                            </label>

                            <label>
                                l
                                <input
                                    name="il"
                                    placeholder="l"
                                >
                            </label>

                            <label>
                                lçe
                                <input
                                    name="ilce"
                                    placeholder="lçe"
                                >
                            </label>

                            <label>
                                Posta Kodu
                                <input
                                    name="postaKodu"
                                    placeholder="Posta kodu"
                                >
                            </label>

                        </div>

                    </div>

                    <div class="dashboard-panel" data-musteri-adim="3">

                        <div class="panel-heading">
                            <div>
                                <h3>Ticari Bilgiler</h3>
                                <p>
                                    Vade ve risk bilgileri.
                                </p>
                            </div>
                        </div>

                        <div class="erp-form-grid">

                            <label>
                                Vade (Gün)
                                <input
                                    name="vadeGun"
                                    type="number"
                                    min="0"
                                    step="1"
                                    value="0"
                                >
                            </label>

                            <label>
                                Limit
                                <input
                                    name="limit"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value="0"
                                >
                            </label>

                            <label>
                                Risk Limiti
                                <input
                                    name="riskLimiti"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value="0"
                                >
                            </label>

                            <label>
                                Müşteri Grubu
                                <input name="grup" value="Genel" placeholder="Genel, VIP, Bayi...">
                            </label>

                            <label class="full">
                                Notlar
                                <textarea
                                    name="notlar"
                                    rows="4"
                                    placeholder="Müşteri hakkında notlar"
                                ></textarea>
                            </label>

                            <label class="full">
                                Müşteri Fotoğrafı
                                <input name="fotografDosya" type="file" accept="image/*" capture="environment">
                                <small>Telefonda kamerayı açar; fotoğraf otomatik olarak optimize edilir.</small>
                            </label>

                        </div>

                    </div>

                    <div
                        id="musteriFormMesaj"
                        style="margin-top:15px;"
                    ></div>

                    <div class="erp-modal-footer">

                        <button
                            type="button"
                            id="musteriFormKapatAlt"
                            class="erp-small-button secondary"
                        >
                            Vazgeç
                        </button>

                        <button type="button" id="musteriGeri" class="erp-small-button secondary">Geri</button>
                        <button type="button" id="musteriIleri" class="erp-primary-button">İleri</button>

                        <button
                            type="submit"
                            id="musteriKaydet"
                            class="erp-primary-button"
                        >
                            Kaydet
                        </button>

                    </div>

                </form>

            </div>
        `;

        document.body.appendChild(overlay);

        const form =
            document.getElementById("musteriForm");

        const kapat = () => {
            overlay.remove();
        };

        document
            .getElementById("musteriFormKapat")
            ?.addEventListener(
                "click",
                kapat
            );

        document
            .getElementById("musteriFormKapatAlt")
            ?.addEventListener(
                "click",
                kapat
            );

        form.addEventListener(
            "submit",
            async event => {

                event.preventDefault();

                const veri = musteriFormVerisi(form);

                const mesaj =
                    document.getElementById(
                        "musteriFormMesaj"
                    );

                const dosya = form.elements.fotografDosya?.files?.[0];
                try {
                    if (dosya) {
                        veri.fotograf = await musteriFotografHazirla(dosya);
                    }
                    mesaj.innerHTML = "<div class=\"dashboard-loading\">Müşteri kaydediliyor ve doğrulanıyor...</div>";
                    const olusan = await api("/api/tenant/musteriler", {
                        method: "POST",
                        body: JSON.stringify(veri)
                    });
                    const musteri = olusan.musteri;
                    const dogrulama = await api(`/api/tenant/musteriler/${encodeURIComponent(musteri._id)}`);
                    if (!dogrulama.musteri || dogrulama.musteri.kod !== musteri.kod) {
                        throw new Error("Kayıt oluşturuldu ancak MongoDB doğrulaması başarısız oldu.");
                    }
                    kapat();
                    await musteriAnaSayfaAc(musteri._id);
                } catch (error) {
                    mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
                }
            }
        );
        musteriFormAdim = 1;
        musteriPanelRenderAdim(1);
        document.getElementById("musteriGeri")?.addEventListener("click", () => musteriPanelRenderAdim(Math.max(1, musteriFormAdim - 1)));
        document.getElementById("musteriIleri")?.addEventListener("click", () => {
            const gorunen = [...form.querySelectorAll(`[data-musteri-adim="${musteriFormAdim}"] input[required]`)];
            if (!gorunen.every(x => x.reportValidity())) return;
            musteriPanelRenderAdim(Math.min(3, musteriFormAdim + 1));
        });
        form.querySelectorAll("[data-musteri-step]").forEach(btn => btn.addEventListener("click", () => musteriPanelRenderAdim(Number(btn.dataset.musteriStep))));
    }
    function musteriFormRenderAdimGecerli() {
        musteriPanelRenderAdim(
            musteriFormAdim || 1
        );
    }

    function musteriModalKapat() {
        document.getElementById("musteriIslemOverlay")?.remove();
    }

    async function musteriTahsilatFormu(musteri) {
        const finans = await api("/api/tenant/finans/ozet");
        const hesaplar = [
            ...(finans.kasalar || []).map(x => ({ ...x, tip: "KASA", adGoster: x.ad })),
            ...(finans.bankalar || []).map(x => ({ ...x, tip: "BANKA", adGoster: x.bankaAdi }))
        ].filter(x => x.aktif !== false);
        musteriModalKapat();
        const overlay = document.createElement("div");
        overlay.id = "musteriIslemOverlay";
        overlay.className = "erp-modal-overlay";
        overlay.innerHTML = `<div class="erp-modal" style="max-width:680px;width:95%">
            <div class="erp-modal-header"><div><h2>Tahsilat Yap</h2><p>${escapeHtml(musteri.kod)} · ${escapeHtml(musteri.unvan || musteri.adSoyad)}</p></div><button class="erp-modal-close" type="button">×</button></div>
            <form id="musteriTahsilatForm"><div class="erp-form-grid">
                <label>Tutar<input name="tutar" type="number" min="0.01" max="${Number(musteri.bakiye || 0)}" step="0.01" required></label>
                <label>Tarih<input name="tarih" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label>
                <label class="full">Kasa / Banka<select name="hesap" required><option value="">Hesap seçin</option>${hesaplar.map(x => `<option value="${x.tip}|${x._id}">${x.tip} · ${escapeHtml(x.kod || "")} ${escapeHtml(x.adGoster || "")} (${para(x.bakiye)})</option>`).join("")}</select></label>
                <label class="full">Açıklama<textarea name="aciklama">Müşteri tahsilatı</textarea></label>
            </div><div id="tahsilatMesaj"></div><div class="erp-modal-footer"><button type="button" class="erp-small-button secondary" data-kapat>Vazgeç</button><button class="erp-primary-button" type="submit">Kaydet</button></div></form></div>`;
        document.body.appendChild(overlay);
        overlay.querySelectorAll(".erp-modal-close,[data-kapat]").forEach(x => x.addEventListener("click", musteriModalKapat));
        overlay.querySelector("form").addEventListener("submit", async event => {
            event.preventDefault();
            const fd = new FormData(event.currentTarget);
            const [hesapTipi, hesapId] = String(fd.get("hesap")).split("|");
            const mesaj = document.getElementById("tahsilatMesaj");
            try {
                const oncekiBakiye = Number(musteri.bakiye || 0);
                const sonuc = await api("/api/tenant/cari/musteri/tahsilat", { method: "POST", body: JSON.stringify({ musteriId: musteri._id, tutar: Number(fd.get("tutar")), tarih: fd.get("tarih"), hesapTipi, hesapId, aciklama: fd.get("aciklama") }) });
                const kontrol = await api(`/api/tenant/musteriler/${encodeURIComponent(musteri._id)}`);
                if (Number(kontrol.musteri.bakiye) !== Number(sonuc.musteriBakiye) || Number(kontrol.musteri.bakiye) >= oncekiBakiye) throw new Error("Tahsilat sonrası bakiye doğrulanamadı.");
                musteriModalKapat();
                await musteriAnaSayfaAc(musteri._id);
            } catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; }
        });
    }

    async function musteriBelgeFormu(tur, musteri, mevcut = null, baslangicKalemleri = []) {
        const [urunData, stokData, finansData] = await Promise.all([api("/api/tenant/urunler"), api("/api/tenant/stok/depolar"), tur === "satis" ? api("/api/tenant/finans/ozet") : Promise.resolve({})]);
        const urunler = (urunData.urunler || []).filter(x => x.aktif !== false);
        const depolar = (stokData.depolar || []).filter(x => x.aktif !== false);
        const satisHesaplari = [
            ...(finansData.kasalar || []).filter(x => x.aktif !== false).map(x => ({ id: x._id, tip: "KASA", ad: `${x.kod || ""} ${x.ad || "Kasa"}` })),
            ...(finansData.bankalar || []).filter(x => x.aktif !== false).map(x => ({ id: x._id, tip: "BANKA", ad: `${x.kod || ""} ${x.bankaAdi || "Banka"}` }))
        ];
        const ayar = {
            satis: { baslik: "Satış Yap", no: "Belge No", endpoint: "/api/tenant/satis", noAlan: "belgeNo", depo: true },
            iade: { baslik: "İade Al", no: "İade Belge No", endpoint: "/api/tenant/satis/iade", noAlan: "belgeNo", depo: true },
            teklif: { baslik: "Teklif Hazırla", no: "Teklif No", endpoint: "/api/tenant/teklifler", noAlan: "teklifNo", depo: false },
            siparis: { baslik: "Sipariş Oluştur", no: "Sipariş No", endpoint: "/api/tenant/siparisler", noAlan: "siparisNo", depo: true }
        }[tur];
        if (!urunler.length) throw new Error("İşlem için aktif ürün bulunamadı.");
        if (ayar.depo && !depolar.length) throw new Error("İşlem için aktif depo bulunamadı.");
        const no = mevcut?.belgeNo || mevcut?.teklifNo || mevcut?.siparisNo || `${tur === "satis" ? "SAT" : tur === "iade" ? "IADE" : tur === "teklif" ? "TEK" : "SIP"}-${Date.now()}`;
        musteriModalKapat();
        const overlay = document.createElement("div");
        overlay.id = "musteriIslemOverlay"; overlay.className = "erp-modal-overlay";
        const urunOptions = urunler.map(x => `<option value="${x._id}" data-fiyat="${Number(x.satisFiyati || 0)}" data-kdv="${Number(x.kdv ?? 20)}">${escapeHtml(x.kod)} · ${escapeHtml(x.ad)}</option>`).join("");
        const satirHtml = (k = {}) => { const uid = String(k.urunId?._id || k.urunId || ""); const opts = urunler.map(x => `<option value="${x._id}" data-fiyat="${Number(x.satisFiyati || 0)}" data-kdv="${Number(x.kdv ?? 20)}" ${String(x._id) === uid ? "selected" : ""}>${escapeHtml(x.kod)} · ${escapeHtml(x.ad)}</option>`).join(""); return `<tr class="belge-kalem"><td><select name="urunId" required style="min-width:220px"><option value="">Ürün seçin</option>${opts}</select></td><td><input name="miktar" type="number" min="0.0001" step="0.0001" value="${Number(k.miktar || 1)}" required style="width:90px"></td><td><input name="birimFiyat" type="number" min="0" step="0.01" value="${k.birimFiyat ?? ""}" required style="width:110px"></td><td><input name="kdv" type="number" min="0" step="0.01" value="${Number(k.kdv ?? 20)}" style="width:75px"></td><td><input name="iskonto" type="number" min="0" max="100" step="0.01" value="${Number(k.iskonto || 0)}" style="width:75px"></td><td><button type="button" class="erp-small-button secondary kalem-sil">Sil</button></td></tr>`; };
        const ilkSatirlar = mevcut?.kalemler?.length ? mevcut.kalemler.map(satirHtml).join("") : baslangicKalemleri.length ? baslangicKalemleri.map(satirHtml).join("") : satirHtml();
        const belgeTarihi = new Date(mevcut?.tarih || Date.now()).toISOString().slice(0, 10);
        const odemeHtml = tur === "satis" && !mevcut ? `<div class="sales-payment-box"><div><span>Belge Toplamı</span><strong id="salesDocumentTotal">₺0,00</strong></div><label>Ödeme Yöntemi<select name="odemeTipi"><option value="ACIK_HESAP">Açık Hesap</option><option value="NAKIT">Nakit</option><option value="KART">Kredi Kartı</option><option value="CEK">Çek</option><option value="SENET">Senet</option></select></label><label data-sales-account hidden>Kasa / Banka<select name="hesap"><option value="">Hesap seçin</option>${satisHesaplari.map(x => `<option value="${x.tip}|${x.id}" data-hesap-tipi="${x.tip}">${escapeHtml(x.tip)} · ${escapeHtml(x.ad)}</option>`).join("")}</select></label></div>` : "";
        overlay.innerHTML = `<div class="erp-modal" style="max-width:1100px;width:98%"><div class="erp-modal-header"><div><h2>${mevcut ? `${ayar.baslik} - Düzenle` : ayar.baslik}</h2><p>${escapeHtml(musteri.kod)} · ${escapeHtml(musteri.unvan || musteri.adSoyad)} · Bakiye ${para(musteri.bakiye)}</p></div><button type="button" class="erp-modal-close">×</button></div><form id="musteriBelgeForm"><div class="erp-form-grid"><label>${ayar.no}<input name="no" value="${escapeHtml(no)}" required></label><label>Tarih<input name="tarih" type="date" value="${belgeTarihi}" required></label>${ayar.depo ? `<label class="full">Depo<select name="depoId" required><option value="">Depo seçin</option>${depolar.map(x => `<option value="${x._id}" ${String(x._id) === String(mevcut?.depoId?._id || mevcut?.depoId || "") ? "selected" : ""}>${escapeHtml(x.kod)} · ${escapeHtml(x.ad)}</option>`).join("")}</select></label>` : `<label>Geçerlilik Tarihi<input name="gecerlilikTarihi" type="date" value="${mevcut?.gecerlilikTarihi ? new Date(mevcut.gecerlilikTarihi).toISOString().slice(0, 10) : ""}"></label>`}</div><div class="panel-heading" style="margin-top:16px"><div><h3>Belge Kalemleri</h3><p>Ürünleri aynı tabloya satır olarak ekleyin.</p></div><button type="button" id="kalemEkle" class="erp-primary-button">+ Kalem Ekle</button></div><div class="table-scroll"><table><thead><tr><th>Ürün</th><th>Miktar</th><th>Birim Fiyat</th><th>KDV %</th><th>İskonto %</th><th></th></tr></thead><tbody id="belgeKalemler">${ilkSatirlar}</tbody></table></div>${odemeHtml}<label style="display:block;margin-top:12px">Notlar<textarea name="notlar" style="width:100%">${escapeHtml(mevcut?.notlar || "")}</textarea></label><div id="belgeMesaj"></div><div class="erp-modal-footer"><button type="button" class="erp-small-button secondary" data-kapat>Vazgeç</button><button type="submit" class="erp-primary-button">${mevcut ? "Değişiklikleri Kaydet" : tur === "iade" ? "İadeyi Kaydet" : "Kaydet"}</button></div></form></div>`;
        document.body.appendChild(overlay);
        const kalemlerEl = document.getElementById("belgeKalemler");
        const belgeToplami = () => [...kalemlerEl.querySelectorAll(".belge-kalem")].reduce((n, x) => { const miktar = Number(x.querySelector("[name=miktar]").value || 0), fiyat = Number(x.querySelector("[name=birimFiyat]").value || 0), kdv = Number(x.querySelector("[name=kdv]").value || 0), iskonto = Number(x.querySelector("[name=iskonto]").value || 0); return n + miktar * fiyat * (1 - iskonto / 100) * (1 + kdv / 100); }, 0);
        const toplamGuncelle = () => { const el = overlay.querySelector("#salesDocumentTotal"); if (el) el.textContent = para(belgeToplami()); };
        const bagla = root => {
            root.querySelector("select[name=urunId]").addEventListener("change", e => {
                const opt = e.target.selectedOptions[0]; root.querySelector("input[name=birimFiyat]").value = opt?.dataset.fiyat || 0; root.querySelector("input[name=kdv]").value = opt?.dataset.kdv || 20; toplamGuncelle();
            });
            root.querySelectorAll("input").forEach(x => x.addEventListener("input", toplamGuncelle));
            root.querySelector(".kalem-sil").addEventListener("click", () => { if (kalemlerEl.children.length > 1) { root.remove(); toplamGuncelle(); } });
        };
        [...kalemlerEl.children].forEach(bagla);
        overlay.querySelector("#kalemEkle").addEventListener("click", event => {
            event.preventDefault(); event.stopPropagation();
            kalemlerEl.insertAdjacentHTML("beforeend", satirHtml());
            bagla(kalemlerEl.lastElementChild);
            kalemlerEl.lastElementChild.querySelector("select")?.focus();
        });
        overlay.querySelectorAll(".erp-modal-close,[data-kapat]").forEach(x => x.addEventListener("click", musteriModalKapat));
        if (tur === "satis" && !mevcut) {
            const form = overlay.querySelector("form"), tip = form.elements.odemeTipi, account = overlay.querySelector("[data-sales-account]");
            const odemeGuncelle = () => { const hesapGerekli = ["NAKIT", "KART"].includes(tip.value); account.hidden = !hesapGerekli; form.elements.hesap.required = hesapGerekli; if (!hesapGerekli) form.elements.hesap.value = ""; [...form.elements.hesap.options].forEach(o => { if (!o.value) return; o.hidden = tip.value === "NAKIT" ? o.dataset.hesapTipi !== "KASA" : o.dataset.hesapTipi !== "BANKA"; }); };
            tip.onchange = odemeGuncelle; odemeGuncelle(); toplamGuncelle();
        }
        overlay.querySelector("form").addEventListener("submit", async event => {
            event.preventDefault(); const fd = new FormData(event.currentTarget); const mesaj = document.getElementById("belgeMesaj");
            const kalemler = [...kalemlerEl.querySelectorAll(".belge-kalem")].map(x => ({ urunId: x.querySelector("[name=urunId]").value, miktar: Number(x.querySelector("[name=miktar]").value), birimFiyat: Number(x.querySelector("[name=birimFiyat]").value), kdv: Number(x.querySelector("[name=kdv]").value), iskonto: Number(x.querySelector("[name=iskonto]").value) }));
            const body = { musteriId: musteri._id, tarih: fd.get("tarih"), depoId: fd.get("depoId") || undefined, gecerlilikTarihi: fd.get("gecerlilikTarihi") || undefined, notlar: fd.get("notlar"), kalemler }; body[ayar.noAlan] = fd.get("no");
            if (tur === "satis" && !mevcut) { const [hesapTipi, hesapId] = String(fd.get("hesap") || "|").split("|"); Object.assign(body, { odemeTipi: fd.get("odemeTipi"), hesapTipi: hesapTipi || null, hesapId: hesapId || null }); }
            try { const endpoint = mevcut ? `${ayar.endpoint}/${encodeURIComponent(mevcut._id)}` : ayar.endpoint; await api(endpoint, { method: mevcut ? "PATCH" : "POST", body: JSON.stringify(body) }); musteriModalKapat(); await musteriAnaSayfaAc(musteri._id); }
            catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; }
        });
    }

    async function musteriBelgeMerkeziAc(tur, belge, musteri) {
        let belgeTercihi = {};
        try { belgeTercihi = (await api("/api/tenant/ayarlar")).ayarlar?.belgeAyari || {}; } catch (_) { belgeTercihi = {}; }
        const turler = {
            SATIS: "Satış Faturası", TAHSILAT: "Tahsilat Makbuzu", SIPARIS: "Sipariş Makbuzu",
            IADE: "Satış İade Belgesi", TESELLUM: "Açık Hesap Tesellüm Makbuzu"
            , TEKLIF: "Teklif Formu"
        };
        const baslik = turler[tur] || "Müşteri Belgesi";
        const no = belge.belgeNo || belge.siparisNo || belge.teklifNo || String(belge._id || "").slice(-8).toUpperCase();
        const tarihText = new Date(belge.tarih || belge.createdAt || Date.now()).toLocaleDateString("tr-TR");
        const kalemler = Array.isArray(belge.kalemler) ? belge.kalemler : [];
        const toplam = Number(belge.genelToplam || belge.tutar || 0);
        const satirlar = kalemler.length ? kalemler.map((x, i) => ({
            sira: i + 1, kod: x.urunId?.kod || "-", urun: x.urunId?.ad || "Ürün",
            miktar: Number(x.miktar || 0), birim: x.urunId?.birim || "ADET", fiyat: Number(x.birimFiyat || 0),
            kdv: Number(x.kdv || 0), iskonto: Number(x.iskonto || 0), toplam: Number(x.toplam || 0)
        })) : [{ sira: 1, kod: belge.kaynak || tur, urun: belge.aciklama || baslik, miktar: 1, birim: "İŞLEM", fiyat: toplam, kdv: 0, iskonto: 0, toplam }];
        musteriModalKapat();
        const overlay = document.createElement("div"); overlay.id = "musteriIslemOverlay"; overlay.className = "erp-modal-overlay";
        overlay.innerHTML = `<div class="invoice-preview-shell"><div class="invoice-toolbar"><div><strong>${baslik}</strong><span>${escapeHtml(no)}</span></div><div class="invoice-toolbar-actions"><button id="belgePdf" class="erp-primary-button">PDF / Yazdır</button><button id="belgeExcel" class="erp-small-button">Excel İndir</button><button id="belgeEposta" class="erp-small-button">E-posta</button><button id="belgeWhatsapp" class="erp-small-button">WhatsApp</button><button class="erp-small-button erp-modal-close">Kapat</button></div></div><div id="musteriBelgeSayfa" class="invoice-page"><div class="invoice-header"><div><div class="invoice-brand">BENİMMUHASEBE</div><div class="invoice-subtitle">${baslik}</div></div><div class="invoice-meta"><div><span>Belge No</span><strong>${escapeHtml(no)}</strong></div><div><span>Tarih</span><strong>${tarihText}</strong></div></div></div><div class="invoice-parties"><div class="invoice-party"><span>MÜŞTERİ</span><strong>${escapeHtml(musteri.unvan || musteri.adSoyad || "-")}</strong><small>Kod: ${escapeHtml(musteri.kod || "-")}</small><small>Tel: ${escapeHtml(musteri.telefon || musteri.whatsapp || "-")}</small><small>E-posta: ${escapeHtml(musteri.email || "-")}</small></div><div class="invoice-party"><span>BELGE TOPLAMI</span><strong>${para(toplam)}</strong><small>${tur === "TESELLUM" ? "Açık hesap teslim belgesidir" : escapeHtml(belge.durum || belge.tip || "")}</small></div></div><div class="invoice-table-wrap"><table class="invoice-table"><thead><tr><th>#</th><th>Kod</th><th>Ürün / Açıklama</th><th>Miktar</th><th>Birim Fiyat</th><th>KDV</th><th>İskonto</th><th>Toplam</th></tr></thead><tbody>${satirlar.map(x => `<tr><td>${x.sira}</td><td>${escapeHtml(x.kod)}</td><td>${escapeHtml(x.urun)}</td><td>${x.miktar} ${escapeHtml(x.birim)}</td><td>${para(x.fiyat)}</td><td>%${x.kdv}</td><td>%${x.iskonto}</td><td><strong>${para(x.toplam)}</strong></td></tr>`).join("")}</tbody></table></div><div class="invoice-bottom"><div class="invoice-notes"><strong>Açıklama</strong><p>${escapeHtml(belge.notlar || belge.aciklama || "Belge elektronik ortamda hazırlanmıştır.")}</p>${tur === "TESELLUM" ? "<p>Teslim eden / Teslim alan imza alanı</p>" : ""}</div><div class="invoice-totals"><div><span>Genel Toplam</span><strong>${para(toplam)}</strong></div></div></div></div></div>`;
        const belgeSayfasi = overlay.querySelector("#musteriBelgeSayfa");
        const sablon = tur === "TESELLUM" ? belgeTercihi.irsaliyeSablonu : belgeTercihi.faturaSablonu;
        belgeSayfasi.classList.add(`invoice-template-${sablon || "modern"}`);
        belgeSayfasi.style.setProperty("--invoice-primary", belgeTercihi.anaRenk || "#2563eb");
        belgeSayfasi.style.setProperty("--invoice-accent", belgeTercihi.vurguRengi || "#0f172a");
        const marka = belgeSayfasi.querySelector(".invoice-brand");
        if (belgeTercihi.logo) marka.innerHTML = `<img src="${escapeHtml(belgeTercihi.logo)}" alt="Firma logosu" class="invoice-logo">`;
        else if (belgeTercihi.belgeBasligi) marka.textContent = belgeTercihi.belgeBasligi;
        const not = belgeSayfasi.querySelector(".invoice-notes p");
        if (not && !belge.notlar && !belge.aciklama && belgeTercihi.dipnot) not.textContent = belgeTercihi.dipnot;
        document.body.appendChild(overlay); overlay.querySelector(".erp-modal-close").addEventListener("click", musteriModalKapat);
        const metin = `${baslik}\nBelge No: ${no}\nTarih: ${tarihText}\nTutar: ${para(toplam)}\nMüşteri: ${musteri.unvan || musteri.adSoyad || musteri.kod}`;
        document.getElementById("belgePdf").addEventListener("click", () => {
            const pencere = window.open("", "_blank"); if (!pencere) return alert("Yazdırma penceresi açılamadı.");
            pencere.document.write(`<!doctype html><html><head><title>${escapeHtml(no)}</title><link rel="stylesheet" href="/erp/erp.css"></head><body>${document.getElementById("musteriBelgeSayfa").outerHTML}</body></html>`); pencere.document.close(); pencere.onload = () => { pencere.focus(); pencere.print(); };
        });
        document.getElementById("belgeExcel").addEventListener("click", () => {
            if (!window.XLSX) return alert("Excel kitaplığı yüklenemedi.");
            const ws = XLSX.utils.json_to_sheet(satirlar.map(x => ({ "Belge Türü": baslik, "Belge No": no, Tarih: tarihText, "Müşteri Kodu": musteri.kod, Müşteri: musteri.unvan || musteri.adSoyad, "Ürün Kodu": x.kod, "Ürün/Açıklama": x.urun, Miktar: x.miktar, Birim: x.birim, "Birim Fiyat": x.fiyat, "KDV %": x.kdv, "İskonto %": x.iskonto, Toplam: x.toplam })));
            ws["!cols"] = [{ wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 16 }, { wch: 28 }, { wch: 16 }, { wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 14 }]; const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Belge"); XLSX.writeFile(wb, `${baslik.replaceAll(" ", "-")}-${no}.xlsx`);
        });
        document.getElementById("belgeEposta").addEventListener("click", () => {
            if (!musteri.email) return alert("Müşterinin e-posta adresi yok.");
            window.location.href = `mailto:${encodeURIComponent(musteri.email)}?subject=${encodeURIComponent(`${baslik} - ${no}`)}&body=${encodeURIComponent(`${metin}\n\nPDF veya Excel dosyasını bu e-postaya ekleyebilirsiniz.`)}`;
        });
        document.getElementById("belgeWhatsapp").addEventListener("click", () => {
            let tel = String(musteri.whatsapp || musteri.telefon || "").replace(/\D/g, ""); if (!tel) return alert("Müşterinin WhatsApp numarası yok."); if (tel.startsWith("0")) tel = `90${tel.slice(1)}`;
            window.open(`https://wa.me/${tel}?text=${encodeURIComponent(`${metin}\n\nPDF veya Excel belgesi ayrıca eklenebilir.`)}`, "_blank", "noopener");
        });
    }

    async function musteriAnaSayfaAc(id) {

        setTitle("Müşteri");
        loading();

        try {

            const guvenliApi = async (url) => {
                try {
                    return await api(url);
                } catch {
                    return null;
                }
            };

            const [
                detayData,
                listeData,
                cariData,
                satisData,
                teklifData,
                siparisData,
                iadeData
            ] = await Promise.all([
                api(`/api/tenant/musteriler/${encodeURIComponent(id)}`),
                api("/api/tenant/musteriler"),
                guvenliApi(`/api/tenant/cari/hareketler?tarafTipi=MUSTERI&tarafId=${encodeURIComponent(id)}`),
                guvenliApi("/api/tenant/satis"),
                guvenliApi("/api/tenant/teklifler"),
                guvenliApi("/api/tenant/siparisler"),
                guvenliApi("/api/tenant/satis/iade")
            ]);

            const m =
                detayData.musteri ||
                detayData.data ||
                detayData;

            const musteriler = listeData.musteriler || [];

            const index = musteriler.findIndex(
                x => String(x._id) === String(id)
            );

            const onceki =
                index > 0
                    ? musteriler[index - 1]
                    : null;

            const sonraki =
                index >= 0 && index < musteriler.length - 1
                    ? musteriler[index + 1]
                    : null;

            const hareketler =
                cariData?.hareketler ||
                cariData?.cariHareketler ||
                cariData?.kayitlar ||
                [];

            const tumSatislar =
                satisData?.satislar ||
                satisData?.kayitlar ||
                [];

            const tumTeklifler =
                teklifData?.teklifler ||
                teklifData?.kayitlar ||
                [];

            const tumSiparisler =
                siparisData?.siparisler ||
                siparisData?.kayitlar ||
                [];

            const musteriEslesir = x => {

                const mid =
                    x?.musteriId?._id ||
                    x?.musteriId ||
                    x?.musteri?._id ||
                    x?.musteri;

                return String(mid || "") === String(id);
            };

            const satislar =
                tumSatislar.filter(musteriEslesir);

            const teklifler =
                tumTeklifler.filter(musteriEslesir);

            const siparisler =
                tumSiparisler.filter(musteriEslesir);
            const iadeler = (iadeData?.iadeler || []).filter(musteriEslesir);

            const ad =
                m.unvan ||
                m.adSoyad ||
                "Müşteri";

            const bakiye = Number(m.bakiye || 0);
            const risk = Number(m.riskLimiti || m.limit || 0);

            const toplamSatis =
                satislar.reduce(
                    (t, x) =>
                        t + Number(
                            x.genelToplam ||
                            x.toplam ||
                            x.tutar ||
                            0
                        ),
                    0
                );

            const simdi = new Date();
            const satisTutari = x => Number(x.genelToplam || x.toplam || x.tutar || 0);
            const satisTarihi = x => new Date(x.tarih || x.createdAt || 0);
            const aylikSatis = satislar.filter(x => {
                const d = satisTarihi(x);
                return d.getFullYear() === simdi.getFullYear() && d.getMonth() === simdi.getMonth();
            }).reduce((t, x) => t + satisTutari(x), 0);
            const yillikSatis = satislar.filter(x => satisTarihi(x).getFullYear() === simdi.getFullYear())
                .reduce((t, x) => t + satisTutari(x), 0);
            const kullanilabilirLimit = Math.max(0, risk - Math.max(0, bakiye));

            content.innerHTML = `

                <div class="dashboard-panel">

                    <div style="
                        display:flex;
                        justify-content:space-between;
                        align-items:center;
                        gap:15px;
                        flex-wrap:wrap;
                    ">

                        ${m.fotograf ? `<img src="${escapeHtml(m.fotograf)}" alt="${escapeHtml(ad)}" style="width:76px;height:76px;object-fit:cover;border-radius:50%;border:3px solid #e2e8f0">` : ""}
                        <div>
                            <div style="color:#64748b;font-size:13px;">
                                ${escapeHtml(m.kod || "-")}
                            </div>

                            <h2 style="margin:4px 0;">
                                ${escapeHtml(ad)}
                            </h2>

                            <div style="color:#64748b;">
                                ${escapeHtml(m.telefon || m.whatsapp || "-")}
                            </div>
                        </div>

                        <div style="display:flex;gap:8px;flex-wrap:wrap;">

                            <button
                                id="oncekiMusteri"
                                class="erp-small-button"
                                ${onceki ? "" : "disabled"}
                            >
                                ← Önceki
                            </button>

                            <button
                                id="musteriListe"
                                class="erp-small-button"
                            >
                                Müşteri Listesi
                            </button>

                            <button
                                id="sonrakiMusteri"
                                class="erp-small-button"
                                ${sonraki ? "" : "disabled"}
                            >
                                Sonraki →
                            </button>

                        </div>
                    </div>
                </div>


                <div class="dashboard-grid"
                    style="grid-template-columns:repeat(3,minmax(0,1fr));">

                    <div class="dashboard-card">
                        <div class="dashboard-card-title">Bakiye</div>
                        <div class="dashboard-card-value">${para(bakiye)}</div>
                        <div class="dashboard-card-info">Cari bakiye</div>
                    </div>

                    <div class="dashboard-card">
                        <div class="dashboard-card-title">Risk Limiti</div>
                        <div class="dashboard-card-value">${para(risk)}</div>
                        <div class="dashboard-card-info">Tanımlı limit</div>
                    </div>

                    <div class="dashboard-card positive">
                        <div class="dashboard-card-title">Kullanılabilir Limit</div>
                        <div class="dashboard-card-value">${para(kullanilabilirLimit)}</div>
                        <div class="dashboard-card-info">Risk limiti - bakiye</div>
                    </div>

                    <div class="dashboard-card positive">
                        <div class="dashboard-card-title">Aylık Satış</div>
                        <div class="dashboard-card-value">${para(aylikSatis)}</div>
                        <div class="dashboard-card-info">Bu ay</div>
                    </div>

                    <div class="dashboard-card positive">
                        <div class="dashboard-card-title">Yıllık Satış</div>
                        <div class="dashboard-card-value">${para(yillikSatis)}</div>
                        <div class="dashboard-card-info">Bu yıl</div>
                    </div>

                    <div class="dashboard-card positive">
                        <div class="dashboard-card-title">Toplam Satış</div>
                        <div class="dashboard-card-value">${para(toplamSatis)}</div>
                        <div class="dashboard-card-info">${satislar.length} belge</div>
                    </div>

                </div>


                <div class="dashboard-panel">

                    <div style="
                        display:flex;
                        flex-wrap:wrap;
                        gap:9px;
                    ">

                        <button data-mtab="ozet"
                            style="background:#2563eb;color:white;"
                            class="erp-small-button">
                            Özet
                        </button>

                        <button data-mtab="satis"
                            style="background:#16a34a;color:white;"
                            class="erp-small-button">
                            Satışlar
                        </button>

                        <button id="musteriSatisYap" style="background:#15803d;color:white;" class="erp-small-button">Satış Yap</button>
                        <button id="musteriIadeAl" style="background:#be123c;color:white;" class="erp-small-button">İade Al</button>

                        <button data-mtab="cari"
                            style="background:#7c3aed;color:white;"
                            class="erp-small-button">
                            Cari / Ekstre
                        </button>

                        <button data-mtab="tahsilat"
                            style="background:#0891b2;color:white;"
                            class="erp-small-button">
                            Tahsilat
                        </button>

                        <button id="musteriTahsilatYap" style="background:#0e7490;color:white;" class="erp-small-button">Tahsilat Yap</button>

                        <button data-mtab="teklif"
                            style="background:#ea580c;color:white;"
                            class="erp-small-button">
                            Teklifler
                        </button>

                        <button id="musteriTeklifHazirla" style="background:#c2410c;color:white;" class="erp-small-button">Teklif Hazırla</button>

                        <button data-mtab="siparis"
                            style="background:#ca8a04;color:white;"
                            class="erp-small-button">
                            Siparişler
                        </button>

                        <button id="musteriSiparisOlustur" style="background:#a16207;color:white;" class="erp-small-button">Sipariş Oluştur</button>

                        <button data-mtab="bilgi"
                            style="background:#475569;color:white;"
                            class="erp-small-button">
                            Bilgiler / Düzenle
                        </button>

                        <button data-mtab="belgeler" style="background:#0f766e;color:white;" class="erp-small-button">Belgeler / Dökümler</button>

                        <button id="musteriWhatsapp"
                            style="background:#22c55e;color:white;"
                            class="erp-small-button">
                            WhatsApp
                        </button>

                    </div>
                </div>

                <div id="musteriSekmePanel"></div>
            `;

            const panel =
                document.getElementById("musteriSekmePanel");

            const tarih = x => {
                const d = x?.tarih || x?.createdAt;
                return d
                    ? new Date(d).toLocaleDateString("tr-TR")
                    : "-";
            };

            const ozetRender = () => {

                panel.innerHTML = `
                    <div class="dashboard-panel">

                        <h2>Müşteri Özeti</h2>

                        <div style="
                            display:grid;
                            grid-template-columns:repeat(2,minmax(0,1fr));
                            gap:15px;
                        ">

                            <div><strong>Yetkili</strong><br>${escapeHtml(m.yetkili || "-")}</div>
                            <div><strong>Telefon</strong><br>${escapeHtml(m.telefon || "-")}</div>
                            <div><strong>WhatsApp</strong><br>${escapeHtml(m.whatsapp || "-")}</div>
                            <div><strong>E-posta</strong><br>${escapeHtml(m.email || "-")}</div>
                            <div><strong>Vergi Dairesi</strong><br>${escapeHtml(m.vergiDairesi || "-")}</div>
                            <div><strong>Vergi No</strong><br>${escapeHtml(m.vergiNo || "-")}</div>
                            <div><strong>Vade</strong><br>${Number(m.vadeGun || 0)} gün</div>
                            <div><strong>Aktif</strong><br>${m.aktif === false ? "Hayır" : "Evet"}</div>

                        </div>
                    </div>
                `;
            };


            const satisRender = () => {

                panel.innerHTML = `
                    <div class="dashboard-panel">

                        <div class="panel-heading">
                            <div>
                                <h2>Satışlar</h2>
                                <p>Müşterinin satış belgeleri</p>
                            </div>

                            <button
                                id="yeniSatisMusteri"
                                class="erp-primary-button">
                                + Satış Yap
                            </button>
                        </div>

                        <div class="table-scroll">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Tarih</th>
                                        <th>Belge</th>
                                        <th>Tutar</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    ${satislar.length
                        ? satislar.map(x => `
                                                <tr>
                                                    <td>${tarih(x)}</td>
                                                    <td>${escapeHtml(x.belgeNo || x.faturaNo || "-")}</td>
                                                    <td><strong>${para(Number(x.genelToplam || x.toplam || x.tutar || 0))}</strong></td>
                                                </tr>
                                            `).join("")
                        : `<tr><td colspan="3">Satış kaydı yok.</td></tr>`
                    }
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;

                document
                    .getElementById("yeniSatisMusteri")
                    ?.addEventListener("click", () => musteriBelgeFormu("satis", m).catch(error => alert(error.message)));
            };


            const cariRender = () => {

                panel.innerHTML = `
                    <div class="dashboard-panel">

                        <div class="panel-heading">

                            <div>
                                <h2>Cari / Ekstre</h2>
                                <p>Müşterinin cari hareketleri</p>
                            </div>

                            <button
                                id="tamEkstreMusteri"
                                class="erp-primary-button">
                                Ekstre Aç
                            </button>

                        </div>

                        <div class="table-scroll">
                            <table>

                                <thead>
                                    <tr>
                                        <th>Tarih</th>
                                        <th>şlem</th>
                                        <th>Açıklama</th>
                                        <th>Tutar</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    ${hareketler.length
                        ? hareketler.map(x => `
                                                <tr>
                                                    <td>${tarih(x)}</td>
                                                    <td>${escapeHtml(x.tip || x.islemTipi || "-")}</td>
                                                    <td>${escapeHtml(x.aciklama || x.belgeNo || "-")}</td>
                                                    <td><strong>${para(Number(x.tutar || 0))}</strong></td>
                                                </tr>
                                            `).join("")
                        : `<tr><td colspan="4">Cari hareket yok.</td></tr>`
                    }
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;

                document
                    .getElementById("tamEkstreMusteri")
                    ?.addEventListener(
                        "click",
                        () => cariEkstreAc("musteri", id)
                    );
            };


            const tahsilatRender = () => {

                panel.innerHTML = `
                    <div class="dashboard-panel">

                        <h2>Tahsilat</h2>

                        <p>
                            Güncel müşteri bakiyesi:
                            <strong>${para(bakiye)}</strong>
                        </p>

                        <button
                            id="tahsilatBaslat"
                            class="erp-primary-button">
                            Tahsilat Yap
                        </button>

                    </div>
                `;

                document
                    .getElementById("tahsilatBaslat")
                    ?.addEventListener("click", async () => {

                        await musteriTahsilatFormu(m);
                    });
            };


            const teklifRender = () => {

                panel.innerHTML = `
                    <div class="dashboard-panel">

                        <div class="panel-heading">

                            <div>
                                <h2>Teklifler</h2>
                                <p>Müşteriye verilen teklifler</p>
                            </div>

                            <button
                                id="yeniTeklifMusteri"
                                class="erp-primary-button">
                                + Yeni Teklif
                            </button>

                        </div>

                        <p>
                            Toplam teklif:
                            <strong>${teklifler.length}</strong>
                        </p>

                    </div>
                `;

                document
                    .getElementById("yeniTeklifMusteri")
                    ?.addEventListener("click", () => musteriBelgeFormu("teklif", m).catch(error => alert(error.message)));
            };


            const siparisRender = () => {

                panel.innerHTML = `
                    <div class="dashboard-panel">

                        <div class="panel-heading">

                            <div>
                                <h2>Siparişler</h2>
                                <p>Müşteri siparişleri</p>
                            </div>

                            <button
                                id="yeniSiparisMusteri"
                                class="erp-primary-button">
                                + Yeni Sipariş
                            </button>

                        </div>

                        <p>
                            Toplam sipariş:
                            <strong>${siparisler.length}</strong>
                        </p>

                    </div>
                `;

                document
                    .getElementById("yeniSiparisMusteri")
                    ?.addEventListener("click", () => musteriBelgeFormu("siparis", m).catch(error => alert(error.message)));
            };


            const bilgiRender = () => {

                panel.innerHTML = `
                    <div class="dashboard-panel">

                        <h2>Müşteri Bilgileri</h2>

                        <form id="musteriDuzenleForm">

                            <div style="
                                display:grid;
                                grid-template-columns:repeat(2,minmax(0,1fr));
                                gap:12px;
                            ">

                                <input name="kod" value="${escapeHtml(m.kod || "")}" placeholder="Müşteri Kodu">
                                <input name="adSoyad" value="${escapeHtml(m.adSoyad || "")}" placeholder="Müşteri Adı">
                                <input name="unvan" value="${escapeHtml(m.unvan || "")}" placeholder="Ünvan">
                                <input name="yetkili" value="${escapeHtml(m.yetkili || "")}" placeholder="Yetkili">
                                <input name="telefon" value="${escapeHtml(m.telefon || "")}" placeholder="Telefon">
                                <input name="whatsapp" value="${escapeHtml(m.whatsapp || "")}" placeholder="WhatsApp">
                                <input name="email" value="${escapeHtml(m.email || "")}" placeholder="E-posta">
                                <input name="vergiDairesi" value="${escapeHtml(m.vergiDairesi || "")}" placeholder="Vergi Dairesi">
                                <input name="vergiNo" value="${escapeHtml(m.vergiNo || "")}" placeholder="Vergi No">
                                <input name="vadeGun" type="number" value="${Number(m.vadeGun || 0)}" placeholder="Vade">
                                <input name="riskLimiti" type="number" value="${Number(m.riskLimiti || 0)}" placeholder="Risk Limiti">
                                <input name="limit" type="number" value="${Number(m.limit || 0)}" placeholder="Limit">
                                <input name="grup" value="${escapeHtml(m.grup || "Genel")}" placeholder="Müşteri Grubu">
                                <input name="il" value="${escapeHtml(m.il || "")}" placeholder="İl">
                                <input name="ilce" value="${escapeHtml(m.ilce || "")}" placeholder="İlçe">
                                <input name="postaKodu" value="${escapeHtml(m.postaKodu || "")}" placeholder="Posta Kodu">

                            </div>

                            <textarea
                                name="adres"
                                placeholder="Adres"
                                style="width:100%;box-sizing:border-box;margin-top:12px;"
                            >${escapeHtml(m.adres || "")}</textarea>

                            <label style="display:block;margin-top:12px">Müşteri Fotoğrafı / Kameradan Çek
                                <input name="fotografDosya" type="file" accept="image/*" capture="environment" style="display:block;margin-top:6px">
                            </label>

                            <button
                                type="submit"
                                class="erp-primary-button"
                                style="margin-top:12px;">
                                Kaydet
                            </button>

                        </form>
                    </div>
                `;

                document
                    .getElementById("musteriDuzenleForm")
                    ?.addEventListener("submit", async event => {

                        event.preventDefault();

                        const form =
                            new FormData(event.currentTarget);

                        const body =
                            Object.fromEntries(form.entries());

                        body.vadeGun =
                            Number(body.vadeGun || 0);

                        body.riskLimiti =
                            Number(body.riskLimiti || 0);
                        body.limit = Number(body.limit || 0);

                        const fotografDosya = event.currentTarget.elements.fotografDosya?.files?.[0];
                        delete body.fotografDosya;
                        if (fotografDosya) {
                            try { body.fotograf = await musteriFotografHazirla(fotografDosya); }
                            catch (error) { alert(error.message); return; }
                        }

                        const response = await fetch(
                            `/api/tenant/musteriler/${encodeURIComponent(id)}`,
                            {
                                method: "PATCH",
                                headers: {
                                    "Content-Type": "application/json",
                                    "Authorization": `Bearer ${token()}`
                                },
                                body: JSON.stringify(body)
                            }
                        );

                        const sonuc = await response.json();

                        if (!response.ok) {
                            alert(
                                sonuc.mesaj ||
                                "Müşteri güncellenemedi."
                            );
                            return;
                        }

                        alert("Müşteri kaydedildi.");

                        await musteriAnaSayfaAc(id);
                    });
            };

            const belgelerRender = () => {
                const belgeler = [
                    ...satislar.map(x => ({ tur: "SATIS", belge: x, etiket: "Satış Faturası", no: x.belgeNo })),
                    ...satislar.filter(x => x.odemeDurumu === "ACIK" || Number(x.kalanTutar || 0) > 0).map(x => ({ tur: "TESELLUM", belge: x, etiket: "Açık Hesap Tesellüm", no: x.belgeNo })),
                    ...siparisler.map(x => ({ tur: "SIPARIS", belge: x, etiket: "Sipariş Makbuzu", no: x.siparisNo })),
                    ...teklifler.map(x => ({ tur: "TEKLIF", belge: x, etiket: "Teklif", no: x.teklifNo })),
                    ...iadeler.map(x => ({ tur: "IADE", belge: x, etiket: "İade Belgesi", no: x.belgeNo })),
                    ...hareketler.filter(x => x.tip === "TAHSILAT").map(x => ({ tur: "TAHSILAT", belge: x, etiket: "Tahsilat Makbuzu", no: String(x._id || "").slice(-8).toUpperCase() }))
                ];
                panel.innerHTML = `<div class="dashboard-panel"><div class="panel-heading"><div><h2>Belgeler ve Dökümler</h2><p>Satıra tıklayarak içeriği görüntüleyin; uygun belgeleri düzenleyin.</p></div></div><div class="table-scroll"><table><thead><tr><th>Tarih</th><th>Belge Türü</th><th>Belge No</th><th>Tutar</th><th>İşlem</th></tr></thead><tbody>${belgeler.length ? belgeler.map((x, i) => `<tr data-belge-row="${i}" style="cursor:pointer"><td>${tarih(x.belge)}</td><td>${escapeHtml(x.etiket)}</td><td><strong>${escapeHtml(x.no || "-")}</strong></td><td>${para(x.belge.genelToplam || x.belge.tutar)}</td><td><button class="erp-small-button" data-belge-index="${i}">Görüntüle</button>${["SATIS", "SIPARIS", "TEKLIF"].includes(x.tur) ? ` <button class="erp-primary-button" data-belge-duzenle="${i}">Düzenle / Kalem Ekle</button>` : ""}</td></tr>`).join("") : `<tr><td colspan="5">Henüz belge bulunmuyor.</td></tr>`}</tbody></table></div><div class="dashboard-panel" style="margin-top:12px"><small>Ödemesi alınmış satışlar doğrudan değiştirilemez; iade/düzeltme belgesi kullanılır.</small></div></div>`;
                panel.querySelectorAll("[data-belge-index]").forEach(btn => btn.addEventListener("click", () => { const x = belgeler[Number(btn.dataset.belgeIndex)]; musteriBelgeMerkeziAc(x.tur, x.belge, m); }));
                panel.querySelectorAll("[data-belge-row]").forEach(row => row.addEventListener("click", event => { if (event.target.closest("button")) return; const x = belgeler[Number(row.dataset.belgeRow)]; musteriBelgeMerkeziAc(x.tur, x.belge, m); }));
                panel.querySelectorAll("[data-belge-duzenle]").forEach(btn => btn.addEventListener("click", event => { event.stopPropagation(); const x = belgeler[Number(btn.dataset.belgeDuzenle)]; const tur = x.tur === "SATIS" ? "satis" : x.tur === "SIPARIS" ? "siparis" : "teklif"; musteriBelgeFormu(tur, m, x.belge).catch(error => alert(error.message)); }));
            };


            document
                .querySelectorAll("[data-mtab]")
                .forEach(btn => {

                    btn.addEventListener("click", () => {

                        const tab =
                            btn.dataset.mtab;

                        if (tab === "ozet") ozetRender();
                        if (tab === "satis") satisRender();
                        if (tab === "cari") cariRender();
                        if (tab === "tahsilat") tahsilatRender();
                        if (tab === "teklif") teklifRender();
                        if (tab === "siparis") siparisRender();
                        if (tab === "bilgi") bilgiRender();
                        if (tab === "belgeler") belgelerRender();
                    });
                });


            document
                .getElementById("musteriWhatsapp")
                ?.addEventListener("click", () => {

                    let tel =
                        String(
                            m.whatsapp ||
                            m.telefon ||
                            ""
                        ).replace(/\D/g, "");

                    if (!tel) {
                        alert("WhatsApp numarası yok.");
                        return;
                    }

                    if (tel.startsWith("0")) {
                        tel = "90" + tel.substring(1);
                    }

                    musteriModalKapat();
                    const overlay = document.createElement("div");
                    overlay.id = "musteriIslemOverlay"; overlay.className = "erp-modal-overlay";
                    const normal = `${ad} cari hesap özeti\nGüncel bakiye: ${para(bakiye)}\nTarih: ${new Date().toLocaleDateString("tr-TR")}`;
                    const detay = `${normal}\n\nSon hareketler:\n${hareketler.slice(0, 20).map(x => `${tarih(x)} | ${x.tip || "İşlem"} | ${para(x.tutar)} | ${x.aciklama || ""}`).join("\n") || "Hareket bulunmuyor."}`;
                    overlay.innerHTML = `<div class="erp-modal" style="max-width:600px;width:95%"><div class="erp-modal-header"><div><h2>WhatsApp Ekstre Paylaş</h2><p>${escapeHtml(tel)}</p></div><button class="erp-modal-close">×</button></div><div class="dashboard-panel"><p>Paylaşım türünü seçin. WhatsApp yeni sekmede açılır; mesaj gönderilmeden önce kullanıcı tarafından kontrol edilir.</p><div style="display:flex;gap:10px;flex-wrap:wrap"><a class="erp-primary-button" target="_blank" rel="noopener" href="https://wa.me/${tel}?text=${encodeURIComponent(normal)}">Normal Ekstre Paylaş</a><a class="erp-primary-button" target="_blank" rel="noopener" href="https://wa.me/${tel}?text=${encodeURIComponent(detay)}">Detaylı Ekstre Paylaş</a></div></div></div>`;
                    document.body.appendChild(overlay);
                    overlay.querySelector(".erp-modal-close").addEventListener("click", musteriModalKapat);
                });

            document.getElementById("musteriSatisYap")?.addEventListener("click", () => musteriBelgeFormu("satis", m).catch(error => alert(error.message)));
            document.getElementById("musteriIadeAl")?.addEventListener("click", () => musteriBelgeFormu("iade", m).catch(error => alert(error.message)));
            document.getElementById("musteriTahsilatYap")?.addEventListener("click", () => musteriTahsilatFormu(m).catch(error => alert(error.message)));
            document.getElementById("musteriTeklifHazirla")?.addEventListener("click", () => musteriBelgeFormu("teklif", m).catch(error => alert(error.message)));
            document.getElementById("musteriSiparisOlustur")?.addEventListener("click", () => musteriBelgeFormu("siparis", m).catch(error => alert(error.message)));


            document
                .getElementById("musteriListe")
                ?.addEventListener(
                    "click",
                    () => musterilerYukle()
                );


            document
                .getElementById("oncekiMusteri")
                ?.addEventListener("click", () => {

                    if (onceki) {
                        musteriAnaSayfaAc(onceki._id);
                    }
                });


            document
                .getElementById("sonrakiMusteri")
                ?.addEventListener("click", () => {

                    if (sonraki) {
                        musteriAnaSayfaAc(sonraki._id);
                    }
                });


            ozetRender();

        } catch (error) {
            errorBox(error);
        }
    }

    function excelMusteriPaneli(hedef, mevcutMusteriler) {
        const kolonlar = [
            "Müşteri Kodu", "Müşteri Adı", "Ünvan", "Yetkili", "Telefon",
            "WhatsApp", "E-posta", "Vergi Dairesi", "Vergi No", "Adres",
            "İl", "İlçe", "Posta Kodu", "Vade", "Limit", "Risk Limiti", "Notlar"
        ];
        const alanlar = {
            "Müşteri Kodu": "kod", "Müşteri Adı": "adSoyad", "Ünvan": "unvan",
            "Yetkili": "yetkili", "Telefon": "telefon", "WhatsApp": "whatsapp",
            "E-posta": "email", "Vergi Dairesi": "vergiDairesi", "Vergi No": "vergiNo",
            "Adres": "adres", "İl": "il", "İlçe": "ilce", "Posta Kodu": "postaKodu",
            "Vade": "vadeGun", "Limit": "limit", "Risk Limiti": "riskLimiti", "Notlar": "notlar"
        };
        let satirlar = [];
        hedef.innerHTML = `
            <div class="dashboard-panel">
                <div class="panel-heading"><div><h2>Excel Müşteri Aktarımı</h2><p>Şablonu doldurun, önizleyin ve geçerli kayıtları aktarın.</p></div></div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
                    <button id="excelSablonIndir" class="erp-primary-button">Şablon İndir</button>
                    <input id="excelMusteriDosya" type="file" accept=".xlsx,.xls">
                    <button id="excelMusteriAktar" class="erp-primary-button" disabled>Müşterileri Aktar</button>
                </div>
                <div id="excelMusteriSonuc" style="margin-top:16px"></div>
                <div id="excelMusteriOnizleme" style="margin-top:16px"></div>
            </div>`;
        const sonucEl = document.getElementById("excelMusteriSonuc");
        const onizleme = document.getElementById("excelMusteriOnizleme");
        const aktar = document.getElementById("excelMusteriAktar");

        document.getElementById("excelSablonIndir").addEventListener("click", () => {
            if (!window.XLSX) return alert("Excel kitaplığı yüklenemedi.");
            const ws = XLSX.utils.aoa_to_sheet([kolonlar]);
            ws["!cols"] = kolonlar.map(x => ({ wch: Math.max(14, x.length + 2) }));
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Müşteriler");
            XLSX.writeFile(wb, "musteri-yukleme-sablonu.xlsx");
        });

        document.getElementById("excelMusteriDosya").addEventListener("change", async event => {
            try {
                if (!window.XLSX) throw new Error("Excel kitaplığı yüklenemedi.");
                const dosya = event.target.files[0];
                if (!dosya) return;
                const wb = XLSX.read(await dosya.arrayBuffer(), { type: "array" });
                const ham = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
                const mevcutKodlar = new Set(mevcutMusteriler.map(x => String(x.kod).trim().toUpperCase()));
                const dosyaKodlari = new Set();
                satirlar = ham.map((row, index) => {
                    const veri = {};
                    kolonlar.forEach(k => veri[alanlar[k]] = row[k] ?? "");
                    veri.kod = String(veri.kod).trim().toUpperCase();
                    ["vadeGun", "limit", "riskLimiti"].forEach(k => veri[k] = Number(veri[k] || 0));
                    const hatalar = [];
                    if (!veri.kod) hatalar.push("Müşteri kodu zorunlu");
                    if (!String(veri.adSoyad).trim() && !String(veri.unvan).trim()) hatalar.push("Müşteri adı veya ünvan zorunlu");
                    if (mevcutKodlar.has(veri.kod)) hatalar.push("Kod sistemde mevcut");
                    if (dosyaKodlari.has(veri.kod)) hatalar.push("Kod dosyada mükerrer");
                    if (veri.kod) dosyaKodlari.add(veri.kod);
                    if ([veri.vadeGun, veri.limit, veri.riskLimiti].some(x => !Number.isFinite(x) || x < 0)) hatalar.push("Sayısal alan geçersiz");
                    return { satir: index + 2, veri, hatalar };
                });
                const gecerli = satirlar.filter(x => !x.hatalar.length).length;
                sonucEl.innerHTML = `<strong>${satirlar.length} satır okundu:</strong> ${gecerli} geçerli, ${satirlar.length - gecerli} hatalı.`;
                onizleme.innerHTML = `<div class="table-scroll"><table><thead><tr><th>Satır</th><th>Kod</th><th>Müşteri</th><th>Durum</th></tr></thead><tbody>${satirlar.map(x => `<tr><td>${x.satir}</td><td>${escapeHtml(x.veri.kod)}</td><td>${escapeHtml(x.veri.unvan || x.veri.adSoyad)}</td><td>${x.hatalar.length ? `<span style="color:#b91c1c">${escapeHtml(x.hatalar.join(", "))}</span>` : `<span style="color:#15803d">Geçerli</span>`}</td></tr>`).join("")}</tbody></table></div>`;
                aktar.disabled = gecerli === 0;
            } catch (error) {
                sonucEl.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
            }
        });

        aktar.addEventListener("click", async () => {
            aktar.disabled = true;
            const hatalar = [];
            let eklenen = 0;
            for (const row of satirlar.filter(x => !x.hatalar.length)) {
                try {
                    const created = await api("/api/tenant/musteriler", { method: "POST", body: JSON.stringify(row.veri) });
                    await api(`/api/tenant/musteriler/${encodeURIComponent(created.musteri._id)}`);
                    eklenen++;
                } catch (error) {
                    hatalar.push(`Satır ${row.satir}: ${error.message}`);
                }
            }
            sonucEl.innerHTML = `<div class="dashboard-panel"><strong>${eklenen} müşteri eklendi, ${hatalar.length} hata oluştu.</strong>${hatalar.length ? `<ul>${hatalar.map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : ""}</div>`;
            aktar.disabled = false;
        });
    }

    async function musterilerYukle() {

        setTitle("Müşteriler");
        loading();

        try {

            const [musteriData, cariData] = await Promise.all([
                api("/api/tenant/musteriler"),
                api("/api/tenant/cari/ozet")
            ]);

            const musteriler = musteriData.musteriler || [];
            const cari = cariData.ozet || cariData || {};

            const toplamAlacak = Number(
                cari.musteriAlacagi ||
                cari.musteriAlacak ||
                0
            );

            content.innerHTML = `
                <div class="dashboard-panel">

                    <div class="panel-heading">
                        <div>
                            <h2>Müşteri Merkezi</h2>
                            <p>Müşteri işlemlerini tek merkezden yönetin.</p>
                        </div>
                    </div>

                    <div class="dashboard-grid"
                         style="grid-template-columns:repeat(4,minmax(0,1fr));">

                        <button id="musteriSecBtn"
                            style="padding:24px;border:0;border-radius:14px;
                            background:#2563eb;color:white;font-weight:700;cursor:pointer;">
                            Müşteri Seç
                        </button>

                        <button id="yeniMusteriV2Btn"
                            style="padding:24px;border:0;border-radius:14px;
                            background:#16a34a;color:white;font-weight:700;cursor:pointer;">
                            + Yeni Müşteri
                        </button>

                        <button id="excelMusteriBtn"
                            style="padding:24px;border:0;border-radius:14px;
                            background:#7c3aed;color:white;font-weight:700;cursor:pointer;">
                            Excel'den Toplu Yükle
                        </button>

                        <button id="musteriGruplariBtn"
                            style="padding:24px;border:0;border-radius:14px;
                            background:#ea580c;color:white;font-weight:700;cursor:pointer;">
                            Müşteri Grupları
                        </button>

                    </div>
                </div>

                <div class="dashboard-grid"
                     style="grid-template-columns:repeat(2,minmax(0,1fr));">

                    <div class="dashboard-card">
                        <div class="dashboard-card-title">Müşteri Sayısı</div>
                        <div class="dashboard-card-value">${musteriler.length}</div>
                        <div class="dashboard-card-info">Kayıtlı müşteri</div>
                    </div>

                    <div class="dashboard-card">
                        <div class="dashboard-card-title">Müşteri Alacağı</div>
                        <div class="dashboard-card-value">${para(toplamAlacak)}</div>
                        <div class="dashboard-card-info">Tahsil edilecek toplam</div>
                    </div>

                </div>

                <div id="musteriAltPanel"></div>
            `;

            const altPanel = document.getElementById("musteriAltPanel");

            document
                .getElementById("musteriSecBtn")
                .addEventListener("click", () => {

                    altPanel.innerHTML = `
                        <div class="dashboard-panel">
                            <div class="panel-heading">
                                <div>
                                    <h2>Müşteri Seç</h2>
                                    <p>Arayın ve müşteri panelini açın.</p>
                                </div>
                            </div>

                            <input
                                id="musteriV2Arama"
                                type="text"
                                placeholder="Kod, müşteri adı veya telefon ara..."
                                style="width:100%;box-sizing:border-box;
                                padding:12px 14px;margin-bottom:16px;
                                border:1px solid #cbd5e1;border-radius:10px;"
                            >

                            <div id="musteriV2Liste"></div>
                        </div>
                    `;

                    const arama = document.getElementById("musteriV2Arama");
                    const liste = document.getElementById("musteriV2Liste");

                    const render = () => {

                        const q = arama.value
                            .trim()
                            .toLocaleLowerCase("tr-TR");

                        const sonuc = musteriler.filter(m => {

                            const text = [
                                m.kod,
                                m.unvan,
                                m.adSoyad,
                                m.yetkili,
                                m.telefon
                            ]
                                .filter(Boolean)
                                .join(" ")
                                .toLocaleLowerCase("tr-TR");

                            return !q || text.includes(q);
                        });

                        liste.innerHTML = `
                            <div class="table-scroll">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Kod</th>
                                            <th>Müşteri</th>
                                            <th>Telefon</th>
                                            <th>Bakiye</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${sonuc.map(m => `
                                            <tr>
                                                <td><strong>${escapeHtml(m.kod || "-")}</strong></td>
                                                <td>${escapeHtml(m.unvan || m.adSoyad || "-")}</td>
                                                <td>${escapeHtml(m.telefon || m.whatsapp || "-")}</td>
                                                <td><strong>${para(Number(m.bakiye || 0))}</strong></td>
                                                <td>
                                                    <button
                                                        class="erp-primary-button"
                                                        data-v2-musteri="${m._id}">
                                                        Paneli Aç
                                                    </button>
                                                </td>
                                            </tr>
                                        `).join("")}
                                    </tbody>
                                </table>
                            </div>
                        `;
                    };

                    arama.addEventListener("input", render);

                    liste.addEventListener("click", async event => {

                        const btn = event.target.closest("[data-v2-musteri]");

                        if (btn) {
                            await musteriAnaSayfaAc(
                                btn.dataset.v2Musteri
                            );
                        }
                    });

                    render();
                });

            document
                .getElementById("yeniMusteriV2Btn")
                .addEventListener("click", () => {
                    yeniMusteriPaneli();
                });

            document
                .getElementById("excelMusteriBtn")
                .addEventListener("click", () => {
                    excelMusteriPaneli(altPanel, musteriler);
                });

            document
                .getElementById("musteriGruplariBtn")
                .addEventListener("click", () => {
                    const sayilar = musteriler.reduce((a, x) => { const g = x.grup || "Genel"; a[g] = (a[g] || 0) + 1; return a; }, {});
                    altPanel.innerHTML = `<div class="dashboard-panel"><div class="panel-heading"><div><h2>Müşteri Grupları</h2><p>Müşterileri satış ve takip gruplarına ayırın.</p></div></div>
                        <div class="dashboard-grid">${Object.entries(sayilar).map(([g, n]) => `<div class="dashboard-card"><div class="dashboard-card-title">${escapeHtml(g)}</div><div class="dashboard-card-value">${n}</div><div class="dashboard-card-info">müşteri</div></div>`).join("")}</div>
                        <form id="musteriGrupForm" class="erp-form-grid" style="margin-top:16px"><label>Müşteri<select name="musteriId" required><option value="">Müşteri seçin</option>${musteriler.map(x => `<option value="${x._id}">${escapeHtml(x.kod)} · ${escapeHtml(x.unvan || x.adSoyad)}</option>`).join("")}</select></label><label>Grup<input name="grup" required placeholder="Örn. VIP, Bayi, Perakende"></label><div class="full"><button class="erp-primary-button" type="submit">Grubu Kaydet</button></div></form><div id="musteriGrupMesaj"></div></div>`;
                    document.getElementById("musteriGrupForm").addEventListener("submit", async event => {
                        event.preventDefault(); const fd = new FormData(event.currentTarget); const mesaj = document.getElementById("musteriGrupMesaj");
                        try { await api(`/api/tenant/musteriler/${encodeURIComponent(fd.get("musteriId"))}`, { method: "PATCH", body: JSON.stringify({ grup: String(fd.get("grup")).trim() }) }); mesaj.innerHTML = `<div class="dashboard-panel"><strong>Grup kaydedildi.</strong></div>`; setTimeout(() => musterilerYukle(), 600); }
                        catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; }
                    });
                });

        } catch (error) {
            errorBox(error);
        }
    }

    async function cariYukle() {
        setTitle("Cari");
        loading();

        try {
            const [ozetData, musteriData, tedarikciData, profilData] =
                await Promise.all([
                    api("/api/tenant/cari/ozet"),
                    api("/api/tenant/musteriler"),
                    api("/api/tenant/tedarikciler"),
                    api("/api/auth/profil")
                ]);

            const musteriler = musteriData.musteriler || [];
            const tedarikciler = tedarikciData.tedarikciler || [];
            const oturumKullanici = profilData.kullanici || {}, bakiyeDuzeltYetkisi = ["OWNER", "ADMIN", "SUPER_ADMIN"].includes(oturumKullanici.rol) || (oturumKullanici.ozelYetkiler || []).includes("balance.adjust");

            content.innerHTML = `
                <div class="dashboard-panel">
                    <div class="dashboard-grid"
                         style="grid-template-columns:repeat(3,minmax(0,1fr));">
                        <div class="dashboard-card">
                            <div class="dashboard-card-title">Müşteri Alacağı</div>
                            <div id="cariMusteriAlacak" class="dashboard-card-value">
                                ${para(ozetData.musteriAlacak)}
                            </div>
                            <div class="dashboard-card-info">Tahsil edilmemiş</div>
                        </div>

                        <div class="dashboard-card">
                            <div class="dashboard-card-title">Tedarikçi Borcu</div>
                            <div id="cariTedarikciBorc" class="dashboard-card-value">
                                ${para(ozetData.tedarikciBorc)}
                            </div>
                            <div class="dashboard-card-info">Ödenmemiş</div>
                        </div>

                        <div class="dashboard-card positive">
                            <div class="dashboard-card-title">Net Cari</div>
                            <div id="cariNet" class="dashboard-card-value">
                                ${para(ozetData.netCari)}
                            </div>
                            <div class="dashboard-card-info">
                                Müşteri alacağı - tedarikçi borcu
                            </div>
                        </div>
                    </div>

                    <div style="
                        display:flex;
                        justify-content:space-between;
                        align-items:center;
                        gap:12px;
                        margin-bottom:15px;
                        flex-wrap:wrap;
                    ">
                        <div class="cari-tabs" style="display:flex;gap:8px;">
                        <button type="button" class="erp-small-button cari-tab active" data-cari-tab="musteri">
                            Müşteriler
                        </button>
                        <button type="button" class="erp-small-button cari-tab" data-cari-tab="tedarikci">
                            Tedarikçiler
                        </button>
                        </div>

                        <button
                            type="button"
                            class="erp-primary-button"
                            id="yeniMusteriBtn"
                        >
                            + Yeni Müşteri
                        </button>
                    </div>

                    <input id="cariArama"
                           class="erp-input"
                           placeholder="Kod veya ünvan ara...">

                    <div id="cariListe" style="margin-top:15px;"></div>
                </div>
            `;

            let aktif = "musteri";
            const arama = document.getElementById("cariArama");

            const render = () => {
                const q = arama.value.trim().toLocaleLowerCase("tr-TR");
                const kaynakListe = aktif === "musteri" ? musteriler : tedarikciler;
                const list = kaynakListe
                    .filter(x => {
                        const text = [
                            x.kod,
                            x.unvan,
                            x.adSoyad,
                            x.yetkili
                        ].filter(Boolean).join(" ")
                            .toLocaleLowerCase("tr-TR");
                        return !q || text.includes(q);
                    });

                document.getElementById("cariListe").innerHTML = `
                    <div class="table-scroll">
                        <table>
                            <thead>
                                <tr>
                                    <th>Kod</th>
                                    <th>Ünvan</th>
                                    <th>Telefon</th>
                                    <th>Bakiye</th>
                                    <th>Durum</th>
                                    <th>İşlem</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${list.length ? list.map(item => `
                                    <tr ${aktif === "musteri" ? `data-cari-musteri-ac="${item._id}"` : `data-cari-tedarikci-ac="${item._id}"`} class="cari-clickable-row">
                                        <td><strong>${escapeHtml(item.kod || "-")}</strong></td>
                                        <td>${escapeHtml(item.unvan || item.adSoyad || "-")}</td>
                                        <td>${escapeHtml(item.whatsapp || item.telefon || "-")}</td>
                                        <td><strong>${para(item.bakiye)}</strong></td>
                                        <td><span class="durum-badge ${item.aktif === false ? "pasif" : "aktif"}">${item.aktif === false ? "Pasif" : "Aktif"}</span></td>
                                        <td>
                                            <div class="row-actions">
                                                <button type="button"
                                                        class="erp-small-button"
                                                        data-cari-ekstre="${item._id}"
                                                        data-cari-tip="${aktif}">
                                                    Ekstre
                                                </button>
                                                <button type="button" class="erp-small-button" data-cari-islem="${item._id}" data-cari-tip="${aktif}">Cari İşlem</button>
                                                <button type="button" class="erp-small-button" data-cari-tahsilat="${item._id}" data-cari-tip="${aktif}">${aktif === "musteri" ? "Tahsilat Al" : "Tedarikçiden Tahsilat"}</button>
                                                <button type="button" class="erp-small-button" data-cari-odeme-yap="${item._id}" data-cari-tip="${aktif}">${aktif === "musteri" ? "Müşteriye Öde" : "Tedarikçiye Öde"}</button>
                                                ${bakiyeDuzeltYetkisi ? `<button type="button" class="erp-small-button" data-cari-bakiye="${item._id}" data-cari-tip="${aktif}">Bakiye Düzelt</button>` : ""}
                                                <button type="button" class="erp-small-button" data-cari-durum="${item._id}" data-cari-tip="${aktif}" data-cari-aktif="${item.aktif !== false}">${item.aktif === false ? "Aktif Et" : "Pasife Al"}</button>
                                                <button type="button" class="erp-small-button danger-button" data-cari-sil="${item._id}" data-cari-tip="${aktif}">Sil</button>
                                            </div>
                                        </td>
                                    </tr>
                                `).join("") : `
                                    <tr>
                                        <td colspan="6">Kayıt bulunamadı.</td>
                                    </tr>
                                `}
                            </tbody>
                        </table>
                    </div>
                `;
            };

            document.querySelectorAll("[data-cari-tab]").forEach(btn => {
                btn.addEventListener("click", () => {
                    aktif = btn.dataset.cariTab;
                    document.querySelectorAll("[data-cari-tab]").forEach(x => x.classList.toggle("active", x === btn));
                    btn.classList.add("active");
                    arama.value = "";
                    render();
                });
            });

            arama.addEventListener("input", render);
            render();

            document
                .getElementById("yeniMusteriBtn")
                ?.addEventListener(
                    "click",
                    yeniMusteriPaneli
                );
        } catch (error) {
            errorBox(error);
        }
    }

    function cariManuelHareketFormu(id, tip = "musteri") {
        const musteriMi = tip === "musteri", taraf = musteriMi ? "Müşteri" : "Tedarikçi";
        const overlay = document.createElement("div");
        overlay.className = "erp-modal-overlay";
        overlay.innerHTML = `<div class="erp-modal"><div class="erp-modal-header"><div><h2>${taraf} Cari İşlemi</h2><p>Borç, alacak veya hesaba yansıtılacak masraf girin.</p></div><button class="erp-modal-close" aria-label="Kapat">×</button></div><form id="cariManuelForm"><div class="erp-form-grid"><label>İşlem Türü<select name="tip" required><option value="BORC">Borçlandır</option><option value="ALACAK">Alacaklandır</option><option value="MASRAF">Masraf Ekle</option></select></label><label>Tutar<input name="tutar" type="number" min="0.01" step="0.01" required></label><label>Tarih<input name="tarih" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label><label>Belge No (isteğe bağlı)<input name="belgeNo"></label><label class="full">Açıklama<input name="aciklama" placeholder="İşlem açıklaması"></label><div id="cariManuelMesaj" class="full"></div></div><div class="erp-modal-footer"><button class="erp-primary-button" type="submit">Hareketi Kaydet</button></div></form></div>`;
        document.body.appendChild(overlay);
        overlay.querySelector(".erp-modal-close").onclick = () => overlay.remove();
        overlay.querySelector("#cariManuelForm").onsubmit = async event => {
            event.preventDefault();
            const fd = new FormData(event.currentTarget);
            const mesaj = overlay.querySelector("#cariManuelMesaj");
            try {
                const result = await api(`/api/tenant/cari/${tip}/hareket`, { method: "POST", body: JSON.stringify({ [musteriMi ? "musteriId" : "tedarikciId"]: id, tip: fd.get("tip"), tutar: Number(fd.get("tutar")), tarih: fd.get("tarih"), belgeNo: fd.get("belgeNo"), aciklama: fd.get("aciklama") }) });
                mesaj.innerHTML = `<div class="success">${escapeHtml(result.mesaj)}</div>`;
                setTimeout(() => { overlay.remove(); cariEkstreAc(tip, id); }, 500);
            } catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; }
        };
    }

    async function cariOdemeFormu(id, tur, tip = "musteri") {
        try {
            const [detay, finans] = await Promise.all([
                api(`/api/tenant/${tip === "musteri" ? "musteriler" : "tedarikciler"}/${encodeURIComponent(id)}`),
                api("/api/tenant/finans/ozet")
            ]);
            const musteri = detay[tip === "musteri" ? "musteri" : "tedarikci"], tahsilat = tur === "tahsilat", musteriMi = tip === "musteri", tarafAdi = musteriMi ? "Müşteri" : "Tedarikçi";
            const overlay = document.createElement("div");
            overlay.className = "erp-modal-overlay";
            overlay.innerHTML = `<div class="erp-modal"><div class="erp-modal-header"><div><h2>${tahsilat ? `${tarafAdi}den Tahsilat Al` : `${tarafAdi}ye Ödeme Yap`}</h2><p>${escapeHtml(musteri.kod)} · ${escapeHtml(musteri.unvan || musteri.adSoyad)} · Bakiye ${para(musteri.bakiye)}</p></div><button class="erp-modal-close" type="button">×</button></div>
                <form><div class="erp-form-grid">
                    <label>Ödeme Yöntemi<select name="odemeYontemi" required><option value="NAKIT">Nakit</option><option value="KREDI_KARTI">Kredi Kartı</option><option value="SENET">Senet</option><option value="CEK">Çek</option></select></label>
                    <label data-hesap-label>Hesap<select name="hesapId"></select></label>
                    <label>Tutar<input name="tutar" type="number" min="0.01" step="0.01" ${tahsilat && Number(musteri.bakiye) > 0 ? `max="${Number(musteri.bakiye)}"` : ""} required></label>
                    <label>Tarih<input name="tarih" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label>
                    <label>Belge No<input name="belgeNo" placeholder="Makbuz / senet / çek no"></label>
                    <label class="full">Açıklama<input name="aciklama" value="${tahsilat ? `${tarafAdi} tahsilatı` : `${tarafAdi} ödemesi`}"></label>
                    <div class="full" data-mesaj></div>
                </div><div class="erp-modal-footer"><button class="erp-primary-button" type="submit">${tahsilat ? "Tahsilatı Kaydet" : "Ödemeyi Kaydet"}</button></div></form></div>`;
            document.body.appendChild(overlay);
            const form = overlay.querySelector("form"), yontem = form.elements.odemeYontemi, hesap = form.elements.hesapId, hesapLabel = overlay.querySelector("[data-hesap-label]");
            const hesaplariYukle = () => {
                const banka = yontem.value === "KREDI_KARTI", evrak = ["SENET", "CEK"].includes(yontem.value);
                hesapLabel.hidden = evrak; hesap.required = !evrak;
                const liste = banka ? (finans.bankalar || []) : (finans.kasalar || []);
                hesap.innerHTML = `<option value="">Hesap seçin</option>${liste.map(x => `<option value="${x._id}">${escapeHtml(banka ? x.bankaAdi : x.ad)} · ${para(x.bakiye)}</option>`).join("")}`;
            };
            yontem.onchange = hesaplariYukle; hesaplariYukle();
            overlay.querySelector(".erp-modal-close").onclick = () => overlay.remove();
            form.onsubmit = async event => {
                event.preventDefault(); const fd = new FormData(form), mesaj = overlay.querySelector("[data-mesaj]");
                try {
                    const sonuc = await api(`/api/tenant/cari/${tip}/${tahsilat ? "tahsilat" : "odeme"}`, {
                        method: "POST", body: JSON.stringify({ [musteriMi ? "musteriId" : "tedarikciId"]: id, odemeYontemi: fd.get("odemeYontemi"), hesapTipi: fd.get("odemeYontemi") === "NAKIT" ? "KASA" : "BANKA", hesapId: fd.get("hesapId"), tutar: Number(fd.get("tutar")), tarih: fd.get("tarih"), belgeNo: fd.get("belgeNo"), aciklama: fd.get("aciklama") })
                    });
                    mesaj.innerHTML = `<div class="success">${escapeHtml(sonuc.mesaj)}</div>`;
                    setTimeout(() => { overlay.remove(); cariYukle(); }, 450);
                } catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; }
            };
        } catch (error) { alert(error.message); }
    }

    async function cariBakiyeDuzeltFormu(id, tip = "musteri") {
        try {
            const detay = await api(`/api/tenant/${tip === "musteri" ? "musteriler" : "tedarikciler"}/${encodeURIComponent(id)}`), musteri = detay[tip === "musteri" ? "musteri" : "tedarikci"];
            const overlay = document.createElement("div"); overlay.className = "erp-modal-overlay";
            overlay.innerHTML = `<div class="erp-modal"><div class="erp-modal-header"><div><h2>Cari Bakiye Düzeltme</h2><p>${escapeHtml(musteri.kod)} · Mevcut bakiye ${para(musteri.bakiye)}</p></div><button class="erp-modal-close">×</button></div><form><div class="erp-form-grid"><label>Yeni Bakiye<input name="yeniBakiye" type="number" step="0.01" value="${Number(musteri.bakiye || 0)}" required></label><label>Tarih<input name="tarih" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label><label>Belge No<input name="belgeNo"></label><label class="full">Düzeltme Gerekçesi<input name="aciklama" required placeholder="Sayım, devir veya mutabakat açıklaması"></label><div class="full" data-mesaj></div></div><div class="erp-modal-footer"><button class="erp-primary-button">Bakiyeyi Düzelt</button></div></form></div>`;
            document.body.appendChild(overlay); overlay.querySelector(".erp-modal-close").onclick = () => overlay.remove();
            overlay.querySelector("form").onsubmit = async event => { event.preventDefault(); const fd = new FormData(event.currentTarget), mesaj = overlay.querySelector("[data-mesaj]"); try { const sonuc = await api(`/api/tenant/cari/${tip}/${encodeURIComponent(id)}/bakiye`, { method: "PATCH", body: JSON.stringify({ yeniBakiye: Number(fd.get("yeniBakiye")), tarih: fd.get("tarih"), belgeNo: fd.get("belgeNo"), aciklama: fd.get("aciklama") }) }); mesaj.innerHTML = `<div class="success">${escapeHtml(sonuc.mesaj)}</div>`; setTimeout(() => { overlay.remove(); cariYukle(); }, 450); } catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
        } catch (error) { alert(error.message); }
    }

    async function cariDurumDegistir(id, aktif, tip = "musteri") {
        await api(`/api/tenant/${tip === "musteri" ? "musteriler" : "tedarikciler"}/${encodeURIComponent(id)}/durum`, { method: "PATCH", body: JSON.stringify({ aktif: !aktif }) });
        await cariYukle();
    }

    async function cariSil(id, tip = "musteri") {
        if (!confirm("Bu cari kaydı kalıcı olarak silinsin mi? Bakiyesi veya hareketi olan kayıtlar muhasebe güvenliği nedeniyle silinmez.")) return;
        try { await api(`/api/tenant/${tip === "musteri" ? "musteriler" : "tedarikciler"}/${encodeURIComponent(id)}`, { method: "DELETE" }); await cariYukle(); }
        catch (error) { alert(error.message); }
    }

    async function cariEkstreAc(tip, id) {
        try {
            const tarafTipi = tip === "musteri" ? "MUSTERI" : "TEDARIKCI";

            const [hareketData, firmaData] = await Promise.all([
                api(`/api/tenant/cari/hareketler?tarafTipi=${encodeURIComponent(tarafTipi)}&tarafId=${encodeURIComponent(id)}`),
                api("/api/tenant/firma")
            ]);

            const tarafData = tip === "musteri"
                ? await api("/api/tenant/musteriler")
                : await api("/api/tenant/tedarikciler");

            const taraf = (tip === "musteri"
                ? tarafData.musteriler
                : tarafData.tedarikciler
            ).find(x => String(x._id) === String(id));

            const firma = firmaData.firmaBilgileri || {};
            const hareketler = hareketData.hareketler || [];

            const rows = hareketler.map(h => {
                const kayitliDegisim = Number(h.bakiyeDegisimi);
                const degisim = h.bakiyeDegisimi !== null && h.bakiyeDegisimi !== undefined && Number.isFinite(kayitliDegisim)
                    ? kayitliDegisim
                    : (h.tip === "BORC" ? Number(h.tutar || 0) : -Number(h.tutar || 0));
                return {
                    ...h,
                    tarihText: h.tarih ? new Date(h.tarih).toLocaleDateString("tr-TR") : "-",
                    borc: degisim > 0 ? degisim : 0,
                    alacak: degisim < 0 ? Math.abs(degisim) : 0
                };
            });
            let yuruyen = 0;
            [...rows].reverse().forEach(row => {
                yuruyen += row.borc - row.alacak;
                row.yuruyenBakiye = yuruyen;
            });

            const overlay = document.createElement("div");
            overlay.className = "erp-modal-overlay";

            overlay.innerHTML = `
                <div class="invoice-preview-shell">
                    <div class="invoice-toolbar">
                        <div>
                            <strong>Cari Ekstre</strong>
                            <span>${escapeHtml(taraf?.unvan || taraf?.adSoyad || "-")}</span>
                        </div>

                        <div class="invoice-toolbar-actions">
                            ${tip === "musteri" ? `<button id="cariManuel" class="erp-small-button">+ Cari İşlem</button><button id="cariPaylas" class="erp-small-button">Ekstre Linki Paylaş</button>` : ""}
                            <button id="normalEkstre" class="erp-small-button">Normal Ekstre</button>
                            <button id="detayliEkstre" class="erp-small-button">Detaylı Ekstre</button>
                            <button id="cariYazdir" class="erp-primary-button">
                                Yazdır / PDF
                            </button>
                            <button id="cariKapat" class="erp-small-button">
                                Kapat
                            </button>
                        </div>
                    </div>

                    <div id="cariEkstreSayfa" class="invoice-page">
                        <div class="invoice-header">
                            <div>
                                <div class="invoice-brand">
                                    ${escapeHtml(firma.unvan || "Firma")}
                                </div>
                                <div class="invoice-subtitle">Cari Hesap Ekstresi</div>
                                <div class="invoice-subtitle">
                                    ${escapeHtml(firma.adres || "")}
                                </div>
                            </div>

                            <div class="invoice-meta">
                                <div>
                                    <span>Tarih</span>
                                    <strong>${new Date().toLocaleDateString("tr-TR")}</strong>
                                </div>
                            </div>
                        </div>

                        <div class="invoice-parties">
                            <div class="invoice-party">
                                <span>${tip === "musteri" ? "MÜŞTERİ" : "TEDARİKÇİ"}</span>
                                <strong>${escapeHtml(taraf?.unvan || taraf?.adSoyad || "-")}</strong>
                                <small>Kod: ${escapeHtml(taraf?.kod || "-")}</small>
                                <small>Tel: ${escapeHtml(taraf?.whatsapp || taraf?.telefon || "-")}</small>
                            </div>

                            <div class="invoice-party">
                                <span>GÜNCEL BAKİYE</span>
                                <strong>${para(taraf?.bakiye)}</strong>
                            </div>
                        </div>

                        <div class="invoice-table-wrap">
                            <table class="invoice-table">
                                <thead>
                                    <tr>
                                        <th>Tarih</th>
                                        <th>Tür</th>
                                        <th>Açıklama</th>
                                        <th class="ekstre-detay">Kaynak / Belge</th>
                                        <th>Borç</th>
                                        <th>Alacak</th>
                                        <th>Bakiye</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${rows.length ? rows.map(row => `
                                        <tr>
                                            <td>${escapeHtml(row.tarihText)}</td>
                                            <td>${escapeHtml(row.tip || "-")}</td>
                                            <td>${escapeHtml(row.aciklama || "-")}</td>
                                            <td class="ekstre-detay">${escapeHtml(row.kaynak || "-")}${row.kaynakId ? ` · ${escapeHtml(row.kaynakId)}` : ""}</td>
                                            <td>${row.borc ? para(row.borc) : "-"}</td>
                                            <td>${row.alacak ? para(row.alacak) : "-"}</td>
                                            <td><strong>${para(row.yuruyenBakiye)}</strong></td>
                                        </tr>
                                    `).join("") : `
                                        <tr>
                                            <td colspan="7" style="text-align:center">
                                                Henüz cari hareket bulunmuyor.
                                            </td>
                                        </tr>
                                    `}
                                </tbody>
                            </table>
                        </div>

                        <div class="invoice-bottom">
                            <div class="invoice-notes">
                                <strong>Normal Ekstre</strong>
                                <p>Cari hesaba ait hareketlerin tarih ve bakiye bazında özeti.</p>
                                <strong>Detaylı Ekstre</strong>
                                <p>Belge ve ürün detayları ayrıca raporlanabilir.</p>
                            </div>

                            <div class="invoice-totals">
                                <div>
                                    <span>Güncel Bakiye</span>
                                    <strong>${para(taraf?.bakiye)}</strong>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            document.getElementById("cariKapat").onclick = () => overlay.remove();
            const detayGoster = goster => overlay.querySelectorAll(".ekstre-detay").forEach(x => x.style.display = goster ? "" : "none");
            document.getElementById("normalEkstre").onclick = () => detayGoster(false);
            document.getElementById("detayliEkstre").onclick = () => detayGoster(true);
            if (tip === "musteri") {
                document.getElementById("cariManuel").onclick = () => { overlay.remove(); cariManuelHareketFormu(id); };
                document.getElementById("cariPaylas").onclick = async () => {
                    try {
                        const result = await api(`/api/tenant/cari/musteri/${encodeURIComponent(id)}/ekstre-paylas`, { method: "POST" });
                        const mesaj = `${taraf?.unvan || taraf?.adSoyad || "Müşteri"} cari hesap ekstresi: ${result.link}`;
                        if (navigator.share) await navigator.share({ title: "Cari Hesap Ekstresi", text: mesaj, url: result.link });
                        else {
                            await navigator.clipboard.writeText(result.link);
                            alert("Ekstre bağlantısı panoya kopyalandı. Bağlantı 30 gün geçerlidir.");
                        }
                    } catch (error) { if (error.name !== "AbortError") alert(error.message); }
                };
            }
            document.getElementById("cariYazdir").onclick = () => {
                const page = document.getElementById("cariEkstreSayfa");
                const old = document.body.innerHTML;
                document.body.innerHTML = page.outerHTML;
                window.print();
                document.body.innerHTML = old;
                window.location.reload();
            };
        } catch (error) {
            alert(error.message);
        }
    }

    let tedarikciV2Liste = [];
    let tedarikciV2Index = 0;

    const tedarikciAdi = t => t?.unvan || t?.adSoyad || "-";
    const tarihKisa = value => value ? new Date(value).toLocaleDateString("tr-TR") : "-";

    function tedarikciFormVerisi(form) {
        const fd = new FormData(form), veri = {};
        for (const [key, value] of fd.entries()) veri[key] = value;
        veri.vadeGun = Number(veri.vadeGun || 0); veri.limit = Number(veri.limit || 0); veri.aktif = form.elements.aktif?.checked !== false;
        return veri;
    }

    async function tedarikciFormAc(mevcut = null) {
        document.getElementById("tedarikciV2Modal")?.remove();
        const overlay = document.createElement("div"); overlay.id = "tedarikciV2Modal"; overlay.className = "erp-modal-overlay";
        const v = mevcut || {};
        overlay.innerHTML = `<div class="erp-modal"><div class="erp-modal-header"><div><h2>${mevcut ? "Tedarikçi Düzenle" : "Yeni Tedarikçi"}</h2><p>Firma, iletişim, vergi ve ticari bilgileri</p></div><button class="erp-modal-close">×</button></div><form id="tedarikciV2Form"><div class="erp-form-grid">
        ${[["kod", "Tedarikçi Kodu", "text", true], ["unvan", "Firma / Ünvan", "text", true], ["yetkili", "Yetkili"], ["telefon", "Telefon"], ["whatsapp", "WhatsApp"], ["email", "E-posta", "email"], ["vergiDairesi", "Vergi Dairesi"], ["vergiNo", "Vergi Numarası"], ["adres", "Adres"], ["il", "İl"], ["ilce", "İlçe"], ["postaKodu", "Posta Kodu"], ["vadeGun", "Vade (Gün)", "number"], ["limit", "Limit", "number"], ["iban", "IBAN"], ["banka", "Banka"], ["grup", "Grup"]].map(([n, l, t = "text", r = false]) => `<label>${l}<input name="${n}" type="${t}" ${r ? "required" : ""} value="${escapeHtml(v[n] ?? (n === "grup" ? "Genel" : ""))}"></label>`).join("")}
        <label class="full">Not<textarea name="notlar">${escapeHtml(v.notlar || "")}</textarea></label><label class="full"><span><input name="aktif" type="checkbox" ${v.aktif === false ? "" : "checked"}> Aktif tedarikçi</span></label></div><div id="tedarikciV2Mesaj"></div><div class="erp-modal-footer"><button type="button" class="erp-small-button" data-kapat>Geri</button><button type="button" class="erp-small-button" data-kapat>Vazgeç</button><button class="erp-primary-button" type="submit">Kaydet</button></div></form></div>`;
        document.body.appendChild(overlay); const kapat = () => overlay.remove(); overlay.querySelector(".erp-modal-close").onclick = kapat; overlay.querySelectorAll("[data-kapat]").forEach(button => button.onclick = kapat);
        overlay.querySelector("form").onsubmit = async event => { event.preventDefault(); const mesaj = overlay.querySelector("#tedarikciV2Mesaj"); try { const veri = tedarikciFormVerisi(event.currentTarget); const sonuc = await api(mevcut ? `/api/tenant/tedarikciler/${mevcut._id}` : "/api/tenant/tedarikciler", { method: mevcut ? "PATCH" : "POST", body: JSON.stringify(veri) }); const dogrula = await api(`/api/tenant/tedarikciler/${sonuc.tedarikci._id}`); if (!dogrula.tedarikci || dogrula.tedarikci.kod !== sonuc.tedarikci.kod) throw new Error("MongoDB kayıt doğrulaması başarısız."); kapat(); await tedarikciDashboardAc(sonuc.tedarikci._id); } catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
    }

    function tedarikciKalemSatiri(urunler, kalem = {}) { return `<tr class="tedarikci-kalem"><td><select name="urunId" required><option value="">Ürün seçin</option>${urunler.map(u => `<option value="${u._id}" ${String(kalem.urunId?._id || kalem.urunId) === String(u._id) ? "selected" : ""}>${escapeHtml(u.kod)} · ${escapeHtml(u.ad)}</option>`).join("")}</select></td><td><input name="miktar" type="number" min="0.0001" step="0.0001" value="${kalem.miktar || 1}" required></td><td><input name="birimFiyat" type="number" min="0" step="0.01" value="${kalem.birimFiyat ?? ""}" required></td><td><input name="kdv" type="number" min="0" step="0.01" value="${kalem.kdv ?? 20}"></td><td><input name="iskonto" type="number" min="0" step="0.01" value="${kalem.iskonto || 0}"></td><td><button type="button" class="erp-small-button" data-sil>Sil</button></td></tr>`; }

    async function tedarikciBelgeFormu(tur, tedarikci, donus = "tedarikci") {
        const [uData, dData, fData] = await Promise.all([api("/api/tenant/urunler"), api("/api/tenant/stok/depolar"), api("/api/tenant/finans/ozet")]); const urunler = uData.urunler || [], depolar = dData.depolar || [];
        const cfg = { alis: { baslik: "Alış Yap", no: "Belge No", endpoint: "/api/tenant/alis", prefix: "AL" }, iade: { baslik: "Alış İade", no: "İade Belge No", endpoint: "/api/tenant/alis/iade", prefix: "AI" }, siparis: { baslik: "Satın Alma Siparişi", no: "Sipariş No", endpoint: "/api/tenant/alis/siparis", prefix: "SAS" } }[tur];
        const overlay = document.createElement("div"); overlay.id = "tedarikciV2Modal"; overlay.className = "erp-modal-overlay"; const no = `${cfg.prefix}-${Date.now()}`;
        overlay.innerHTML = `<div class="erp-modal"><div class="erp-modal-header"><div><h2>${cfg.baslik}</h2><p>${escapeHtml(tedarikci.kod)} · ${escapeHtml(tedarikciAdi(tedarikci))}</p></div><button class="erp-modal-close">×</button></div><form><div class="erp-form-grid"><label>${cfg.no}<input name="belgeNo" value="${no}" required></label><label>Tarih<input name="tarih" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label>${tur !== "siparis" ? `<label>Depo<select name="depoId" required><option value="">Depo seçin</option>${depolar.map(d => `<option value="${d._id}">${escapeHtml(d.kod)} · ${escapeHtml(d.ad)}</option>`).join("")}</select></label>` : ""}${tur === "alis" ? `<label>Ödeme Durumu<select name="odemeDurumu"><option value="ACIK">Açık Hesap</option><option value="KISMI">Kısmi</option><option value="ODENDI">Ödendi</option></select></label><label>Ödenen Tutar<input name="odenenTutar" type="number" min="0" step="0.01" value="0"></label><label>Ödeme Hesabı<select name="hesap"><option value="">Hesap seçin</option>${(fData.kasalar || []).map(x => `<option value="KASA:${x._id}">Kasa · ${escapeHtml(x.ad)}</option>`).join("")}${(fData.bankalar || []).map(x => `<option value="BANKA:${x._id}">Banka · ${escapeHtml(x.bankaAdi)}</option>`).join("")}</select></label>` : ""}<label class="full">Not<textarea name="notlar"></textarea></label></div><div class="dashboard-panel"><div class="panel-heading"><div><h3>Belge Kalemleri</h3><p>Kalem ekleme aynı tabloda satır açar.</p></div><button type="button" class="erp-primary-button" id="tedKalemEkle">+ Kalem Ekle</button></div><div class="table-scroll"><table><thead><tr><th>Ürün</th><th>Miktar</th><th>Fiyat</th><th>KDV %</th><th>İskonto %</th><th></th></tr></thead><tbody id="tedKalemler">${tedarikciKalemSatiri(urunler)}</tbody></table></div></div><div id="tedBelgeMesaj"></div><div class="erp-modal-footer"><button type="button" class="erp-small-button" data-kapat>Vazgeç</button><button class="erp-primary-button" type="submit">Kaydet</button></div></form></div>`;
        document.body.appendChild(overlay); const kapat = () => overlay.remove(); overlay.querySelector(".erp-modal-close").onclick = kapat; overlay.querySelector("[data-kapat]").onclick = kapat; const tbody = overlay.querySelector("#tedKalemler"); const bagla = () => tbody.querySelectorAll("[data-sil]").forEach(b => b.onclick = () => { if (tbody.rows.length > 1) b.closest("tr").remove(); }); bagla(); overlay.querySelector("#tedKalemEkle").onclick = () => { tbody.insertAdjacentHTML("beforeend", tedarikciKalemSatiri(urunler)); bagla(); };
        const toplamKutusu = document.createElement("div"); toplamKutusu.className = "supplier-document-total"; toplamKutusu.innerHTML = 'Genel Toplam: <strong id="tedGenelToplam">₺0,00</strong>'; tbody.closest(".dashboard-panel").appendChild(toplamKutusu); const toplamHesapla = () => { const toplam = [...tbody.rows].reduce((n, row) => { const get = name => Number(row.querySelector(`[name="${name}"]`)?.value || 0), ara = get("miktar") * get("birimFiyat") * (1 - get("iskonto") / 100); return n + ara * (1 + get("kdv") / 100); }, 0); toplamKutusu.querySelector("strong").textContent = para(toplam); }; tbody.addEventListener("input", toplamHesapla); tbody.addEventListener("click", () => setTimeout(toplamHesapla)); toplamHesapla();
        overlay.querySelector("form").onsubmit = async event => { event.preventDefault(); const form = event.currentTarget, mesaj = overlay.querySelector("#tedBelgeMesaj"); try { const kalemler = [...tbody.rows].map(row => Object.fromEntries([...row.querySelectorAll("input,select")].map(x => [x.name, x.type === "number" ? Number(x.value) : x.value]))); const body = { tedarikciId: tedarikci._id, belgeNo: form.elements.belgeNo.value, tarih: form.elements.tarih.value, depoId: form.elements.depoId?.value, kalemler, notlar: form.elements.notlar.value, aciklama: form.elements.notlar.value }; if (tur === "siparis") { body.siparisNo = body.belgeNo; delete body.belgeNo; } if (tur === "alis") { body.odemeDurumu = form.elements.odemeDurumu.value; body.odenenTutar = Number(form.elements.odenenTutar.value || 0); const [hesapTipi, hesapId] = String(form.elements.hesap.value || ":").split(":"); body.hesapTipi = hesapTipi; body.hesapId = hesapId; } await api(cfg.endpoint, { method: "POST", body: JSON.stringify(body) }); kapat(); if (donus === "alis") await alisMerkeziYukle(tur === "iade" ? "iadeler" : "alislar"); else await tedarikciDashboardAc(tedarikci._id, tur === "siparis" ? "siparisler" : tur === "iade" ? "iadeler" : "alislar"); } catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
    }

    async function tedarikciOdemeFormu(tedarikci) {
        const f = await api("/api/tenant/finans/ozet"), overlay = document.createElement("div"); overlay.id = "tedarikciV2Modal"; overlay.className = "erp-modal-overlay"; overlay.innerHTML = `<div class="erp-modal" style="max-width:650px"><div class="erp-modal-header"><div><h2>Ödeme Yap</h2><p>${escapeHtml(tedarikciAdi(tedarikci))} · Borç ${para(tedarikci.bakiye)}</p></div><button class="erp-modal-close">×</button></div><form><div class="erp-form-grid"><label>Tutar<input name="tutar" type="number" min="0.01" max="${Math.max(0, tedarikci.bakiye)}" step="0.01" required></label><label>Tarih<input name="tarih" type="date" value="${new Date().toISOString().slice(0, 10)}"></label><label>Belge No<input name="belgeNo" value="ODM-${Date.now()}"></label><label>Hesap<select name="hesap" required><option value="">Seçin</option>${(f.kasalar || []).map(x => `<option value="KASA:${x._id}">Kasa · ${escapeHtml(x.ad)} · ${para(x.bakiye)}</option>`).join("")}${(f.bankalar || []).map(x => `<option value="BANKA:${x._id}">Banka · ${escapeHtml(x.bankaAdi)} · ${para(x.bakiye)}</option>`).join("")}</select></label><label class="full">Açıklama<input name="aciklama" value="Tedarikçi ödemesi"></label></div><div id="tedOdemeMesaj"></div><div class="erp-modal-footer"><button type="button" class="erp-small-button" data-kapat>Vazgeç</button><button class="erp-primary-button">Ödemeyi Kaydet</button></div></form></div>`; document.body.appendChild(overlay); const kapat = () => overlay.remove(); overlay.querySelector(".erp-modal-close").onclick = kapat; overlay.querySelector("[data-kapat]").onclick = kapat; overlay.querySelector("form").onsubmit = async e => { e.preventDefault(); try { const fd = new FormData(e.currentTarget), [hesapTipi, hesapId] = fd.get("hesap").split(":"); await api("/api/tenant/cari/tedarikci/odeme", { method: "POST", body: JSON.stringify({ tedarikciId: tedarikci._id, tutar: Number(fd.get("tutar")), tarih: fd.get("tarih"), belgeNo: fd.get("belgeNo"), hesapTipi, hesapId, aciklama: fd.get("aciklama") }) }); kapat(); await tedarikciDashboardAc(tedarikci._id, "cari"); } catch (error) { overlay.querySelector("#tedOdemeMesaj").innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
    }

    async function tedarikciDashboardAc(id, aktifSekme = "ozet") {
        loading("Tedarikçi paneli hazırlanıyor..."); const [d, a, c, i, s] = await Promise.all([api(`/api/tenant/tedarikciler/${id}`), api(`/api/tenant/alis?tedarikciId=${id}`), api(`/api/tenant/cari/hareketler?tarafTipi=TEDARIKCI&tarafId=${id}`), api(`/api/tenant/alis/iade?tedarikciId=${id}`), api(`/api/tenant/alis/siparis?tedarikciId=${id}`)]); const t = d.tedarikci; tedarikciV2Index = Math.max(0, tedarikciV2Liste.findIndex(x => x._id === id)); const alislar = a.alislar || [], hareketler = c.hareketler || [], iadeler = i.iadeler || [], siparisler = s.siparisler || []; const simdi = new Date(), aylik = alislar.filter(x => { const dt = new Date(x.tarih); return dt.getMonth() === simdi.getMonth() && dt.getFullYear() === simdi.getFullYear(); }).reduce((n, x) => n + Number(x.genelToplam || 0), 0), yillik = alislar.filter(x => new Date(x.tarih).getFullYear() === simdi.getFullYear()).reduce((n, x) => n + Number(x.genelToplam || 0), 0), toplam = alislar.reduce((n, x) => n + Number(x.genelToplam || 0), 0);
        const odenenCari = hareketler.filter(x => x.tip === "ODEME").reduce((n, x) => n + Number(x.tutar || 0), 0), vadeGun = Number(t.vadeGun || 0), yediGun = new Date(simdi.getTime() + 7 * 86400000), vadesiYaklasan = alislar.filter(x => Number(x.kalanTutar || 0) > 0 && new Date(new Date(x.tarih).getTime() + vadeGun * 86400000) <= yediGun).reduce((n, x) => n + Number(x.kalanTutar || 0), 0);
        setTitle("Tedarikçi"); content.innerHTML = `<div class="supplier-hero"><div><span>${escapeHtml(t.kod)}</span><h2>${escapeHtml(tedarikciAdi(t))}</h2><p>${escapeHtml(t.yetkili || "Yetkili belirtilmemiş")} · ${escapeHtml(t.telefon || "Telefon yok")}</p></div><div class="supplier-nav"><button id="tedOnceki" ${tedarikciV2Index <= 0 ? "disabled" : ""}>← Önceki</button><button id="tedListe">Tedarikçi Listesi</button><button id="tedSonraki" ${tedarikciV2Index >= tedarikciV2Liste.length - 1 ? "disabled" : ""}>Sonraki →</button></div></div><div class="dashboard-grid">${card("Güncel Borç", para(t.bakiye), "Cari bakiye")}${card("Ödenen", para(odenenCari), "Cari ödemeler")}${card("Kalan Borç", para(t.bakiye), "Ödenecek")}${card("Bu Ay Alış", para(aylik), "Aylık")}${card("Bu Yıl Alış", para(yillik), "Yıllık")}${card("Toplam Alış", para(toplam), `${alislar.length} belge`)}${card("Vadesi Yaklaşan", para(vadesiYaklasan), "7 gün içinde")}</div><div class="supplier-tabs">${[["ozet", "Özet"], ["alis", "Alış Yap"], ["alislar", "Alışlar"], ["odeme", "Ödeme Yap"], ["cari", "Cari / Ekstre"], ["iade", "Alış İade"], ["iadeler", "İadeler"], ["siparis", "Sipariş Oluştur"], ["siparisler", "Siparişler"], ["whatsapp", "WhatsApp"], ["bilgiler", "Bilgiler / Düzenle"]].map(([k, l]) => `<button data-ted-tab="${k}" class="${aktifSekme === k ? "active" : ""}">${l}</button>`).join("")}</div><div id="tedarikciSekme"></div>`;
        const panel = content.querySelector("#tedarikciSekme"); const tablo = (baslik, rows, noKey) => `<div class="dashboard-panel"><div class="panel-heading"><div><h2>${baslik}</h2><p>${rows.length} kayıt</p></div></div><div class="table-scroll"><table><thead><tr><th>Tarih</th><th>Belge</th><th>Tutar</th><th>Durum/Açıklama</th></tr></thead><tbody>${rows.length ? rows.map(x => `<tr><td>${tarihKisa(x.tarih)}</td><td>${escapeHtml(x[noKey] || x.belgeNo || x.belgeNo || "-")}</td><td>${para(x.genelToplam || x.tutar)}</td><td>${escapeHtml(x.durum || x.aciklama || x.notlar || "-")}</td></tr>`).join("") : `<tr><td colspan="4">Henüz kayıt yok.</td></tr>`}</tbody></table></div></div>`;
        const cariTablo = () => { let bakiye = 0; const sirali = [...hareketler].sort((a, b) => new Date(a.tarih) - new Date(b.tarih)); return `<div class="dashboard-panel"><div class="panel-heading"><div><h2>Tedarikçi Cari Ekstresi</h2><p>Normal ve detaylı hareket görünümü</p></div><div><button class="erp-small-button" id="tedNormal">Normal Ekstre</button> <button class="erp-primary-button" id="tedDetay">Detaylı Ekstre</button></div></div><div class="table-scroll"><table><thead><tr><th>Tarih</th><th>İşlem</th><th>Belge</th><th class="ted-detay">Açıklama</th><th>Borç</th><th>Alacak</th><th>Bakiye</th></tr></thead><tbody>${sirali.map(x => { const borc = x.tip === "ODEME" || x.tip === "IADE" ? Number(x.tutar || 0) : 0, alacak = borc ? 0 : Number(x.tutar || 0); bakiye += alacak - borc; return `<tr><td>${tarihKisa(x.tarih)}</td><td>${escapeHtml(x.tip)}</td><td>${escapeHtml(x.belgeNo || "-")}</td><td class="ted-detay">${escapeHtml(x.aciklama || "-")}</td><td>${borc ? para(borc) : "-"}</td><td>${alacak ? para(alacak) : "-"}</td><td><b>${para(bakiye)}</b></td></tr>`; }).join("") || `<tr><td colspan="7">Henüz cari hareket yok.</td></tr>`}</tbody></table></div></div>`; };
        const sekmeAc = async key => { if (key === "alis") return tedarikciBelgeFormu("alis", t); if (key === "odeme") return tedarikciOdemeFormu(t); if (key === "iade") return tedarikciBelgeFormu("iade", t); if (key === "siparis") return tedarikciBelgeFormu("siparis", t); if (key === "bilgiler") return tedarikciFormAc(t); if (key === "whatsapp") { const tel = String(t.whatsapp || t.telefon || "").replace(/\D/g, ""); if (!tel) return alert("Tedarikçinin WhatsApp numarası yok."); window.open(`https://wa.me/${tel}?text=${encodeURIComponent(`${tedarikciAdi(t)} cari bakiye: ${para(t.bakiye)}`)}`, "_blank", "noopener"); return; } if (key === "alislar") panel.innerHTML = tablo("Alışlar", alislar, "belgeNo"); else if (key === "iadeler") panel.innerHTML = tablo("Alış İadeleri", iadeler, "belgeNo"); else if (key === "siparisler") panel.innerHTML = tablo("Satın Alma Siparişleri", siparisler, "siparisNo"); else if (key === "cari") { panel.innerHTML = cariTablo(); panel.querySelector("#tedNormal").onclick = () => panel.querySelectorAll(".ted-detay").forEach(x => x.style.display = "none"); panel.querySelector("#tedDetay").onclick = () => panel.querySelectorAll(".ted-detay").forEach(x => x.style.display = ""); } else panel.innerHTML = `<div class="dashboard-panel"><h2>Tedarikçi Özeti</h2><div class="supplier-info"><div><b>Yetkili</b><span>${escapeHtml(t.yetkili || "-")}</span></div><div><b>Telefon</b><span>${escapeHtml(t.telefon || "-")}</span></div><div><b>WhatsApp</b><span>${escapeHtml(t.whatsapp || "-")}</span></div><div><b>E-posta</b><span>${escapeHtml(t.email || "-")}</span></div><div><b>Vergi No</b><span>${escapeHtml(t.vergiNo || "-")}</span></div><div><b>IBAN</b><span>${escapeHtml(t.iban || "-")}</span></div></div></div>`; }; content.querySelectorAll("[data-ted-tab]").forEach(b => b.onclick = () => sekmeAc(b.dataset.tedTab)); content.querySelector("#tedListe").onclick = tedarikcilerYukle; content.querySelector("#tedOnceki").onclick = () => tedarikciDashboardAc(tedarikciV2Liste[tedarikciV2Index - 1]._id); content.querySelector("#tedSonraki").onclick = () => tedarikciDashboardAc(tedarikciV2Liste[tedarikciV2Index + 1]._id); await sekmeAc(aktifSekme);
    }

    function tedarikciExcelPaneli() {
        const panel = content.querySelector("#tedarikciAltPanel"); panel.innerHTML = `<div class="dashboard-panel"><div class="panel-heading"><div><h2>Excel'den Toplu Tedarikçi Yükle</h2><p>Şablonu doldurun, önizleyin ve doğrulanmış satırları aktarın.</p></div><button id="tedSablon" class="erp-primary-button">Şablon İndir</button></div><label>Dosya Seç<input id="tedExcelDosya" type="file" accept=".xlsx,.xls"></label><div id="tedExcelOnizleme" style="margin-top:16px"></div></div>`; panel.querySelector("#tedSablon").onclick = () => { const baslik = ["Tedarikçi Kodu", "Ünvan", "Yetkili", "Telefon", "WhatsApp", "E-posta", "Vergi Dairesi", "Vergi Numarası", "Adres", "İl", "İlçe", "Posta Kodu", "Vade", "Limit", "IBAN", "Banka", "Not"]; const ws = XLSX.utils.aoa_to_sheet([baslik]); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Tedarikçiler"); XLSX.writeFile(wb, "tedarikci-sablonu.xlsx"); }; panel.querySelector("#tedExcelDosya").onchange = async e => { const file = e.target.files[0]; if (!file) return; const wb = XLSX.read(await file.arrayBuffer(), { type: "array" }), rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" }), map = { "Tedarikçi Kodu": "kod", "Ünvan": "unvan", "Yetkili": "yetkili", "Telefon": "telefon", "WhatsApp": "whatsapp", "E-posta": "email", "Vergi Dairesi": "vergiDairesi", "Vergi Numarası": "vergiNo", "Adres": "adres", "İl": "il", "İlçe": "ilce", "Posta Kodu": "postaKodu", "Vade": "vadeGun", "Limit": "limit", "IBAN": "iban", "Banka": "banka", "Not": "notlar" }, veriler = rows.map(r => Object.fromEntries(Object.entries(map).map(([a, b]) => [b, r[a]]))), kodlar = new Set(tedarikciV2Liste.map(x => x.kod)), dosyaKodlari = new Set(), hatalar = veriler.map((r, i) => { const kod = String(r.kod || "").trim().toUpperCase(); if (!kod || !r.unvan) return `${i + 2}. satır: kod ve ünvan zorunlu`; if (kodlar.has(kod) || dosyaKodlari.has(kod)) return `${i + 2}. satır: mükerrer kod`; dosyaKodlari.add(kod); return null; }).filter(Boolean); panel.querySelector("#tedExcelOnizleme").innerHTML = `<p>${veriler.length} satır · ${hatalar.length} hata</p>${hatalar.length ? `<div class="error">${hatalar.map(escapeHtml).join("<br>")}</div>` : `<button id="tedExcelAktar" class="erp-primary-button">Tedarikçileri Aktar</button>`}`; panel.querySelector("#tedExcelAktar")?.addEventListener("click", async () => { let eklenen = 0; for (const row of veriler) { await api("/api/tenant/tedarikciler", { method: "POST", body: JSON.stringify(row) }); eklenen++; } alert(`${eklenen} tedarikçi aktarıldı.`); await tedarikcilerYukle(); }); };
        panel.querySelector("#tedExcelDosya").addEventListener("change", async event => { const file = event.target.files[0]; if (!file) return; const wb = XLSX.read(await file.arrayBuffer(), { type: "array" }), rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" }); const hedef = panel.querySelector("#tedExcelOnizleme"); hedef.insertAdjacentHTML("beforeend", `<div class="table-scroll" style="margin-top:14px"><table><thead><tr><th>Satır</th><th>Tedarikçi Kodu</th><th>Ünvan</th><th>Yetkili</th><th>Telefon</th><th>Vergi No</th></tr></thead><tbody>${rows.slice(0, 100).map((r, i) => `<tr><td>${i + 2}</td><td>${escapeHtml(r["Tedarikçi Kodu"] || "")}</td><td>${escapeHtml(r["Ünvan"] || "")}</td><td>${escapeHtml(r["Yetkili"] || "")}</td><td>${escapeHtml(r["Telefon"] || "")}</td><td>${escapeHtml(r["Vergi Numarası"] || "")}</td></tr>`).join("")}</tbody></table></div>`); });
    }

    async function tedarikcilerYukle() {
        setTitle("Tedarikçiler"); loading(); try { const d = await api("/api/tenant/tedarikciler"); tedarikciV2Liste = d.tedarikciler || []; const borc = tedarikciV2Liste.reduce((n, x) => n + Number(x.bakiye || 0), 0); content.innerHTML = `<div class="welcome-banner"><div><div class="eyebrow">TEDARİKÇİLER V2</div><h2>Tedarikçi Merkezi</h2><p>Satın alma, ödeme, cari ve tedarikçi belgelerini tek merkezden yönetin.</p></div></div><div class="musteri-toolbar"><button class="dashboard-action dashboard-action-blue" id="tedSec">Tedarikçi Seç</button><button class="dashboard-action dashboard-action-green" id="tedYeni">+ Yeni Tedarikçi</button><button class="dashboard-action dashboard-action-purple" id="tedExcel">Excel'den Toplu Yükle</button><button class="dashboard-action shortcut-orange" id="tedGruplar">Tedarikçi Grupları</button></div><div class="dashboard-grid">${card("Tedarikçi Sayısı", tedarikciV2Liste.length, "Kayıtlı tedarikçi")}${card("Toplam Borç", para(borc), "Ödenecek bakiye")}</div><div id="tedarikciAltPanel"></div>`; const panel = content.querySelector("#tedarikciAltPanel"); const liste = () => { panel.innerHTML = `<div class="dashboard-panel"><div class="panel-heading"><div><h2>Tedarikçi Seç</h2><p>Kod, ünvan, yetkili, telefon veya vergi no ile arayın.</p></div></div><input id="tedAra" class="erp-input" placeholder="Tedarikçi ara..."><div class="table-scroll"><table><thead><tr><th>Kod</th><th>Ünvan</th><th>Yetkili</th><th>Telefon</th><th>Bakiye</th><th>Durum</th></tr></thead><tbody id="tedListeGovde">${tedarikciV2Liste.map((x, i) => `<tr data-ted-id="${x._id}" data-ted-index="${i}" style="cursor:pointer"><td><b>${escapeHtml(x.kod)}</b></td><td>${escapeHtml(tedarikciAdi(x))}</td><td>${escapeHtml(x.yetkili || "-")}</td><td>${escapeHtml(x.telefon || "-")}</td><td>${para(x.bakiye)}</td><td>${x.aktif === false ? "Pasif" : "Aktif"}</td></tr>`).join("")}</tbody></table></div></div>`; const bagla = () => panel.querySelectorAll("[data-ted-id]").forEach(row => row.onclick = () => tedarikciDashboardAc(row.dataset.tedId)); bagla(); panel.querySelector("#tedAra").oninput = e => { const q = e.target.value.toLocaleLowerCase("tr-TR"); panel.querySelectorAll("#tedListeGovde tr").forEach(row => row.hidden = !row.textContent.toLocaleLowerCase("tr-TR").includes(q)); }; }; content.querySelector("#tedSec").onclick = liste; content.querySelector("#tedYeni").onclick = () => tedarikciFormAc(); content.querySelector("#tedExcel").onclick = tedarikciExcelPaneli; content.querySelector("#tedGruplar").onclick = () => { const gruplar = {}; tedarikciV2Liste.forEach(x => gruplar[x.grup || "Genel"] = (gruplar[x.grup || "Genel"] || 0) + 1); panel.innerHTML = `<div class="dashboard-panel"><h2>Tedarikçi Grupları</h2><div class="dashboard-grid">${Object.entries(gruplar).map(([g, n]) => card(g, n, "tedarikçi")).join("")}</div></div>`; }; liste(); } catch (error) { errorBox(error); }
    }

    let alisMerkezi = { alislar: [], iadeler: [], tedarikciler: [] };

    async function alisMerkeziYukle(aktifSekme = "alislar") {
        setTitle("Alışlar"); loading("Alış merkezi hazırlanıyor...");
        try {
            const [a, i, t] = await Promise.all([api("/api/tenant/alis"), api("/api/tenant/alis/iade"), api("/api/tenant/tedarikciler")]);
            alisMerkezi = { alislar: a.alislar || [], iadeler: i.iadeler || [], tedarikciler: (t.tedarikciler || []).filter(x => x.aktif !== false) };
            const toplam = alisMerkezi.alislar.reduce((n, x) => n + Number(x.genelToplam || 0), 0), odenen = alisMerkezi.alislar.reduce((n, x) => n + Number(x.odenenTutar || 0), 0), kalan = alisMerkezi.alislar.reduce((n, x) => n + Number(x.kalanTutar || 0), 0), iadeToplam = alisMerkezi.iadeler.reduce((n, x) => n + Number(x.genelToplam || 0), 0), buAy = alisMerkezi.alislar.filter(x => { const d = new Date(x.tarih), n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); }).reduce((n, x) => n + Number(x.genelToplam || 0), 0);
            content.innerHTML = `<div class="purchase-hero"><div><span>ALIŞ MERKEZİ</span><h2>Satın alma ve tedarik kontrolü</h2><p>Alış faturalarını, ödemeleri, iadeleri ve stok girişlerini tek merkezden yönetin.</p></div><div class="stock-hero-actions"><button id="alisExcel">Excel Dökümü</button><button id="alisYazdir">Yazdır / PDF</button><button id="alisYenile">Yenile</button><button id="alisYeni">+ Yeni Alış</button></div></div><div class="dashboard-grid">${card("Toplam Alış", para(toplam), `${alisMerkezi.alislar.length} belge`)}${card("Bu Ay", para(buAy), "Aylık satın alma")}${card("Ödenen", para(odenen), "Gerçekleşen ödeme")}${card("Açık Borç", para(kalan), "Ödenecek tutar")}${card("Alış İadesi", para(iadeToplam), `${alisMerkezi.iadeler.length} belge`)}</div><div class="stock-tabs">${[["alislar", "Alış Faturaları"], ["yeni", "Yeni Alış"], ["iadeler", "Alış İadeleri"], ["iade", "Yeni İade"], ["analiz", "Tedarikçi Analizi"]].map(([k, l]) => `<button data-alis-tab="${k}" class="${aktifSekme === k ? "active" : ""}">${l}</button>`).join("")}</div><div id="alisAltPanel"></div>`;
            const panel = content.querySelector("#alisAltPanel");
            const ac = key => { content.querySelectorAll("[data-alis-tab]").forEach(b => b.classList.toggle("active", b.dataset.alisTab === key)); if (key === "yeni") return alisIslemBaslat(panel, "alis"); if (key === "iade") return alisIslemBaslat(panel, "iade"); if (key === "iadeler") return alisIadeListesi(panel); if (key === "analiz") return alisTedarikciAnalizi(panel); return alisFaturaListesi(panel); };
            content.querySelectorAll("[data-alis-tab]").forEach(b => b.onclick = () => ac(b.dataset.alisTab));
            content.querySelector("#alisYeni").onclick = () => ac("yeni"); content.querySelector("#alisYenile").onclick = () => alisMerkeziYukle(aktifSekme); content.querySelector("#alisExcel").onclick = alisExcelDokumu; content.querySelector("#alisYazdir").onclick = () => alisListeYazdir(alisMerkezi.alislar, "Alış Faturaları Dökümü"); ac(aktifSekme);
        } catch (error) { errorBox(error); }
    }

    function alisFaturaListesi(panel) {
        const rows = alisMerkezi.alislar;
        panel.innerHTML = `<div class="dashboard-panel"><div class="stock-filterbar"><input id="alisAra" class="erp-input" placeholder="Belge, tedarikçi veya depo ara"><select id="alisDurum"><option value="">Tüm ödeme durumları</option><option value="ACIK">Açık</option><option value="KISMI">Kısmi</option><option value="ODENDI">Ödendi</option></select><input id="alisBaslangic" type="date" title="Başlangıç"><input id="alisBitis" type="date" title="Bitiş"></div><div class="table-scroll"><table><thead><tr><th>Tarih / Belge</th><th>Tedarikçi</th><th>Depo</th><th>Toplam</th><th>Ödenen</th><th>Kalan</th><th>Durum</th><th></th></tr></thead><tbody id="alisGovde">${rows.length ? rows.map((x, i) => `<tr data-index="${i}" data-durum="${escapeHtml(x.odemeDurumu || "")}" data-tarih="${String(x.tarih || "").slice(0, 10)}"><td>${tarihKisa(x.tarih)}<small>${escapeHtml(x.belgeNo)}</small></td><td><b>${escapeHtml(x.tedarikciId?.kod || "-")}</b><small>${escapeHtml(x.tedarikciId?.unvan || x.tedarikciId?.adSoyad || "-")}</small></td><td>${escapeHtml(x.depoId?.ad || "-")}</td><td><b>${para(x.genelToplam)}</b></td><td>${para(x.odenenTutar)}</td><td>${para(x.kalanTutar)}</td><td><span class="purchase-status ${String(x.odemeDurumu || "").toLowerCase()}">${escapeHtml(x.odemeDurumu || "-")}</span></td><td><button class="erp-small-button" data-alis-detay="${i}">Detay</button></td></tr>`).join("") : '<tr><td colspan="8">Henüz alış faturası yok.</td></tr>'}</tbody></table></div></div>`;
        const uygula = () => { const q = panel.querySelector("#alisAra").value.toLocaleLowerCase("tr-TR"), durum = panel.querySelector("#alisDurum").value, bas = panel.querySelector("#alisBaslangic").value, bit = panel.querySelector("#alisBitis").value; panel.querySelectorAll("#alisGovde tr[data-index]").forEach(r => r.hidden = (q && !r.textContent.toLocaleLowerCase("tr-TR").includes(q)) || (durum && r.dataset.durum !== durum) || (bas && r.dataset.tarih < bas) || (bit && r.dataset.tarih > bit)); };
        ["#alisAra", "#alisDurum", "#alisBaslangic", "#alisBitis"].forEach(s => { const e = panel.querySelector(s); e.oninput = e.onchange = uygula; }); panel.querySelectorAll("[data-alis-detay]").forEach(b => b.onclick = () => alisDetayAc(rows[Number(b.dataset.alisDetay)]._id));
    }

    function alisIslemBaslat(panel, tur) {
        panel.innerHTML = `<div class="dashboard-panel"><div class="panel-heading"><div><h2>${tur === "alis" ? "Yeni Alış Faturası" : "Yeni Alış İadesi"}</h2><p>İşleme devam etmek için tedarikçi seçin.</p></div></div><div class="purchase-start"><label>Tedarikçi<select id="alisTedarikciSec"><option value="">Tedarikçi seçin</option>${stokSecenekleri(alisMerkezi.tedarikciler)}</select></label><button id="alisDevam" class="erp-primary-button">Belgeyi Hazırla</button></div></div>`;
        panel.querySelector("#alisDevam").onclick = () => { const id = panel.querySelector("#alisTedarikciSec").value, t = alisMerkezi.tedarikciler.find(x => String(x._id) === id); if (!t) return alert("Tedarikçi seçin."); tedarikciBelgeFormu(tur, t, "alis"); };
    }

    async function alisDetayAc(id) {
        try { const d = await api(`/api/tenant/alis/${id}`), x = d.alis, rows = x.kalemler || []; document.getElementById("alisDetayModal")?.remove(); const overlay = document.createElement("div"); overlay.id = "alisDetayModal"; overlay.className = "erp-modal-overlay"; overlay.innerHTML = `<div class="erp-modal"><div class="erp-modal-header"><div><h2>Alış Faturası · ${escapeHtml(x.belgeNo)}</h2><p>${tarihKisa(x.tarih)} · ${escapeHtml(x.tedarikciId?.unvan || x.tedarikciId?.adSoyad || "-")}</p></div><button class="erp-modal-close">×</button></div><div class="purchase-detail-meta"><span>Depo <b>${escapeHtml(x.depoId?.ad || "-")}</b></span><span>Durum <b>${escapeHtml(x.odemeDurumu)}</b></span><span>Kalan <b>${para(x.kalanTutar)}</b></span></div><div class="table-scroll"><table><thead><tr><th>Kod</th><th>Ürün</th><th>Miktar</th><th>Fiyat</th><th>KDV</th><th>İskonto</th><th>Toplam</th></tr></thead><tbody>${rows.map(k => `<tr><td>${escapeHtml(k.urunId?.kod || "-")}</td><td>${escapeHtml(k.urunId?.ad || "-")}</td><td>${Number(k.miktar)}</td><td>${para(k.birimFiyat)}</td><td>%${Number(k.kdv)}</td><td>%${Number(k.iskonto)}</td><td><b>${para(k.toplam)}</b></td></tr>`).join("")}</tbody></table></div><div class="purchase-totals"><span>Ara Toplam <b>${para(x.araToplam)}</b></span><span>KDV <b>${para(x.toplamKdv)}</b></span><span>Genel Toplam <b>${para(x.genelToplam)}</b></span></div><div class="erp-modal-footer"><button id="alisDetayYazdir" class="erp-primary-button">Yazdır / PDF</button><button data-kapat class="erp-small-button">Kapat</button></div></div>`; document.body.appendChild(overlay); const kapat = () => overlay.remove(); overlay.querySelectorAll(".erp-modal-close,[data-kapat]").forEach(b => b.onclick = kapat); overlay.querySelector("#alisDetayYazdir").onclick = () => stokYazdir(`Alış Faturası · ${x.belgeNo}`, rows.map(k => [k.urunId?.kod, k.urunId?.ad, k.miktar, para(k.birimFiyat), `%${k.kdv}`, `%${k.iskonto}`, para(k.toplam)]), ["Kod", "Ürün", "Miktar", "Birim Fiyat", "KDV", "İskonto", "Toplam"], `${x.tedarikciId?.unvan || ""} · Genel toplam ${para(x.genelToplam)}`); } catch (error) { alert(error.message); }
    }

    function alisIadeListesi(panel) { const rows = alisMerkezi.iadeler; panel.innerHTML = `<div class="dashboard-panel"><div class="panel-heading"><div><h2>Alış İadeleri</h2><p>${rows.length} iade belgesi</p></div></div><div class="table-scroll"><table><thead><tr><th>Tarih / Belge</th><th>Tedarikçi</th><th>Depo</th><th>Kalem</th><th>Toplam</th><th>Açıklama</th></tr></thead><tbody>${rows.map(x => `<tr><td>${tarihKisa(x.tarih)}<small>${escapeHtml(x.belgeNo)}</small></td><td>${escapeHtml(x.tedarikciId?.unvan || x.tedarikciId?.adSoyad || "-")}</td><td>${escapeHtml(x.depoId?.ad || "-")}</td><td>${x.kalemler?.length || 0}</td><td><b>${para(x.genelToplam)}</b></td><td>${escapeHtml(x.aciklama || "-")}</td></tr>`).join("") || '<tr><td colspan="6">Alış iadesi bulunmuyor.</td></tr>'}</tbody></table></div></div>`; }

    function alisTedarikciAnalizi(panel) { const map = {}; alisMerkezi.alislar.forEach(x => { const id = String(x.tedarikciId?._id || ""), ad = x.tedarikciId?.unvan || x.tedarikciId?.adSoyad || "Tedarikçi"; if (!map[id]) map[id] = { ad, adet: 0, toplam: 0, kalan: 0 }; map[id].adet++; map[id].toplam += Number(x.genelToplam || 0); map[id].kalan += Number(x.kalanTutar || 0); }); panel.innerHTML = `<div class="dashboard-panel"><div class="panel-heading"><div><h2>Tedarikçi Satın Alma Analizi</h2><p>Toplam alış hacmi ve açık borç karşılaştırması</p></div></div><div class="table-scroll"><table><thead><tr><th>Tedarikçi</th><th>Belge</th><th>Toplam Alış</th><th>Açık Borç</th><th>Ortalama Belge</th></tr></thead><tbody>${Object.values(map).sort((a, b) => b.toplam - a.toplam).map(x => `<tr><td><b>${escapeHtml(x.ad)}</b></td><td>${x.adet}</td><td>${para(x.toplam)}</td><td>${para(x.kalan)}</td><td>${para(x.toplam / x.adet)}</td></tr>`).join("") || '<tr><td colspan="5">Analiz için alış kaydı yok.</td></tr>'}</tbody></table></div></div>`; }

    function alisListeYazdir(rows, baslik) { stokYazdir(baslik, rows.map(x => [tarihKisa(x.tarih), x.belgeNo, x.tedarikciId?.unvan || x.tedarikciId?.adSoyad, x.depoId?.ad, para(x.genelToplam), para(x.odenenTutar), para(x.kalanTutar), x.odemeDurumu]), ["Tarih", "Belge", "Tedarikçi", "Depo", "Toplam", "Ödenen", "Kalan", "Durum"]); }
    function alisExcelDokumu() { if (!window.XLSX) return alert("Excel kitaplığı yüklenemedi."); const ws = XLSX.utils.json_to_sheet(alisMerkezi.alislar.map(x => ({ Tarih: String(x.tarih || "").slice(0, 10), "Belge No": x.belgeNo, "Tedarikçi Kodu": x.tedarikciId?.kod || "", Tedarikçi: x.tedarikciId?.unvan || x.tedarikciId?.adSoyad || "", Depo: x.depoId?.ad || "", "Ara Toplam": Number(x.araToplam || 0), KDV: Number(x.toplamKdv || 0), "Genel Toplam": Number(x.genelToplam || 0), Ödenen: Number(x.odenenTutar || 0), Kalan: Number(x.kalanTutar || 0), Durum: x.odemeDurumu }))); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Alışlar"); XLSX.writeFile(wb, `alis-dokumu-${new Date().toISOString().slice(0, 10)}.xlsx`); }

    let stokMerkezi = { stoklar: [], urunler: [], depolar: [], hareketler: [], transferler: [], sayimlar: [] };

    function stokDurumu(item) {
        const miktar = Number(item.miktar || 0);
        const kritik = Number(item.urunId?.kritikStok || item.urunId?.minimumStok || 0);
        if (kritik > 0 && miktar <= kritik) return { className: "danger", label: "Kritik" };
        if (kritik > 0 && miktar <= kritik * 1.5) return { className: "warn", label: "Düşük" };
        return { className: "ok", label: "Normal" };
    }

    function stokSecenekleri(list, selected = "") {
        return list.map(x => `<option value="${x._id}" ${String(x._id) === String(selected) ? "selected" : ""}>${escapeHtml(x.kod || "")} · ${escapeHtml(x.ad || x.unvan || "")}</option>`).join("");
    }

    async function stokMerkeziYukle(aktifSekme = "liste") {
        setTitle("Stok");
        loading("Stok merkezi hazırlanıyor...");
        try {
            const [stokData, urunData, depoData, hareketData, transferData, sayimData] = await Promise.all([
                api("/api/tenant/stok"),
                api("/api/tenant/urunler?aktif=true"),
                api("/api/tenant/stok/depolar"),
                api("/api/tenant/stok/hareketler"),
                api("/api/tenant/stok/transferler"),
                api("/api/tenant/stok/sayimlar")
            ]);
            stokMerkezi = {
                stoklar: stokData.stoklar || [],
                urunler: urunData.urunler || [],
                depolar: depoData.depolar || [],
                hareketler: hareketData.hareketler || [],
                transferler: transferData.transferler || [],
                sayimlar: sayimData.sayimlar || []
            };
            const toplamMiktar = stokMerkezi.stoklar.reduce((n, x) => n + Number(x.miktar || 0), 0);
            const stokDegeri = stokMerkezi.stoklar.reduce((n, x) => n + Number(x.miktar || 0) * Number(x.maliyet || x.urunId?.alisFiyati || 0), 0);
            const kritikler = stokMerkezi.stoklar.filter(x => stokDurumu(x).className === "danger");
            const hareketsiz = stokMerkezi.stoklar.filter(x => {
                if (!x.sonHareketTarihi && !x.updatedAt) return true;
                return Date.now() - new Date(x.sonHareketTarihi || x.updatedAt).getTime() > 30 * 86400000;
            });

            content.innerHTML = `<div class="stock-hero"><div><span>STOK MERKEZİ</span><h2>Depo, sayım ve transfer kontrolü</h2><p>Ürün bazlı stokları, kritik seviyeleri ve hareket geçmişini tek panelden yönetin.</p></div><div class="stock-hero-actions"><button id="stokExcel">Excel Dökümü</button><button id="stokYazdir">Yazdır / PDF</button><button id="stokYenile">Yenile</button><button id="stokHizliHareket">Hızlı Hareket</button></div></div><div class="dashboard-grid">${card("Toplam Stok", toplamMiktar, "Tüm depo satırları")}${card("Stok Değeri", para(stokDegeri), "Maliyet üzerinden")}${card("Kritik Satır", kritikler.length, "Acil kontrol")}${card("Hareketsiz", hareketsiz.length, "30 günü aşan")}${card("Aktif Depo", stokMerkezi.depolar.length, "Kullanılabilir depo")}</div><div class="stock-tabs">${[["liste", "Stok Listesi"], ["kritik", "Kritik Stok"], ["sayim", "Sayım Ekranı"], ["hareket", "Hareket İşle"], ["transfer", "Depo Transfer"], ["transferler", "Transfer Fişleri"], ["sayimlar", "Sayım Tutanakları"], ["depolar", "Depolar"], ["gecmis", "Hareket Geçmişi"]].map(([k, l]) => `<button data-stok-tab="${k}" class="${aktifSekme === k ? "active" : ""}">${l}</button>`).join("")}</div><div id="stokAltPanel"></div>`;

            const panel = content.querySelector("#stokAltPanel");
            let aktifStokSekme = aktifSekme;
            const sekmeAc = key => {
                aktifStokSekme = key;
                content.querySelectorAll("[data-stok-tab]").forEach(b => b.classList.toggle("active", b.dataset.stokTab === key));
                if (key === "kritik") return stokKritikPanel(panel);
                if (key === "sayim") return stokSayimPaneli(panel);
                if (key === "sayimlar") return stokSayimGecmisi(panel);
                if (key === "hareket") return stokHareketFormu(panel);
                if (key === "transfer") return stokTransferFormu(panel);
                if (key === "transferler") return stokTransferGecmisi(panel);
                if (key === "depolar") return stokDepoPaneli(panel);
                if (key === "gecmis") return stokHareketGecmisi(panel);
                return stokListePaneli(panel);
            };
            content.querySelectorAll("[data-stok-tab]").forEach(b => b.onclick = () => sekmeAc(b.dataset.stokTab));
            content.querySelector("#stokYenile").onclick = () => stokMerkeziYukle(aktifStokSekme);
            content.querySelector("#stokHizliHareket").onclick = () => sekmeAc("hareket");
            content.querySelector("#stokExcel").onclick = stokExcelDokumu;
            content.querySelector("#stokYazdir").onclick = () => stokYazdir("Güncel Stok Dökümü", stokMerkezi.stoklar.map(x => [x.urunId?.kod, x.urunId?.ad, x.depoId?.ad, x.miktar, x.urunId?.birim, para(x.maliyet), para(Number(x.miktar || 0) * Number(x.maliyet || 0))]), ["Kod", "Ürün", "Depo", "Miktar", "Birim", "Maliyet", "Değer"]);
            sekmeAc(aktifSekme);
        } catch (error) { errorBox(error); }
    }

    function stokYazdir(baslik, satirlar, kolonlar, altBilgi = "") {
        const pencere = window.open("", "_blank");
        if (!pencere) return alert("Döküm için açılır pencereye izin verin.");
        pencere.opener = null;
        const hucreler = satirlar.map(row => `<tr>${row.map(x => `<td>${escapeHtml(x ?? "-")}</td>`).join("")}</tr>`).join("");
        pencere.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${escapeHtml(baslik)}</title><style>body{font:12px Arial;color:#172033;margin:28px}h1{font-size:22px;margin:0 0 5px}.meta{color:#64748b;margin-bottom:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:7px;text-align:left}th{background:#e2e8f0}.footer{margin-top:24px;color:#475569}@media print{button{display:none}}</style></head><body><h1>BAHADIR ERP · ${escapeHtml(baslik)}</h1><div class="meta">Döküm tarihi: ${new Date().toLocaleString("tr-TR")}</div><table><thead><tr>${kolonlar.map(x => `<th>${escapeHtml(x)}</th>`).join("")}</tr></thead><tbody>${hucreler || `<tr><td colspan="${kolonlar.length}">Kayıt yok</td></tr>`}</tbody></table><div class="footer">${escapeHtml(altBilgi)}</div><script>window.onload=()=>window.print()<\/script></body></html>`);
        pencere.document.close();
    }

    function stokExcelDokumu() {
        if (!window.XLSX) return alert("Excel kitaplığı yüklenemedi.");
        const rows = stokMerkezi.stoklar.map(x => ({ "Ürün Kodu": x.urunId?.kod || "", Barkod: x.urunId?.barkod || "", Ürün: x.urunId?.ad || "", Depo: x.depoId?.ad || "", "Depo Kodu": x.depoId?.kod || "", Miktar: Number(x.miktar || 0), Birim: x.urunId?.birim || "", Maliyet: Number(x.maliyet || 0), "Stok Değeri": Number(x.miktar || 0) * Number(x.maliyet || 0), Durum: stokDurumu(x).label, "Son Hareket": x.sonHareketTarihi || "" }));
        const ws = XLSX.utils.json_to_sheet(rows), wb = XLSX.utils.book_new();
        ws["!cols"] = [{ wch: 16 }, { wch: 18 }, { wch: 32 }, { wch: 24 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, ws, "Stok Dökümü");
        XLSX.writeFile(wb, `stok-dokumu-${new Date().toISOString().slice(0, 10)}.xlsx`);
    }

    function stokSayimPaneli(panel) {
        panel.innerHTML = `<div class="dashboard-panel stock-panel"><div class="panel-heading"><div><h2>Depo Sayım Ekranı</h2><p>Depoyu seçin, sayılan miktarları girin ve farkları tek tutanakla işleyin.</p></div><button id="sayimBosForm" class="erp-small-button">Boş Sayım Formu</button></div><div class="erp-form-grid"><label>Sayım No<input id="sayimBelgeNo" value="SYM-${Date.now()}"></label><label>Tarih<input id="sayimTarih" type="date" value="${new Date().toISOString().slice(0, 10)}"></label><label>Depo<select id="sayimDepo"><option value="">Depo seçin</option>${stokSecenekleri(stokMerkezi.depolar)}</select></label><label>Ürün Ara<input id="sayimAra" placeholder="Kod, barkod veya ürün"></label><label class="full">Açıklama<input id="sayimAciklama" placeholder="Sayım notu / ekip bilgisi"></label></div><div id="sayimMesaj"></div><div class="stock-count-summary" id="sayimOzet"></div><div class="table-scroll"><table><thead><tr><th>Kod / Barkod</th><th>Ürün</th><th>Birim</th><th>Sistem</th><th>Sayılan</th><th>Fark</th></tr></thead><tbody id="sayimGovde"><tr><td colspan="6">Sayım için depo seçin.</td></tr></tbody></table></div><div class="stock-form-actions"><button id="sayimKaydet" class="erp-primary-button" disabled>Sayımı Tamamla ve Farkları İşle</button></div></div>`;
        const depo = panel.querySelector("#sayimDepo"), govde = panel.querySelector("#sayimGovde"), ozet = panel.querySelector("#sayimOzet");
        const ozetle = () => { const rows = [...govde.querySelectorAll("tr[data-urun]")]; let arti = 0, eksi = 0, farkli = 0; rows.forEach(row => { const fark = Number(row.querySelector("input").value || 0) - Number(row.dataset.sistem || 0); row.querySelector("[data-fark]").textContent = fark > 0 ? `+${fark}` : String(fark); row.classList.toggle("stock-count-diff", fark !== 0); if (fark > 0) arti += fark; if (fark < 0) eksi += Math.abs(fark); if (fark) farkli++; }); ozet.innerHTML = `<span>${rows.length} ürün</span><span>${farkli} farklı satır</span><span class="positive">+${arti}</span><span class="negative">-${eksi}</span>`; };
        const doldur = () => { const depoId = depo.value; if (!depoId) return; const map = new Map(stokMerkezi.stoklar.filter(x => String(x.depoId?._id) === depoId).map(x => [String(x.urunId?._id), Number(x.miktar || 0)])); govde.innerHTML = stokMerkezi.urunler.map(u => { const sistem = map.get(String(u._id)) || 0; return `<tr data-urun="${u._id}" data-sistem="${sistem}"><td><b>${escapeHtml(u.kod)}</b><small>${escapeHtml(u.barkod || "-")}</small></td><td>${escapeHtml(u.ad)}</td><td>${escapeHtml(u.birim || "")}</td><td><b>${sistem}</b></td><td><input class="stock-count-input" type="number" min="0" step="0.0001" value="${sistem}"></td><td data-fark>0</td></tr>`; }).join("") || '<tr><td colspan="6">Aktif ürün yok.</td></tr>'; govde.querySelectorAll("input").forEach(x => x.oninput = ozetle); panel.querySelector("#sayimKaydet").disabled = !stokMerkezi.urunler.length; ozetle(); };
        depo.onchange = doldur;
        panel.querySelector("#sayimAra").oninput = e => { const q = e.target.value.toLocaleLowerCase("tr-TR"); govde.querySelectorAll("tr[data-urun]").forEach(row => row.hidden = !row.textContent.toLocaleLowerCase("tr-TR").includes(q)); };
        panel.querySelector("#sayimBosForm").onclick = () => { if (!depo.value) return alert("Önce depo seçin."); stokYazdir(`Boş Sayım Formu · ${depo.options[depo.selectedIndex].text}`, [...govde.querySelectorAll("tr[data-urun]")].map(r => [r.cells[0].innerText, r.cells[1].innerText, r.cells[2].innerText, r.dataset.sistem, "", ""]), ["Kod / Barkod", "Ürün", "Birim", "Sistem", "Sayılan", "Fark"]); };
        panel.querySelector("#sayimKaydet").onclick = async () => { if (!depo.value) return alert("Depo seçin."); if (!confirm("Sayım tamamlanacak ve stok farkları işlenecek. Devam edilsin mi?")) return; const mesaj = panel.querySelector("#sayimMesaj"); try { const kalemler = [...govde.querySelectorAll("tr[data-urun]")].map(row => ({ urunId: row.dataset.urun, sayilanMiktar: Number(row.querySelector("input").value) })); await api("/api/tenant/stok/sayim", { method: "POST", body: JSON.stringify({ belgeNo: panel.querySelector("#sayimBelgeNo").value, tarih: panel.querySelector("#sayimTarih").value, depoId: depo.value, aciklama: panel.querySelector("#sayimAciklama").value, kalemler }) }); await stokMerkeziYukle("sayimlar"); } catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
    }

    function stokListePaneli(panel) {
        const rows = stokMerkezi.stoklar;
        const depoOptions = stokSecenekleri(stokMerkezi.depolar);
        panel.innerHTML = `<div class="dashboard-panel stock-panel"><div class="stock-filterbar"><input id="stokAra" class="erp-input" placeholder="Kod, barkod, ürün veya depo ara"><select id="stokDepoFiltre"><option value="">Tüm depolar</option>${depoOptions}</select><select id="stokDurumFiltre"><option value="">Tüm durumlar</option><option value="danger">Kritik</option><option value="warn">Düşük</option><option value="ok">Normal</option></select></div><div class="table-scroll"><table><thead><tr><th>Ürün</th><th>Depo</th><th>Miktar</th><th>Maliyet</th><th>Değer</th><th>Durum</th><th>Son Hareket</th></tr></thead><tbody id="stokListeGovde">${rows.length ? rows.map(x => { const durum = stokDurumu(x); return `<tr data-depo="${x.depoId?._id || ""}" data-durum="${durum.className}"><td><b>${escapeHtml(x.urunId?.kod || "-")}</b><small>${escapeHtml(x.urunId?.ad || "-")} · ${escapeHtml(x.urunId?.barkod || "Barkod yok")}</small></td><td>${escapeHtml(x.depoId?.ad || "-")}<small>${escapeHtml(x.depoId?.kod || "")}</small></td><td><b>${Number(x.miktar || 0)} ${escapeHtml(x.urunId?.birim || "")}</b></td><td>${para(x.maliyet || x.urunId?.alisFiyati)}</td><td>${para(Number(x.miktar || 0) * Number(x.maliyet || x.urunId?.alisFiyati || 0))}</td><td><span class="stock-status ${durum.className}">${durum.label}</span></td><td>${x.sonHareketTarihi ? tarihKisa(x.sonHareketTarihi) : "-"}</td></tr>`; }).join("") : '<tr><td colspan="7">Henüz stok kaydı yok.</td></tr>'}</tbody></table></div></div>`;
        const uygula = () => {
            const q = panel.querySelector("#stokAra").value.toLocaleLowerCase("tr-TR");
            const depo = panel.querySelector("#stokDepoFiltre").value;
            const durum = panel.querySelector("#stokDurumFiltre").value;
            panel.querySelectorAll("#stokListeGovde tr").forEach(row => {
                if (!row.dataset.durum) return;
                row.hidden = (q && !row.textContent.toLocaleLowerCase("tr-TR").includes(q)) || (depo && row.dataset.depo !== depo) || (durum && row.dataset.durum !== durum);
            });
        };
        panel.querySelector("#stokAra").oninput = uygula;
        panel.querySelector("#stokDepoFiltre").onchange = uygula;
        panel.querySelector("#stokDurumFiltre").onchange = uygula;
    }

    function stokKritikPanel(panel) {
        const kritikler = stokMerkezi.stoklar.filter(x => stokDurumu(x).className !== "ok");
        panel.innerHTML = `<div class="dashboard-panel stock-panel"><div class="panel-heading"><div><h2>Kritik ve Düşük Stok</h2><p>Minimum veya kritik seviyeye yaklaşan ürünler.</p></div></div><div class="table-scroll"><table><thead><tr><th>Ürün</th><th>Depo</th><th>Mevcut</th><th>Kritik</th><th>Minimum</th><th>Öneri</th></tr></thead><tbody>${kritikler.length ? kritikler.map(x => { const mevcut = Number(x.miktar || 0), kritik = Number(x.urunId?.kritikStok || 0), min = Number(x.urunId?.minimumStok || 0), hedef = Math.max(kritik, min); return `<tr><td><b>${escapeHtml(x.urunId?.kod || "-")}</b><small>${escapeHtml(x.urunId?.ad || "-")}</small></td><td>${escapeHtml(x.depoId?.ad || "-")}</td><td><b>${mevcut}</b></td><td>${kritik}</td><td>${min}</td><td>${hedef > mevcut ? `${hedef - mevcut} ${escapeHtml(x.urunId?.birim || "")} tamamlanmalı` : "Kontrol edin"}</td></tr>`; }).join("") : '<tr><td colspan="6">Kritik stok bulunmuyor.</td></tr>'}</tbody></table></div></div>`;
    }

    function stokHareketFormu(panel) {
        panel.innerHTML = `<div class="dashboard-panel stock-panel"><div class="panel-heading"><div><h2>Manuel Stok Hareketi</h2><p>Giriş, çıkış, sayım farkı veya iade hareketi işleyin.</p></div></div><form id="stokHareketForm" class="erp-form-grid"><label>Ürün<select name="urunId" required><option value="">Ürün seçin</option>${stokSecenekleri(stokMerkezi.urunler)}</select></label><label>Depo<select name="depoId" required><option value="">Depo seçin</option>${stokSecenekleri(stokMerkezi.depolar)}</select></label><label>Hareket Tipi<select name="tip" required><option value="GIRIS">Giriş</option><option value="CIKIS">Çıkış</option><option value="SAYIM_ARTI">Sayım Fazlası</option><option value="SAYIM_EKSI">Sayım Eksiği</option><option value="IADE_GIRIS">İade Giriş</option><option value="IADE_CIKIS">İade Çıkış</option></select></label><label>Miktar<input name="miktar" type="number" min="0.0001" step="0.0001" required></label><label>Birim Maliyet<input name="birimMaliyet" type="number" min="0" step="0.01" placeholder="Mevcut maliyet"></label><label class="full">Açıklama<textarea name="aciklama" placeholder="Sayım, düzeltme veya işlem notu"></textarea></label><div id="stokHareketMesaj" class="full"></div><div class="full"><button class="erp-primary-button" type="submit">Hareketi Kaydet</button></div></form></div>`;
        panel.querySelector("#stokHareketForm").onsubmit = async event => {
            event.preventDefault();
            const form = event.currentTarget, mesaj = panel.querySelector("#stokHareketMesaj");
            try {
                const body = Object.fromEntries(new FormData(form).entries());
                body.miktar = Number(body.miktar || 0);
                if (body.birimMaliyet === "") delete body.birimMaliyet;
                else body.birimMaliyet = Number(body.birimMaliyet);
                await api("/api/tenant/stok/hareket", { method: "POST", body: JSON.stringify(body) });
                mesaj.innerHTML = `<div class="success">Stok hareketi kaydedildi.</div>`;
                await stokMerkeziYukle("liste");
            } catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; }
        };
    }

    function stokTransferFormu(panel) {
        panel.innerHTML = `<div class="dashboard-panel stock-panel"><div class="panel-heading"><div><h2>Depolar Arası Transfer Fişi</h2><p>Kaynak stok kontrolüyle çift taraflı depo hareketi ve kalıcı transfer fişi oluşturun.</p></div></div><form id="stokTransferForm" class="erp-form-grid"><label>Transfer No<input name="belgeNo" value="TRF-${Date.now()}" required></label><label>Tarih<input name="tarih" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label><label>Ürün<select name="urunId" required><option value="">Ürün seçin</option>${stokSecenekleri(stokMerkezi.urunler)}</select></label><label>Çıkış Deposu<select name="kaynakDepoId" required><option value="">Depo seçin</option>${stokSecenekleri(stokMerkezi.depolar)}</select></label><label>Giriş Deposu<select name="hedefDepoId" required><option value="">Depo seçin</option>${stokSecenekleri(stokMerkezi.depolar)}</select></label><label>Miktar<input name="miktar" type="number" min="0.0001" step="0.0001" required></label><label>Birim Maliyet<input name="birimMaliyet" type="number" min="0" step="0.01" placeholder="Kaynak maliyet kullanılır"></label><label class="full">Açıklama<textarea name="aciklama" placeholder="Sevk, araç, teslim alan veya transfer notu"></textarea></label><div id="stokTransferMesaj" class="full"></div><div class="full"><button class="erp-primary-button" type="submit">Transfer Fişini Oluştur</button></div></form></div>`;
        panel.querySelector("#stokTransferForm").onsubmit = async event => {
            event.preventDefault();
            const form = event.currentTarget, mesaj = panel.querySelector("#stokTransferMesaj");
            try {
                const body = Object.fromEntries(new FormData(form).entries());
                body.miktar = Number(body.miktar || 0);
                if (body.birimMaliyet === "") delete body.birimMaliyet;
                else body.birimMaliyet = Number(body.birimMaliyet);
                await api("/api/tenant/stok/transfer", { method: "POST", body: JSON.stringify(body) });
                mesaj.innerHTML = `<div class="success">Depo transferi kaydedildi.</div>`;
                await stokMerkeziYukle("liste");
            } catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; }
        };
    }

    function stokTransferGecmisi(panel) {
        const rows = stokMerkezi.transferler;
        panel.innerHTML = `<div class="dashboard-panel stock-panel"><div class="panel-heading"><div><h2>Transfer Fişleri</h2><p>${rows.length} kayıtlı depo transferi</p></div></div><div class="table-scroll"><table><thead><tr><th>Tarih / Fiş</th><th>Ürün</th><th>Kaynak</th><th>Hedef</th><th>Miktar</th><th>Değer</th><th></th></tr></thead><tbody>${rows.length ? rows.map((x, i) => `<tr><td>${tarihKisa(x.tarih)}<small>${escapeHtml(x.belgeNo)}</small></td><td><b>${escapeHtml(x.urunId?.kod || "-")}</b><small>${escapeHtml(x.urunId?.ad || "-")}</small></td><td>${escapeHtml(x.kaynakDepoId?.ad || "-")}</td><td>${escapeHtml(x.hedefDepoId?.ad || "-")}</td><td><b>${Number(x.miktar || 0)} ${escapeHtml(x.urunId?.birim || "")}</b></td><td>${para(Number(x.miktar || 0) * Number(x.birimMaliyet || 0))}</td><td><button class="erp-small-button" data-transfer-yazdir="${i}">Döküm</button></td></tr>`).join("") : '<tr><td colspan="7">Transfer fişi bulunmuyor.</td></tr>'}</tbody></table></div></div>`;
        panel.querySelectorAll("[data-transfer-yazdir]").forEach(button => button.onclick = () => { const x = rows[Number(button.dataset.transferYazdir)]; stokYazdir(`Transfer Fişi · ${x.belgeNo}`, [[tarihKisa(x.tarih), x.urunId?.kod, x.urunId?.ad, x.kaynakDepoId?.ad, x.hedefDepoId?.ad, `${x.miktar} ${x.urunId?.birim || ""}`, para(x.birimMaliyet), para(Number(x.miktar || 0) * Number(x.birimMaliyet || 0))]], ["Tarih", "Kod", "Ürün", "Çıkış Deposu", "Giriş Deposu", "Miktar", "Maliyet", "Toplam"], x.aciklama || ""); });
    }

    function stokSayimGecmisi(panel) {
        const rows = stokMerkezi.sayimlar;
        panel.innerHTML = `<div class="dashboard-panel stock-panel"><div class="panel-heading"><div><h2>Sayım Tutanakları</h2><p>Tamamlanan sayımlar ve işlenen farklar</p></div></div><div class="table-scroll"><table><thead><tr><th>Tarih / Tutanak</th><th>Depo</th><th>Kalem</th><th>Farklı</th><th>Artı</th><th>Eksi</th><th></th></tr></thead><tbody>${rows.length ? rows.map((x, i) => { const farkli = x.kalemler.filter(k => Number(k.fark) !== 0), arti = farkli.filter(k => k.fark > 0).reduce((n, k) => n + k.fark, 0), eksi = farkli.filter(k => k.fark < 0).reduce((n, k) => n + Math.abs(k.fark), 0); return `<tr><td>${tarihKisa(x.tarih)}<small>${escapeHtml(x.belgeNo)}</small></td><td>${escapeHtml(x.depoId?.ad || "-")}</td><td>${x.kalemler.length}</td><td><b>${farkli.length}</b></td><td class="stock-positive">+${arti}</td><td class="stock-negative">-${eksi}</td><td><button class="erp-small-button" data-sayim-yazdir="${i}">Tutanak</button></td></tr>`; }).join("") : '<tr><td colspan="7">Sayım tutanağı bulunmuyor.</td></tr>'}</tbody></table></div></div>`;
        panel.querySelectorAll("[data-sayim-yazdir]").forEach(button => button.onclick = () => { const x = rows[Number(button.dataset.sayimYazdir)]; stokYazdir(`Sayım Tutanağı · ${x.belgeNo}`, x.kalemler.map(k => [k.urunId?.kod, k.urunId?.ad, k.sistemMiktari, k.sayilanMiktar, k.fark > 0 ? `+${k.fark}` : k.fark, k.urunId?.birim]), ["Kod", "Ürün", "Sistem", "Sayılan", "Fark", "Birim"], `${x.depoId?.ad || ""} · ${x.aciklama || ""}`); });
    }

    function stokDepoPaneli(panel) {
        panel.innerHTML = `<div class="stock-two-column"><div class="dashboard-panel stock-panel"><div class="panel-heading"><div><h2>Depolar</h2><p>Aktif depo listesi ve stok satırı sayıları.</p></div></div><div class="stock-depot-list">${stokMerkezi.depolar.length ? stokMerkezi.depolar.map(d => { const satir = stokMerkezi.stoklar.filter(x => String(x.depoId?._id) === String(d._id)); const miktar = satir.reduce((n, x) => n + Number(x.miktar || 0), 0); return `<div class="stock-depot"><b>${escapeHtml(d.kod)} · ${escapeHtml(d.ad)}</b><span>${miktar} adet · ${satir.length} ürün satırı</span><small>${escapeHtml(d.adres || "Adres yok")}</small></div>`; }).join("") : "<p>Henüz depo yok.</p>"}</div></div><div class="dashboard-panel stock-panel"><div class="panel-heading"><div><h2>Yeni Depo</h2><p>Stok işlemleri için depo kartı açın.</p></div></div><form id="stokDepoForm" class="erp-form-grid"><label>Depo Kodu<input name="kod" required maxlength="30"></label><label>Depo Adı<input name="ad" required maxlength="120"></label><label class="full">Adres<textarea name="adres"></textarea></label><div id="stokDepoMesaj" class="full"></div><div class="full"><button class="erp-primary-button" type="submit">Depoyu Kaydet</button></div></form></div></div>`;
        panel.querySelector("#stokDepoForm").onsubmit = async event => {
            event.preventDefault();
            const mesaj = panel.querySelector("#stokDepoMesaj");
            try {
                await api("/api/tenant/stok/depolar", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) });
                await stokMerkeziYukle("depolar");
            } catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; }
        };
    }

    function stokHareketGecmisi(panel) {
        const rows = stokMerkezi.hareketler;
        panel.innerHTML = `<div class="dashboard-panel stock-panel"><div class="stock-filterbar"><input id="stokHareketAra" class="erp-input" placeholder="Hareket, ürün, depo veya açıklama ara"><select id="stokHareketTip"><option value="">Tüm hareketler</option>${["GIRIS", "CIKIS", "SAYIM_ARTI", "SAYIM_EKSI", "IADE_GIRIS", "IADE_CIKIS", "TRANSFER_GIRIS", "TRANSFER_CIKIS"].map(x => `<option value="${x}">${x}</option>`).join("")}</select></div><div class="table-scroll"><table><thead><tr><th>Tarih</th><th>Tip</th><th>Ürün</th><th>Depo</th><th>Miktar</th><th>Maliyet</th><th>Kaynak</th><th>Açıklama</th></tr></thead><tbody id="stokHareketGovde">${rows.length ? rows.map(x => `<tr data-tip="${escapeHtml(x.tip || "")}"><td>${tarihKisa(x.createdAt || x.tarih)}</td><td><span class="stock-status ${String(x.tip || "").includes("CIKIS") || String(x.tip || "").includes("EKSI") ? "danger" : "ok"}">${escapeHtml(x.tip || "-")}</span></td><td><b>${escapeHtml(x.urunId?.kod || "-")}</b><small>${escapeHtml(x.urunId?.ad || "-")}</small></td><td>${escapeHtml(x.depoId?.ad || "-")}</td><td><b>${Number(x.miktar || 0)}</b></td><td>${para(x.birimMaliyet)}</td><td>${escapeHtml(x.kaynak || "-")}</td><td>${escapeHtml(x.aciklama || "-")}</td></tr>`).join("") : '<tr><td colspan="8">Henüz stok hareketi yok.</td></tr>'}</tbody></table></div></div>`;
        const uygula = () => {
            const q = panel.querySelector("#stokHareketAra").value.toLocaleLowerCase("tr-TR");
            const tip = panel.querySelector("#stokHareketTip").value;
            panel.querySelectorAll("#stokHareketGovde tr").forEach(row => {
                if (!row.dataset.tip) return;
                row.hidden = (q && !row.textContent.toLocaleLowerCase("tr-TR").includes(q)) || (tip && row.dataset.tip !== tip);
            });
        };
        panel.querySelector("#stokHareketAra").oninput = uygula;
        panel.querySelector("#stokHareketTip").onchange = uygula;
    }

    let urunV2Liste = [];
    let urunV2Index = 0;

    async function urunGorselHazirla(file) {
        if (!file) return "";
        if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error("JPG, PNG veya WebP görsel seçin.");
        return new Promise((resolve, reject) => {
            const img = new Image(), reader = new FileReader();
            reader.onerror = () => reject(new Error("Görsel okunamadı."));
            reader.onload = () => {
                img.onerror = () => reject(new Error("Görsel açılamadı.")); img.onload = () => {
                    const max = 1000, oran = Math.min(1, max / Math.max(img.width, img.height));
                    const canvas = document.createElement("canvas"); canvas.width = Math.round(img.width * oran); canvas.height = Math.round(img.height * oran);
                    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL("image/jpeg", .82));
                }; img.src = reader.result;
            }; reader.readAsDataURL(file);
        });
    }

    async function urunFormAc(mevcut = null) {
        const kategoriData = await api("/api/tenant/urunler/kategoriler");
        const kategoriler = kategoriData.kategoriler || [];
        document.getElementById("urunV2Modal")?.remove();
        const v = mevcut || {}, overlay = document.createElement("div"); overlay.id = "urunV2Modal"; overlay.className = "erp-modal-overlay";
        const alan = (n, l, t = "text", r = false) => `<label>${l}<input name="${n}" type="${t}" ${r ? "required" : ""} ${t === "number" ? 'min="0" step="0.01"' : ""} value="${escapeHtml(v[n] ?? "")}"></label>`;
        overlay.innerHTML = `<div class="erp-modal product-modal"><div class="erp-modal-header"><div><h2>${mevcut ? "Ürün Kartını Düzenle" : "Yeni Ürün"}</h2><p>Kod, barkod, fiyat, stok ve görsel bilgileri</p></div><button type="button" class="erp-modal-close">×</button></div><form><div class="product-form-layout"><div class="product-photo-editor"><div id="urunGorselOnizleme" class="product-photo">${v.gorsel ? `<img src="${v.gorsel}" alt="Ürün">` : '<span>📦</span>'}</div><label class="erp-small-button">Görsel Seç<input name="gorselDosya" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden></label><small>Telefon kamerası veya galeriden eklenebilir.</small></div><div class="erp-form-grid">${alan("kod", "Ürün Kodu / SKU", "text", true)}${alan("barkod", "Barkod")}${alan("ad", "Ürün Adı", "text", true)}<label>Kategori<select name="kategori"><option value="">Kategori seçin</option>${[...new Set([...kategoriler, v.kategori].filter(Boolean))].map(x => `<option value="${escapeHtml(x)}" ${v.kategori === x ? "selected" : ""}>${escapeHtml(x)}</option>`).join("")}</select></label>${alan("marka", "Marka")}${alan("model", "Model")}<label>Birim<select name="birim">${["ADET", "KUTU", "PAKET", "KG", "LT", "MT"].map(x => `<option ${v.birim === x ? "selected" : ""}>${x}</option>`).join("")}</select></label>${alan("kdv", "KDV %", "number")}${alan("alisFiyati", "Alış Fiyatı", "number")}${alan("satisFiyati", "Satış Fiyatı", "number")}${alan("bayiFiyati", "Bayi Fiyatı", "number")}${alan("perakendeFiyati", "Perakende Fiyatı", "number")}${alan("minimumStok", "Minimum Stok", "number")}${alan("kritikStok", "Kritik Stok", "number")}${alan("uyumluluk", "Uyumluluk (virgülle)")}<label class="full">Notlar<textarea name="notlar">${escapeHtml(v.notlar || "")}</textarea></label><label class="full"><span><input name="aktif" type="checkbox" ${v.aktif === false ? "" : "checked"}> Aktif ürün</span></label></div></div><div id="urunV2Mesaj"></div><div class="erp-modal-footer"><button type="button" class="erp-small-button" data-kapat>Vazgeç</button><button class="erp-primary-button" type="submit">Ürünü Kaydet</button></div></form></div>`;
        document.body.appendChild(overlay); const kapat = () => overlay.remove(); overlay.querySelectorAll(".erp-modal-close,[data-kapat]").forEach(x => x.onclick = kapat);
        let gorsel = v.gorsel || ""; overlay.querySelector('[name="gorselDosya"]').onchange = async e => { try { gorsel = await urunGorselHazirla(e.target.files[0]); overlay.querySelector("#urunGorselOnizleme").innerHTML = `<img src="${gorsel}" alt="Ürün">`; } catch (error) { overlay.querySelector("#urunV2Mesaj").innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
        overlay.querySelector("form").onsubmit = async e => { e.preventDefault(); const mesaj = overlay.querySelector("#urunV2Mesaj"); try { const fd = new FormData(e.currentTarget), veri = {}; for (const [k, val] of fd.entries()) if (k !== "gorselDosya") veri[k] = val;["kdv", "alisFiyati", "satisFiyati", "bayiFiyati", "perakendeFiyati", "minimumStok", "kritikStok"].forEach(k => veri[k] = Number(veri[k] || 0)); veri.uyumluluk = String(veri.uyumluluk || "").split(",").map(x => x.trim()).filter(Boolean); veri.aktif = e.currentTarget.elements.aktif.checked; veri.gorsel = gorsel; const sonuc = await api(mevcut ? `/api/tenant/urunler/${mevcut._id}` : "/api/tenant/urunler", { method: mevcut ? "PATCH" : "POST", body: JSON.stringify(veri) }); await api(`/api/tenant/urunler/${sonuc.urun._id}`); kapat(); await urunDashboardAc(sonuc.urun._id); } catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
    }

    async function urunDashboardAc(id, sekme = "ozet") {
        try {
            const [ud, sd, hd] = await Promise.all([api(`/api/tenant/urunler/${id}`), api(`/api/tenant/stok?urunId=${id}`), api(`/api/tenant/stok/hareketler?urunId=${id}`)]);
            const u = ud.urun, stoklar = sd.stoklar || [], hareketler = hd.hareketler || []; urunV2Index = urunV2Liste.findIndex(x => String(x._id) === String(id)); if (urunV2Index < 0) { urunV2Liste.push(u); urunV2Index = urunV2Liste.length - 1; }
            const toplam = stoklar.reduce((n, x) => n + Number(x.miktar || 0), 0), maliyet = stoklar.reduce((n, x) => n + Number(x.miktar || 0) * Number(x.maliyet || u.alisFiyati || 0), 0), kritik = toplam <= Number(u.kritikStok || u.minimumStok || 0);
            setTitle("Ürün Kartı"); content.innerHTML = `<div class="product-hero"><div class="product-identity"><div class="product-avatar">${u.gorsel ? `<img src="${u.gorsel}" alt="${escapeHtml(u.ad)}">` : '📦'}</div><div><span>ÜRÜN KARTI · ${escapeHtml(u.kod)}</span><h2>${escapeHtml(u.ad)}</h2><p>${escapeHtml([u.marka, u.model, u.kategori].filter(Boolean).join(" · ") || "Kategori bilgisi yok")}</p></div></div><div class="supplier-nav"><button id="urunListe">Liste</button><button id="urunOnceki" ${urunV2Index <= 0 ? "disabled" : ""}>← Önceki</button><button id="urunSonraki" ${urunV2Index >= urunV2Liste.length - 1 ? "disabled" : ""}>Sonraki →</button></div></div><div class="dashboard-grid">${card("Mevcut Stok", `${toplam} ${u.birim || "ADET"}`, kritik ? "Kritik stok seviyesinde" : "Stok seviyesi normal")}${card("Stok Değeri", para(maliyet), "Güncel maliyet")}${card("Alış / Satış", `${para(u.alisFiyati)} / ${para(u.satisFiyati)}`, "Standart fiyatlar")}${card("Tahmini Marj", para(Number(u.satisFiyati || 0) - Number(u.alisFiyati || 0)), "Birim brüt fark")}</div><div class="supplier-tabs">${[["ozet", "Özet"], ["stok", "Depo Stokları"], ["hareket", "Stok Hareketleri"], ["duzenle", "Düzenle"]].map(([k, l]) => `<button class="${sekme === k ? "active" : ""}" data-urun-tab="${k}">${l}</button>`).join("")}</div><div id="urunAltPanel"></div>`;
            const panel = content.querySelector("#urunAltPanel"), ac = k => { if (k === "duzenle") return urunFormAc(u); if (k === "stok") panel.innerHTML = `<div class="dashboard-panel"><h2>Depo Bazlı Stok</h2><div class="table-scroll"><table><thead><tr><th>Depo</th><th>Miktar</th><th>Maliyet</th><th>Stok Değeri</th></tr></thead><tbody>${stoklar.length ? stoklar.map(x => `<tr><td>${escapeHtml(x.depoId?.ad || "-")}</td><td><b>${Number(x.miktar || 0)} ${escapeHtml(u.birim || "")}</b></td><td>${para(x.maliyet)}</td><td>${para(Number(x.miktar || 0) * Number(x.maliyet || 0))}</td></tr>`).join("") : '<tr><td colspan="4">Bu ürün için stok kaydı yok.</td></tr>'}</tbody></table></div></div>`; else if (k === "hareket") panel.innerHTML = `<div class="dashboard-panel"><h2>Stok Hareketleri</h2><div class="table-scroll"><table><thead><tr><th>Tarih</th><th>Tür</th><th>Depo</th><th>Miktar</th><th>Birim Maliyet</th><th>Açıklama</th></tr></thead><tbody>${hareketler.length ? hareketler.map(x => `<tr><td>${tarihKisa(x.tarih || x.createdAt)}</td><td>${escapeHtml(x.tip || "-")}</td><td>${escapeHtml(x.depoId?.ad || "-")}</td><td><b>${Number(x.miktar || 0)}</b></td><td>${para(x.birimMaliyet || x.maliyet)}</td><td>${escapeHtml(x.aciklama || "-")}</td></tr>`).join("") : '<tr><td colspan="6">Stok hareketi bulunmuyor.</td></tr>'}</tbody></table></div></div>`; else panel.innerHTML = `<div class="dashboard-panel"><h2>Ürün Bilgileri</h2><div class="supplier-info"><div><b>Barkod</b><span>${escapeHtml(u.barkod || "-")}</span></div><div><b>Kategori</b><span>${escapeHtml(u.kategori || "-")}</span></div><div><b>Birim / KDV</b><span>${escapeHtml(u.birim || "-")} · %${Number(u.kdv || 0)}</span></div><div><b>Bayi Fiyatı</b><span>${para(u.bayiFiyati)}</span></div><div><b>Perakende Fiyatı</b><span>${para(u.perakendeFiyati || u.satisFiyati)}</span></div><div><b>Durum</b><span>${u.aktif === false ? "Pasif" : "Aktif"}</span></div><div><b>Uyumluluk</b><span>${escapeHtml((u.uyumluluk || []).join(", ") || "-")}</span></div><div><b>Minimum / Kritik</b><span>${Number(u.minimumStok || 0)} / ${Number(u.kritikStok || 0)}</span></div><div><b>Not</b><span>${escapeHtml(u.notlar || "-")}</span></div></div></div>`; };
            content.querySelectorAll("[data-urun-tab]").forEach(b => b.onclick = () => ac(b.dataset.urunTab)); content.querySelector("#urunListe").onclick = urunlerYukle; content.querySelector("#urunOnceki").onclick = () => urunDashboardAc(urunV2Liste[urunV2Index - 1]._id); content.querySelector("#urunSonraki").onclick = () => urunDashboardAc(urunV2Liste[urunV2Index + 1]._id); ac(sekme);
        } catch (error) { errorBox(error); }
    }

    async function urunExcelPaneli() {
        const panel = content.querySelector("#urunAltPanel"); panel.innerHTML = `<div class="dashboard-panel"><div class="panel-heading"><div><h2>Excel'den Toplu Ürün Yükle</h2><p>Şablondaki “Görsel URL / Base64” alanıyla resimli ürünleri de aktarabilirsiniz.</p></div><button id="urunSablon" class="erp-primary-button">Şablon İndir</button></div><label>Excel Dosyası<input id="urunExcelDosya" type="file" accept=".xlsx,.xls"></label><div id="urunExcelOnizleme"></div></div>`;
        panel.querySelector("#urunSablon").onclick = () => { const ws = XLSX.utils.aoa_to_sheet([["Ürün Kodu", "Barkod", "Ürün Adı", "Kategori", "Marka", "Model", "Birim", "KDV", "Alış Fiyatı", "Satış Fiyatı", "Bayi Fiyatı", "Perakende Fiyatı", "Minimum Stok", "Kritik Stok", "Görsel URL / Base64", "Uyumluluk", "Not"]]); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Ürünler"); XLSX.writeFile(wb, "urun-yukleme-sablonu.xlsx"); };
        panel.querySelector("#urunExcelDosya").onchange = async e => { try { const file = e.target.files[0]; if (!file) return; const wb = XLSX.read(await file.arrayBuffer(), { type: "array" }), rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" }), map = { "Ürün Kodu": "kod", "Barkod": "barkod", "Ürün Adı": "ad", "Kategori": "kategori", "Marka": "marka", "Model": "model", "Birim": "birim", "KDV": "kdv", "Alış Fiyatı": "alisFiyati", "Satış Fiyatı": "satisFiyati", "Bayi Fiyatı": "bayiFiyati", "Perakende Fiyatı": "perakendeFiyati", "Minimum Stok": "minimumStok", "Kritik Stok": "kritikStok", "Görsel URL / Base64": "gorsel", "Uyumluluk": "uyumluluk", "Not": "notlar" }, veriler = rows.map(r => Object.fromEntries(Object.entries(map).map(([a, b]) => [b, r[a]]))), mevcutKod = new Set(urunV2Liste.map(x => String(x.kod).toUpperCase())), mevcutBarkod = new Set(urunV2Liste.map(x => String(x.barkod || "")).filter(Boolean)), dosyaKod = new Set(), dosyaBarkod = new Set(), hatalar = []; veriler.forEach((r, i) => { r.kod = String(r.kod || "").trim().toUpperCase(); r.barkod = String(r.barkod || "").trim(); if (!r.kod || !r.ad) hatalar.push(`${i + 2}. satır: ürün kodu ve adı zorunlu`); else if (mevcutKod.has(r.kod) || dosyaKod.has(r.kod)) hatalar.push(`${i + 2}. satır: mükerrer ürün kodu`); else dosyaKod.add(r.kod); if (r.barkod && (mevcutBarkod.has(r.barkod) || dosyaBarkod.has(r.barkod))) hatalar.push(`${i + 2}. satır: mükerrer barkod`); else if (r.barkod) dosyaBarkod.add(r.barkod); r.uyumluluk = String(r.uyumluluk || "").split(",").map(x => x.trim()).filter(Boolean); }); const hedef = panel.querySelector("#urunExcelOnizleme"); hedef.innerHTML = `<p><b>${veriler.length}</b> satır · <b>${hatalar.length}</b> hata</p>${hatalar.length ? `<div class="error">${hatalar.map(escapeHtml).join("<br>")}</div>` : `<button id="urunExcelAktar" class="erp-primary-button">${veriler.length} Ürünü Aktar</button>`}<div class="table-scroll"><table><thead><tr><th>Satır</th><th>Kod</th><th>Barkod</th><th>Ürün</th><th>Kategori</th><th>Satış</th></tr></thead><tbody>${veriler.slice(0, 100).map((r, i) => `<tr><td>${i + 2}</td><td>${escapeHtml(r.kod)}</td><td>${escapeHtml(r.barkod)}</td><td>${escapeHtml(r.ad)}</td><td>${escapeHtml(r.kategori)}</td><td>${para(r.satisFiyati)}</td></tr>`).join("")}</tbody></table></div>`; hedef.querySelector("#urunExcelAktar")?.addEventListener("click", async () => { let eklenen = 0; for (const r of veriler) { await api("/api/tenant/urunler", { method: "POST", body: JSON.stringify(r) }); eklenen++; } alert(`${eklenen} ürün aktarıldı.`); await urunlerYukle(); }); } catch (error) { panel.querySelector("#urunExcelOnizleme").innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
    }

    async function urunKategoriPaneli() {
        const panel = content.querySelector("#urunAltPanel");
        try {
            const data = await api("/api/tenant/urunler/kategoriler");
            const kategoriler = data.kategoriKayitlari || [];
            panel.innerHTML = `<div class="dashboard-panel"><div class="panel-heading"><div><h2>Ürün Kategorileri</h2><p>Yeni kategori ekleyin; kullanılmayan kategorileri güvenle kaldırın.</p></div></div><form id="urunKategoriForm" class="category-add-form"><label>Kategori Adı<input name="ad" class="erp-input" maxlength="80" required placeholder="Örn. Fren Sistemi"></label><button class="erp-primary-button" type="submit">+ Kategori Ekle</button></form><div id="urunKategoriMesaj"></div><div class="category-chip-list">${kategoriler.length ? kategoriler.map(x => `<div class="category-chip"><span>${escapeHtml(x.ad)}</span><small>${x.kullanim} ürün</small><button type="button" class="category-delete" data-kategori-sil="${x._id || ""}" data-kategori-ad="${escapeHtml(x.ad)}" title="Kategoriyi sil" aria-label="${escapeHtml(x.ad)} kategorisini sil">×</button></div>`).join("") : "<p>Henüz kategori bulunmuyor.</p>"}</div></div>`;
            panel.querySelector("#urunKategoriForm").onsubmit = async event => {
                event.preventDefault();
                const mesaj = panel.querySelector("#urunKategoriMesaj");
                try {
                    await api("/api/tenant/urunler/kategoriler", { method: "POST", body: JSON.stringify({ ad: new FormData(event.currentTarget).get("ad") }) });
                    await urunKategoriPaneli();
                } catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; }
            };
            panel.querySelectorAll("[data-kategori-sil]").forEach(button => button.onclick = async () => {
                if (!confirm(`“${button.dataset.kategoriAd}” kategorisini silmek istiyor musunuz?`)) return;
                const mesaj = panel.querySelector("#urunKategoriMesaj");
                try {
                    const hedef = button.dataset.kategoriSil
                        ? `/api/tenant/urunler/kategoriler/${button.dataset.kategoriSil}`
                        : `/api/tenant/urunler/kategoriler?ad=${encodeURIComponent(button.dataset.kategoriAd)}`;
                    await api(hedef, { method: "DELETE" });
                    await urunKategoriPaneli();
                } catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; }
            });
        } catch (error) { panel.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; }
    }

    async function ozelFiyatPaneli() {
        const panel = content.querySelector("#urunAltPanel");
        try {
            const data = await api("/api/tenant/urunler/ozel-fiyatlar"), fiyatlar = data.fiyatlar || [];
            const secili = new Set(fiyatlar.map(x => String(x.urunId?._id || x.urunId)));
            const secenekler = urunV2Liste.filter(x => !secili.has(String(x._id)) && x.aktif !== false).map(x => `<option value="${x._id}">${escapeHtml(x.kod)} · ${escapeHtml(x.ad)} (Standart: ${para(x.satisFiyati)})</option>`).join("");
            panel.innerHTML = `<div class="dashboard-panel"><div class="panel-heading"><div><h2>Özel Fiyat Listesi</h2><p>Bu liste bağımsızdır; standart ürün fiyatları, satış belgeleri ve cari hareketleri değişmez.</p></div></div><form id="ozelFiyatForm" class="category-add-form"><label>Ürün<select name="urunId" class="erp-input" required><option value="">Ürün seçin</option>${secenekler}</select></label><label>Özel Fiyat<input name="fiyat" class="erp-input" type="number" min="0" step="0.01" required></label><label>Açıklama<input name="aciklama" class="erp-input" maxlength="250" placeholder="İsteğe bağlı"></label><button class="erp-primary-button" type="submit" ${secenekler ? "" : "disabled"}>+ Listeye Ekle</button></form><div id="ozelFiyatMesaj"></div><input id="ozelFiyatAra" class="erp-input" placeholder="Kod veya ürün ara..."><div class="table-scroll"><table><thead><tr><th>Kod</th><th>Ürün</th><th>Standart Fiyat</th><th>Özel Fiyat</th><th>Açıklama</th><th>İşlemler</th></tr></thead><tbody>${fiyatlar.length ? fiyatlar.map(x => `<tr data-ozel-fiyat-row><td><b>${escapeHtml(x.urunId?.kod || "-")}</b></td><td>${escapeHtml(x.urunId?.ad || "-")}</td><td>${para(x.urunId?.satisFiyati)}</td><td><input data-fiyat type="number" min="0" step="0.01" value="${Number(x.fiyat || 0)}" style="width:120px"></td><td><input data-aciklama maxlength="250" value="${escapeHtml(x.aciklama || "")}" style="min-width:160px"></td><td><button class="erp-small-button" data-fiyat-guncelle="${x._id}">Fiyatı Güncelle</button> <button class="erp-small-button secondary" data-fiyat-sil="${x._id}" data-urun-ad="${escapeHtml(x.urunId?.ad || "Ürün")}">Listeden Sil</button></td></tr>`).join("") : '<tr><td colspan="6">Özel fiyat listesi boş.</td></tr>'}</tbody></table></div></div>`;
            panel.querySelector("#ozelFiyatForm").onsubmit = async event => { event.preventDefault(); const mesaj = panel.querySelector("#ozelFiyatMesaj"); try { const fd = new FormData(event.currentTarget); await api("/api/tenant/urunler/ozel-fiyatlar", { method: "POST", body: JSON.stringify({ urunId: fd.get("urunId"), fiyat: Number(fd.get("fiyat")), aciklama: fd.get("aciklama") }) }); await ozelFiyatPaneli(); } catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
            panel.querySelectorAll("[data-fiyat-guncelle]").forEach(button => button.onclick = async () => { const row = button.closest("tr"), mesaj = panel.querySelector("#ozelFiyatMesaj"); try { await api(`/api/tenant/urunler/ozel-fiyatlar/${button.dataset.fiyatGuncelle}`, { method: "PATCH", body: JSON.stringify({ fiyat: Number(row.querySelector("[data-fiyat]").value), aciklama: row.querySelector("[data-aciklama]").value }) }); mesaj.innerHTML = '<div class="success">Özel fiyat güncellendi.</div>'; } catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } });
            panel.querySelectorAll("[data-fiyat-sil]").forEach(button => button.onclick = async () => { if (!confirm(`“${button.dataset.urunAd}” yalnızca özel fiyat listesinden kaldırılsın mı?`)) return; try { await api(`/api/tenant/urunler/ozel-fiyatlar/${button.dataset.fiyatSil}`, { method: "DELETE" }); await ozelFiyatPaneli(); } catch (error) { panel.querySelector("#ozelFiyatMesaj").innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } });
            panel.querySelector("#ozelFiyatAra").oninput = event => { const q = event.target.value.toLocaleLowerCase("tr-TR"); panel.querySelectorAll("[data-ozel-fiyat-row]").forEach(row => row.hidden = !row.textContent.toLocaleLowerCase("tr-TR").includes(q)); };
        } catch (error) { panel.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; }
    }

    async function urunlerYukleTemel() {
        setTitle("Ürünler"); loading(); try { const [ud, sd] = await Promise.all([api("/api/tenant/urunler"), api("/api/tenant/stok")]); urunV2Liste = ud.urunler || []; const stoklar = sd.stoklar || [], stokMap = {}; stoklar.forEach(x => { const id = String(x.urunId?._id || x.urunId); stokMap[id] = (stokMap[id] || 0) + Number(x.miktar || 0); }); const stokToplam = Object.values(stokMap).reduce((a, b) => a + b, 0), kritik = urunV2Liste.filter(u => (stokMap[String(u._id)] || 0) <= Number(u.kritikStok || u.minimumStok || 0)).length, deger = urunV2Liste.reduce((n, u) => n + (stokMap[String(u._id)] || 0) * Number(u.alisFiyati || 0), 0); content.innerHTML = `<div class="welcome-banner product-welcome"><div><div class="eyebrow">ÜRÜNLER V2</div><h2>Ürün Merkezi</h2><p>Ürün kartları, fiyatlar ve depo stoklarını tek merkezden yönetin.</p></div></div><div class="musteri-toolbar"><button class="dashboard-action dashboard-action-blue" id="urunSec">Ürün Seç</button><button class="dashboard-action dashboard-action-green" id="urunYeni">+ Yeni Ürün</button><button class="dashboard-action dashboard-action-purple" id="urunExcel">Excel'den Toplu Yükle</button><button class="dashboard-action shortcut-orange" id="urunKategori">Kategoriler</button></div><div class="dashboard-grid">${card("Ürün Sayısı", urunV2Liste.length, "Kayıtlı ürün")}${card("Toplam Stok", stokToplam, "Tüm depolar")}${card("Stok Değeri", para(deger), "Alış fiyatı üzerinden")}${card("Kritik Ürün", kritik, "Kontrol gereken")}</div><div id="urunAltPanel"></div>`; const panel = content.querySelector("#urunAltPanel"), liste = () => { panel.innerHTML = `<div class="dashboard-panel"><div class="panel-heading"><div><h2>Ürün Seç</h2><p>Kod, barkod, ürün, marka veya kategori ile arayın.</p></div></div><input id="urunAra" class="erp-input" placeholder="Ürün ara veya barkod okut..."><div class="table-scroll"><table><thead><tr><th>Görsel</th><th>Kod / Barkod</th><th>Ürün</th><th>Stok</th><th>Alış</th><th>Satış</th><th>Durum</th></tr></thead><tbody id="urunListeGovde">${urunV2Liste.map(u => `<tr data-urun-id="${u._id}" style="cursor:pointer"><td><div class="product-thumb">${u.gorsel ? `<img src="${u.gorsel}" alt="">` : '📦'}</div></td><td><b>${escapeHtml(u.kod)}</b><small>${escapeHtml(u.barkod || "-")}</small></td><td>${escapeHtml(u.ad)}<small>${escapeHtml([u.marka, u.model, u.kategori].filter(Boolean).join(" · ") || "-")}</small></td><td><b>${stokMap[String(u._id)] || 0} ${escapeHtml(u.birim || "")}</b></td><td>${para(u.alisFiyati)}</td><td>${para(u.satisFiyati)}</td><td>${u.aktif === false ? "Pasif" : "Aktif"}</td></tr>`).join("") || '<tr><td colspan="7">Henüz ürün yok.</td></tr>'}</tbody></table></div></div>`; panel.querySelectorAll("[data-urun-id]").forEach(x => x.onclick = () => urunDashboardAc(x.dataset.urunId)); panel.querySelector("#urunAra").oninput = e => { const q = e.target.value.toLocaleLowerCase("tr-TR"); panel.querySelectorAll("[data-urun-id]").forEach(x => x.hidden = !x.textContent.toLocaleLowerCase("tr-TR").includes(q)); }; }; content.querySelector("#urunSec").onclick = liste; content.querySelector("#urunYeni").onclick = () => urunFormAc(); content.querySelector("#urunExcel").onclick = urunExcelPaneli; content.querySelector("#urunKategori").onclick = urunKategoriPaneli; liste(); } catch (error) { errorBox(error); }
    }

    async function urunlerYukle() {
        await urunlerYukleTemel();
        const toolbar = content.querySelector(".musteri-toolbar");
        if (toolbar && !toolbar.querySelector("#ozelFiyatListesi")) {
            const button = document.createElement("button");
            button.id = "ozelFiyatListesi";
            button.className = "dashboard-action dashboard-action-blue";
            button.textContent = "Özel Fiyat Listesi";
            button.onclick = ozelFiyatPaneli;
            toolbar.appendChild(button);
        }
    }

    async function kullanicilarYukle() {
        setTitle("Kullanıcılar ve Yetkiler"); loading();
        try {
            const data = await api("/api/tenant/kullanicilar"), kullanicilar = data.kullanicilar || [];
            content.innerHTML = `<div class="welcome-banner"><div><div class="eyebrow">YETKİ YÖNETİMİ</div><h2>Kullanıcılar ve Kritik İşlem Yetkileri</h2><p>Bakiye düzeltme gibi muhasebe geçmişini etkileyen işlemleri yalnızca açıkça yetkilendirdiğiniz çalışanlar yapabilir.</p></div></div><div class="dashboard-panel"><div class="panel-heading"><div><h2>Kullanıcı Yetkileri</h2><p>Yönetici yetkileri kalıcıdır. Satış ve muhasebe çalışanlarına ihtiyaç halinde özel yetki verin.</p></div></div><div class="table-scroll"><table><thead><tr><th>Kullanıcı</th><th>Rol / Departman</th><th>Durum</th><th>Son Giriş</th><th>Bakiye Düzeltme</th></tr></thead><tbody>${kullanicilar.map(k => { const yonetici = ["OWNER", "ADMIN"].includes(k.rol), yetkili = yonetici || (k.ozelYetkiler || []).includes("balance.adjust"); return `<tr><td><b>${escapeHtml(k.adSoyad)}</b><small>${escapeHtml(k.email)}</small></td><td>${escapeHtml(k.rol)}</td><td><span class="durum-badge ${k.aktif ? "aktif" : "pasif"}">${k.aktif ? "Aktif" : "Pasif"}</span></td><td>${k.sonGirisTarihi ? new Date(k.sonGirisTarihi).toLocaleString("tr-TR") : "Henüz giriş yok"}</td><td><label class="permission-toggle"><input type="checkbox" data-balance-permission="${k._id || k.id}" ${yetkili ? "checked" : ""} ${yonetici || !k.aktif ? "disabled" : ""}><span>${yonetici ? "Yönetici — zorunlu" : yetkili ? "Yetkili" : "Yetkisiz"}</span></label></td></tr>`; }).join("") || '<tr><td colspan="5">Kullanıcı bulunamadı.</td></tr>'}</tbody></table></div><div id="permissionMessage"></div></div>`;
            content.querySelectorAll("[data-balance-permission]").forEach(input => input.onchange = async () => { const mesaj = content.querySelector("#permissionMessage"); input.disabled = true; try { const sonuc = await api(`/api/tenant/kullanicilar/${encodeURIComponent(input.dataset.balancePermission)}/yetkiler`, { method: "PATCH", body: JSON.stringify({ ozelYetkiler: input.checked ? ["balance.adjust"] : [] }) }); input.nextElementSibling.textContent = input.checked ? "Yetkili" : "Yetkisiz"; mesaj.innerHTML = `<div class="success">${escapeHtml(sonuc.mesaj)} Değişiklik anında geçerlidir.</div>`; } catch (error) { input.checked = !input.checked; mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } finally { input.disabled = false; } });
        } catch (error) { errorBox(error); }
    }

    async function ayarlarYukle() {
        setTitle("Ayarlar"); loading("Ayarlar hazırlanıyor...");
        try {
            const [d, fd] = await Promise.all([api("/api/tenant/ayarlar"), api("/api/tenant/firma")]);
            const a = d.ayarlar, g = a.genel || {}, b = a.belgeAyari || {}, firma = fd.firmaBilgileri || {};
            const entegrasyonAdlari = { E_FATURA:"e-Fatura", E_IRSALIYE:"e-İrsaliye", E_POSTA:"E-posta / SMTP", WHATSAPP:"WhatsApp", E_TICARET:"E-Ticaret", KARGO:"Kargo", ODEME:"Ödeme", MUHASEBE:"Muhasebe" };
            content.innerHTML = `<div class="welcome-banner"><div><div class="eyebrow">SİSTEM YÖNETİMİ</div><h2>Profesyonel Ayarlar</h2><p>Firma, belge tasarımı, güvenlik ve entegrasyonlar tek merkezde.</p></div></div><div class="supplier-tabs">${[["genel","Genel"],["firma","Firma"],["belgeler","Fatura / İrsaliye"],["entegrasyonlar","Entegrasyonlar"],["guvenlik","Güvenlik"]].map(([k,l])=>`<button data-ayar-tab="${k}">${l}</button>`).join("")}</div><div id="ayarPanel"></div>`;
            const panel = content.querySelector("#ayarPanel"), durum = id => `<div id="${id}" class="full"></div>`;
            const genel = () => { panel.innerHTML=`<div class="dashboard-panel"><div class="panel-heading"><div><h2>Genel Sistem Ayarları</h2><p>Varsayılan işlem, numara ve güvenlik davranışları</p></div></div><form class="erp-form-grid" id="genelAyarForm"><label>Para Birimi<select name="paraBirimi">${["TRY","USD","EUR","GBP"].map(x=>`<option ${g.paraBirimi===x?"selected":""}>${x}</option>`).join("")}</select></label><label>Dil<select name="dil"><option value="tr-TR">Türkçe</option><option value="en-US" ${g.dil==="en-US"?"selected":""}>English</option></select></label><label>Saat Dilimi<input name="saatDilimi" value="${escapeHtml(g.saatDilimi||"Europe/Istanbul")}"></label><label>Varsayılan KDV %<input name="varsayilanKdv" type="number" min="0" max="100" value="${Number(g.varsayilanKdv??20)}"></label><label>Fatura Serisi<input name="faturaSeri" maxlength="10" value="${escapeHtml(g.faturaSeri||"FTR")}"></label><label>İrsaliye Serisi<input name="irsaliyeSeri" maxlength="10" value="${escapeHtml(g.irsaliyeSeri||"IRS")}"></label><label>Teklif Geçerlilik Günü<input name="teklifGecerlilikGun" type="number" min="1" max="365" value="${Number(g.teklifGecerlilikGun||15)}"></label><label><span><input name="negatifStokEngelle" type="checkbox" ${g.negatifStokEngelle!==false?"checked":""}> Negatif stoğu engelle</span></label><label><span><input name="otomatikYedekleme" type="checkbox" ${g.otomatikYedekleme!==false?"checked":""}> Otomatik yedekleme</span></label><label><span><input name="ikiAsamaliOnay" type="checkbox" ${g.ikiAsamaliOnay?"checked":""}> Kritik işlemlerde çift onay</span></label>${durum("genelMesaj")}<div class="full"><button class="erp-primary-button">Ayarları Kaydet</button></div></form></div>`; panel.querySelector("form").onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,body=Object.fromEntries(new FormData(f));["varsayilanKdv","teklifGecerlilikGun"].forEach(k=>body[k]=Number(body[k]));["negatifStokEngelle","otomatikYedekleme","ikiAsamaliOnay"].forEach(k=>body[k]=f.elements[k].checked);try{await api("/api/tenant/ayarlar/genel",{method:"PATCH",body:JSON.stringify(body)});panel.querySelector("#genelMesaj").innerHTML='<div class="success">Ayarlar kaydedildi.</div>';}catch(err){panel.querySelector("#genelMesaj").innerHTML=`<div class="error">${escapeHtml(err.message)}</div>`;}}; };
            const firmaAc = () => { panel.innerHTML=`<div class="dashboard-panel"><h2>Firma ve Resmî Bilgiler</h2><form class="erp-form-grid">${[["unvan","Firma Ünvanı"],["yetkili","Yetkili"],["vergiDairesi","Vergi Dairesi"],["vergiNo","Vergi / T.C. No"],["telefon","Telefon"],["web","Web Sitesi"],["il","İl"],["ilce","İlçe"],["postaKodu","Posta Kodu"]].map(([k,l])=>`<label>${l}<input name="${k}" value="${escapeHtml(firma[k]||"")}"></label>`).join("")}<label class="full">Adres<textarea name="adres">${escapeHtml(firma.adres||"")}</textarea></label>${durum("firmaMesaj")}<div class="full"><button class="erp-primary-button">Firma Bilgilerini Kaydet</button></div></form></div>`;panel.querySelector("form").onsubmit=async e=>{e.preventDefault();try{await api("/api/tenant/firma",{method:"PATCH",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});panel.querySelector("#firmaMesaj").innerHTML='<div class="success">Firma bilgileri kaydedildi.</div>';}catch(err){panel.querySelector("#firmaMesaj").innerHTML=`<div class="error">${escapeHtml(err.message)}</div>`;}}; };
            const belgeler = () => { panel.innerHTML=`<div class="dashboard-panel"><div class="panel-heading"><div><h2>Fatura ve İrsaliye Tasarımcısı</h2><p>Seçimler kullanıcı hesabınıza özel saklanır.</p></div></div><form><h3>Fatura Şablonu</h3><div class="settings-template-grid">${a.hazirSablonlar.map(x=>`<label class="settings-template-card"><input type="radio" name="faturaSablonu" value="${x.id}" ${b.faturaSablonu===x.id?"checked":""}><span class="template-mini template-mini-${x.id}"><b>${x.ad}</b><small>${x.aciklama}</small></span></label>`).join("")}</div><div class="erp-form-grid"><label>İrsaliye Şablonu<select name="irsaliyeSablonu">${a.hazirSablonlar.map(x=>`<option value="${x.id}" ${b.irsaliyeSablonu===x.id?"selected":""}>${x.ad}</option>`).join("")}</select></label><label>Ana Renk<input name="anaRenk" type="color" value="${escapeHtml(b.anaRenk||"#2563eb")}"></label><label>Vurgu Rengi<input name="vurguRengi" type="color" value="${escapeHtml(b.vurguRengi||"#0f172a")}"></label><label>Belge Başlığı<input name="belgeBasligi" maxlength="100" value="${escapeHtml(b.belgeBasligi||"")}"></label><label class="full">Logo URL<input name="logo" value="${escapeHtml(b.logo||"")}" placeholder="https://..."></label><label class="full">Dipnot<textarea name="dipnot" maxlength="500">${escapeHtml(b.dipnot||"")}</textarea></label>${["bankaBilgisiGoster","vergiBilgisiGoster","imzaAlaniGoster"].map((k,i)=>`<label><span><input name="${k}" type="checkbox" ${b[k]!==false?"checked":""}> ${["Banka bilgilerini göster","Vergi bilgilerini göster","İmza alanı göster"][i]}</span></label>`).join("")}${durum("belgeMesaj")}<div class="full"><button class="erp-primary-button">Kişisel Şablonumu Kaydet</button></div></div></form></div>`;panel.querySelector("form").onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,body=Object.fromEntries(new FormData(f));["bankaBilgisiGoster","vergiBilgisiGoster","imzaAlaniGoster"].forEach(k=>body[k]=f.elements[k].checked);try{await api("/api/tenant/ayarlar/belgeler",{method:"PATCH",body:JSON.stringify(body)});panel.querySelector("#belgeMesaj").innerHTML='<div class="success">Şablonunuz kaydedildi.</div>';}catch(err){panel.querySelector("#belgeMesaj").innerHTML=`<div class="error">${escapeHtml(err.message)}</div>`;}}; };
            const entegrasyonlar = () => { panel.innerHTML=`<div class="settings-integration-grid">${a.entegrasyonlar.map(x=>`<form class="dashboard-panel integration-card" data-ent="${x.tip}"><div class="panel-heading"><div><h3>${entegrasyonAdlari[x.tip]}</h3><p>${x.aktif?"Aktif":"Yapılandırılmadı"}${x.gizliAnahtarKayitli?" · Anahtar kayıtlı":""}</p></div><input name="aktif" type="checkbox" ${x.aktif?"checked":""}></div><label>Sağlayıcı<input name="saglayici" value="${escapeHtml(x.saglayici)}"></label><label>HTTPS API Adresi<input name="apiUrl" value="${escapeHtml(x.apiUrl)}" placeholder="https://api..."></label><label>Hesap / Firma Kodu<input name="hesapKodu" value="${escapeHtml(x.hesapKodu)}"></label><label>API Anahtarı<input name="gizliAnahtar" type="password" autocomplete="new-password" placeholder="${x.gizliAnahtarKayitli?"Kayıtlı — değiştirmek için yazın":"Gizli anahtar"}"></label><div data-ent-mesaj></div><button class="erp-primary-button">Kaydet</button></form>`).join("")}</div>`;panel.querySelectorAll("[data-ent]").forEach(f=>f.onsubmit=async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(f));body.aktif=f.elements.aktif.checked;try{await api(`/api/tenant/ayarlar/entegrasyonlar/${f.dataset.ent}`,{method:"PATCH",body:JSON.stringify(body)});f.querySelector("[data-ent-mesaj]").innerHTML='<div class="success">Kaydedildi.</div>';}catch(err){f.querySelector("[data-ent-mesaj]").innerHTML=`<div class="error">${escapeHtml(err.message)}</div>`;}}); };
            const guvenlik = () => { panel.innerHTML=`<div class="dashboard-grid">${card("Tenant İzolasyonu","Aktif","Firma verileri ayrıdır")}${card("Gizli Anahtarlar","AES-256-GCM","API yanıtında gösterilmez")}${card("Kişisel Şablon","Aktif","Kullanıcı bazında tasarım")}${card("Yedekleme",g.otomatikYedekleme!==false?"Açık":"Kapalı","Genel ayarlardan yönetilir")}</div><div class="dashboard-panel"><h2>Güvenlik Kontrolü</h2><p>API anahtarlarını düzenli yenileyin, yalnızca HTTPS servisleri kullanın ve kritik işlemler için çift onayı etkinleştirin.</p></div>`; };
            const ac=key=>{content.querySelectorAll("[data-ayar-tab]").forEach(x=>x.classList.toggle("active",x.dataset.ayarTab===key));({genel,firma:firmaAc,belgeler,entegrasyonlar,guvenlik}[key]||genel)();};content.querySelectorAll("[data-ayar-tab]").forEach(x=>x.onclick=()=>ac(x.dataset.ayarTab));ac("genel");
        } catch(error) { errorBox(error); }
    }

    let sayfaYuklemeNo = 0;

    async function oturumuKapat() {
        try { await api("/api/auth/logout", { method: "POST" }); } catch (_) {}
        ["tenantToken", "token", "accessToken"].forEach(key => localStorage.removeItem(key));
        sessionStorage.removeItem("bmCsrfToken");
        window.location.replace("/erp/login.html");
    }

    async function hesabimYukle() {
        setTitle("Hesabım");
        loading("Hesap bilgileriniz yükleniyor...");
        try {
            const data = await api("/api/auth/profil"), k = data.kullanici || {}, t = data.firma || {}, f = t.firmaBilgileri || {};
            const accountButton = document.getElementById("accountButton");
            if (accountButton) accountButton.querySelector(".account-avatar").textContent = String(k.adSoyad || "H").trim().charAt(0).toLocaleUpperCase("tr-TR");
            content.innerHTML = `<div class="welcome-banner"><div><div class="eyebrow">HESAP MERKEZİ</div><h2>${escapeHtml(k.adSoyad || "Kullanıcı")}</h2><p>Kişisel bilgilerinizi, şirket kayıtlarını ve hesap güvenliğini tek yerden yönetin.</p></div></div><div class="account-summary"><div><span>Rol</span><strong>${escapeHtml(k.rol || "-")}</strong></div><div><span>Paket</span><strong>${escapeHtml(t.plan || "-")}</strong></div><div><span>Hesap Durumu</span><strong>${escapeHtml(t.status || "-")}</strong></div><div><span>Son Giriş</span><strong>${k.sonGirisTarihi ? new Date(k.sonGirisTarihi).toLocaleString("tr-TR") : "İlk giriş"}</strong></div></div><div class="account-tabs"><button class="erp-small-button active" data-account-tab="profil">Kullanıcı Bilgileri</button><button class="erp-small-button" data-account-tab="firma">Şirket ve Vergi</button><button class="erp-small-button" data-account-tab="guvenlik">Parola ve Güvenlik</button><button class="erp-small-button" data-account-tab="sil">Hesabı Kapat</button></div><div id="accountPanel"></div>`;
            const panel = content.querySelector("#accountPanel");
            const profil = () => {
                panel.innerHTML = `<div class="dashboard-panel"><div class="panel-heading"><div><h2>Kullanıcı Bilgileri</h2><p>Size ait iletişim ve görev bilgileri</p></div></div><form id="accountProfileForm" class="erp-form-grid"><label>Ad Soyad<input name="adSoyad" required minlength="2" value="${escapeHtml(k.adSoyad || "")}"></label><label>E-posta<input name="email" type="email" required value="${escapeHtml(k.email || "")}"></label><label>Telefon<input name="telefon" type="tel" value="${escapeHtml(k.telefon || "")}" placeholder="05xx xxx xx xx"></label><label>Görev / Ünvan<input name="unvan" value="${escapeHtml(k.unvan || "")}" placeholder="Örn. İşletme sahibi"></label><label>Yetki Rolü<input value="${escapeHtml(k.rol || "-")}" disabled></label><label>Kayıt Tarihi<input value="${k.createdAt ? new Date(k.createdAt).toLocaleDateString("tr-TR") : "-"}" disabled></label><div id="accountProfileMessage" class="full"></div><div class="full"><button class="erp-primary-button">Bilgilerimi Kaydet</button></div></form></div>`;
                panel.querySelector("form").onsubmit = async event => { event.preventDefault(); const mesaj = panel.querySelector("#accountProfileMessage"); try { const result = await api("/api/auth/profil", { method: "PATCH", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); mesaj.innerHTML = `<div class="success">${escapeHtml(result.mesaj)}</div>`; } catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
            };
            const firma = () => {
                panel.innerHTML = `<div class="dashboard-panel"><div class="panel-heading"><div><h2>Şirket ve Resmî Kayıtlar</h2><p>Fatura, ekstre ve resmî belgelerde kullanılacak bilgiler</p></div></div><form class="erp-form-grid"><label>Firma Ünvanı<input name="unvan" required value="${escapeHtml(f.unvan || t.name || "")}"></label><label>Yetkili<input name="yetkili" value="${escapeHtml(f.yetkili || "")}"></label><label>Vergi Dairesi<input name="vergiDairesi" value="${escapeHtml(f.vergiDairesi || "")}"></label><label>Vergi / T.C. No<input name="vergiNo" inputmode="numeric" value="${escapeHtml(f.vergiNo || "")}"></label><label>MERSİS No<input name="mersisNo" inputmode="numeric" value="${escapeHtml(f.mersisNo || "")}"></label><label>Ticaret Sicil No<input name="ticaretSicilNo" value="${escapeHtml(f.ticaretSicilNo || "")}"></label><label>Telefon<input name="telefon" type="tel" value="${escapeHtml(f.telefon || "")}"></label><label>Kurumsal E-posta<input name="email" type="email" value="${escapeHtml(f.email || "")}"></label><label class="full">IBAN<input name="iban" value="${escapeHtml(f.iban || "")}" placeholder="TR..."></label><label>İl<input name="il" value="${escapeHtml(f.il || "")}"></label><label>İlçe<input name="ilce" value="${escapeHtml(f.ilce || "")}"></label><label>Posta Kodu<input name="postaKodu" value="${escapeHtml(f.postaKodu || "")}"></label><label>Web Sitesi<input name="web" value="${escapeHtml(f.web || "")}"></label><label><span><input name="eFaturaMukellefi" type="checkbox" ${f.eFaturaMukellefi ? "checked" : ""}> E-Fatura mükellefi</span></label><label class="full">Açık Adres<textarea name="adres">${escapeHtml(f.adres || "")}</textarea></label><div id="accountCompanyMessage" class="full"></div><div class="full"><button class="erp-primary-button">Şirket Bilgilerini Kaydet</button></div></form></div>`;
                panel.querySelector("form").onsubmit = async event => { event.preventDefault(); const form = event.currentTarget, body = Object.fromEntries(new FormData(form)); body.eFaturaMukellefi = form.elements.eFaturaMukellefi.checked; const mesaj = panel.querySelector("#accountCompanyMessage"); try { const result = await api("/api/tenant/firma", { method: "PATCH", body: JSON.stringify(body) }); mesaj.innerHTML = `<div class="success">${escapeHtml(result.mesaj)}</div>`; } catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
            };
            const guvenlik = () => {
                panel.innerHTML = `<div class="dashboard-panel"><h2>Parola ve Güvenlik</h2><p>En az 8 karakterli, benzersiz bir parola kullanın. Parola değişiminden sonra yeniden giriş gerekir.</p><form class="erp-form-grid"><label>Mevcut Parola<input name="mevcutSifre" type="password" autocomplete="current-password" required></label><label>Yeni Parola<input name="yeniSifre" type="password" autocomplete="new-password" minlength="8" required></label><label>Yeni Parola Tekrar<input name="yeniSifreTekrar" type="password" autocomplete="new-password" minlength="8" required></label><div id="accountPasswordMessage" class="full"></div><div class="full"><button class="erp-primary-button">Parolamı Değiştir</button></div></form></div>`;
                panel.querySelector("form").onsubmit = async event => { event.preventDefault(); const fd = new FormData(event.currentTarget), mesaj = panel.querySelector("#accountPasswordMessage"); if (fd.get("yeniSifre") !== fd.get("yeniSifreTekrar")) return mesaj.innerHTML = '<div class="error">Yeni parolalar eşleşmiyor.</div>'; try { const result = await api("/api/auth/sifre-degistir", { method: "POST", body: JSON.stringify({ mevcutSifre: fd.get("mevcutSifre"), yeniSifre: fd.get("yeniSifre") }) }); mesaj.innerHTML = `<div class="success">${escapeHtml(result.mesaj)}</div>`; setTimeout(oturumuKapat, 1200); } catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
            };
            const sil = () => {
                panel.innerHTML = `<div class="dashboard-panel danger-zone"><h2>Hesabı Kalıcı Olarak Kapat</h2><p>Bu işlem kişisel bilgilerinizi anonimleştirir ve girişinizi kalıcı olarak kapatır. Geçmiş muhasebe kayıtlarının bütünlüğü korunur.</p><form class="erp-form-grid"><label>Parolanız<input name="sifre" type="password" autocomplete="current-password" required></label><label>Onay için “HESABIMI SİL” yazın<input name="onay" required></label><div id="accountDeleteMessage" class="full"></div><div class="full"><button class="erp-primary-button danger-button">Hesabımı Kalıcı Olarak Kapat</button></div></form></div>`;
                panel.querySelector("form").onsubmit = async event => { event.preventDefault(); if (!confirm("Bu hesabı kapatmak istediğinizden emin misiniz? Bu işlem geri alınamaz.")) return; const mesaj = panel.querySelector("#accountDeleteMessage"); try { const result = await api("/api/auth/hesap", { method: "DELETE", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); mesaj.innerHTML = `<div class="success">${escapeHtml(result.mesaj)}</div>`; setTimeout(oturumuKapat, 1200); } catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
            };
            const ac = key => { content.querySelectorAll("[data-account-tab]").forEach(x => x.classList.toggle("active", x.dataset.accountTab === key)); ({ profil, firma, guvenlik, sil }[key] || profil)(); };
            content.querySelectorAll("[data-account-tab]").forEach(button => button.onclick = () => ac(button.dataset.accountTab));
            ac("profil");
        } catch (error) { errorBox(error); }
    }

    async function satisMusteriSec(tur = "satis", baslangicKalemleri = []) {
        const data = await api("/api/tenant/musteriler");
        const musteriler = (data.musteriler || []).filter(x => x.aktif !== false);
        musteriModalKapat();
        const overlay = document.createElement("div"); overlay.id = "musteriIslemOverlay"; overlay.className = "erp-modal-overlay";
        overlay.innerHTML = `<div class="erp-modal sales-customer-picker"><div class="erp-modal-header"><div><h2>Müşteri Seç</h2><p>Satış işlemine başlamak için müşteri arayın.</p></div><button class="erp-modal-close">×</button></div><input id="salesCustomerSearch" class="erp-input" placeholder="Kod, ünvan, telefon veya vergi no ara..." autofocus><div class="sales-customer-list">${musteriler.map(m => `<button type="button" data-sales-customer="${m._id}"><span><b>${escapeHtml(m.unvan || m.adSoyad)}</b><small>${escapeHtml(m.kod)} · ${escapeHtml(m.telefon || m.whatsapp || "Telefon yok")}</small></span><span class="${Number(m.bakiye || 0) > 0 ? "sales-debt" : "sales-clear"}">${para(m.bakiye)}</span></button>`).join("") || '<div class="empty-state">Aktif müşteri bulunamadı.</div>'}</div><div class="erp-modal-footer"><button id="salesNewCustomer" class="erp-small-button">+ Yeni Müşteri</button></div></div>`;
        document.body.appendChild(overlay);
        overlay.querySelector(".erp-modal-close").onclick = musteriModalKapat;
        overlay.querySelector("#salesNewCustomer").onclick = () => { musteriModalKapat(); yeniMusteriPaneli(); };
        overlay.querySelector("#salesCustomerSearch").oninput = e => { const q = e.target.value.toLocaleLowerCase("tr-TR"); overlay.querySelectorAll("[data-sales-customer]").forEach(x => x.hidden = !x.textContent.toLocaleLowerCase("tr-TR").includes(q)); };
        overlay.querySelectorAll("[data-sales-customer]").forEach(btn => btn.onclick = () => { const m = musteriler.find(x => String(x._id) === btn.dataset.salesCustomer); musteriBelgeFormu(tur, m, null, baslangicKalemleri).catch(error => alert(error.message)); });
    }

    async function satisPaneliYukle() {
        setTitle("Satış Merkezi"); loading();
        try {
            const [data, urunData, stokData] = await Promise.all([api("/api/tenant/satis/panel"), api("/api/tenant/urunler"), api("/api/tenant/stok")]), p = data.panel || {};
            const son = p.sonSatislar || [], cokSatanlar = p.enCokSatanlar || [], temsilciler = p.temsilciler || [];
            const katalog = (urunData.urunler || []).filter(x => x.aktif !== false);
            const stokHaritasi = new Map();
            (stokData.stoklar || []).forEach(x => { const id = String(x.urunId?._id || x.urunId || ""); stokHaritasi.set(id, (stokHaritasi.get(id) || 0) + Number(x.miktar || 0)); });
            const durum = x => x === "ODENDI" ? '<span class="sales-status paid">Ödendi</span>' : x === "KISMI" ? '<span class="sales-status partial">Kısmi</span>' : '<span class="sales-status open">Açık</span>';
            content.innerHTML = `<div class="sales-hero"><div><div class="eyebrow">SATIŞ OPERASYON MERKEZİ</div><h2>Satışın her adımı tek ekranda</h2><p>Müşteri, stok, cari, tahsilat, teklif ve sipariş süreçlerini kesintisiz yönetin.</p></div><button id="salesNew" class="sales-primary-cta">+ Yeni Satış</button></div>
            <div class="sales-actions"><button id="salesQuick">⚡ Ürün Seç</button><button data-sales-page="teklifler">📝 Yeni Teklif</button><button data-sales-page="siparisler">📦 Siparişler</button><button id="salesReturn">↩ Satış İadesi</button><button data-sales-page="musteriler">👥 Müşteriler</button><button data-sales-page="cari">₺ Cari / Tahsilat</button></div>
            <section id="salesPos" class="sales-pos"><div class="sales-catalog"><div class="panel-heading"><div><h2>Ürün Seçimi</h2><p>Ürünleri sepete ekleyin, ardından satış yapacağınız müşteriyi seçin.</p></div><input id="salesProductSearch" class="erp-input" placeholder="Ürün adı, kod veya barkod ara..."></div><div class="sales-product-grid">${katalog.map(u => { const stok = stokHaritasi.get(String(u._id)) || 0; return `<button type="button" class="sales-product-card" data-sales-product="${u._id}" ${stok <= 0 ? "disabled" : ""}><span>${escapeHtml(u.kod || "ÜRÜN")}</span><b>${escapeHtml(u.ad)}</b><small>${escapeHtml(u.birim || "ADET")} · Stok ${stok}</small><strong>${para(u.satisFiyati)}</strong><em>${stok > 0 ? "+ Sepete Ekle" : "Stok Yok"}</em></button>`; }).join("") || '<div class="empty-state">Satışa uygun aktif ürün bulunamadı.</div>'}</div></div><aside class="sales-cart"><div><span>HIZLI SATIŞ</span><h2>Satış Sepeti</h2></div><div id="salesCartItems" class="sales-cart-items"><div class="empty-state">Henüz ürün eklenmedi.</div></div><div class="sales-cart-total"><span>Sepet Toplamı</span><strong id="salesCartTotal">₺0,00</strong></div><button id="salesChooseCustomer" class="erp-primary-button" disabled>Müşteri Seç ve Satışa Başla</button><small>Müşteri seçildikten sonra depo ve ödeme bilgilerini tamamlayabilirsiniz.</small></aside></section>
            <div class="sales-kpis"><article><span>Bugünkü Ciro</span><strong>${para(p.bugun?.ciro)}</strong><small>${Number(p.bugun?.belge || 0)} satış belgesi</small></article><article><span>Bugünkü Tahsilat</span><strong>${para(p.bugun?.tahsilat)}</strong><small>Nakit, kart ve banka</small></article><article><span>Aylık Net Ciro</span><strong>${para(p.ay?.netCiro)}</strong><small>${para(p.ay?.iade)} iade düşüldü</small></article><article class="warning"><span>Açık Satış Bakiyesi</span><strong>${para(p.acikBakiye)}</strong><small>Tahsilat bekleyen tutar</small></article><article><span>Satış Hunisi</span><strong>${Number(p.aktifTeklif || 0)} / ${Number(p.acikSiparis || 0)}</strong><small>Aktif teklif / açık sipariş</small></article></div>
            <div class="sales-layout"><section class="dashboard-panel sales-wide"><div class="panel-heading"><div><h2>Son Satışlar</h2><p>Belge, müşteri veya temsilci ile anında arayın.</p></div><input id="salesSearch" class="erp-input" placeholder="Satış ara..."></div><div class="table-scroll"><table><thead><tr><th>Tarih / Belge</th><th>Müşteri</th><th>Temsilci</th><th>Ödeme</th><th>Toplam</th><th>Kalan</th></tr></thead><tbody>${son.map(s => `<tr data-sales-row="${s._id}" style="cursor:pointer"><td><b>${escapeHtml(s.belgeNo)}</b><small>${tarihKisa(s.tarih)}</small></td><td>${escapeHtml(s.musteriId?.unvan || s.musteriId?.adSoyad || "-")}<small>${escapeHtml(s.musteriId?.kod || "")}</small></td><td>${escapeHtml(s.kullaniciId?.adSoyad || s.kullaniciId?.email || "Atanmamış")}</td><td>${durum(s.odemeDurumu)}<small>${escapeHtml(s.odemeTipi || "")}</small></td><td><b>${para(s.genelToplam)}</b></td><td class="${Number(s.kalanTutar || 0) > 0 ? "sales-debt" : "sales-clear"}">${para(s.kalanTutar)}</td></tr>`).join("") || '<tr><td colspan="6">Henüz satış yok.</td></tr>'}</tbody></table></div></section>
            <aside class="dashboard-panel"><h2>En Çok Satanlar</h2><div class="sales-ranking">${cokSatanlar.map((u, i) => `<div><span>${i + 1}</span><p><b>${escapeHtml(u.ad)}</b><small>${escapeHtml(u.kod)} · ${Number(u.miktar || 0)} adet</small></p><strong>${para(u.ciro)}</strong></div>`).join("") || '<div class="empty-state">Bu ay veri yok.</div>'}</div></aside></div>
            <div class="sales-layout"><section class="dashboard-panel sales-wide"><div class="panel-heading"><div><h2>Satış Temsilcisi Performansı</h2><p>Aylık ciro, tahsilat ve belge üretimi.</p></div></div><div class="sales-reps">${temsilciler.map((r, i) => `<article><div class="sales-rep-avatar">${escapeHtml(String(r.temsilci || "?").slice(0, 2).toUpperCase())}</div><div><b>${escapeHtml(r.temsilci)}</b><small>${Number(r.belge || 0)} belge · Tahsilat ${para(r.tahsilat)}</small></div><strong>${para(r.ciro)}</strong><span style="--score:${Math.max(8, 100 - i * 15)}%"></span></article>`).join("") || '<div class="empty-state">Temsilci satış verisi yok.</div>'}</div></section><aside class="dashboard-panel sales-summary"><h2>Aylık Özet</h2><div><span>Brüt satış</span><b>${para(p.ay?.ciro)}</b></div><div><span>İade</span><b>${para(p.ay?.iade)}</b></div><div><span>Net satış</span><b>${para(p.ay?.netCiro)}</b></div><div><span>Tahsilat</span><b>${para(p.ay?.tahsilat)}</b></div><div><span>Belge</span><b>${Number(p.ay?.belge || 0)}</b></div></aside></div>`;
            const sepet = new Map();
            const sepetCiz = () => { const satirlar = [...sepet.values()]; content.querySelector("#salesCartItems").innerHTML = satirlar.map(x => `<div class="sales-cart-row"><div><b>${escapeHtml(x.ad)}</b><small>${escapeHtml(x.kod)} · ${para(x.satisFiyati)}</small></div><div class="sales-cart-quantity"><button type="button" data-cart-minus="${x._id}">−</button><strong>${x.miktar}</strong><button type="button" data-cart-plus="${x._id}">+</button></div><button type="button" class="sales-cart-remove" data-cart-remove="${x._id}">×</button></div>`).join("") || '<div class="empty-state">Henüz ürün eklenmedi.</div>'; content.querySelector("#salesCartTotal").textContent = para(satirlar.reduce((n, x) => n + x.miktar * Number(x.satisFiyati || 0) * (1 + Number(x.kdv ?? 20) / 100), 0)); content.querySelector("#salesChooseCustomer").disabled = !satirlar.length; content.querySelectorAll("[data-cart-minus]").forEach(b => b.onclick = () => { const x = sepet.get(b.dataset.cartMinus); if (x.miktar <= 1) sepet.delete(b.dataset.cartMinus); else x.miktar--; sepetCiz(); }); content.querySelectorAll("[data-cart-plus]").forEach(b => b.onclick = () => { const x = sepet.get(b.dataset.cartPlus), stok = stokHaritasi.get(String(x._id)) || 0; if (x.miktar < stok) x.miktar++; sepetCiz(); }); content.querySelectorAll("[data-cart-remove]").forEach(b => b.onclick = () => { sepet.delete(b.dataset.cartRemove); sepetCiz(); }); };
            content.querySelectorAll("[data-sales-product]").forEach(btn => btn.onclick = () => { const u = katalog.find(x => String(x._id) === btn.dataset.salesProduct), mevcut = sepet.get(String(u._id)), stok = stokHaritasi.get(String(u._id)) || 0; if (mevcut) { if (mevcut.miktar < stok) mevcut.miktar++; } else sepet.set(String(u._id), { ...u, miktar: 1 }); sepetCiz(); });
            const uruneGit = () => { content.querySelector("#salesPos").scrollIntoView({ behavior: "smooth", block: "start" }); content.querySelector("#salesProductSearch").focus(); };
            content.querySelector("#salesNew").onclick = uruneGit;
            content.querySelector("#salesQuick").onclick = uruneGit;
            content.querySelector("#salesChooseCustomer").onclick = () => satisMusteriSec("satis", [...sepet.values()].map(x => ({ urunId: x._id, miktar: x.miktar, birimFiyat: Number(x.satisFiyati || 0), kdv: Number(x.kdv ?? 20), iskonto: 0 })));
            content.querySelector("#salesProductSearch").oninput = e => { const q = e.target.value.toLocaleLowerCase("tr-TR"); content.querySelectorAll("[data-sales-product]").forEach(x => x.hidden = !x.textContent.toLocaleLowerCase("tr-TR").includes(q)); };
            content.querySelector("#salesReturn").onclick = () => satisMusteriSec("iade");
            content.querySelectorAll("[data-sales-page]").forEach(x => x.onclick = () => sayfaYukle(x.dataset.salesPage));
            content.querySelector("#salesSearch").oninput = e => { const q = e.target.value.toLocaleLowerCase("tr-TR"); content.querySelectorAll("[data-sales-row]").forEach(x => x.hidden = !x.textContent.toLocaleLowerCase("tr-TR").includes(q)); };
            content.querySelectorAll("[data-sales-row]").forEach(row => row.onclick = () => { const s = son.find(x => String(x._id) === row.dataset.salesRow); musteriBelgeMerkeziAc("SATIS", s, s.musteriId || {}).catch(error => alert(error.message)); });
        } catch (error) { errorBox(error); }
    }

    async function sayfaYukle(page) {
        const buYukleme = ++sayfaYuklemeNo;
        if (page === "dashboard" || page === "anaSayfa" || !page) {
            if (buYukleme !== sayfaYuklemeNo) return;
            await dashboardYukle();
            return;
        }

        if (page === "cari" || page === "cariler") {
            if (buYukleme !== sayfaYuklemeNo) return;
            await cariYukle();
            return;
        }

        if (page === "musteriler") {
            if (buYukleme !== sayfaYuklemeNo) return;
            await musterilerYukle();
            return;
        }

        if (page === "tedarikciler") {
            if (buYukleme !== sayfaYuklemeNo) return;
            await tedarikcilerYukle();
            return;
        }

        if (page === "urunler") {
            if (buYukleme !== sayfaYuklemeNo) return;
            await urunlerYukle();
            return;
        }

        if (page === "satis") {
            await satisPaneliYukle();
            return;
        }

        if (page === "ayarlar") {
            if (buYukleme !== sayfaYuklemeNo) return;
            await ayarlarYukle();
            return;
        }

        if (page === "kullanicilar") {
            if (buYukleme !== sayfaYuklemeNo) return;
            await kullanicilarYukle();
            return;
        }

        if (page === "hesabim") {
            if (buYukleme !== sayfaYuklemeNo) return;
            await hesabimYukle();
            return;
        }

        if (page === "stok") {
            if (buYukleme !== sayfaYuklemeNo) return;
            await stokMerkeziYukle();
            return;
        }

        if (page === "alis") {
            if (buYukleme !== sayfaYuklemeNo) return;
            await alisMerkeziYukle();
            return;
        }

        if (configs[page]) {
            if (buYukleme !== sayfaYuklemeNo) return;
            await basitSayfa(page);
            return;
        }

        if (page === "finans" || page === "kasa" || page === "banka") {
            setTitle("Kasa / Banka");
            loading();
            try {
                const d = await api("/api/tenant/finans/ozet");
                if (buYukleme !== sayfaYuklemeNo) return;
                content.innerHTML = `
                    <div class="dashboard-grid">
                        ${card("Kasa", para(d.kasaToplam), "Aktif kasa bakiyesi")}
                        ${card("Banka", para(d.bankaToplam), "Aktif banka bakiyesi")}
                        ${card("Toplam Nakit", para(d.toplamNakit), "Kasa + banka")}
                    </div>
                `;
            } catch (error) {
                errorBox(error);
            }
            return;
        }

        if (page === "raporlar") {
            setTitle("Raporlar");
            loading();
            try {
                const d = await api("/api/tenant/raporlar/genel");
                const r = d.rapor || {};
                if (buYukleme !== sayfaYuklemeNo) return;
                content.innerHTML = `<div class="welcome-banner"><div><div class="eyebrow">YÖNETİM RAPORLARI</div><h2>İşletme Özeti</h2><p>Satış, stok, cari ve personel sonuçlarını tek ekranda inceleyin.</p></div></div><div class="dashboard-grid">${card("Stok Miktarı", Number(r.stok?.toplamAdet || 0), "Toplam mevcut stok")}${card("Tahsilat", para(r.cari?.tahsilat || 0), "Toplam cari tahsilat")}${card("Ödeme", para(r.cari?.odeme || 0), "Toplam cari ödeme")}${card("Aktif Personel", Number(r.personel?.aktif || 0), "Çalışan personel")}</div>`;
            } catch (error) { errorBox(error); }
            return;
        }

        setTitle(page);
        content.innerHTML = `
            <div class="dashboard-panel">
                <h2>${escapeHtml(page)}</h2>
                <div class="empty-state">Bu ekran kurtarma sürümünde hazırlanıyor.</div>
            </div>
        `;
    }

    function anaSayfa() {
        sayfaYukle("dashboard");
    }

    function modul(name) {
        const map = {
            musteriler: "musteriler",
            tedarikciler: "tedarikciler",
            urunler: "urunler",
            stok: "stok",
            alis: "alis",
            satis: "satis",
            cariler: "cari",
            cari: "cari",
            finans: "finans"
        };
        sayfaYukle(map[name] || name);
    }

    document.addEventListener("click", event => {
        const tahsilat = event.target.closest("[data-cari-tahsilat]");
        if (tahsilat) { cariOdemeFormu(tahsilat.dataset.cariTahsilat, "tahsilat", tahsilat.dataset.cariTip); return; }
        const odeme = event.target.closest("[data-cari-odeme-yap]");
        if (odeme) { cariOdemeFormu(odeme.dataset.cariOdemeYap, "odeme", odeme.dataset.cariTip); return; }
        const bakiye = event.target.closest("[data-cari-bakiye]");
        if (bakiye) { cariBakiyeDuzeltFormu(bakiye.dataset.cariBakiye, bakiye.dataset.cariTip); return; }
        const durum = event.target.closest("[data-cari-durum]");
        if (durum) { cariDurumDegistir(durum.dataset.cariDurum, durum.dataset.cariAktif === "true", durum.dataset.cariTip).catch(error => alert(error.message)); return; }
        const sil = event.target.closest("[data-cari-sil]");
        if (sil) { cariSil(sil.dataset.cariSil, sil.dataset.cariTip); return; }
        const cariIslem = event.target.closest("[data-cari-islem]");
        if (cariIslem) {
            cariManuelHareketFormu(cariIslem.dataset.cariIslem, cariIslem.dataset.cariTip);
            return;
        }
        const ekstre = event.target.closest("[data-cari-ekstre]");
        if (ekstre) {
            cariEkstreAc(ekstre.dataset.cariTip, ekstre.dataset.cariEkstre);
            return;
        }
        const musteriSatiri = event.target.closest("[data-cari-musteri-ac]");
        if (musteriSatiri && !event.target.closest("button,a,input,select")) musteriAnaSayfaAc(musteriSatiri.dataset.cariMusteriAc);
        const tedarikciSatiri = event.target.closest("[data-cari-tedarikci-ac]");
        if (tedarikciSatiri && !event.target.closest("button,a,input,select")) tedarikciDashboardAc(tedarikciSatiri.dataset.cariTedarikciAc);
    });

    // Mevcut menü yapılarıyla uyumlu global fonksiyonlar.
    window.sayfaYukle = sayfaYukle;
    window.anaSayfa = anaSayfa;
    window.modul = modul;
    window.cariYukle = cariYukle;
    window.cariEkstreAc = cariEkstreAc;

    document.getElementById("accountButton")?.addEventListener("click", () => sayfaYukle("hesabim"));
    document.getElementById("logoutButton")?.addEventListener("click", oturumuKapat);

    // Menü butonlarında data-page kullanılıyorsa otomatik bağla.
    document.querySelectorAll("[data-page]").forEach(button => {
        button.addEventListener("click", () => {
            sayfaYukle(button.dataset.page);
        });
    });

    // Başlangıç.
    anaSayfa();
})();
