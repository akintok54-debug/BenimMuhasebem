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

                            ${
                                oneriler
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

                    <div class="dashboard-panel">

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

                    <div class="dashboard-panel">

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

                    <div class="dashboard-panel">

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

                    <div class="dashboard-panel">

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

                    <div class="dashboard-panel">

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
                                <input name="fotografDosya" type="file" accept="image/png,image/jpeg,image/webp">
                                <small>PNG, JPG veya WebP; en fazla 1 MB.</small>
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
                        if (dosya.size > 1024 * 1024) throw new Error("Fotoğraf 1 MB'dan büyük olamaz.");
                        veri.fotograf = await new Promise((resolve, reject) => {
                            const okuyucu = new FileReader();
                            okuyucu.onload = () => resolve(okuyucu.result);
                            okuyucu.onerror = () => reject(new Error("Fotoğraf okunamadı."));
                            okuyucu.readAsDataURL(dosya);
                        });
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
    }
    function musteriFormRenderAdimGecerli() {
        musteriPanelRenderAdim(
            musteriFormAdim || 1
        );
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
                siparisData
            ] = await Promise.all([
                api(`/api/tenant/musteriler/${encodeURIComponent(id)}`),
                api("/api/tenant/musteriler"),
                guvenliApi(`/api/tenant/cari/hareketler?tarafTipi=MUSTERI&tarafId=${encodeURIComponent(id)}`),
                guvenliApi("/api/tenant/satis"),
                guvenliApi("/api/tenant/teklifler"),
                guvenliApi("/api/tenant/siparisler")
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

                        <button data-mtab="teklif"
                            style="background:#ea580c;color:white;"
                            class="erp-small-button">
                            Teklifler
                        </button>

                        <button data-mtab="siparis"
                            style="background:#ca8a04;color:white;"
                            class="erp-small-button">
                            Siparişler
                        </button>

                        <button data-mtab="bilgi"
                            style="background:#475569;color:white;"
                            class="erp-small-button">
                            Bilgiler / Düzenle
                        </button>

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
                                    ${
                                        satislar.length
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
                    ?.addEventListener("click", () => {

                        sessionStorage.setItem(
                            "erpSeciliMusteriId",
                            id
                        );

                        sayfaYukle("satis");
                    });
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
                                    ${
                                        hareketler.length
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

                        sessionStorage.setItem(
                            "erpSeciliMusteriId",
                            id
                        );

                        if (
                            typeof cariTahsilatFormu ===
                            "function"
                        ) {
                            await cariTahsilatFormu(id);
                            return;
                        }

                        sayfaYukle("cari");
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
                    ?.addEventListener("click", () => {

                        sessionStorage.setItem(
                            "erpSeciliMusteriId",
                            id
                        );

                        sayfaYukle("teklifler");
                    });
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
                    ?.addEventListener("click", () => {

                        sessionStorage.setItem(
                            "erpSeciliMusteriId",
                            id
                        );

                        sayfaYukle("siparisler");
                    });
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

                            </div>

                            <textarea
                                name="adres"
                                placeholder="Adres"
                                style="width:100%;box-sizing:border-box;margin-top:12px;"
                            >${escapeHtml(m.adres || "")}</textarea>

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

                    window.open(
                        `https://wa.me/${tel}`,
                        "_blank",
                        "noopener"
                    );
                });


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

                    altPanel.innerHTML = `
                        <div class="dashboard-panel">
                            <h2>Müşteri Grupları</h2>
                            <p>Müşteri sınıflandırmaları burada yönetilecek.</p>
                        </div>
                    `;
                });

        } catch (error) {
            errorBox(error);
        }
    }

    async function cariYukle() {
        setTitle("Cari");
        loading();

        try {
            const [ozetData, musteriData, tedarikciData] =
                await Promise.all([
                    api("/api/tenant/cari/ozet"),
                    api("/api/tenant/musteriler"),
                    api("/api/tenant/tedarikciler")
                ]);

            const musteriler = musteriData.musteriler || [];
            const tedarikciler = tedarikciData.tedarikciler || [];

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
                const list = musteriler
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
                                    <th>İşlem</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${list.length ? list.map(item => `
                                    <tr>
                                        <td><strong>${escapeHtml(item.kod || "-")}</strong></td>
                                        <td>${escapeHtml(item.unvan || item.adSoyad || "-")}</td>
                                        <td>${escapeHtml(item.whatsapp || item.telefon || "-")}</td>
                                        <td><strong>${para(item.bakiye)}</strong></td>
                                        <td>
                                            <div class="row-actions">
                                                <button type="button"
                                                        class="erp-small-button"
                                                        data-cari-ekstre="${item._id}"
                                                        data-cari-tip="${aktif}">
                                                    Ekstre
                                                </button>
                                                ${aktif === "musteri"
                                                    ? `<button type="button"
                                                               class="erp-small-button"
                                                               data-cari-tahsilat="${item._id}">
                                                           Tahsilat
                                                       </button>`
                                                    : `<button type="button"
                                                               class="erp-small-button"
                                                               data-cari-odeme="${item._id}">
                                                           Ödeme
                                                       </button>`}
                                            </div>
                                        </td>
                                    </tr>
                                `).join("") : `
                                    <tr>
                                        <td colspan="5">Kayıt bulunamadı.</td>
                                    </tr>
                                `}
                            </tbody>
                        </table>
                    </div>
                `;
            };

            document.querySelectorAll("[data-cari-tab]").forEach(btn => {
                btn.addEventListener("click", () => {
                    aktif = "musteri";
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

            const rows = hareketler.map(h => ({
                ...h,
                tarihText: h.tarih ? new Date(h.tarih).toLocaleDateString("tr-TR") : "-",
                borc: h.tip === "BORC" ? Number(h.tutar || 0) : 0,
                alacak: ["TAHSILAT", "ODEME", "ALACAK"].includes(h.tip)
                    ? Number(h.tutar || 0)
                    : 0
            }));

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
                                        <th>Borç</th>
                                        <th>Alacak</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${rows.length ? rows.map(row => `
                                        <tr>
                                            <td>${escapeHtml(row.tarihText)}</td>
                                            <td>${escapeHtml(row.tip || "-")}</td>
                                            <td>${escapeHtml(row.aciklama || "-")}</td>
                                            <td>${row.borc ? para(row.borc) : "-"}</td>
                                            <td>${row.alacak ? para(row.alacak) : "-"}</td>
                                        </tr>
                                    `).join("") : `
                                        <tr>
                                            <td colspan="5" style="text-align:center">
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

    let sayfaYuklemeNo = 0;

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
        const ekstre = event.target.closest("[data-cari-ekstre]");
        if (ekstre) {
            cariEkstreAc(ekstre.dataset.cariTip, ekstre.dataset.cariEkstre);
        }
    });

    // Mevcut menü yapılarıyla uyumlu global fonksiyonlar.
    window.sayfaYukle = sayfaYukle;
    window.anaSayfa = anaSayfa;
    window.modul = modul;
    window.cariYukle = cariYukle;
    window.cariEkstreAc = cariEkstreAc;

    // Menü butonlarında data-page kullanılıyorsa otomatik bağla.
    document.querySelectorAll("[data-page]").forEach(button => {
        button.addEventListener("click", () => {
            sayfaYukle(button.dataset.page);
        });
    });

    // Başlangıç.
    anaSayfa();
})();

























