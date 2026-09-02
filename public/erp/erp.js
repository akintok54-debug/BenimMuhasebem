(() => {
    "use strict";

    function sonKullaniciMetinleriniDuzelt(kok) {
        if (!kok) return;
        const walker = document.createTreeWalker(kok, NodeFilter.SHOW_TEXT);
        const dugumler = [];
        while (walker.nextNode()) dugumler.push(walker.currentNode);
        for (const dugum of dugumler) {
            let metin = dugum.nodeValue;
            metin = metin.replace(/BAHADIR ERP/gi, "benimmuhasebe.com");
            metin = metin.replace(/BENİMMUHASEBE ERP/gi, "BENİMMUHASEBE İŞLETME YÖNETİMİ");
            metin = metin.replace(/\bERP\b/g, "İşletme Yönetimi");
            metin = metin.replace(/\s+V2\b/g, "");
            metin = metin.replace(/Tenant bağlantısı aktif/gi, "İşletme hesabınız aktif");
            metin = metin.replace(/Tenant İzolasyonu/gi, "Firma Veri Güvenliği");
            if (metin !== dugum.nodeValue) dugum.nodeValue = metin;
        }
    }
    const metinGozlemcisi = new MutationObserver(degisiklikler => degisiklikler.forEach(degisiklik => degisiklik.addedNodes.forEach(node => sonKullaniciMetinleriniDuzelt(node.nodeType === Node.TEXT_NODE ? node.parentNode : node))));
    sonKullaniciMetinleriniDuzelt(document.body);
    metinGozlemcisi.observe(document.body, { childList: true, subtree: true });

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

    let firmaProfiliOnbellegi = null;
    async function firmaProfiliGetir() {
        if (firmaProfiliOnbellegi) return firmaProfiliOnbellegi;
        try {
            const data = await api("/api/tenant/dashboard");
            const f = data.tenant?.firmaBilgileri || {};
            firmaProfiliOnbellegi = { ...f, unvan: f.unvan || data.tenant?.name || "İşletmeniz" };
        } catch (_) { firmaProfiliOnbellegi = { unvan: "İşletmeniz" }; }
        return firmaProfiliOnbellegi;
    }

    function profesyonelPaylasimMesaji({ firmaAdi, musteriAdi, belgeAdi, belgeNo, link = "", ek = false }) {
        return `Sayın ${musteriAdi || "Yetkili"},\n\n${firmaAdi} tarafından hazırlanan ${belgeAdi.toLocaleLowerCase("tr-TR")}${belgeNo ? ` (${belgeNo})` : ""} ${link ? "aşağıdaki güvenli bağlantıda" : ek ? "ekte" : "bilgilerinize"} sunulmuştur.${link ? `\n\n${link}` : ""}\n\nBelgeyle ilgili sorularınız için bizimle iletişime geçebilirsiniz.\n\nSaygılarımızla,\n${firmaAdi}`;
    }

    const devamEdenMutasyonlar = new Map();

    async function api(url, options = {}) {
        const method = String(options.method || "GET").toUpperCase();
        const mutasyon = !["GET", "HEAD", "OPTIONS"].includes(method);
        const parmakIzi = mutasyon ? `${method}:${url}:${String(options.body || "")}` : null;
        if (parmakIzi && devamEdenMutasyonlar.has(parmakIzi)) {
            return devamEdenMutasyonlar.get(parmakIzi);
        }

        const headers = {
            Accept: "application/json",
            ...(options.headers || {})
        };

        if (options.body && !headers["Content-Type"]) {
            headers["Content-Type"] = "application/json";
        }

        if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
            const csrf = sessionStorage.getItem("bmCsrfToken");
            if (csrf) headers["X-CSRF-Token"] = csrf;
        }

        if (mutasyon && !headers["Idempotency-Key"]) {
            let bodyTransactionId = "";
            try { bodyTransactionId = JSON.parse(options.body || "{}")?.transactionId || ""; } catch (_) {}
            headers["Idempotency-Key"] = String(options.transactionId || bodyTransactionId || globalThis.crypto?.randomUUID?.() || `tx-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        }

        const t = token();
        if (t) {
            headers.Authorization = t.startsWith("Bearer ")
                ? t
                : `Bearer ${t}`;
        }

        const istek = (async () => {
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
                const apiError = new Error(
                    data?.mesaj ||
                    data?.message ||
                    `API hatası: ${response.status}`
                );
                apiError.code = data?.kod || "";
                apiError.data = data;
                apiError.status = response.status;
                throw apiError;
            }

            return data;
        })();

        if (parmakIzi) devamEdenMutasyonlar.set(parmakIzi, istek);
        try {
            return await istek;
        } finally {
            if (parmakIzi && devamEdenMutasyonlar.get(parmakIzi) === istek) devamEdenMutasyonlar.delete(parmakIzi);
        }
    }

    let oturumKullanici = null;
    const rolYetkileri = {
        MANAGER: ["sales.", "purchase.", "stock.", "customer.", "supplier.", "reports.read"],
        SALES: ["sales.", "field.", "customer.read", "customer.write", "stock.read"], SATIS: ["sales.", "field.", "customer.read", "customer.write", "stock.read"],
        CASHIER: ["cash.", "customer.read", "sales.read"],
        ACCOUNTING: ["cash.", "accounting.", "customer.", "supplier.", "reports.read", "sales.read", "purchase.read", "ecommerce.view", "ecommerce.documents", "ecommerce.finance"], MUHASEBE: ["cash.", "accounting.", "customer.", "supplier.", "reports.read", "sales.read", "purchase.read", "ecommerce.view", "ecommerce.documents", "ecommerce.finance"],
        WAREHOUSE: ["stock.", "sales.read", "purchase.read", "supplier.read", "ecommerce.view", "ecommerce.orders"], DEPO: ["stock.", "sales.read", "purchase.read", "supplier.read", "ecommerce.view", "ecommerce.orders"],
        ECOMMERCE: ["sales.", "customer.read", "stock.read", "ecommerce.view", "ecommerce.orders", "ecommerce.products", "ecommerce.returns", "ecommerce.sync"], ETICARET: ["sales.", "customer.read", "stock.read", "ecommerce.view", "ecommerce.orders", "ecommerce.products", "ecommerce.returns", "ecommerce.sync"]
    };
    function oturumYetkisiVar(gerekli) {
        const rol = String(oturumKullanici?.rol || "").toUpperCase();
        if (["OWNER", "ADMIN"].includes(rol)) return true;
        const izinler = oturumKullanici?.yetkiModu === "OZEL" ? (oturumKullanici.ozelYetkiler || []) : (rolYetkileri[rol] || []);
        const eskiCari = { "customer.read": "party.read", "customer.write": "party.write", "supplier.read": "party.read", "supplier.write": "party.write" };
        return izinler.some(izin => izin === gerekli || (!(["SALES", "SATIS"].includes(rol) && gerekli.startsWith("supplier.")) && izin === eskiCari[gerekli]) || (izin.endsWith(".") && gerekli.startsWith(izin)));
    }
    function sayfaErisimiVar(page) {
        const esleme = { musteriler: ["customer.read"], tedarikciler: ["supplier.read"], urunler: ["stock.read"], stok: ["stock.read"], alis: ["purchase.read", "supplier.read"], satis: ["sales.read"], saha: ["field.read"], teklifler: ["sales.read"], siparisler: ["sales.read"], eticaret: ["ecommerce.view"], whatsapp: ["sales.read"], cari: ["customer.read", "supplier.read"], finans: ["cash.read"], masraflar: ["accounting.read"], personeller: ["tenant.users"], kullanicilar: ["tenant.users"], raporlar: ["reports.read"], ayarlar: ["tenant.settings"] };
        if (page === "alis") return esleme.alis.every(oturumYetkisiVar);
        return !esleme[page] || esleme[page].some(oturumYetkisiVar);
    }
    function mobilYetkiMenusunuUygula() {
        document.querySelectorAll("[data-page]").forEach(button => { button.hidden = !sayfaErisimiVar(button.dataset.page); });
        document.body.dataset.kullaniciRol = String(oturumKullanici?.rol || "");
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
                    oturumYetkisiVar("cash.read") ? api("/api/tenant/finans/ozet") : Promise.resolve({}),
                    oturumYetkisiVar("reports.read") ? api("/api/tenant/raporlar/genel") : Promise.resolve({}),
                    oturumYetkisiVar("sales.read") ? api("/api/tenant/satis") : Promise.resolve({ satislar: [] }),
                    oturumYetkisiVar("accounting.read") ? api("/api/tenant/masraflar/ozet") : Promise.resolve({}),
                    (oturumYetkisiVar("customer.read") || oturumYetkisiVar("supplier.read")) ? api("/api/tenant/cari/ozet") : Promise.resolve({})
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

            if (oturumYetkisiVar("supplier.read") && cari.tedarikciBorc > 0) {
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
                    "İşletme hesabınız aktif";
            }

            content.innerHTML = `
                <div class="welcome-banner">

                    <div>
                        <div class="eyebrow">
                            BEN&#304;MMUHASEBE İŞLETME YÖNETİMİ
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

                    ${oturumYetkisiVar("supplier.read") ? `<div class="dashboard-card">

                        <div class="dashboard-card-title">
                            Tedarikçi Borcu
                        </div>

                        <div class="dashboard-card-value">
                            ${para(cari.tedarikciBorc)}
                        </div>

                        <div class="dashboard-card-info">
                            Ödenmemiş
                        </div>

                    </div>` : ""}

                    ${oturumYetkisiVar("customer.read") && oturumYetkisiVar("supplier.read") ? `<div class="dashboard-card positive">

                        <div class="dashboard-card-title">
                            Net Cari
                        </div>

                        <div class="dashboard-card-value">
                            ${para(cari.netCari)}
                        </div>

                        <div class="dashboard-card-info">
                            Alacak - borç
                        </div>

                    </div>` : ""}

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
                                    İşletmenizi yönetmenize yardımcı olacak
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
                                    Günlük işlemlere hızlı erişin
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
                button.hidden = !sayfaErisimiVar(button.dataset.dashboardPage);
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

    function musteriTahsilatDuzenleFormu(musteri, tahsilat) {
        musteriModalKapat();
        const overlay = document.createElement("div");
        overlay.id = "musteriIslemOverlay";
        overlay.className = "erp-modal-overlay";
        const mevcutTutar = Number(tahsilat.tutar || 0);
        const azamiTutar = mevcutTutar + Number(musteri.bakiye || 0);
        const tahsilatTarihi = new Date(tahsilat.tarih || tahsilat.createdAt || Date.now()).toISOString().slice(0, 10);
        overlay.innerHTML = `<div class="erp-modal" style="max-width:620px;width:95%">
            <div class="erp-modal-header"><div><h2>Tahsilatı Düzenle</h2><p>${escapeHtml(musteri.kod)} · ${escapeHtml(musteri.unvan || musteri.adSoyad)} · Mevcut ${para(mevcutTutar)}</p></div><button class="erp-modal-close" type="button">×</button></div>
            <form><div class="erp-form-grid">
                <label>Yeni Tutar<input name="tutar" type="number" min="0.01" max="${azamiTutar}" step="0.01" value="${mevcutTutar}" required></label>
                <label>Tarih<input name="tarih" type="date" value="${tahsilatTarihi}" required></label>
                <label class="full">Açıklama<textarea name="aciklama">${escapeHtml(tahsilat.aciklama || "Müşteri tahsilatı")}</textarea></label>
            </div><div id="tahsilatDuzenleMesaj"></div><div class="erp-modal-footer"><button type="button" class="erp-small-button" data-kapat>Vazgeç</button><button class="erp-primary-button" type="submit">Değişikliği Kaydet</button></div></form></div>`;
        document.body.appendChild(overlay);
        overlay.querySelectorAll(".erp-modal-close,[data-kapat]").forEach(x => x.addEventListener("click", musteriModalKapat));
        overlay.querySelector("form").addEventListener("submit", async event => {
            event.preventDefault();
            const fd = new FormData(event.currentTarget);
            const mesaj = overlay.querySelector("#tahsilatDuzenleMesaj");
            try {
                const sonuc = await api(`/api/tenant/cari/musteri/tahsilat/${encodeURIComponent(tahsilat._id)}`, {
                    method: "PATCH",
                    body: JSON.stringify({ tutar: Number(fd.get("tutar")), tarih: fd.get("tarih"), aciklama: fd.get("aciklama") })
                });
                mesaj.innerHTML = `<div class="success">${escapeHtml(sonuc.mesaj)}</div>`;
                setTimeout(() => { musteriModalKapat(); musteriAnaSayfaAc(musteri._id); }, 450);
            } catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; }
        });
    }

    async function hizliSatisUrunuAc(secenekler = {}) {
        const [depolarData, kategoriData] = await Promise.all([
            secenekler.depolar ? Promise.resolve({ depolar: secenekler.depolar }) : api("/api/tenant/stok/depolar"),
            api("/api/tenant/urunler/kategoriler")
        ]);
        const depolar = depolarData.depolar || [];
        const kategoriler = kategoriData.kategoriler || [];
        const aktifDepolar = depolar.filter(x => x.aktif !== false);
        if (!aktifDepolar.length) throw new Error("Hızlı ürün açmak için aktif depo bulunamadı.");
        document.getElementById("hizliSatisUrunModal")?.remove();
        const overlay = document.createElement("div"); overlay.id = "hizliSatisUrunModal"; overlay.className = "erp-modal-overlay";
        overlay.innerHTML = `<div class="erp-modal" style="max-width:760px;width:96%"><div class="erp-modal-header"><div><h2>Satış İçin Yeni Ürün Aç</h2><p>Ürün kartı ve satılabilir başlangıç stoğu tek adımda oluşturulur.</p></div><button type="button" class="erp-modal-close">×</button></div><form><div class="erp-form-grid"><label>Ürün Kodu / SKU<input name="kod" required maxlength="80" autofocus></label><label>Barkod<input name="barkod" maxlength="120"></label><label class="full">Ürün Adı<input name="ad" required maxlength="200"></label><label>Depo<select name="depoId" required>${aktifDepolar.map(x => `<option value="${x._id}" ${String(x._id) === String(secenekler.depoId || "") ? "selected" : ""}>${escapeHtml(x.kod)} · ${escapeHtml(x.ad)}</option>`).join("")}</select></label><label>Başlangıç Stoğu<input name="stokMiktari" type="number" min="0.0001" step="0.0001" value="1" required></label><label>Alış Maliyeti<input name="alisFiyati" type="number" min="0.01" step="0.01" required></label><label>Satış Fiyatı<input name="satisFiyati" type="number" min="0" step="0.01" required></label><label>Perakende Fiyatı<input name="perakendeFiyati" type="number" min="0" step="0.01"></label><label>KDV %<input name="kdv" type="number" min="0" max="100" step="0.01" value="20" required></label><label>Birim<select name="birim"><option>ADET</option><option>KUTU</option><option>PAKET</option><option>KG</option><option>LT</option><option>MT</option></select></label><label>Kategori<span class="product-category-row"><select name="kategori" id="hizliKategoriSecim"><option value="">Kategori seçin</option>${kategoriler.map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join("")}</select><button type="button" id="hizliYeniKategori" class="erp-small-button" title="Yeni kategori ekle">+ Yeni</button></span></label><label>Marka<input name="marka"></label><label class="full">Açıklama<input name="aciklama" value="Satış ekranından hızlı ürün ve açılış stoğu"></label></div><div id="hizliSatisUrunMesaj"></div><div class="erp-modal-footer"><button type="button" class="erp-small-button" data-kapat>Vazgeç</button><button type="submit" class="erp-primary-button">Ürünü Oluştur ve Satışa Ekle</button></div></form></div>`;
        document.body.appendChild(overlay);
        const kapat = () => overlay.remove(); overlay.querySelectorAll(".erp-modal-close,[data-kapat]").forEach(x => x.onclick = kapat);
        overlay.querySelector("#hizliYeniKategori").onclick = () => { const yeni = String(prompt("Yeni kategori adı:") || "").trim(); if (!yeni) return; const secim = overlay.querySelector("#hizliKategoriSecim"); if (![...secim.options].some(o => o.value === yeni)) secim.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(yeni)}">${escapeHtml(yeni)}</option>`); secim.value = yeni; };
        const form = overlay.querySelector("form"), satisFiyati = form.elements.satisFiyati, perakendeFiyati = form.elements.perakendeFiyati;
        satisFiyati.addEventListener("input", () => { if (!perakendeFiyati.value) perakendeFiyati.value = satisFiyati.value; });
        form.onsubmit = async event => { event.preventDefault(); const mesaj = overlay.querySelector("#hizliSatisUrunMesaj"); try { const body = Object.fromEntries(new FormData(form).entries()); ["stokMiktari", "alisFiyati", "satisFiyati", "perakendeFiyati", "kdv"].forEach(k => body[k] = Number(body[k] || 0)); body.tarih = new Date().toISOString(); const sonuc = await api("/api/tenant/urunler/hizli-satis", { method: "POST", body: JSON.stringify(body) }); kapat(); if (typeof secenekler.onSaved === "function") await secenekler.onSaved(sonuc); } catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
    }

    async function musteriBelgeFormu(tur, musteri, mevcut = null, baslangicKalemleri = [], secenekler = {}) {
        const perakende = tur === "satis" && secenekler.perakende === true;
        const sahaBaglami = secenekler.saha === true;
        const [urunData, stokData, finansData] = await Promise.all([api("/api/tenant/urunler"), api("/api/tenant/stok/depolar"), tur === "satis" ? (sahaBaglami ? api(`/api/tenant/saha/panel?gun=${encodeURIComponent(secenekler.sahaGun || new Date().toISOString().slice(0, 10))}`) : oturumYetkisiVar("cash.read") ? api("/api/tenant/finans/ozet") : api("/api/tenant/saha/panel")) : Promise.resolve({})]);
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
        if (ayar.depo && !depolar.length) throw new Error("İşlem için aktif depo bulunamadı.");
        const no = mevcut?.belgeNo || mevcut?.teklifNo || mevcut?.siparisNo || `${tur === "satis" ? "SAT" : tur === "iade" ? "IADE" : tur === "teklif" ? "TEK" : "SIP"}-${Date.now()}`;
        musteriModalKapat();
        const overlay = document.createElement("div");
        overlay.id = "musteriIslemOverlay"; overlay.className = "erp-modal-overlay";
        const urunFiyati = x => Number(perakende ? (x.perakendeFiyati || x.satisFiyati || 0) : (x.satisFiyati || 0));
        const urunSecenegi = (x, uid = "") => `<option value="${x._id}" data-fiyat="${urunFiyati(x)}" data-kdv="${Number(x.kdv ?? 20)}" data-iskonto="${perakende ? 0 : Number(x.iskonto || 0)}" ${String(x._id) === String(uid) ? "selected" : ""}>${escapeHtml(x.kod)} · ${escapeHtml(x.ad)}</option>`;
        const satirHtml = (k = {}) => { const uid = String(k.urunId?._id || k.urunId || ""); const opts = urunler.map(x => urunSecenegi(x, uid)).join(""); const seciliUrun = urunler.find(x => String(x._id) === uid); return `<tr class="belge-kalem"><td><select name="urunId" required style="min-width:220px"><option value="">Ürün seçin</option>${opts}</select></td><td><input name="miktar" type="number" min="0.0001" step="0.0001" value="${Number(k.miktar || 1)}" required style="width:90px"></td><td><input name="birimFiyat" type="number" min="0" step="0.01" value="${k.birimFiyat ?? (seciliUrun ? urunFiyati(seciliUrun) : "")}" required style="width:110px"></td><td><input name="kdv" type="number" min="0" step="0.01" value="${Number(k.kdv ?? 20)}" style="width:75px"></td><td><input name="iskonto" type="number" min="0" max="100" step="0.01" value="${perakende ? 0 : Number(k.iskonto ?? 0)}" style="width:75px"></td><td><button type="button" class="erp-small-button secondary kalem-sil">Sil</button></td></tr>`; };
        const ilkSatirlar = mevcut?.kalemler?.length ? mevcut.kalemler.map(satirHtml).join("") : baslangicKalemleri.length ? baslangicKalemleri.map(satirHtml).join("") : satirHtml();
        const belgeTarihi = new Date(mevcut?.tarih || Date.now()).toISOString().slice(0, 10);
        const odemeHtml = tur === "satis" && !mevcut ? `<div class="sales-payment-box ${perakende ? "retail-payment-box" : ""}"><div class="sales-total-breakdown"><div><span>Ara Toplam (KDV Hariç)</span><strong id="salesAraToplam">₺0,00</strong></div><div><span>KDV Tutarı</span><strong id="salesKdvToplam">₺0,00</strong></div><div class="sales-total-genel"><span>${perakende ? "Perakende Toplamı" : "Belge Toplamı"}</span><strong id="salesDocumentTotal">₺0,00</strong></div></div><label>Hedef Genel Toplam (indirim için)<span class="sales-target-row"><input id="hedefGenelToplam" type="number" min="0" step="0.01" placeholder="Örn. 8000"><button type="button" id="hedefUygula" class="erp-small-button">Uygula</button></span><small>Girilen tutara göre iskonto oranı her kaleme değerine orantılı dağıtılır.</small></label><label>Ödeme Yöntemi<select name="odemeTipi">${perakende ? "" : '<option value="ACIK_HESAP">Açık Hesap</option>'}<option value="NAKIT">Nakit</option><option value="KART">POS / Kredi Kartı</option><option value="BANKA">IBAN / Havale</option>${perakende ? "" : '<option value="CEK">Çek</option><option value="SENET">Senet</option>'}</select></label><label data-sales-account hidden>Kasa / Banka<select name="hesap"><option value="">Hesap seçin</option>${satisHesaplari.map(x => `<option value="${x.tip}|${x.id}" data-hesap-tipi="${x.tip}">${escapeHtml(x.tip)} · ${escapeHtml(x.ad)}</option>`).join("")}</select></label></div>` : "";
        const seciliDepoId = mevcut?.depoId?._id || mevcut?.depoId || secenekler.depoId || "";
        const surecAlanlari = tur === "teklif" ? `<label>Geçerlilik Tarihi<input name="gecerlilikTarihi" type="date" value="${mevcut?.gecerlilikTarihi ? new Date(mevcut.gecerlilikTarihi).toISOString().slice(0, 10) : ""}"></label><label>Para Birimi<select name="paraBirimi"><option>TRY</option><option ${mevcut?.paraBirimi === "USD" ? "selected" : ""}>USD</option><option ${mevcut?.paraBirimi === "EUR" ? "selected" : ""}>EUR</option></select></label><label>Teslim Süresi (gün)<input name="teslimSuresiGun" type="number" min="0" value="${Number(mevcut?.teslimSuresiGun || 0)}"></label><label>Ödeme Koşulları<input name="odemeKosullari" value="${escapeHtml(mevcut?.odemeKosullari || "")}" placeholder="Örn. %50 peşin, bakiye teslimde"></label><label class="full">Teslimat Koşulları<input name="teslimatKosullari" value="${escapeHtml(mevcut?.teslimatKosullari || "")}" placeholder="Teslim şekli, nakliye ve termin bilgisi"></label>` : tur === "siparis" ? `<label class="full">Depo<select name="depoId" required><option value="">Depo seçin</option>${depolar.map(x => `<option value="${x._id}" ${String(x._id) === String(seciliDepoId) ? "selected" : ""}>${escapeHtml(x.kod)} · ${escapeHtml(x.ad)}</option>`).join("")}</select></label><label>Teslim Tarihi<input name="teslimTarihi" type="date" value="${mevcut?.teslimTarihi ? new Date(mevcut.teslimTarihi).toISOString().slice(0, 10) : ""}"></label><label>Para Birimi<select name="paraBirimi"><option>TRY</option><option ${mevcut?.paraBirimi === "USD" ? "selected" : ""}>USD</option><option ${mevcut?.paraBirimi === "EUR" ? "selected" : ""}>EUR</option></select></label><label class="full">Sevk Adresi<input name="sevkAdresi" value="${escapeHtml(mevcut?.sevkAdresi || "")}"></label><label class="full">Ödeme Koşulları<input name="odemeKosullari" value="${escapeHtml(mevcut?.odemeKosullari || "")}"></label>` : ayar.depo ? `<label class="full">Depo<select name="depoId" required><option value="">Depo seçin</option>${depolar.map(x => `<option value="${x._id}" ${String(x._id) === String(seciliDepoId) ? "selected" : ""}>${escapeHtml(x.kod)} · ${escapeHtml(x.ad)}</option>`).join("")}</select></label>` : "";
        overlay.innerHTML = `<div class="erp-modal ${perakende ? "retail-sale-modal" : ""}" style="max-width:1100px;width:98%"><div class="erp-modal-header"><div><h2>${perakende ? "Perakende Satış" : mevcut ? `${ayar.baslik} - Düzenle` : ayar.baslik}</h2><p>${perakende ? "Müşteri seçmeden hızlı kasa satışı · Perakende fiyatları" : `${escapeHtml(musteri.kod)} · ${escapeHtml(musteri.unvan || musteri.adSoyad)} · Bakiye ${para(musteri.bakiye)}`}</p></div><button type="button" class="erp-modal-close">×</button></div><form id="musteriBelgeForm"><div class="erp-form-grid"><label>${ayar.no}<input name="no" value="${escapeHtml(no)}" required></label><label>Tarih<input name="tarih" type="date" value="${belgeTarihi}" required></label>${surecAlanlari}</div><div class="panel-heading" style="margin-top:16px"><div><h3>${perakende ? "Perakende Sepeti" : "Belge Kalemleri"}</h3><p>Ürünleri aynı tabloya satır olarak ekleyin.</p></div><div>${tur === "satis" && !mevcut ? '<button type="button" id="hizliSatisUrunEkle" class="erp-small-button">+ Yeni Ürün Aç</button> ' : ""}<button type="button" id="kalemEkle" class="erp-primary-button">+ Kalem Ekle</button></div></div><div class="table-scroll"><table><thead><tr><th>Ürün</th><th>Miktar</th><th>Birim Fiyat</th><th>KDV %</th><th>İskonto %</th><th></th></tr></thead><tbody id="belgeKalemler">${ilkSatirlar}</tbody></table></div>${odemeHtml}<label style="display:block;margin-top:12px">Notlar<textarea name="notlar" style="width:100%">${escapeHtml(mevcut?.notlar || (perakende ? "Perakende satış" : ""))}</textarea></label><div id="belgeMesaj"></div><div class="erp-modal-footer"><button type="button" class="erp-small-button secondary" data-kapat>Vazgeç</button><button type="submit" class="erp-primary-button">${perakende ? "Perakende Satışı Tamamla" : mevcut ? "Değişiklikleri Kaydet" : tur === "iade" ? "İadeyi Kaydet" : "Kaydet"}</button></div></form></div>`;
        document.body.appendChild(overlay);
        const kalemlerEl = document.getElementById("belgeKalemler");
        const belgeKalemleriHesapla = () => [...kalemlerEl.querySelectorAll(".belge-kalem")].map(x => { const miktar = Number(x.querySelector("[name=miktar]").value || 0), fiyat = Number(x.querySelector("[name=birimFiyat]").value || 0), kdv = Number(x.querySelector("[name=kdv]").value || 0), iskonto = Number(x.querySelector("[name=iskonto]").value || 0), ara = miktar * fiyat * (1 - iskonto / 100); return { ara, kdvTutari: ara * kdv / 100 }; });
        const belgeToplami = () => belgeKalemleriHesapla().reduce((n, x) => n + x.ara + x.kdvTutari, 0);
        const toplamGuncelle = () => { const el = overlay.querySelector("#salesDocumentTotal"); if (el) el.textContent = para(belgeToplami()); const kalemler = belgeKalemleriHesapla(), araEl = overlay.querySelector("#salesAraToplam"), kdvEl = overlay.querySelector("#salesKdvToplam"); if (araEl) araEl.textContent = para(kalemler.reduce((n, x) => n + x.ara, 0)); if (kdvEl) kdvEl.textContent = para(kalemler.reduce((n, x) => n + x.kdvTutari, 0)); };
        const bagla = root => {
            root.querySelector("select[name=urunId]").addEventListener("change", e => {
                const opt = e.target.selectedOptions[0]; root.querySelector("input[name=birimFiyat]").value = opt?.dataset.fiyat || 0; root.querySelector("input[name=kdv]").value = opt?.dataset.kdv || 20; root.querySelector("input[name=iskonto]").value = opt?.dataset.iskonto || 0; toplamGuncelle();
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
        overlay.querySelector("#hizliSatisUrunEkle")?.addEventListener("click", () => hizliSatisUrunuAc({ depolar, depoId: overlay.querySelector('[name="depoId"]')?.value, onSaved: async sonuc => { const yeniUrun = sonuc.urun; if (!urunler.some(x => String(x._id) === String(yeniUrun._id))) urunler.push(yeniUrun); overlay.querySelector('[name="depoId"]').value = sonuc.depo._id; const bosSatir = [...kalemlerEl.querySelectorAll(".belge-kalem")].find(x => !x.querySelector('[name="urunId"]').value); kalemlerEl.querySelectorAll('[name="urunId"]').forEach(select => { const secili = select.value; select.innerHTML = `<option value="">Ürün seçin</option>${urunler.map(x => urunSecenegi(x, secili)).join("")}`; select.value = secili; }); const hedef = bosSatir || (() => { kalemlerEl.insertAdjacentHTML("beforeend", satirHtml({ urunId: yeniUrun._id })); bagla(kalemlerEl.lastElementChild); return kalemlerEl.lastElementChild; })(); hedef.querySelector('[name="urunId"]').value = yeniUrun._id; hedef.querySelector('[name="urunId"]').dispatchEvent(new Event("change")); hedef.querySelector('[name="miktar"]').value = "1"; toplamGuncelle(); } }).catch(error => alert(error.message)));
        overlay.querySelectorAll(".erp-modal-close,[data-kapat]").forEach(x => x.addEventListener("click", musteriModalKapat));
        if (tur === "satis" && !mevcut) {
            const form = overlay.querySelector("form"), tip = form.elements.odemeTipi, account = overlay.querySelector("[data-sales-account]");
            const odemeGuncelle = () => { const hesapGerekli = ["NAKIT", "KART", "BANKA"].includes(tip.value); account.hidden = !hesapGerekli; form.elements.hesap.required = hesapGerekli; if (!hesapGerekli) form.elements.hesap.value = ""; [...form.elements.hesap.options].forEach(o => { if (!o.value) return; o.hidden = tip.value === "NAKIT" ? o.dataset.hesapTipi !== "KASA" : o.dataset.hesapTipi !== "BANKA"; }); };
            tip.onchange = odemeGuncelle; if (perakende) tip.value = "NAKIT"; odemeGuncelle(); if (perakende && !form.elements.hesap.value) { const varsayilan = [...form.elements.hesap.options].find(x => x.value && !x.hidden); if (varsayilan) form.elements.hesap.value = varsayilan.value; } toplamGuncelle();
            overlay.querySelector("#hedefUygula")?.addEventListener("click", () => {
                const hedef = Number(overlay.querySelector("#hedefGenelToplam")?.value || 0), mevcutGenel = belgeToplami();
                if (!(hedef > 0)) return alert("Geçerli bir hedef tutar girin.");
                if (!(mevcutGenel > 0)) return alert("Önce kalem tutarlarını girin.");
                if (hedef > mevcutGenel) return alert("Hedef tutar mevcut toplamdan büyük olamaz.");
                const oran = hedef / mevcutGenel;
                kalemlerEl.querySelectorAll(".belge-kalem").forEach(row => {
                    const iskontoInput = row.querySelector("[name=iskonto]"), eskiIskonto = Number(iskontoInput.value || 0);
                    iskontoInput.value = Math.min(100, Math.max(0, (1 - oran * (1 - eskiIskonto / 100)) * 100)).toFixed(2);
                });
                toplamGuncelle();
            });
        }
        overlay.querySelector("form").addEventListener("submit", async event => {
            event.preventDefault(); const fd = new FormData(event.currentTarget); const mesaj = document.getElementById("belgeMesaj");
            const kalemler = [...kalemlerEl.querySelectorAll(".belge-kalem")].map(x => ({ urunId: x.querySelector("[name=urunId]").value, miktar: Number(x.querySelector("[name=miktar]").value), birimFiyat: Number(x.querySelector("[name=birimFiyat]").value), kdv: Number(x.querySelector("[name=kdv]").value), iskonto: Number(x.querySelector("[name=iskonto]").value) }));
            const body = { musteriId: perakende ? undefined : musteri._id, perakende, satisKanali: perakende ? "PERAKENDE" : sahaBaglami ? "SAHA" : "NORMAL", sahaGun: sahaBaglami ? secenekler.sahaGun : undefined, orijinalSatisId: secenekler.orijinalSatisId || undefined, tarih: fd.get("tarih"), depoId: fd.get("depoId") || undefined, gecerlilikTarihi: fd.get("gecerlilikTarihi") || undefined, teslimTarihi: fd.get("teslimTarihi") || undefined, paraBirimi: fd.get("paraBirimi") || undefined, teslimSuresiGun: Number(fd.get("teslimSuresiGun") || 0), odemeKosullari: fd.get("odemeKosullari") || "", teslimatKosullari: fd.get("teslimatKosullari") || "", sevkAdresi: fd.get("sevkAdresi") || "", notlar: fd.get("notlar"), kalemler }; body[ayar.noAlan] = fd.get("no");
            if (tur === "satis" && !mevcut) { const [hesapTipi, hesapId] = String(fd.get("hesap") || "|").split("|"); Object.assign(body, { odemeTipi: fd.get("odemeTipi"), hesapTipi: hesapTipi || null, hesapId: hesapId || null }); }
            try { const endpoint = mevcut ? `${ayar.endpoint}/${encodeURIComponent(mevcut._id)}` : ayar.endpoint; await api(endpoint, { method: mevcut ? "PATCH" : "POST", body: JSON.stringify(body) }); musteriModalKapat(); if (perakende) await satisPaneliYukle(); else await musteriAnaSayfaAc(musteri._id); }
            catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; }
        });
    }

    async function musteriBelgeMerkeziAc(tur, belge, musteri) {
        let belgeTercihi = {};
        try { belgeTercihi = (await api("/api/tenant/ayarlar")).ayarlar?.belgeAyari || {}; } catch (_) { belgeTercihi = {}; }
        const firma = await firmaProfiliGetir();
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
        belgeSayfasi.querySelector(".invoice-brand").textContent = firma.unvan;
        if (["TEKLIF", "SIPARIS", "SATIS"].includes(tur)) {
            const linkDugmesi = document.createElement("button");
            linkDugmesi.id = "belgeLink"; linkDugmesi.type = "button"; linkDugmesi.className = "erp-small-button"; linkDugmesi.textContent = "Güvenli Link";
            overlay.querySelector("#belgeEposta").before(linkDugmesi);
        }
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
        const musteriAdi = musteri.unvan || musteri.adSoyad || musteri.kod;
        const metin = profesyonelPaylasimMesaji({ firmaAdi: firma.unvan, musteriAdi, belgeAdi: baslik, belgeNo: no, ek: true });
        document.getElementById("belgePdf").addEventListener("click", () => {
            const pencere = window.open("", "_blank"); if (!pencere) return alert("Yazdırma penceresi açılamadı.");
            pencere.document.write(`<!doctype html><html><head><title>${escapeHtml(no)}</title><link rel="stylesheet" href="/erp/erp.css"></head><body>${document.getElementById("musteriBelgeSayfa").outerHTML}</body></html>`); pencere.document.close(); pencere.onload = () => { pencere.focus(); pencere.print(); };
        });
        document.getElementById("belgeExcel").addEventListener("click", () => {
            if (!window.XLSX) return alert("Excel kitaplığı yüklenemedi.");
            const ws = XLSX.utils.json_to_sheet(satirlar.map(x => ({ "Belge Türü": baslik, "Belge No": no, Tarih: tarihText, "Müşteri Kodu": musteri.kod, Müşteri: musteri.unvan || musteri.adSoyad, "Ürün Kodu": x.kod, "Ürün/Açıklama": x.urun, Miktar: x.miktar, Birim: x.birim, "Birim Fiyat": x.fiyat, "KDV %": x.kdv, "İskonto %": x.iskonto, Toplam: x.toplam })));
            ws["!cols"] = [{ wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 16 }, { wch: 28 }, { wch: 16 }, { wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 14 }]; const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Belge"); XLSX.writeFile(wb, `${baslik.replaceAll(" ", "-")}-${no}.xlsx`);
        });
        document.getElementById("belgeLink")?.addEventListener("click", async () => {
            try {
                const sonuc = await api("/api/tenant/paylasim", { method: "POST", body: JSON.stringify({ tur, belgeId: belge._id, gecerlilikGun: 30 }) });
                const link = `${location.origin}/erp/paylasim.html?token=${encodeURIComponent(sonuc.paylasim.token)}`;
                await navigator.clipboard.writeText(link);
                alert(`30 gün geçerli güvenli bağlantı kopyalandı.\n\n${profesyonelPaylasimMesaji({ firmaAdi: firma.unvan, musteriAdi, belgeAdi: baslik, belgeNo: no, link })}`);
            } catch (error) { alert(error.message); }
        });
        document.getElementById("belgeEposta").addEventListener("click", () => {
            if (!musteri.email) return alert("Müşterinin e-posta adresi yok.");
            window.location.href = `mailto:${encodeURIComponent(musteri.email)}?subject=${encodeURIComponent(`${baslik} - ${no}`)}&body=${encodeURIComponent(`${metin}\n\nPDF veya Excel dosyasını bu e-postaya ekleyebilirsiniz.`)}`;
        });
        document.getElementById("belgeWhatsapp").addEventListener("click", async () => {
            let tel = String(musteri.whatsapp || musteri.telefon || "").replace(/\D/g, ""); if (!tel) return alert("Müşterinin WhatsApp numarası yok."); if (tel.startsWith("0")) tel = `90${tel.slice(1)}`;
            try { let mesaj = `${metin}\n\nPDF veya Excel belgesi ayrıca eklenebilir.`; if (["SATIS", "TEKLIF", "SIPARIS"].includes(tur)) { const sonuc = await api("/api/tenant/paylasim", { method: "POST", body: JSON.stringify({ tur, belgeId: belge._id, gecerlilikGun: 30 }) }); const link = `${location.origin}/erp/paylasim.html?token=${encodeURIComponent(sonuc.paylasim.token)}`; mesaj = profesyonelPaylasimMesaji({ firmaAdi: firma.unvan, musteriAdi, belgeAdi: baslik, belgeNo: no, link }); } window.open(`https://wa.me/${tel}?text=${encodeURIComponent(mesaj)}`, "_blank", "noopener"); } catch (error) { alert(error.message); }
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
            const sonIslemler = [
                ...satislar.map(x => ({ tur: "SATIS", kayit: x, tarih: x.tarih || x.createdAt, tutar: satisTutari(x) })),
                ...hareketler.filter(x => x.tip === "TAHSILAT").map(x => ({ tur: "TAHSILAT", kayit: x, tarih: x.tarih || x.createdAt, tutar: Number(x.tutar || 0) }))
            ].sort((a, b) => new Date(b.tarih || 0) - new Date(a.tarih || 0)).slice(0, 12);

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
                    <div class="dashboard-panel" style="margin-top:16px">
                        <div class="panel-heading"><div><h2>Son İşlemler</h2><p>Satış ve tahsilat kayıtlarını buradan yönetin.</p></div></div>
                        <div class="table-scroll"><table><thead><tr><th>Tarih</th><th>İşlem</th><th>Belge / Açıklama</th><th>Tutar</th><th>İşlem</th></tr></thead><tbody>
                            ${sonIslemler.length ? sonIslemler.map((x, index) => `<tr><td>${tarih(x.kayit)}</td><td><strong>${x.tur === "SATIS" ? "Satış" : "Tahsilat"}</strong></td><td>${escapeHtml(x.tur === "SATIS" ? (x.kayit.belgeNo || "-") : (x.kayit.aciklama || x.kayit.belgeNo || "Tahsilat"))}</td><td><strong>${para(x.tutar)}</strong></td><td><button class="erp-small-button" data-son-goruntule="${index}">Detay Gör</button> ${x.tur === "SATIS" && Number(x.kayit.odenenTutar || 0) === 0 ? `<button class="erp-small-button" data-son-duzenle="${index}">Düzenle</button> <button class="erp-small-button danger-button" data-son-sil="${index}">İptal Et</button>` : x.tur === "SATIS" ? `<button class="erp-small-button" data-son-iade="${index}">İade</button>` : `<button class="erp-small-button danger-button" data-son-sil="${index}">İptal Et</button>`}</td></tr>`).join("") : `<tr><td colspan="5">Henüz satış veya tahsilat işlemi yok.</td></tr>`}
                        </tbody></table></div>
                    </div>
                `;
                panel.querySelectorAll("[data-son-goruntule]").forEach(btn => btn.addEventListener("click", () => { const x = sonIslemler[Number(btn.dataset.sonGoruntule)]; musteriBelgeMerkeziAc(x.tur, x.kayit, m); }));
                panel.querySelectorAll("[data-son-duzenle]").forEach(btn => btn.addEventListener("click", () => { const x = sonIslemler[Number(btn.dataset.sonDuzenle)]; musteriBelgeFormu("satis", m, x.kayit).catch(error => alert(error.message)); }));
                panel.querySelectorAll("[data-son-iade]").forEach(btn => btn.addEventListener("click", () => { const x = sonIslemler[Number(btn.dataset.sonIade)]; musteriBelgeFormu("iade", m, null, x.kayit.kalemler || []).catch(error => alert(error.message)); }));
                panel.querySelectorAll("[data-son-sil]").forEach(btn => btn.addEventListener("click", async () => {
                    const x = sonIslemler[Number(btn.dataset.sonSil)];
                    const ad = x.tur === "SATIS" ? `Satış ${x.kayit.belgeNo || ""}` : "Bu tahsilat";
                    if (!confirm(`${ad} silinsin mi? İlgili bakiyeler otomatik geri alınacak.`)) return;
                    try {
                        const url = x.tur === "SATIS" ? `/api/tenant/satis/${encodeURIComponent(x.kayit._id)}` : `/api/tenant/cari/musteri/tahsilat/${encodeURIComponent(x.kayit._id)}`;
                        const sonuc = await api(url, { method: "DELETE" });
                        alert(sonuc.mesaj || "İşlem silindi.");
                        await musteriAnaSayfaAc(id);
                    } catch (error) { alert(error.message); }
                }));
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
                                        <th>İşlem</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    ${satislar.length
                        ? satislar.map(x => `
                                                <tr>
                                                    <td>${tarih(x)}</td>
                                                    <td>${escapeHtml(x.belgeNo || x.faturaNo || "-")}</td>
                                                    <td><strong>${para(Number(x.genelToplam || x.toplam || x.tutar || 0))}</strong></td>
                                                    <td><button class="erp-small-button" data-musteri-satis-gor="${x._id}">Detay Gör</button> ${Number(x.odenenTutar || 0) === 0 ? `<button class="erp-small-button" data-musteri-satis-duzenle="${x._id}">Düzenle</button> <button class="erp-small-button danger-button" data-musteri-satis-sil="${x._id}">İptal Et</button>` : ""}</td>
                                                </tr>
                                            `).join("")
                        : `<tr><td colspan="4">Satış kaydı yok.</td></tr>`
                    }
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;

                document
                    .getElementById("yeniSatisMusteri")
                    ?.addEventListener("click", () => musteriBelgeFormu("satis", m).catch(error => alert(error.message)));
                panel.querySelectorAll("[data-musteri-satis-gor]").forEach(btn => btn.addEventListener("click", () => { const x = satislar.find(s => String(s._id) === btn.dataset.musteriSatisGor); musteriBelgeMerkeziAc("SATIS", x, m); }));
                panel.querySelectorAll("[data-musteri-satis-duzenle]").forEach(btn => btn.addEventListener("click", () => { const x = satislar.find(s => String(s._id) === btn.dataset.musteriSatisDuzenle); musteriBelgeFormu("satis", m, x).catch(error => alert(error.message)); }));
                panel.querySelectorAll("[data-musteri-satis-sil]").forEach(btn => btn.addEventListener("click", async () => { const x = satislar.find(s => String(s._id) === btn.dataset.musteriSatisSil); if (!confirm(`${x.belgeNo} numaralı satış ters kayıtla iptal edilsin mi?`)) return; try { const sonuc = await api(`/api/tenant/satis/${encodeURIComponent(x._id)}`, { method: "DELETE" }); alert(sonuc.mesaj); await musteriAnaSayfaAc(id); } catch (error) { alert(error.message); } }));
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
                const tahsilatlar = hareketler.filter(x => x.tip === "TAHSILAT" && x.kaynak === "TAHSILAT");
                panel.innerHTML = `
                    <div class="dashboard-panel">
                        <div class="panel-heading"><div><h2>Tahsilatlar</h2><p>Güncel müşteri bakiyesi: <strong>${para(bakiye)}</strong></p></div><button id="tahsilatBaslat" class="erp-primary-button">+ Tahsilat Yap</button></div>
                        <div class="table-scroll"><table><thead><tr><th>Tarih</th><th>Açıklama</th><th>Yöntem</th><th>Tutar</th><th>İşlem</th></tr></thead><tbody>
                            ${tahsilatlar.length ? tahsilatlar.map(x => `<tr data-tahsilat-duzenle="${x._id}" style="cursor:pointer"><td>${tarih(x)}</td><td>${escapeHtml(x.aciklama || "Müşteri tahsilatı")}</td><td>${escapeHtml(x.odemeYontemi || "-")}</td><td><strong>${para(x.tutar)}</strong></td><td><button type="button" class="erp-small-button" data-tahsilat-btn="${x._id}">Tutarı Değiştir</button></td></tr>`).join("") : `<tr><td colspan="5">Henüz tahsilat kaydı yok.</td></tr>`}
                        </tbody></table></div>
                    </div>
                `;

                document
                    .getElementById("tahsilatBaslat")
                    ?.addEventListener("click", async () => {

                        await musteriTahsilatFormu(m);
                    });
                panel.querySelectorAll("[data-tahsilat-duzenle]").forEach(row => row.addEventListener("click", event => {
                    if (event.target.closest("button")) return;
                    const kayit = tahsilatlar.find(x => String(x._id) === row.dataset.tahsilatDuzenle);
                    musteriTahsilatDuzenleFormu(m, kayit);
                }));
                panel.querySelectorAll("[data-tahsilat-btn]").forEach(btn => btn.addEventListener("click", () => {
                    const kayit = tahsilatlar.find(x => String(x._id) === btn.dataset.tahsilatBtn);
                    musteriTahsilatDuzenleFormu(m, kayit);
                }));
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

                        try {
                            await api(`/api/tenant/musteriler/${encodeURIComponent(id)}`, {
                                method: "PATCH",
                                body: JSON.stringify(body)
                            });
                            alert("Müşteri kaydedildi.");
                            await musteriAnaSayfaAc(id);
                        } catch (error) {
                            alert(error.message || "Müşteri güncellenemedi.");
                        }
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
                panel.innerHTML = `<div class="dashboard-panel"><div class="panel-heading"><div><h2>Belgeler ve Dökümler</h2><p>Satıra tıklayarak içeriği görüntüleyin; uygun belgeleri düzenleyin.</p></div></div><div class="table-scroll"><table><thead><tr><th>Tarih</th><th>Belge Türü</th><th>Belge No</th><th>Tutar</th><th>İşlem</th></tr></thead><tbody>${belgeler.length ? belgeler.map((x, i) => `<tr data-belge-row="${i}" style="cursor:pointer"><td>${tarih(x.belge)}</td><td>${escapeHtml(x.etiket)}</td><td><strong>${escapeHtml(x.no || "-")}</strong></td><td>${para(x.belge.genelToplam || x.belge.tutar)}</td><td><button class="erp-small-button" data-belge-index="${i}">Detay Gör</button>${["SATIS", "SIPARIS", "TEKLIF"].includes(x.tur) ? ` <button class="erp-primary-button" data-belge-duzenle="${i}">Düzenle / Kalem Ekle</button>` : ""}${x.tur === "IADE" && x.belge.durum !== "IPTAL" ? ` <button class="erp-small-button danger-button" data-belge-iade-iptal="${i}">İptal Et</button>` : ""}</td></tr>`).join("") : `<tr><td colspan="5">Henüz belge bulunmuyor.</td></tr>`}</tbody></table></div><div class="dashboard-panel" style="margin-top:12px"><small>Ödemesi alınmış satışlar doğrudan değiştirilemez; iade/düzeltme belgesi kullanılır.</small></div></div>`;
                panel.querySelectorAll("[data-belge-index]").forEach(btn => btn.addEventListener("click", () => { const x = belgeler[Number(btn.dataset.belgeIndex)]; musteriBelgeMerkeziAc(x.tur, x.belge, m); }));
                panel.querySelectorAll("[data-belge-row]").forEach(row => row.addEventListener("click", event => { if (event.target.closest("button")) return; const x = belgeler[Number(row.dataset.belgeRow)]; musteriBelgeMerkeziAc(x.tur, x.belge, m); }));
                panel.querySelectorAll("[data-belge-duzenle]").forEach(btn => btn.addEventListener("click", event => { event.stopPropagation(); const x = belgeler[Number(btn.dataset.belgeDuzenle)]; const tur = x.tur === "SATIS" ? "satis" : x.tur === "SIPARIS" ? "siparis" : "teklif"; musteriBelgeFormu(tur, m, x.belge).catch(error => alert(error.message)); }));
                panel.querySelectorAll("[data-belge-iade-iptal]").forEach(btn => btn.addEventListener("click", async event => { event.stopPropagation(); const x = belgeler[Number(btn.dataset.belgeIadeIptal)], neden = prompt("Satış iadesi iptal nedenini yazın:"); if (neden === null) return; if (!neden.trim()) return alert("İptal nedeni zorunludur."); try { await api(`/api/tenant/satis/iade/${encodeURIComponent(x.belge._id)}/iptal`, { method: "POST", body: JSON.stringify({ neden: neden.trim() }) }); await musteriAnaSayfaAc(id); } catch (error) { alert(error.message); } }));
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
        setTitle("Cari Kontrol");
        loading();

        try {
            const musteriErisimi = oturumYetkisiVar("customer.read");
            const tedarikciErisimi = oturumYetkisiVar("supplier.read");
            const [ozetData, musteriData, tedarikciData] =
                await Promise.all([
                    api("/api/tenant/cari/ozet"),
                    musteriErisimi ? api("/api/tenant/musteriler") : Promise.resolve({ musteriler: [] }),
                    tedarikciErisimi ? api("/api/tenant/tedarikciler") : Promise.resolve({ tedarikciler: [] })
                ]);

            const musteriler = musteriData.musteriler || [];
            const tedarikciler = tedarikciData.tedarikciler || [];

            content.innerHTML = `
                <div class="dashboard-panel">
                    <div class="dashboard-grid">
                        ${musteriErisimi ? `<div class="dashboard-card">
                            <div class="dashboard-card-title">Müşteri Alacağı</div>
                            <div id="cariMusteriAlacak" class="dashboard-card-value">
                                ${para(ozetData.musteriAlacak)}
                            </div>
                            <div class="dashboard-card-info">Tahsil edilmemiş</div>
                        </div>` : ""}

                        ${tedarikciErisimi ? `<div class="dashboard-card">
                            <div class="dashboard-card-title">Tedarikçi Borcu</div>
                            <div id="cariTedarikciBorc" class="dashboard-card-value">
                                ${para(ozetData.tedarikciBorc)}
                            </div>
                            <div class="dashboard-card-info">Ödenmemiş</div>
                        </div>` : ""}

                        ${musteriErisimi && tedarikciErisimi ? `<div class="dashboard-card positive">
                            <div class="dashboard-card-title">Net Cari</div>
                            <div id="cariNet" class="dashboard-card-value">
                                ${para(ozetData.netCari)}
                            </div>
                            <div class="dashboard-card-info">
                                Müşteri alacağı - tedarikçi borcu
                            </div>
                        </div>` : ""}
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
                        ${musteriErisimi ? `<button type="button" class="erp-small-button cari-tab active" data-cari-tab="musteri">
                            Müşteriler
                        </button>` : ""}
                        ${tedarikciErisimi ? `<button type="button" class="erp-small-button cari-tab ${musteriErisimi ? "" : "active"}" data-cari-tab="tedarikci">
                            Tedarikçiler
                        </button>` : ""}
                        </div>

                        <span class="dashboard-card-info">Toplu bakiye ve ekstre kontrolü · işlemler ilgili müşteri/tedarikçi kartındadır.</span>
                    </div>

                    <input id="cariArama"
                           class="erp-input"
                           placeholder="Kod veya ünvan ara...">

                    <div id="cariListe" style="margin-top:15px;"></div>
                </div>
            `;

            let aktif = musteriErisimi ? "musteri" : "tedarikci";
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
                                                <small>Kartı açmak için satıra tıklayın</small>
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
                    <label>Tutar<input name="tutar" type="number" min="0.01" step="0.01" ${tahsilat && Number(musteri.bakiye) > 0 ? `max="${Number(musteri.bakiye)}"` : ""} required>${!musteriMi && !tahsilat ? "<small>Mevcut borcu aşan ödeme tedarikçi avansı/alacağı olarak negatif bakiyede izlenir.</small>" : ""}</label>
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
                        const firma = await firmaProfiliGetir();
                        const mesaj = profesyonelPaylasimMesaji({ firmaAdi: firma.unvan, musteriAdi: taraf?.unvan || taraf?.adSoyad, belgeAdi: "Cari Hesap Ekstresi", link: result.link });
                        if (navigator.share) await navigator.share({ title: `${firma.unvan} · Cari Hesap Ekstresi`, text: mesaj, url: result.link });
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

    function raporDonemTarihleri(kod = "BU_AY", ozelBaslangic = "", ozelBitis = "") {
        const iso = tarih => `${tarih.getFullYear()}-${String(tarih.getMonth() + 1).padStart(2, "0")}-${String(tarih.getDate()).padStart(2, "0")}`;
        const bugun = new Date(), baslangic = new Date(bugun), bitis = new Date(bugun);
        if (kod === "OZEL") return { baslangic: ozelBaslangic, bitis: ozelBitis };
        if (kod === "BU_HAFTA") baslangic.setDate(bugun.getDate() - ((bugun.getDay() + 6) % 7));
        else if (kod === "BU_AY") baslangic.setDate(1);
        else if (kod === "BU_YIL") { baslangic.setMonth(0); baslangic.setDate(1); }
        return { baslangic: iso(baslangic), bitis: iso(bitis) };
    }

    const raporDonemSecenekleri = secili => [["BUGUN", "Günlük"], ["BU_HAFTA", "Haftalık"], ["BU_AY", "Aylık"], ["BU_YIL", "Yıllık"], ["OZEL", "Özel tarih aralığı"]].map(([kod, ad]) => `<option value="${kod}" ${kod === secili ? "selected" : ""}>${ad}</option>`).join("");

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

    function tedarikciKalemSatiri(urunler, kalem = {}) {
        const seciliId = String(kalem.urunId?._id || kalem.urunId || "");
        const secenekler = urunler.map(u => `<option value="${u._id}" data-kod="${escapeHtml(u.kod)}" data-barkod="${escapeHtml(u.barkod || "")}" data-fiyat="${Number(u.alisFiyati || 0)}" data-kdv="${Number(u.kdv ?? 20)}" data-iskonto="${Number(u.iskonto || 0)}" ${seciliId === String(u._id) ? "selected" : ""}>${escapeHtml(u.kod)} · ${escapeHtml(u.ad)}</option>`).join("");
        return `<tr class="tedarikci-kalem"><td><select name="urunId" required><option value="">Ürün seçin</option>${secenekler}</select></td><td><input name="miktar" type="number" min="0.0001" step="0.0001" value="${kalem.miktar || 1}" required></td><td><input name="birimFiyat" type="number" min="0" step="0.01" value="${kalem.birimFiyat ?? ""}" required></td><td><input name="kdv" type="number" min="0" max="100" step="0.01" value="${kalem.kdv ?? 20}"></td><td><input name="iskonto" type="number" min="0" max="100" step="0.01" value="${kalem.iskonto ?? 0}"></td><td><button type="button" class="erp-small-button" data-sil>Sil</button></td></tr>`;
    }

    function tedarikciAlisSablonuIndir() {
        if (!window.XLSX) throw new Error("Excel kitaplığı yüklenemedi.");
        const basliklar = ["Ürün Kodu", "Barkod", "Ürün Adı", "Miktar", "Birim Fiyat", "KDV %", "İskonto %"];
        const ornek = ["URN-001", "869000000001", "Örnek Ürün", 10, 100, 20, 0];
        const ws = XLSX.utils.aoa_to_sheet([basliklar, ornek]);
        ws["!cols"] = [{ wch: 18 }, { wch: 20 }, { wch: 36 }, { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 12 }];
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Alış Kalemleri");
        XLSX.writeFile(wb, "benimmuhasebe-toplu-alis-sablonu.xlsx", { compression: true });
    }

    async function tedarikciAlisExcelOku(file, urunler) {
        if (!window.XLSX) throw new Error("Excel kitaplığı yüklenemedi.");
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        if (!sheet) throw new Error("Dosyada okunabilir çalışma sayfası yok.");
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false, blankrows: false });
        if (!rows.length) throw new Error("Dosyada alış kalemi bulunamadı.");
        const norm = value => String(value || "").toLocaleLowerCase("tr-TR").replaceAll("ı", "i").replaceAll("ş", "s").replaceAll("ğ", "g").replaceAll("ü", "u").replaceAll("ö", "o").replaceAll("ç", "c").replace(/[^a-z0-9]+/g, " ").trim();
        const aliaslar = {
            kod: ["urun kodu", "stok kodu", "sku", "merchant sku", "stock code"], barkod: ["barkod", "barcode", "ean", "gtin"],
            ad: ["urun adi", "product name", "title"], miktar: ["miktar", "adet", "quantity", "stok miktari", "stok adedi"],
            birimFiyat: ["birim fiyat", "alis fiyati", "maliyet", "purchase price", "cost price"], kdv: ["kdv", "kdv yuzdesi", "kdv orani", "vat"],
            iskonto: ["iskonto", "iskonto yuzdesi", "indirim orani", "discount"]
        };
        const alanBul = baslik => Object.keys(aliaslar).find(alan => aliaslar[alan].some(alias => norm(alias) === norm(baslik)));
        const eslesmeler = Object.fromEntries(Object.keys(rows[0]).map(b => [b, alanBul(b)]).filter(([, a]) => a));
        if (!Object.values(eslesmeler).includes("miktar")) throw new Error("Miktar kolonu tanınamadı.");
        const kodMap = new Map(urunler.map(x => [String(x.kod || "").trim().toUpperCase(), x]));
        const barkodMap = new Map(urunler.filter(x => x.barkod).map(x => [String(x.barkod).trim(), x]));
        const hatalar = [], kalemler = [];
        rows.forEach((row, index) => {
            const veri = {}; for (const [baslik, alan] of Object.entries(eslesmeler)) veri[alan] = row[baslik];
            const kod = String(veri.kod || "").trim().toUpperCase(), barkod = String(veri.barkod || "").trim();
            const urun = kodMap.get(kod) || barkodMap.get(barkod);
            if (!urun) { hatalar.push(`${index + 2}. satır: ürün kodu veya barkod bulunamadı (${kod || barkod || "boş"})`); return; }
            const miktar = urunExcelSayi(veri.miktar), birimFiyat = veri.birimFiyat === "" ? Number(urun.alisFiyati || 0) : urunExcelSayi(veri.birimFiyat);
            const kdv = veri.kdv === "" ? Number(urun.kdv ?? 20) : urunExcelSayi(veri.kdv), iskonto = veri.iskonto === "" ? Number(urun.iskonto || 0) : urunExcelSayi(veri.iskonto);
            if (!(miktar > 0)) { hatalar.push(`${index + 2}. satır: miktar sıfırdan büyük olmalıdır`); return; }
            if (birimFiyat < 0 || kdv < 0 || kdv > 100 || iskonto < 0 || iskonto > 100) { hatalar.push(`${index + 2}. satır: fiyat, KDV veya iskonto geçersiz`); return; }
            kalemler.push({ urunId: urun._id, miktar, birimFiyat, kdv, iskonto });
        });
        if (hatalar.length) throw new Error(hatalar.slice(0, 20).join("\n"));
        if (!kalemler.length) throw new Error("Aktarılabilir alış kalemi bulunamadı.");
        return kalemler;
    }

    async function tedarikciBelgeFormu(tur, tedarikci, donus = "tedarikci", mevcut = null) {
        const [uData, dData, fData] = await Promise.all([api("/api/tenant/urunler"), api("/api/tenant/stok/depolar"), api("/api/tenant/finans/ozet")]); const urunler = uData.urunler || [], depolar = dData.depolar || [];
        const cfg = { alis: { baslik: mevcut ? "Alışı Düzenle" : "Alış Yap", no: "Belge No", endpoint: mevcut ? `/api/tenant/alis/${mevcut._id}` : "/api/tenant/alis", prefix: "AL" }, iade: { baslik: "Alış İade", no: "İade Belge No", endpoint: "/api/tenant/alis/iade", prefix: "AI" }, siparis: { baslik: "Satın Alma Siparişi", no: "Sipariş No", endpoint: "/api/tenant/alis/siparis", prefix: "SAS" } }[tur];
        const overlay = document.createElement("div"); overlay.id = "tedarikciV2Modal"; overlay.className = "erp-modal-overlay"; const no = mevcut?.belgeNo || `${cfg.prefix}-${Date.now()}`;
        const mevcutHesap = mevcut?.hesapTipi && mevcut?.hesapId ? `${mevcut.hesapTipi}:${mevcut.hesapId?._id || mevcut.hesapId}` : "";
        overlay.innerHTML = `<div class="erp-modal"><div class="erp-modal-header"><div><h2>${cfg.baslik}</h2><p>${escapeHtml(tedarikci.kod)} · ${escapeHtml(tedarikciAdi(tedarikci))}</p></div><button class="erp-modal-close">×</button></div><form><div class="erp-form-grid"><label>${cfg.no}<input name="belgeNo" value="${escapeHtml(no)}" required></label><label>Tarih<input name="tarih" type="date" value="${String(mevcut?.tarih || new Date().toISOString()).slice(0, 10)}" required></label>${tur !== "siparis" ? `<label>Depo<select name="depoId" required><option value="">Depo seçin</option>${depolar.map(d => `<option value="${d._id}" ${String(mevcut?.depoId?._id || mevcut?.depoId || "") === String(d._id) ? "selected" : ""}>${escapeHtml(d.kod)} · ${escapeHtml(d.ad)}</option>`).join("")}</select></label>` : ""}${tur === "alis" ? `<label>Ödeme Durumu<select name="odemeDurumu"><option value="ACIK" ${mevcut?.odemeDurumu === "ACIK" ? "selected" : ""}>Açık Hesap</option><option value="KISMI" ${mevcut?.odemeDurumu === "KISMI" ? "selected" : ""}>Kısmi</option><option value="ODENDI" ${mevcut?.odemeDurumu === "ODENDI" ? "selected" : ""}>Ödendi</option></select></label><label>Ödenen Tutar<input name="odenenTutar" type="number" min="0" step="0.01" value="${Number(mevcut?.odenenTutar || 0)}"></label><label>Ödeme Hesabı<select name="hesap"><option value="">Hesap seçin</option>${(fData.kasalar || []).map(x => `<option value="KASA:${x._id}" ${mevcutHesap === `KASA:${x._id}` ? "selected" : ""}>Kasa · ${escapeHtml(x.ad)}</option>`).join("")}${(fData.bankalar || []).map(x => `<option value="BANKA:${x._id}" ${mevcutHesap === `BANKA:${x._id}` ? "selected" : ""}>Banka · ${escapeHtml(x.bankaAdi)}</option>`).join("")}</select></label>` : ""}<label class="full">Not<textarea name="notlar">${escapeHtml(mevcut?.notlar || "")}</textarea></label></div><div class="dashboard-panel"><div class="panel-heading"><div><h3>Belge Kalemleri</h3><p>Düzeltme kaydedildiğinde stok, cari ve ödeme farkları birlikte işlenir.</p></div><div><button type="button" class="erp-small-button" id="tedYeniUrun">+ Yeni Ürün Kartı</button> <button type="button" class="erp-primary-button" id="tedKalemEkle">+ Kalem Ekle</button></div></div><div class="table-scroll"><table><thead><tr><th>Ürün</th><th>Miktar</th><th>Fiyat</th><th>KDV %</th><th>İskonto %</th><th></th></tr></thead><tbody id="tedKalemler">${mevcut?.kalemler?.length ? mevcut.kalemler.map(x => tedarikciKalemSatiri(urunler, { ...x, urunId: x.urunId?._id || x.urunId })).join("") : tedarikciKalemSatiri(urunler)}</tbody></table></div></div><div id="tedBelgeMesaj"></div><div class="erp-modal-footer"><button type="button" class="erp-small-button" data-kapat>Vazgeç</button><button class="erp-primary-button" type="submit">${mevcut ? "Düzeltmeyi Kaydet" : "Kaydet"}</button></div></form></div>`;
        document.body.appendChild(overlay);
        if (mevcut && tur === "alis") { const belgeOdemesi = Number(mevcut.belgeOdemeTutari || 0), toplam = Number(mevcut.genelToplam || 0); overlay.querySelector('[name="odenenTutar"]').value = belgeOdemesi; overlay.querySelector('[name="odemeDurumu"]').value = belgeOdemesi <= 0 ? "ACIK" : belgeOdemesi >= toplam ? "ODENDI" : "KISMI"; }
        const kapat = () => overlay.remove(); overlay.querySelector(".erp-modal-close").onclick = kapat; overlay.querySelector("[data-kapat]").onclick = kapat;
        const tbody = overlay.querySelector("#tedKalemler");
        const toplamHesaplaGecikmeli = () => setTimeout(() => typeof toplamHesapla === "function" && toplamHesapla());
        const bagla = (kok = tbody) => kok.querySelectorAll(".tedarikci-kalem").forEach(row => {
            if (row.dataset.bagli === "1") return; row.dataset.bagli = "1";
            row.querySelector("[data-sil]").onclick = () => { if (tbody.rows.length > 1) row.remove(); toplamHesaplaGecikmeli(); };
            row.querySelector('[name="urunId"]').onchange = event => {
                const secenek = event.target.selectedOptions[0]; if (!secenek?.value) return;
                row.querySelector('[name="birimFiyat"]').value = secenek.dataset.fiyat || 0;
                row.querySelector('[name="kdv"]').value = secenek.dataset.kdv || 20;
                row.querySelector('[name="iskonto"]').value = secenek.dataset.iskonto || 0;
                toplamHesaplaGecikmeli();
            };
        });
        bagla();
        overlay.querySelector("#tedKalemEkle").onclick = event => {
            event.preventDefault();
            tbody.insertAdjacentHTML("beforeend", tedarikciKalemSatiri(urunler));
            const yeniSatir = tbody.lastElementChild; bagla();
            const kaydirmaAlani = tbody.closest(".table-scroll"); if (kaydirmaAlani) kaydirmaAlani.scrollTop = kaydirmaAlani.scrollHeight;
            yeniSatir.scrollIntoView({ block: "nearest", behavior: "smooth" });
            yeniSatir.querySelector("select")?.focus();
        };
        if (tur === "alis") {
            const aksiyonlar = overlay.querySelector(".dashboard-panel .panel-heading > div:last-child");
            aksiyonlar.insertAdjacentHTML("afterbegin", '<button type="button" class="erp-small-button" id="tedAlisSablon">Alış Şablonu</button> <label class="erp-small-button" style="cursor:pointer">Excel’den Yükle<input id="tedAlisExcel" type="file" accept=".xlsx,.xls,.csv" hidden></label> ');
            overlay.querySelector("#tedAlisSablon").onclick = () => { try { tedarikciAlisSablonuIndir(); } catch (error) { alert(error.message); } };
            overlay.querySelector("#tedAlisExcel").onchange = async event => {
                const mesaj = overlay.querySelector("#tedBelgeMesaj");
                if (!event.target.files[0]) return;
                try {
                    const kalemler = await tedarikciAlisExcelOku(event.target.files[0], urunler);
                    tbody.innerHTML = kalemler.map(x => tedarikciKalemSatiri(urunler, x)).join(""); bagla();
                    mesaj.innerHTML = `<div class="success">${kalemler.length} alış kalemi Excel’den yüklendi. Kontrol edip kaydedebilirsiniz.</div>`;
                    toplamHesaplaGecikmeli();
                } catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message).replaceAll("\n", "<br>")}</div>`; }
                event.target.value = "";
            };
        }
        overlay.querySelector("#tedYeniUrun").onclick = () => urunFormAc(null, { onSaved: async yeniUrun => { urunler.push(yeniUrun); tbody.querySelectorAll('[name="urunId"]').forEach(select => { const secili = select.value; select.innerHTML = `<option value="">Ürün seçin</option>${urunler.map(u => `<option value="${u._id}">${escapeHtml(u.kod)} · ${escapeHtml(u.ad)}</option>`).join("")}`; select.value = secili; }); const bosSatir = [...tbody.rows].find(row => !row.querySelector('[name="urunId"]').value) || tbody.rows[tbody.rows.length - 1]; bosSatir.querySelector('[name="urunId"]').value = yeniUrun._id; bosSatir.querySelector('[name="birimFiyat"]').value = Number(yeniUrun.alisFiyati || 0); bosSatir.querySelector('[name="kdv"]').value = Number(yeniUrun.kdv ?? 20); toplamHesapla(); } });
        const toplamKutusu = document.createElement("div"); toplamKutusu.className = "supplier-document-total invoice-like"; toplamKutusu.innerHTML = '<div>Ara Toplam (KDV Hariç): <strong id="tedAraToplam">₺0,00</strong></div><div>KDV Tutarı: <strong id="tedKdvToplam">₺0,00</strong></div><div>Genel Toplam (KDV Dahil): <strong id="tedGenelToplam">₺0,00</strong></div>'; tbody.closest(".dashboard-panel").appendChild(toplamKutusu); const toplamHesapla = () => { let araToplam = 0, kdvToplam = 0; [...tbody.rows].forEach(row => { const get = name => Number(row.querySelector(`[name="${name}"]`)?.value || 0), ara = get("miktar") * get("birimFiyat") * (1 - get("iskonto") / 100); araToplam += ara; kdvToplam += ara * get("kdv") / 100; }); toplamKutusu.querySelector("#tedAraToplam").textContent = para(araToplam); toplamKutusu.querySelector("#tedKdvToplam").textContent = para(kdvToplam); toplamKutusu.querySelector("#tedGenelToplam").textContent = para(araToplam + kdvToplam); }; tbody.addEventListener("input", toplamHesapla); tbody.addEventListener("click", () => setTimeout(toplamHesapla)); toplamHesapla();
        overlay.querySelector("form").onsubmit = async event => { event.preventDefault(); const form = event.currentTarget, mesaj = overlay.querySelector("#tedBelgeMesaj"); try { const kalemler = [...tbody.rows].map(row => Object.fromEntries([...row.querySelectorAll("input,select")].map(x => [x.name, x.type === "number" ? Number(x.value) : x.value]))); const body = { tedarikciId: tedarikci._id, belgeNo: form.elements.belgeNo.value, tarih: form.elements.tarih.value, depoId: form.elements.depoId?.value, kalemler, notlar: form.elements.notlar.value, aciklama: form.elements.notlar.value }; if (tur === "siparis") { body.siparisNo = body.belgeNo; delete body.belgeNo; } if (tur === "alis") { body.odemeDurumu = form.elements.odemeDurumu.value; body.odenenTutar = Number(form.elements.odenenTutar.value || 0); const [hesapTipi, hesapId] = String(form.elements.hesap.value || ":").split(":"); body.hesapTipi = hesapTipi; body.hesapId = hesapId; } await api(cfg.endpoint, { method: mevcut ? "PATCH" : "POST", body: JSON.stringify(body) }); kapat(); if (donus === "alis") await alisMerkeziYukle(tur === "iade" ? "iadeler" : "alislar"); else await tedarikciDashboardAc(tedarikci._id, tur === "siparis" ? "siparisler" : tur === "iade" ? "iadeler" : "alislar"); } catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
    }

    async function tedarikciOdemeFormu(tedarikci, mevcut = null) {
        const f = await api("/api/tenant/finans/ozet"), overlay = document.createElement("div"); overlay.id = "tedarikciV2Modal"; overlay.className = "erp-modal-overlay"; overlay.innerHTML = `<div class="erp-modal" style="max-width:650px"><div class="erp-modal-header"><div><h2>${mevcut ? "Ödemeyi Düzenle" : "Ödeme Yap"}</h2><p>${escapeHtml(tedarikciAdi(tedarikci))} · Borç ${para(tedarikci.bakiye)}</p></div><button class="erp-modal-close">×</button></div><form><div class="erp-form-grid"><label>Tutar<input name="tutar" type="number" min="0.01" step="0.01" value="${Number(mevcut?.tutar || 0) || ""}" required><small>Fark; cari, ödeme hesabı ve açık faturalara birlikte uygulanır.</small></label><label>Tarih<input name="tarih" type="date" value="${String(mevcut?.tarih || new Date().toISOString()).slice(0, 10)}"></label><label>Belge No<input name="belgeNo" value="${escapeHtml(mevcut?.belgeNo || `ODM-${Date.now()}`)}" ${mevcut ? "readonly" : ""}></label>${mevcut ? "" : `<label>Hesap<select name="hesap" required><option value="">Seçin</option>${(f.kasalar || []).map(x => `<option value="KASA:${x._id}">Kasa · ${escapeHtml(x.ad)} · ${para(x.bakiye)}</option>`).join("")}${(f.bankalar || []).map(x => `<option value="BANKA:${x._id}">Banka · ${escapeHtml(x.bankaAdi)} · ${para(x.bakiye)}</option>`).join("")}</select></label>`}<label class="full">Açıklama<input name="aciklama" value="${escapeHtml(mevcut?.aciklama || "Tedarikçi ödemesi")}"></label></div><div id="tedOdemeMesaj"></div><div class="erp-modal-footer"><button type="button" class="erp-small-button" data-kapat>Vazgeç</button><button class="erp-primary-button">${mevcut ? "Düzeltmeyi Kaydet" : "Ödemeyi Kaydet"}</button></div></form></div>`; document.body.appendChild(overlay); const kapat = () => overlay.remove(); overlay.querySelector(".erp-modal-close").onclick = kapat; overlay.querySelector("[data-kapat]").onclick = kapat; overlay.querySelector("form").onsubmit = async e => { e.preventDefault(); try { const fd = new FormData(e.currentTarget), [hesapTipi, hesapId] = mevcut ? ["", ""] : fd.get("hesap").split(":"); await api(mevcut ? `/api/tenant/cari/tedarikci/odeme/${mevcut._id}` : "/api/tenant/cari/tedarikci/odeme", { method: mevcut ? "PATCH" : "POST", body: JSON.stringify({ tedarikciId: tedarikci._id, tutar: Number(fd.get("tutar")), tarih: fd.get("tarih"), belgeNo: fd.get("belgeNo"), hesapTipi, hesapId, aciklama: fd.get("aciklama") }) }); kapat(); await tedarikciDashboardAc(tedarikci._id, "odemeler"); } catch (error) { overlay.querySelector("#tedOdemeMesaj").innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
    }

    async function tedarikciDashboardAc(id, aktifSekme = "ozet") {
        loading("Tedarikçi kartı hazırlanıyor...");
        const merkez = await api(`/api/tenant/tedarikciler/${encodeURIComponent(id)}/merkez`);
        const t = merkez.tedarikci;
        const alislar = merkez.alislar || [], hareketler = merkez.cariHareketler || [];
        const iadeler = merkez.iadeler || [], odemeler = merkez.odemeler || [];
        const avanslar = merkez.avanslar || [], vadeler = merkez.vadeler || [];
        const siparisler = merkez.siparisler || [], sonIslemler = merkez.sonIslemler || [];
        const iptalAlisIdSeti = new Set(alislar.filter(x => x.durum === "IPTAL").map(x => String(x._id)));
        tedarikciV2Index = Math.max(0, tedarikciV2Liste.findIndex(x => String(x._id) === String(id)));
        const bakiyeEtiketi = merkez.bakiye?.durum === "AVANS_ALACAK" ? "Tedarikçi Avansı" : merkez.bakiye?.durum === "KAPALI" ? "Kapalı Bakiye" : "Güncel Borç";

        setTitle("Tedarikçi");
        content.innerHTML = `<div class="supplier-hero"><div><span>${escapeHtml(t.kod)}</span><h2>${escapeHtml(tedarikciAdi(t))}</h2><p>${escapeHtml(t.yetkili || "Yetkili belirtilmemiş")} · ${escapeHtml(t.telefon || "Telefon yok")} · Vade ${Number(t.vadeGun || 0)} gün</p></div><div class="supplier-nav"><button id="tedOnceki" ${tedarikciV2Index <= 0 ? "disabled" : ""}>← Önceki</button><button id="tedListe">Tedarikçi Listesi</button><button id="tedSonraki" ${tedarikciV2Index >= tedarikciV2Liste.length - 1 ? "disabled" : ""}>Sonraki →</button></div></div>
        <div class="musteri-toolbar"><button class="dashboard-action dashboard-action-green" id="tedHizliAlis">+ Yeni Alış</button><button class="dashboard-action dashboard-action-blue" id="tedHizliOdeme">Hızlı Ödeme</button><button class="dashboard-action shortcut-orange" id="tedHizliIade">İade</button><button class="dashboard-action dashboard-action-purple" id="tedEkstrePdf">PDF Ekstre</button><button class="dashboard-action dashboard-action-purple" id="tedEkstreExcel">Excel Ekstre</button></div>
        <div class="dashboard-grid">${card(bakiyeEtiketi, para(Math.abs(Number(t.bakiye || 0))), merkez.bakiye?.durum || "Cari bakiye")}${card("Toplam Alış", para(merkez.ozet?.toplamAlis), `${alislar.length} fatura`)}${card("Ödemeler", para(merkez.ozet?.toplamOdeme), `${odemeler.length} hareket`)}${card("Avans", para(Math.abs(Math.min(0, Number(t.bakiye || 0)))), `${avanslar.length} avans hareketi`)}${card("İadeler", para(merkez.ozet?.toplamIade), `${iadeler.length} belge`)}${card("Açık Fatura", para(merkez.ozet?.acikFatura), `${vadeler.length} vade`)}</div>
        <div class="supplier-tabs">${[["ozet", "Son İşlemler"], ["alislar", "Alış Faturaları"], ["odemeler", "Ödemeler"], ["avanslar", "Avanslar"], ["iadeler", "İadeler"], ["cari", "Cari Hareketler / Ekstre"], ["vadeler", "Vade"], ["siparisler", "Siparişler"], ["bilgiler", "Kart Bilgileri"]].map(([k, l]) => `<button data-ted-tab="${k}" class="${aktifSekme === k ? "active" : ""}">${l}</button>`).join("")}</div><div id="tedarikciSekme"></div>`;

        const panel = content.querySelector("#tedarikciSekme");
        const tablo = (baslik, rows, noKey = "belgeNo", tutarKey = "tutar") => `<div class="dashboard-panel"><div class="panel-heading"><div><h2>${baslik}</h2><p>${rows.length} kayıt · tek tedarikçi kartından görüntüleniyor</p></div></div><div class="table-scroll"><table><thead><tr><th>Tarih</th><th>Belge</th><th>Tutar</th><th>Durum / Açıklama</th></tr></thead><tbody>${rows.length ? rows.map(x => `<tr><td>${tarihKisa(x.tarih)}</td><td>${escapeHtml(x[noKey] || x.belgeNo || "-")}</td><td>${para(x[tutarKey] ?? x.genelToplam ?? x.tutar)}</td><td>${escapeHtml(x.odemeDurumu || x.durum || x.aciklama || x.notlar || "-")}</td></tr>`).join("") : `<tr><td colspan="4">Henüz kayıt yok.</td></tr>`}</tbody></table></div></div>`;
        const ekstreTablo = () => {
            let bakiye = 0;
            const sirali = [...hareketler].sort((a, b) => new Date(a.tarih) - new Date(b.tarih));
            return `<div class="dashboard-panel"><div class="panel-heading"><div><h2>Tedarikçi Cari Ekstresi</h2><p>Tüm modüller aynı cari hareket kaynağını kullanır.</p></div><div><button class="erp-small-button" id="tedNormal">Normal</button> <button class="erp-small-button" id="tedDetay">Detaylı</button> <button class="erp-primary-button" id="tedPanelPdf">PDF</button> <button class="erp-primary-button" id="tedPanelExcel">Excel</button></div></div><div class="table-scroll"><table><thead><tr><th>Tarih</th><th>İşlem</th><th>Belge</th><th class="ted-detay">Açıklama</th><th>Borç</th><th>Alacak</th><th>Bakiye</th></tr></thead><tbody>${sirali.map(x => { const degisim = x.bakiyeDegisimi !== null && x.bakiyeDegisimi !== undefined ? Number(x.bakiyeDegisimi) : (["ODEME", "IADE"].includes(x.tip) ? -Number(x.tutar || 0) : Number(x.tutar || 0)); bakiye += degisim; const kaynakIptalMi = x.kaynak === "ALIS" && iptalAlisIdSeti.has(String(x.kaynakId)); return `<tr class="${kaynakIptalMi ? "ted-hareket-iptal" : ""}"><td>${tarihKisa(x.tarih)}</td><td>${escapeHtml(raporKodEtiketi(x.tip))}${kaynakIptalMi ? ' <span class="purchase-status iptal">İptal Edildi</span>' : ""}</td><td>${escapeHtml(x.belgeNo || "-")}</td><td class="ted-detay">${escapeHtml(x.aciklama || "-")}</td><td>${degisim > 0 ? para(degisim) : "-"}</td><td>${degisim < 0 ? para(Math.abs(degisim)) : "-"}</td><td><b>${para(bakiye)}</b></td></tr>`; }).join("") || `<tr><td colspan="7">Henüz cari hareket yok.</td></tr>`}</tbody></table></div></div>`;
        };
        const ekstreExcel = () => { if (!window.XLSX) return alert("Excel kitaplığı yüklenemedi."); const ws = XLSX.utils.json_to_sheet([...hareketler].reverse().map(x => ({ Tarih: String(x.tarih || "").slice(0, 10), İşlem: raporKodEtiketi(x.tip), "Belge No": x.belgeNo || "", Açıklama: x.aciklama || "", Tutar: Number(x.tutar || 0), "Bakiye Değişimi": Number(x.bakiyeDegisimi ?? 0), "Sonraki Bakiye": x.sonrakiBakiye }))); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Ekstre"); XLSX.writeFile(wb, `${t.kod}-tedarikci-ekstre.xlsx`); };
        const ekstrePdf = () => stokYazdir(`${tedarikciAdi(t)} · Tedarikçi Ekstresi`, [...hareketler].reverse().map(x => [tarihKisa(x.tarih), x.tip, x.belgeNo || "-", x.aciklama || "-", para(x.tutar), para(x.sonrakiBakiye)]), ["Tarih", "İşlem", "Belge", "Açıklama", "Tutar", "Bakiye"], `Güncel bakiye: ${para(t.bakiye)}`);
        const sekmeAc = key => {
            content.querySelectorAll("[data-ted-tab]").forEach(b => b.classList.toggle("active", b.dataset.tedTab === key));
            if (key === "bilgiler") return tedarikciFormAc(t);
            if (key === "alislar") panel.innerHTML = tablo("Alış Faturaları", alislar, "belgeNo", "genelToplam");
            else if (key === "odemeler") { panel.innerHTML = `<div class="dashboard-panel"><div class="panel-heading"><div><h2>Ödemeler</h2><p>${odemeler.length} aktif ödeme</p></div></div><div class="table-scroll"><table><thead><tr><th>Tarih</th><th>Belge</th><th>Tutar</th><th>Açıklama</th><th>İşlemler</th></tr></thead><tbody>${odemeler.map((x, i) => `<tr><td>${tarihKisa(x.tarih)}</td><td>${escapeHtml(x.belgeNo || "-")}</td><td><b>${para(x.tutar)}</b></td><td>${escapeHtml(x.aciklama || "-")}</td><td><button class="erp-small-button" data-odeme-detay="${i}">Detay Gör</button> <button class="erp-small-button" data-odeme-duzenle="${i}">Düzenle</button> <button class="erp-small-button" data-odeme-iptal="${i}">İptal Et</button></td></tr>`).join("") || '<tr><td colspan="5">Henüz ödeme yok.</td></tr>'}</tbody></table></div></div>`; panel.querySelectorAll("[data-odeme-detay]").forEach(b => b.onclick = () => { const x = odemeler[Number(b.dataset.odemeDetay)]; alert(`Tedarikçi ödemesi\nBelge: ${x.belgeNo || "-"}\nTarih: ${tarihKisa(x.tarih)}\nTutar: ${para(x.tutar)}\nAçıklama: ${x.aciklama || "-"}`); }); panel.querySelectorAll("[data-odeme-duzenle]").forEach(b => b.onclick = () => tedarikciOdemeFormu(t, odemeler[Number(b.dataset.odemeDuzenle)])); panel.querySelectorAll("[data-odeme-iptal]").forEach(b => b.onclick = async () => { const x = odemeler[Number(b.dataset.odemeIptal)], neden = prompt("Ödeme iptal nedenini yazın:"); if (neden === null) return; if (!neden.trim()) return alert("İptal nedeni zorunludur."); try { await api(`/api/tenant/cari/tedarikci/odeme/${x._id}/iptal`, { method: "POST", body: JSON.stringify({ neden: neden.trim() }) }); await tedarikciDashboardAc(t._id, "odemeler"); } catch (error) { alert(error.message); } }); }
            else if (key === "avanslar") panel.innerHTML = tablo("Avanslar", avanslar, "belgeNo", "avansTutari");
            else if (key === "iadeler") {
                panel.innerHTML = `<div class="dashboard-panel"><div class="panel-heading"><div><h2>Alış İadeleri</h2><p>${iadeler.length} kayıt</p></div></div><div class="table-scroll"><table><thead><tr><th>Tarih</th><th>Belge</th><th>Tutar</th><th>Durum</th><th>İşlemler</th></tr></thead><tbody>${iadeler.map((x, i) => `<tr><td>${tarihKisa(x.tarih)}</td><td>${escapeHtml(x.belgeNo || "-")}</td><td><b>${para(x.genelToplam)}</b></td><td>${x.durum === "IPTAL" ? "İptal" : "Aktif"}</td><td><button class="erp-small-button" data-alis-iade-detay="${i}">Detay Gör</button>${x.durum === "IPTAL" ? "" : ` <button class="erp-small-button danger-button" data-alis-iade-iptal="${i}">İptal Et</button>`}</td></tr>`).join("") || '<tr><td colspan="5">Henüz alış iadesi yok.</td></tr>'}</tbody></table></div></div>`;
                panel.querySelectorAll("[data-alis-iade-detay]").forEach(b => b.onclick = () => { const x = iadeler[Number(b.dataset.alisIadeDetay)]; alert(`Alış iadesi\nBelge: ${x.belgeNo || "-"}\nTarih: ${tarihKisa(x.tarih)}\nTutar: ${para(x.genelToplam)}\nAçıklama: ${x.aciklama || "-"}`); });
                panel.querySelectorAll("[data-alis-iade-iptal]").forEach(b => b.onclick = async () => { const x = iadeler[Number(b.dataset.alisIadeIptal)], neden = prompt("Alış iadesi iptal nedenini yazın:"); if (neden === null) return; if (!neden.trim()) return alert("İptal nedeni zorunludur."); try { await api(`/api/tenant/alis/iade/${encodeURIComponent(x._id)}/iptal`, { method: "POST", body: JSON.stringify({ neden: neden.trim() }) }); await tedarikciDashboardAc(t._id, "iadeler"); } catch (error) { alert(error.message); } });
            }
            else if (key === "siparisler") panel.innerHTML = tablo("Satın Alma Siparişleri", siparisler, "siparisNo", "genelToplam");
            else if (key === "vadeler") panel.innerHTML = `<div class="dashboard-panel"><div class="panel-heading"><div><h2>Vade Takibi</h2><p>Tedarikçi kartındaki ${Number(t.vadeGun || 0)} günlük vadeye göre hesaplanır.</p></div></div><div class="table-scroll"><table><thead><tr><th>Fatura</th><th>Fatura Tarihi</th><th>Vade Tarihi</th><th>Kalan</th></tr></thead><tbody>${vadeler.map(x => `<tr><td>${escapeHtml(x.belgeNo)}</td><td>${tarihKisa(x.tarih)}</td><td>${tarihKisa(x.vadeTarihi)}</td><td><b>${para(x.kalanTutar)}</b></td></tr>`).join("") || '<tr><td colspan="4">Açık vadeli fatura yok.</td></tr>'}</tbody></table></div></div>`;
            else if (key === "cari") { panel.innerHTML = ekstreTablo(); panel.querySelector("#tedNormal").onclick = () => panel.querySelectorAll(".ted-detay").forEach(x => x.style.display = "none"); panel.querySelector("#tedDetay").onclick = () => panel.querySelectorAll(".ted-detay").forEach(x => x.style.display = ""); panel.querySelector("#tedPanelPdf").onclick = ekstrePdf; panel.querySelector("#tedPanelExcel").onclick = ekstreExcel; }
            else panel.innerHTML = `${tablo("Son İşlemler", sonIslemler.map(x => x.kaynak === "ALIS" && iptalAlisIdSeti.has(String(x.kaynakId)) ? { ...x, durum: "İptal Edildi" } : x))}<div class="dashboard-panel"><h2>Kart Özeti</h2><div class="supplier-info"><div><b>Yetkili</b><span>${escapeHtml(t.yetkili || "-")}</span></div><div><b>Telefon</b><span>${escapeHtml(t.telefon || "-")}</span></div><div><b>E-posta</b><span>${escapeHtml(t.email || "-")}</span></div><div><b>Vergi No</b><span>${escapeHtml(t.vergiNo || "-")}</span></div><div><b>IBAN</b><span>${escapeHtml(t.iban || "-")}</span></div><div><b>Vade</b><span>${Number(t.vadeGun || 0)} gün</span></div></div></div>`;
        };
        content.querySelectorAll("[data-ted-tab]").forEach(b => b.onclick = () => sekmeAc(b.dataset.tedTab));
        content.querySelector("#tedHizliAlis").onclick = () => tedarikciBelgeFormu("alis", t);
        content.querySelector("#tedHizliOdeme").onclick = () => tedarikciOdemeFormu(t);
        content.querySelector("#tedHizliIade").onclick = () => tedarikciBelgeFormu("iade", t);
        content.querySelector("#tedEkstrePdf").onclick = ekstrePdf;
        content.querySelector("#tedEkstreExcel").onclick = ekstreExcel;
        content.querySelector("#tedListe").onclick = tedarikcilerYukle;
        content.querySelector("#tedOnceki").onclick = () => tedarikciDashboardAc(tedarikciV2Liste[tedarikciV2Index - 1]._id);
        content.querySelector("#tedSonraki").onclick = () => tedarikciDashboardAc(tedarikciV2Liste[tedarikciV2Index + 1]._id);
        sekmeAc(aktifSekme);
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
        setTitle("Alışlar"); loading("Alış faturaları hazırlanıyor...");
        try {
            const [a, t] = await Promise.all([api("/api/tenant/alis"), api("/api/tenant/tedarikciler")]);
            alisMerkezi = { alislar: a.alislar || [], iadeler: [], tedarikciler: (t.tedarikciler || []).filter(x => x.aktif !== false) };
            const aktifAlislar = alisMerkezi.alislar.filter(x => x.durum !== "IPTAL");
            const toplam = aktifAlislar.reduce((n, x) => n + Number(x.genelToplam || 0), 0), odenen = aktifAlislar.reduce((n, x) => n + Number(x.odenenTutar || 0), 0), kalan = aktifAlislar.reduce((n, x) => n + Number(x.kalanTutar || 0), 0), buAy = aktifAlislar.filter(x => { const d = new Date(x.tarih), n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); }).reduce((n, x) => n + Number(x.genelToplam || 0), 0);
            content.innerHTML = `<div class="purchase-hero"><div><span>ALIŞLAR</span><h2>Alış faturaları</h2><p>Tüm alış faturalarının genel listesi, filtreleme, yeni alış ve raporlama. Tedarikçiye özel işlemler tedarikçi kartındadır.</p></div><div class="stock-hero-actions"><button id="alisExcel">Excel Raporu</button><button id="alisYazdir">PDF Raporu</button><button id="alisYenile">Yenile</button><button id="alisYeni">+ Yeni Alış</button></div></div><div class="dashboard-grid">${card("Toplam Alış", para(toplam), `${alisMerkezi.alislar.length} fatura`)}${card("Bu Ay", para(buAy), "Aylık satın alma")}${card("Ödenen", para(odenen), "Faturalarda ödenen")}${card("Açık Tutar", para(kalan), "Faturalarda kalan")}</div><div class="stock-tabs">${[["alislar", "Tüm Alış Faturaları"], ["yeni", "Yeni Alış"], ["rapor", "Raporlama"]].map(([k, l]) => `<button data-alis-tab="${k}" class="${aktifSekme === k ? "active" : ""}">${l}</button>`).join("")}</div><div id="alisAltPanel"></div>`;
            const panel = content.querySelector("#alisAltPanel");
            const ac = key => { content.querySelectorAll("[data-alis-tab]").forEach(b => b.classList.toggle("active", b.dataset.alisTab === key)); if (key === "yeni") return alisIslemBaslat(panel, "alis"); if (key === "rapor") return alisGenelRaporu(panel); return alisFaturaListesi(panel); };
            content.querySelectorAll("[data-alis-tab]").forEach(b => b.onclick = () => ac(b.dataset.alisTab));
            content.querySelector("#alisYeni").onclick = () => ac("yeni"); content.querySelector("#alisYenile").onclick = () => alisMerkeziYukle(aktifSekme); content.querySelector("#alisExcel").onclick = alisExcelDokumu; content.querySelector("#alisYazdir").onclick = () => alisListeYazdir(alisMerkezi.alislar, "Alış Faturaları Dökümü"); ac(aktifSekme);
        } catch (error) { errorBox(error); }
    }

    function alisGenelRaporu(panel, donem = "BU_AY", ozelBaslangic = "", ozelBitis = "") {
        const aralik = raporDonemTarihleri(donem, ozelBaslangic, ozelBitis);
        const rows = alisMerkezi.alislar.filter(x => { const tarih = String(x.tarih || "").slice(0, 10); return x.durum !== "IPTAL" && (!aralik.baslangic || tarih >= aralik.baslangic) && (!aralik.bitis || tarih <= aralik.bitis); });
        const durumlar = ["ACIK", "KISMI", "ODENDI"].map(durum => {
            const liste = rows.filter(x => x.odemeDurumu === durum);
            return { durum, adet: liste.length, toplam: liste.reduce((n, x) => n + Number(x.genelToplam || 0), 0), kalan: liste.reduce((n, x) => n + Number(x.kalanTutar || 0), 0) };
        });
        panel.innerHTML = `<div class="dashboard-panel"><div class="panel-heading"><div><h2>Genel Alış Raporu</h2><p>${aralik.baslangic || "İlk kayıt"} – ${aralik.bitis || "Bugün"} · ${rows.length} fatura</p></div><div><button id="alisRaporExcel" class="erp-small-button">Excel</button> <button id="alisRaporPdf" class="erp-primary-button">PDF</button></div></div><div class="stock-filterbar"><select id="alisRaporDonem">${raporDonemSecenekleri(donem)}</select><input id="alisRaporBaslangic" type="date" value="${aralik.baslangic}"><input id="alisRaporBitis" type="date" value="${aralik.bitis}"></div><div class="table-scroll"><table><thead><tr><th>Durum</th><th>Fatura</th><th>Toplam</th><th>Kalan</th></tr></thead><tbody>${durumlar.map(x => `<tr><td><span class="purchase-status ${x.durum.toLowerCase()}">${raporKodEtiketi(x.durum)}</span></td><td>${x.adet}</td><td>${para(x.toplam)}</td><td>${para(x.kalan)}</td></tr>`).join("")}</tbody></table></div></div>`;
        const yenile = () => alisGenelRaporu(panel, panel.querySelector("#alisRaporDonem").value, panel.querySelector("#alisRaporBaslangic").value, panel.querySelector("#alisRaporBitis").value);
        panel.querySelector("#alisRaporDonem").onchange = yenile;
        panel.querySelector("#alisRaporBaslangic").onchange = () => alisGenelRaporu(panel, "OZEL", panel.querySelector("#alisRaporBaslangic").value, panel.querySelector("#alisRaporBitis").value);
        panel.querySelector("#alisRaporBitis").onchange = () => alisGenelRaporu(panel, "OZEL", panel.querySelector("#alisRaporBaslangic").value, panel.querySelector("#alisRaporBitis").value);
        panel.querySelector("#alisRaporExcel").onclick = () => alisExcelDokumu(rows);
        panel.querySelector("#alisRaporPdf").onclick = () => alisListeYazdir(rows, "Genel Alış Raporu");
    }

    function alisFaturaListesi(panel) {
        const rows = alisMerkezi.alislar;
        const aralik = raporDonemTarihleri("BU_AY");
        panel.innerHTML = `<div class="dashboard-panel"><div class="stock-filterbar"><input id="alisAra" class="erp-input" placeholder="Belge, tedarikçi veya depo ara"><select id="alisDurum"><option value="">Tüm ödeme durumları</option><option value="ACIK">Açık</option><option value="KISMI">Kısmi</option><option value="ODENDI">Ödendi</option><option value="IPTAL">İptal</option></select><select id="alisDonem">${raporDonemSecenekleri("BU_AY")}</select><input id="alisBaslangic" type="date" title="Başlangıç" value="${aralik.baslangic}"><input id="alisBitis" type="date" title="Bitiş" value="${aralik.bitis}"></div><div class="table-scroll"><table><thead><tr><th>Tarih / Belge</th><th>Tedarikçi</th><th>Depo</th><th>Toplam</th><th>Ödenen</th><th>Kalan</th><th>Durum</th><th>İşlemler</th></tr></thead><tbody id="alisGovde">${rows.length ? rows.map((x, i) => { const iptal = x.durum === "IPTAL"; return `<tr data-index="${i}" data-durum="${iptal ? "IPTAL" : escapeHtml(x.odemeDurumu || "")}" data-tarih="${String(x.tarih || "").slice(0, 10)}"><td>${tarihKisa(x.tarih)}<small>${escapeHtml(x.belgeNo)}</small></td><td><b>${escapeHtml(x.tedarikciId?.kod || "-")}</b><small>${escapeHtml(x.tedarikciId?.unvan || x.tedarikciId?.adSoyad || "-")}</small></td><td>${escapeHtml(x.depoId?.ad || "-")}</td><td><b>${para(x.genelToplam)}</b></td><td>${para(x.odenenTutar)}</td><td>${para(x.kalanTutar)}</td><td><span class="purchase-status ${iptal ? "iptal" : String(x.odemeDurumu || "").toLowerCase()}">${iptal ? "İptal" : raporKodEtiketi(x.odemeDurumu || "-")}</span></td><td><button class="erp-small-button" data-alis-detay="${i}">Detay Gör</button>${iptal ? "" : ` <button class="erp-small-button" data-alis-duzenle="${i}">Düzenle</button> <button class="erp-small-button" data-alis-iptal="${i}">İptal Et</button>`}</td></tr>`; }).join("") : '<tr><td colspan="8">Henüz alış faturası yok.</td></tr>'}</tbody></table></div></div>`;
        const uygula = () => { const q = panel.querySelector("#alisAra").value.toLocaleLowerCase("tr-TR"), durum = panel.querySelector("#alisDurum").value, bas = panel.querySelector("#alisBaslangic").value, bit = panel.querySelector("#alisBitis").value; panel.querySelectorAll("#alisGovde tr[data-index]").forEach(r => r.hidden = (q && !r.textContent.toLocaleLowerCase("tr-TR").includes(q)) || (durum && r.dataset.durum !== durum) || (bas && r.dataset.tarih < bas) || (bit && r.dataset.tarih > bit)); };
        panel.querySelector("#alisDonem").onchange = event => { const secili = raporDonemTarihleri(event.target.value, panel.querySelector("#alisBaslangic").value, panel.querySelector("#alisBitis").value); panel.querySelector("#alisBaslangic").value = secili.baslangic; panel.querySelector("#alisBitis").value = secili.bitis; uygula(); };
        ["#alisAra", "#alisDurum", "#alisBaslangic", "#alisBitis"].forEach(s => { const e = panel.querySelector(s); e.oninput = e.onchange = uygula; });
        panel.querySelectorAll("[data-alis-detay]").forEach(b => b.onclick = () => alisDetayAc(rows[Number(b.dataset.alisDetay)]._id));
        panel.querySelectorAll("[data-alis-duzenle]").forEach(b => b.onclick = async () => { const x = rows[Number(b.dataset.alisDuzenle)], d = await api(`/api/tenant/alis/${x._id}`); tedarikciBelgeFormu("alis", d.alis.tedarikciId, "alis", d.alis); });
        panel.querySelectorAll("[data-alis-iptal]").forEach(b => b.onclick = () => alisIptalEt(rows[Number(b.dataset.alisIptal)]));
    }

    function alisIslemBaslat(panel, tur) {
        panel.innerHTML = `<div class="dashboard-panel"><div class="panel-heading"><div><h2>${tur === "alis" ? "Yeni Alış Faturası" : "Yeni Alış İadesi"}</h2><p>İşleme devam etmek için tedarikçi seçin.</p></div></div><div class="purchase-start"><label>Tedarikçi<select id="alisTedarikciSec"><option value="">Tedarikçi seçin</option>${stokSecenekleri(alisMerkezi.tedarikciler)}</select></label><button id="alisDevam" class="erp-primary-button">Belgeyi Hazırla</button></div></div>`;
        panel.querySelector("#alisDevam").onclick = () => { const id = panel.querySelector("#alisTedarikciSec").value, t = alisMerkezi.tedarikciler.find(x => String(x._id) === id); if (!t) return alert("Tedarikçi seçin."); tedarikciBelgeFormu(tur, t, "alis"); };
    }

    async function alisDetayAc(id) {
        try { const d = await api(`/api/tenant/alis/${id}`), x = d.alis, rows = x.kalemler || []; document.getElementById("alisDetayModal")?.remove(); const overlay = document.createElement("div"); overlay.id = "alisDetayModal"; overlay.className = "erp-modal-overlay"; overlay.innerHTML = `<div class="erp-modal"><div class="erp-modal-header"><div><h2>Alış Faturası · ${escapeHtml(x.belgeNo)}</h2><p>${tarihKisa(x.tarih)} · ${escapeHtml(x.tedarikciId?.unvan || x.tedarikciId?.adSoyad || "-")}</p></div><button class="erp-modal-close">×</button></div><div class="purchase-detail-meta"><span>Depo <b>${escapeHtml(x.depoId?.ad || "-")}</b></span><span>Durum <b>${x.durum === "IPTAL" ? "İptal" : escapeHtml(x.odemeDurumu)}</b></span><span>Kalan <b>${para(x.kalanTutar)}</b></span></div><div class="table-scroll"><table><thead><tr><th>Kod</th><th>Ürün</th><th>Miktar</th><th>Fiyat</th><th>KDV</th><th>İskonto</th><th>Toplam</th></tr></thead><tbody>${rows.map(k => `<tr><td>${escapeHtml(k.urunId?.kod || "-")}</td><td>${escapeHtml(k.urunId?.ad || "-")}</td><td>${Number(k.miktar)}</td><td>${para(k.birimFiyat)}</td><td>%${Number(k.kdv)}</td><td>%${Number(k.iskonto)}</td><td><b>${para(k.toplam)}</b></td></tr>`).join("")}</tbody></table></div><div class="purchase-totals"><span>Ara Toplam <b>${para(x.araToplam)}</b></span><span>KDV <b>${para(x.toplamKdv)}</b></span><span>Genel Toplam <b>${para(x.genelToplam)}</b></span></div><div class="erp-modal-footer"><button id="alisDetayYazdir" class="erp-primary-button">Yazdır / PDF</button><button data-kapat class="erp-small-button">Kapat</button></div></div>`; document.body.appendChild(overlay); const kapat = () => overlay.remove(); overlay.querySelectorAll(".erp-modal-close,[data-kapat]").forEach(b => b.onclick = kapat); if (x.durum !== "IPTAL") { const duzenle = document.createElement("button"), iptal = document.createElement("button"); duzenle.className = iptal.className = "erp-small-button"; duzenle.textContent = "Düzenle"; iptal.textContent = "İptal Et"; overlay.querySelector("#alisDetayYazdir").before(duzenle, iptal); duzenle.onclick = () => { kapat(); tedarikciBelgeFormu("alis", x.tedarikciId, "alis", x); }; iptal.onclick = async () => { kapat(); await alisIptalEt(x); }; } overlay.querySelector("#alisDetayYazdir").onclick = () => stokYazdir(`Alış Faturası · ${x.belgeNo}`, rows.map(k => [k.urunId?.kod, k.urunId?.ad, k.miktar, para(k.birimFiyat), `%${k.kdv}`, `%${k.iskonto}`, para(k.toplam)]), ["Kod", "Ürün", "Miktar", "Birim Fiyat", "KDV", "İskonto", "Toplam"], `${x.tedarikciId?.unvan || ""} · Genel toplam ${para(x.genelToplam)}`); } catch (error) { alert(error.message); }
    }

    async function alisIptalEt(x) {
        const neden = prompt(`${x.belgeNo} numaralı alış için iptal nedenini yazın:`);
        if (neden === null) return;
        if (!neden.trim()) return alert("İptal nedeni zorunludur.");
        try { await api(`/api/tenant/alis/${x._id}/iptal`, { method: "POST", body: JSON.stringify({ neden: neden.trim() }) }); await alisMerkeziYukle("alislar"); }
        catch (error) { alert(error.message); }
    }

    function alisIadeListesi(panel) { const rows = alisMerkezi.iadeler; panel.innerHTML = `<div class="dashboard-panel"><div class="panel-heading"><div><h2>Alış İadeleri</h2><p>${rows.length} iade belgesi</p></div></div><div class="table-scroll"><table><thead><tr><th>Tarih / Belge</th><th>Tedarikçi</th><th>Depo</th><th>Kalem</th><th>Toplam</th><th>Açıklama</th></tr></thead><tbody>${rows.map(x => `<tr><td>${tarihKisa(x.tarih)}<small>${escapeHtml(x.belgeNo)}</small></td><td>${escapeHtml(x.tedarikciId?.unvan || x.tedarikciId?.adSoyad || "-")}</td><td>${escapeHtml(x.depoId?.ad || "-")}</td><td>${x.kalemler?.length || 0}</td><td><b>${para(x.genelToplam)}</b></td><td>${escapeHtml(x.aciklama || "-")}</td></tr>`).join("") || '<tr><td colspan="6">Alış iadesi bulunmuyor.</td></tr>'}</tbody></table></div></div>`; }

    function alisTedarikciAnalizi(panel) { const map = {}; alisMerkezi.alislar.forEach(x => { const id = String(x.tedarikciId?._id || ""), ad = x.tedarikciId?.unvan || x.tedarikciId?.adSoyad || "Tedarikçi"; if (!map[id]) map[id] = { ad, adet: 0, toplam: 0, kalan: 0 }; map[id].adet++; map[id].toplam += Number(x.genelToplam || 0); map[id].kalan += Number(x.kalanTutar || 0); }); panel.innerHTML = `<div class="dashboard-panel"><div class="panel-heading"><div><h2>Tedarikçi Satın Alma Analizi</h2><p>Toplam alış hacmi ve açık borç karşılaştırması</p></div></div><div class="table-scroll"><table><thead><tr><th>Tedarikçi</th><th>Belge</th><th>Toplam Alış</th><th>Açık Borç</th><th>Ortalama Belge</th></tr></thead><tbody>${Object.values(map).sort((a, b) => b.toplam - a.toplam).map(x => `<tr><td><b>${escapeHtml(x.ad)}</b></td><td>${x.adet}</td><td>${para(x.toplam)}</td><td>${para(x.kalan)}</td><td>${para(x.toplam / x.adet)}</td></tr>`).join("") || '<tr><td colspan="5">Analiz için alış kaydı yok.</td></tr>'}</tbody></table></div></div>`; }

    function alisListeYazdir(rows, baslik) { stokYazdir(baslik, rows.map(x => [tarihKisa(x.tarih), x.belgeNo, x.tedarikciId?.unvan || x.tedarikciId?.adSoyad, x.depoId?.ad, para(x.genelToplam), para(x.odenenTutar), para(x.kalanTutar), x.odemeDurumu]), ["Tarih", "Belge", "Tedarikçi", "Depo", "Toplam", "Ödenen", "Kalan", "Durum"]); }
    function alisExcelDokumu(rows = alisMerkezi.alislar) { if (!window.XLSX) return alert("Excel kitaplığı yüklenemedi."); const ws = XLSX.utils.json_to_sheet(rows.map(x => ({ Tarih: String(x.tarih || "").slice(0, 10), "Belge No": x.belgeNo, "Tedarikçi Kodu": x.tedarikciId?.kod || "", Tedarikçi: x.tedarikciId?.unvan || x.tedarikciId?.adSoyad || "", Depo: x.depoId?.ad || "", "Ara Toplam": Number(x.araToplam || 0), KDV: Number(x.toplamKdv || 0), "Genel Toplam": Number(x.genelToplam || 0), Ödenen: Number(x.odenenTutar || 0), Kalan: Number(x.kalanTutar || 0), Durum: raporKodEtiketi(x.odemeDurumu) }))); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Alışlar"); XLSX.writeFile(wb, `alis-dokumu-${new Date().toISOString().slice(0, 10)}.xlsx`); }

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
        pencere.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${escapeHtml(baslik)}</title><style>body{font:12px Arial;color:#172033;margin:28px}h1{font-size:22px;margin:0 0 5px}.meta{color:#64748b;margin-bottom:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:7px;text-align:left}th{background:#e2e8f0}.footer{margin-top:24px;color:#475569}@media print{button{display:none}}</style></head><body><h1>benimmuhasebe.com · ${escapeHtml(baslik)}</h1><div class="meta">Döküm tarihi: ${new Date().toLocaleString("tr-TR")}</div><table><thead><tr>${kolonlar.map(x => `<th>${escapeHtml(x)}</th>`).join("")}</tr></thead><tbody>${hucreler || `<tr><td colspan="${kolonlar.length}">Kayıt yok</td></tr>`}</tbody></table><div class="footer">${escapeHtml(altBilgi)}</div><script>window.onload=()=>window.print()<\/script></body></html>`);
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
        panel.innerHTML = `<div class="dashboard-panel stock-panel"><div class="panel-heading"><div><h2>Manuel Stok Hareketi</h2><p>Giriş, çıkış, devir, sayım farkı veya iade hareketi işleyin.</p></div></div><form id="stokHareketForm" class="erp-form-grid"><label>Ürün<select name="urunId" required><option value="">Ürün seçin</option>${stokSecenekleri(stokMerkezi.urunler)}</select></label><label>Depo<select name="depoId" required><option value="">Depo seçin</option>${stokSecenekleri(stokMerkezi.depolar)}</select></label><label>Hareket Tipi<select name="tip" required><option value="GIRIS">Giriş</option><option value="CIKIS">Çıkış</option><option value="DEVIR_GIRIS">Devir Giriş</option><option value="DEVIR_CIKIS">Devir Çıkış</option><option value="SAYIM_ARTI">Sayım Fazlası</option><option value="SAYIM_EKSI">Sayım Eksiği</option><option value="IADE_GIRIS">İade Giriş</option><option value="IADE_CIKIS">İade Çıkış</option></select></label><label>İşlem Tarihi<input name="tarih" type="date" value="${new Date().toISOString().slice(0,10)}" required></label><label>Miktar<input name="miktar" type="number" min="0.0001" step="0.0001" required></label><label>Birim Maliyet<input name="birimMaliyet" type="number" min="0" step="0.01" placeholder="Mevcut maliyet"></label><label class="full">Açıklama<textarea name="aciklama" placeholder="Sayım, düzeltme veya işlem notu"></textarea></label><div id="stokHareketMesaj" class="full"></div><div class="full"><button class="erp-primary-button" type="submit">Hareketi Kaydet</button></div></form></div>`;
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
        panel.innerHTML = `<div class="stock-two-column"><div class="dashboard-panel stock-panel"><div class="panel-heading"><div><h2>Depolar</h2><p>Aktif depo listesi, bağlı şube ve stok satırı sayıları.</p></div></div><div class="stock-depot-list">${stokMerkezi.depolar.length ? stokMerkezi.depolar.map(d => { const satir = stokMerkezi.stoklar.filter(x => String(x.depoId?._id) === String(d._id)); const miktar = satir.reduce((n, x) => n + Number(x.miktar || 0), 0); return `<div class="stock-depot"><b>${escapeHtml(d.kod)} · ${escapeHtml(d.ad)}</b><span>${miktar} adet · ${satir.length} ürün satırı</span><small>Şube: ${escapeHtml(d.sube || "Atanmamış")} · ${escapeHtml(d.adres || "Adres yok")}</small><button type="button" class="erp-small-button" data-depo-duzenle="${escapeHtml(d._id)}">Düzenle</button></div>`; }).join("") : "<p>Henüz depo yok.</p>"}</div></div><div class="dashboard-panel stock-panel"><div class="panel-heading"><div><h2 id="stokDepoFormBaslik">Yeni Depo</h2><p>Şube bağlantısı raporların satış, alış, iade ve stok verilerini doğru süzmesini sağlar.</p></div></div><form id="stokDepoForm" class="erp-form-grid"><input type="hidden" name="depoId"><label>Depo Kodu<input name="kod" required maxlength="30"></label><label>Depo Adı<input name="ad" required maxlength="120"></label><label class="full">Şube<input name="sube" maxlength="120" placeholder="Örn. Merkez"></label><label class="full">Adres<textarea name="adres"></textarea></label><div id="stokDepoMesaj" class="full"></div><div class="full"><button class="erp-primary-button" type="submit">Depoyu Kaydet</button><button class="erp-secondary-button" id="stokDepoVazgec" type="button" hidden>Vazgeç</button></div></form></div></div>`;
        const form = panel.querySelector("#stokDepoForm");
        const formuSifirla = () => { form.reset(); form.elements.depoId.value = ""; panel.querySelector("#stokDepoFormBaslik").textContent = "Yeni Depo"; form.querySelector('[type="submit"]').textContent = "Depoyu Kaydet"; panel.querySelector("#stokDepoVazgec").hidden = true; };
        panel.querySelectorAll("[data-depo-duzenle]").forEach(button => button.onclick = () => {
            const depo = stokMerkezi.depolar.find(x => String(x._id) === button.dataset.depoDuzenle);
            if (!depo) return;
            form.elements.depoId.value = depo._id; form.elements.kod.value = depo.kod || ""; form.elements.ad.value = depo.ad || ""; form.elements.sube.value = depo.sube || ""; form.elements.adres.value = depo.adres || "";
            panel.querySelector("#stokDepoFormBaslik").textContent = "Depoyu Düzenle"; form.querySelector('[type="submit"]').textContent = "Değişiklikleri Kaydet"; panel.querySelector("#stokDepoVazgec").hidden = false; form.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        panel.querySelector("#stokDepoVazgec").onclick = formuSifirla;
        form.onsubmit = async event => {
            event.preventDefault();
            const mesaj = panel.querySelector("#stokDepoMesaj");
            try {
                const veri = Object.fromEntries(new FormData(event.currentTarget).entries()), depoId = veri.depoId; delete veri.depoId;
                await api(depoId ? `/api/tenant/stok/depolar/${depoId}` : "/api/tenant/stok/depolar", { method: depoId ? "PATCH" : "POST", body: JSON.stringify(veri) });
                await stokMerkeziYukle("depolar");
            } catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; }
        };
    }

    function stokHareketGecmisi(panel) {
        const rows = stokMerkezi.hareketler;
        const aralik = raporDonemTarihleri("BU_AY");
        panel.innerHTML = `<div class="dashboard-panel stock-panel"><div class="stock-filterbar"><input id="stokHareketAra" class="erp-input" placeholder="Hareket, ürün, depo veya açıklama ara"><select id="stokHareketTip"><option value="">Tüm hareketler</option>${["GIRIS", "CIKIS", "SAYIM_ARTI", "SAYIM_EKSI", "IADE_GIRIS", "IADE_CIKIS", "TRANSFER_GIRIS", "TRANSFER_CIKIS"].map(x => `<option value="${x}">${raporKodEtiketi(x)}</option>`).join("")}</select><select id="stokHareketDonem">${raporDonemSecenekleri("BU_AY")}</select><input id="stokHareketBaslangic" type="date" value="${aralik.baslangic}" title="Başlangıç"><input id="stokHareketBitis" type="date" value="${aralik.bitis}" title="Bitiş"></div><div class="table-scroll"><table><thead><tr><th>Tarih</th><th>Tip</th><th>Ürün</th><th>Depo</th><th>Miktar</th><th>Maliyet</th><th>Kaynak</th><th>Açıklama</th></tr></thead><tbody id="stokHareketGovde">${rows.length ? rows.map(x => { const tarih = x.createdAt || x.tarih; return `<tr data-tip="${escapeHtml(x.tip || "")}" data-tarih="${String(tarih || "").slice(0, 10)}"><td>${tarihKisa(tarih)}</td><td><span class="stock-status ${String(x.tip || "").includes("CIKIS") || String(x.tip || "").includes("EKSI") ? "danger" : "ok"}">${raporKodEtiketi(x.tip || "-")}</span></td><td><b>${escapeHtml(x.urunId?.kod || "-")}</b><small>${escapeHtml(x.urunId?.ad || "-")}</small></td><td>${escapeHtml(x.depoId?.ad || "-")}</td><td><b>${Number(x.miktar || 0)}</b></td><td>${para(x.birimMaliyet)}</td><td>${raporKodEtiketi(x.kaynak || "-")}</td><td>${escapeHtml(x.aciklama || "-")}</td></tr>`; }).join("") : '<tr><td colspan="8">Henüz stok hareketi yok.</td></tr>'}</tbody></table></div></div>`;
        panel.querySelectorAll("#stokHareketGovde tr[data-tip]").forEach((row, index) => { const x = rows[index], alan = row.lastElementChild; const detay = document.createElement("button"); detay.className = "erp-small-button"; detay.textContent = "Detay Gör"; detay.onclick = () => alert(`Stok hareketi\nÜrün: ${x.urunId?.kod || "-"} · ${x.urunId?.ad || "-"}\nDepo: ${x.depoId?.ad || "-"}\nTür: ${raporKodEtiketi(x.tip)}\nMiktar: ${Number(x.miktar || 0)}\nAçıklama: ${x.aciklama || "-"}`); alan.append(" ", detay); if (x.kaynak === "MANUEL" && x.durum !== "IPTAL") { const iptal = document.createElement("button"); iptal.className = "erp-small-button"; iptal.textContent = "İptal Et"; iptal.onclick = async () => { const neden = prompt("Stok hareketi iptal nedenini yazın:"); if (neden === null) return; if (!neden.trim()) return alert("İptal nedeni zorunludur."); try { await api(`/api/tenant/stok/hareketler/${x._id}/iptal`, { method: "POST", body: JSON.stringify({ neden: neden.trim() }) }); await stokMerkeziYukle("gecmis"); } catch (error) { alert(error.message); } }; alan.append(" ", iptal); } });
        const uygula = () => {
            const q = panel.querySelector("#stokHareketAra").value.toLocaleLowerCase("tr-TR");
            const tip = panel.querySelector("#stokHareketTip").value;
            const baslangic = panel.querySelector("#stokHareketBaslangic").value, bitis = panel.querySelector("#stokHareketBitis").value;
            panel.querySelectorAll("#stokHareketGovde tr").forEach(row => {
                if (!row.dataset.tip) return;
                row.hidden = (q && !row.textContent.toLocaleLowerCase("tr-TR").includes(q)) || (tip && row.dataset.tip !== tip) || (baslangic && row.dataset.tarih < baslangic) || (bitis && row.dataset.tarih > bitis);
            });
        };
        panel.querySelector("#stokHareketAra").oninput = uygula;
        panel.querySelector("#stokHareketTip").onchange = uygula;
        panel.querySelector("#stokHareketDonem").onchange = event => { const secili = raporDonemTarihleri(event.target.value, panel.querySelector("#stokHareketBaslangic").value, panel.querySelector("#stokHareketBitis").value); panel.querySelector("#stokHareketBaslangic").value = secili.baslangic; panel.querySelector("#stokHareketBitis").value = secili.bitis; uygula(); };
        panel.querySelector("#stokHareketBaslangic").onchange = panel.querySelector("#stokHareketBitis").onchange = uygula;
        uygula();
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

    async function urunFormAc(mevcut = null, secenekler = {}) {
        const kategoriData = await api("/api/tenant/urunler/kategoriler");
        const kategoriler = kategoriData.kategoriler || [];
        document.getElementById("urunV2Modal")?.remove();
        const v = mevcut || {}, overlay = document.createElement("div"); overlay.id = "urunV2Modal"; overlay.className = "erp-modal-overlay";
        const alan = (n, l, t = "text", r = false) => `<label>${l}<input name="${n}" type="${t}" ${r ? "required" : ""} ${t === "number" ? 'min="0" step="0.01"' : ""} value="${escapeHtml(v[n] ?? "")}"></label>`;
        overlay.innerHTML = `<div class="erp-modal product-modal"><div class="erp-modal-header"><div><h2>${mevcut ? "Ürün Kartını Düzenle" : "Yeni Ürün"}</h2><p>Kod, barkod, fiyat, stok ve görsel bilgileri</p></div><button type="button" class="erp-modal-close">×</button></div><form><div class="product-form-layout"><div class="product-photo-editor"><div id="urunGorselOnizleme" class="product-photo">${v.gorsel ? `<img src="${v.gorsel}" alt="Ürün">` : '<span>📦</span>'}</div><label class="erp-small-button">Görsel Seç<input name="gorselDosya" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden></label><small>Telefon kamerası veya galeriden eklenebilir.</small></div><div class="erp-form-grid">${alan("kod", "Ürün Kodu / SKU", "text", true)}${alan("barkod", "Barkod")}${alan("ad", "Ürün Adı", "text", true)}<label>Kategori<span class="product-category-row"><select name="kategori" id="urunKategoriSecim"><option value="">Kategori seçin</option>${[...new Set([...kategoriler, v.kategori].filter(Boolean))].map(x => `<option value="${escapeHtml(x)}" ${v.kategori === x ? "selected" : ""}>${escapeHtml(x)}</option>`).join("")}</select><button type="button" id="urunYeniKategori" class="erp-small-button" title="Yeni kategori ekle">+ Yeni</button></span></label>${alan("marka", "Marka")}${alan("model", "Model")}<label>Birim<select name="birim">${["ADET", "KUTU", "PAKET", "KG", "LT", "MT"].map(x => `<option ${v.birim === x ? "selected" : ""}>${x}</option>`).join("")}</select></label><label>Para Birimi<select name="paraBirimi">${[["TRY", "TL (₺)"], ["USD", "Dolar ($)"], ["EUR", "Euro (€)"]].map(([kod, ad]) => `<option value="${kod}" ${(v.paraBirimi || "TRY") === kod ? "selected" : ""}>${ad}</option>`).join("")}</select></label>${alan("kdv", "KDV %", "number")}${alan("alisFiyati", "Alış Fiyatı", "number")}${alan("satisFiyati", "Satış Fiyatı", "number")}${alan("bayiFiyati", "Bayi Fiyatı", "number")}${alan("perakendeFiyati", "Perakende Fiyatı", "number")}${alan("minimumStok", "Minimum Stok", "number")}${alan("kritikStok", "Kritik Stok", "number")}${alan("uyumluluk", "Uyumluluk (virgülle)")}<label class="full">Notlar<textarea name="notlar">${escapeHtml(v.notlar || "")}</textarea></label><label class="full"><span><input name="aktif" type="checkbox" ${v.aktif === false ? "" : "checked"}> Aktif ürün</span></label></div></div><div id="urunV2Mesaj"></div><div class="erp-modal-footer"><button type="button" class="erp-small-button" data-kapat>Vazgeç</button><button class="erp-primary-button" type="submit">Ürünü Kaydet</button></div></form></div>`;
        overlay.querySelector('[name="perakendeFiyati"]').closest("label").insertAdjacentHTML("afterend", alan("iskonto", "Varsayılan İskonto %", "number"));
        overlay.querySelector('[name="iskonto"]').max = "100";
        document.body.appendChild(overlay); const kapat = () => overlay.remove(); overlay.querySelectorAll(".erp-modal-close,[data-kapat]").forEach(x => x.onclick = kapat);
        overlay.querySelector("#urunYeniKategori").onclick = () => { const yeni = String(prompt("Yeni kategori adı:") || "").trim(); if (!yeni) return; const secim = overlay.querySelector("#urunKategoriSecim"); if (![...secim.options].some(o => o.value === yeni)) secim.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(yeni)}">${escapeHtml(yeni)}</option>`); secim.value = yeni; };
        let gorsel = v.gorsel || ""; overlay.querySelector('[name="gorselDosya"]').onchange = async e => { try { gorsel = await urunGorselHazirla(e.target.files[0]); overlay.querySelector("#urunGorselOnizleme").innerHTML = `<img src="${gorsel}" alt="Ürün">`; } catch (error) { overlay.querySelector("#urunV2Mesaj").innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
        overlay.querySelector("form").onsubmit = async e => { e.preventDefault(); const mesaj = overlay.querySelector("#urunV2Mesaj"); try { const fd = new FormData(e.currentTarget), veri = {}; for (const [k, val] of fd.entries()) if (k !== "gorselDosya") veri[k] = val;["kdv", "alisFiyati", "satisFiyati", "bayiFiyati", "perakendeFiyati", "minimumStok", "kritikStok"].forEach(k => veri[k] = Number(veri[k] || 0)); veri.uyumluluk = String(veri.uyumluluk || "").split(",").map(x => x.trim()).filter(Boolean); veri.aktif = e.currentTarget.elements.aktif.checked; veri.gorsel = gorsel; const sonuc = await api(mevcut ? `/api/tenant/urunler/${mevcut._id}` : "/api/tenant/urunler", { method: mevcut ? "PATCH" : "POST", body: JSON.stringify(veri) }); await api(`/api/tenant/urunler/${sonuc.urun._id}`); kapat(); if (typeof secenekler.onSaved === "function") await secenekler.onSaved(sonuc.urun); else await urunDashboardAc(sonuc.urun._id); } catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
    }

    async function urunDashboardAc(id, sekme = "ozet") {
        try {
            const [ud, sd, hd] = await Promise.all([api(`/api/tenant/urunler/${id}`), api(`/api/tenant/stok?urunId=${id}`), api(`/api/tenant/stok/hareketler?urunId=${id}`)]);
            const u = ud.urun, stoklar = sd.stoklar || [], hareketler = hd.hareketler || []; urunV2Index = urunV2Liste.findIndex(x => String(x._id) === String(id)); if (urunV2Index < 0) { urunV2Liste.push(u); urunV2Index = urunV2Liste.length - 1; }
            const toplam = stoklar.reduce((n, x) => n + Number(x.miktar || 0), 0), maliyet = stoklar.reduce((n, x) => n + Number(x.miktar || 0) * Number(x.maliyet || u.alisFiyati || 0), 0), kritik = toplam <= Number(u.kritikStok || u.minimumStok || 0);
            setTitle("Ürün Kartı"); content.innerHTML = `<div class="product-hero"><div class="product-identity"><div class="product-avatar">${u.gorsel ? `<img src="${u.gorsel}" alt="${escapeHtml(u.ad)}">` : '📦'}</div><div><span>ÜRÜN KARTI · ${escapeHtml(u.kod)}</span><h2>${escapeHtml(u.ad)}</h2><p>${escapeHtml([u.marka, u.model, u.kategori].filter(Boolean).join(" · ") || "Kategori bilgisi yok")}</p></div></div><div class="supplier-nav"><button id="urunListe">Liste</button><button id="urunOnceki" ${urunV2Index <= 0 ? "disabled" : ""}>← Önceki</button><button id="urunSonraki" ${urunV2Index >= urunV2Liste.length - 1 ? "disabled" : ""}>Sonraki →</button></div></div><div class="dashboard-grid">${card("Mevcut Stok", `${toplam} ${u.birim || "ADET"}`, kritik ? "Kritik stok seviyesinde" : "Stok seviyesi normal")}${card("Stok Değeri", urunParasi(maliyet, u.paraBirimi), "Güncel maliyet")}${card("Alış / Satış", `${urunParasi(u.alisFiyati, u.paraBirimi)} / ${urunParasi(u.satisFiyati, u.paraBirimi)}`, `Standart fiyatlar · ${u.paraBirimi || "TRY"}`)}${card("Tahmini Marj", urunParasi(Number(u.satisFiyati || 0) - Number(u.alisFiyati || 0), u.paraBirimi), "Birim brüt fark")}</div><div class="supplier-tabs">${[["ozet", "Özet"], ["stok", "Depo Stokları"], ["hareket", "Stok Hareketleri"], ["duzenle", "Düzenle"]].map(([k, l]) => `<button class="${sekme === k ? "active" : ""}" data-urun-tab="${k}">${l}</button>`).join("")}</div><div id="urunAltPanel"></div>`;
            const panel = content.querySelector("#urunAltPanel"), ac = k => { if (k === "duzenle") return urunFormAc(u); if (k === "stok") panel.innerHTML = `<div class="dashboard-panel"><h2>Depo Bazlı Stok</h2><div class="table-scroll"><table><thead><tr><th>Depo</th><th>Miktar</th><th>Maliyet</th><th>Stok Değeri</th></tr></thead><tbody>${stoklar.length ? stoklar.map(x => `<tr><td>${escapeHtml(x.depoId?.ad || "-")}</td><td><b>${Number(x.miktar || 0)} ${escapeHtml(u.birim || "")}</b></td><td>${urunParasi(x.maliyet, u.paraBirimi)}</td><td>${urunParasi(Number(x.miktar || 0) * Number(x.maliyet || 0), u.paraBirimi)}</td></tr>`).join("") : '<tr><td colspan="4">Bu ürün için stok kaydı yok.</td></tr>'}</tbody></table></div></div>`; else if (k === "hareket") panel.innerHTML = `<div class="dashboard-panel"><h2>Stok Hareketleri</h2><div class="table-scroll"><table><thead><tr><th>Tarih</th><th>Tür</th><th>Depo</th><th>Miktar</th><th>Birim Maliyet</th><th>Açıklama</th></tr></thead><tbody>${hareketler.length ? hareketler.map(x => `<tr><td>${tarihKisa(x.tarih || x.createdAt)}</td><td>${escapeHtml(x.tip || "-")}</td><td>${escapeHtml(x.depoId?.ad || "-")}</td><td><b>${Number(x.miktar || 0)}</b></td><td>${urunParasi(x.birimMaliyet || x.maliyet, u.paraBirimi)}</td><td>${escapeHtml(x.aciklama || "-")}</td></tr>`).join("") : '<tr><td colspan="6">Stok hareketi bulunmuyor.</td></tr>'}</tbody></table></div></div>`; else panel.innerHTML = `<div class="dashboard-panel"><h2>Ürün Bilgileri</h2><div class="supplier-info"><div><b>Barkod</b><span>${escapeHtml(u.barkod || "-")}</span></div><div><b>Kategori</b><span>${escapeHtml(u.kategori || "-")}</span></div><div><b>Birim / KDV</b><span>${escapeHtml(u.birim || "-")} · %${Number(u.kdv || 0)}</span></div><div><b>Para Birimi</b><span>${escapeHtml(u.paraBirimi || "TRY")}</span></div><div><b>Bayi Fiyatı</b><span>${urunParasi(u.bayiFiyati, u.paraBirimi)}</span></div><div><b>Perakende Fiyatı</b><span>${urunParasi(u.perakendeFiyati || u.satisFiyati, u.paraBirimi)}</span></div><div><b>Durum</b><span>${u.aktif === false ? "Pasif" : "Aktif"}</span></div><div><b>Uyumluluk</b><span>${escapeHtml((u.uyumluluk || []).join(", ") || "-")}</span></div><div><b>Minimum / Kritik</b><span>${Number(u.minimumStok || 0)} / ${Number(u.kritikStok || 0)}</span></div><div><b>Not</b><span>${escapeHtml(u.notlar || "-")}</span></div></div></div>`; };
            content.querySelectorAll("[data-urun-tab]").forEach(b => b.onclick = () => ac(b.dataset.urunTab)); content.querySelector("#urunListe").onclick = urunlerYukle; content.querySelector("#urunOnceki").onclick = () => urunDashboardAc(urunV2Liste[urunV2Index - 1]._id); content.querySelector("#urunSonraki").onclick = () => urunDashboardAc(urunV2Liste[urunV2Index + 1]._id); ac(sekme);
        } catch (error) { errorBox(error); }
    }

    const urunExcelAlanlari = {
        kod: ["urun kodu", "stok kodu", "urun stok kodu", "sku", "merchant sku", "stock code", "stockcode", "model kodu"],
        barkod: ["barkod", "barcode", "ean", "gtin"],
        ad: ["urun adi", "urun basligi", "baslik", "name", "product name", "title"],
        kategori: ["kategori", "kategori ismi", "kategori adi", "category", "category name"],
        marka: ["marka", "brand"], model: ["model", "model adi"], birim: ["birim", "unit"],
        kdv: ["kdv", "kdv orani", "kdv yuzdesi", "vat", "vat rate"],
        alisFiyati: ["alis fiyati", "maliyet", "maliyet fiyati", "purchase price", "cost price"],
        satisFiyati: ["satis fiyati", "trendyolda satilacak fiyat kdv dahil", "indirimli fiyat", "sale price", "price"],
        bayiFiyati: ["bayi fiyati", "toptan fiyat", "wholesale price"],
        perakendeFiyati: ["perakende fiyati", "piyasa satis fiyati kdv dahil", "liste fiyati", "list price", "retail price"],
        iskonto: ["iskonto", "iskonto orani", "varsayilan iskonto", "indirim", "indirim orani", "discount", "discount rate"],
        paraBirimi: ["para birimi", "doviz", "doviz tipi", "currency", "currency type"],
        minimumStok: ["minimum stok", "min stok", "minimum stock"], kritikStok: ["kritik stok", "critical stock"],
        stokMiktari: ["stok", "stok miktari", "stok adedi", "mevcut stok", "envanter", "quantity", "stock", "stock quantity", "inventory"],
        depoKodu: ["depo", "depo kodu", "warehouse", "warehouse code"],
        gorsel: ["gorsel url base64", "gorsel url", "gorsel", "urun gorseli", "urun gorseli 1", "resim", "resim 1", "resim url", "resim url 1", "image", "image 1", "image url", "image url 1", "main image", "main image url", "picture url", "photo url"],
        uyumluluk: ["uyumluluk", "uyumlu modeller", "compatibility"], notlar: ["not", "notlar", "aciklama", "urun aciklamasi", "description"]
    };

    function urunExcelBaslikNorm(value) { return String(value || "").toLocaleLowerCase("tr-TR").replaceAll("ı", "i").replaceAll("ş", "s").replaceAll("ğ", "g").replaceAll("ü", "u").replaceAll("ö", "o").replaceAll("ç", "c").replace(/[^a-z0-9]+/g, " ").trim(); }
    function urunExcelAlanBul(baslik) { const norm = urunExcelBaslikNorm(baslik); const bulunan = Object.keys(urunExcelAlanlari).find(alan => urunExcelAlanlari[alan].some(alias => urunExcelBaslikNorm(alias) === norm)); if (bulunan) return bulunan; if (/^(gorsel|urun gorseli|resim|image|image url|foto|picture|photo)( url)? [0-9]+$/.test(norm)) return "gorsel"; return undefined; }
    function urunExcelSayi(value) { if (typeof value === "number") return value; let text = String(value ?? "").replace(/[^0-9,.-]/g, ""); if (!text) return 0; const virgul = text.lastIndexOf(","), nokta = text.lastIndexOf("."); if (virgul >= 0 && nokta >= 0) text = virgul > nokta ? text.replaceAll(".", "").replace(",", ".") : text.replaceAll(",", ""); else if (virgul >= 0) text = text.replaceAll(".", "").replace(",", "."); const sayi = Number(text); return Number.isFinite(sayi) ? sayi : 0; }
    function urunExcelParaBirimi(value) { const text = String(value || "TRY").trim().toUpperCase(); if (text.includes("USD") || text.includes("DOLAR") || text === "$") return "USD"; if (text.includes("EUR") || text.includes("EURO") || text === "€") return "EUR"; return "TRY"; }
    function urunParasi(value, paraBirimi = "TRY") { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: ["TRY", "USD", "EUR"].includes(paraBirimi) ? paraBirimi : "TRY" }).format(Number(value || 0)); }

    function urunExcelSablonuIndir() {
        if (!window.XLSX) throw new Error("Excel kitaplığı yüklenemedi. Sayfayı yenileyip tekrar deneyin.");
        const basliklar = ["Ürün Kodu", "Barkod", "Ürün Adı", "Kategori", "Marka", "Model", "Birim", "KDV", "Alış Fiyatı", "Satış Fiyatı", "Bayi Fiyatı", "Perakende Fiyatı", "Varsayılan İskonto %", "Para Birimi", "Stok Miktarı", "Depo Kodu", "Minimum Stok", "Kritik Stok", "Görsel URL / Base64", "Uyumluluk", "Not"];
        const ornek = ["URN-001", "869000000001", "Örnek Ürün", "Genel", "Örnek Marka", "Model A", "ADET", 20, 100, 150, 140, 160, 0, "TRY", 25, "ANA", 5, 3, "https://ornek.com/urun.jpg", "Model A, Model B", "Örnek satırı silin."];
        const ws = XLSX.utils.aoa_to_sheet([basliklar, ornek]); ws["!cols"] = basliklar.map(() => ({ wch: 19 }));
        const bilgi = XLSX.utils.aoa_to_sheet([["Kullanım"], ["Ürün kodu veya barkod eşleşirse ürün güncellenir."], ["Stok miktarı belirtilirse Depo Kodu alanındaki stok mutlak miktar olarak güncellenir."], ["Depo kodu boşsa ilk aktif depo kullanılır; hiç depo yoksa Ana Depo otomatik açılır."], ["Görsel alanında doğrudan HTTPS resim adresi kullanın. Trendyol ve IdeaSoft görsel kolonları otomatik tanınır."], ["Para Birimi: TRY, USD veya EUR."]]); bilgi["!cols"] = [{ wch: 110 }];
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Ürünler"); XLSX.utils.book_append_sheet(wb, bilgi, "Açıklamalar");
        XLSX.writeFile(wb, "benimmuhasebe-urun-yukleme-sablonu.xlsx", { bookType: "xlsx", compression: true });
    }

    async function urunExcelPaneli() {
        const panel = content.querySelector("#urunAltPanel");
        panel.innerHTML = `<div class="dashboard-panel"><div class="panel-heading"><div><h2>Excel / CSV'den Toplu Ürün Yükle</h2><p>benimmuhasebe.com, Trendyol ve IdeaSoft kolonlarını otomatik tanır; ürün kodu veya barkod eşleşirse kartı günceller.</p></div><button id="urunSablon" class="erp-primary-button">Şablon İndir</button></div><label>Excel veya CSV Dosyası<input id="urunExcelDosya" type="file" accept=".xlsx,.xls,.csv"></label><div id="urunExcelOnizleme"></div></div>`;
        panel.querySelector("#urunSablon").onclick = () => { try { if (!window.XLSX) throw new Error("Excel kitaplığı yüklenemedi. Sayfayı yenileyip tekrar deneyin."); const basliklar = ["Ürün Kodu", "Barkod", "Ürün Adı", "Kategori", "Marka", "Model", "Birim", "KDV", "Alış Fiyatı", "Satış Fiyatı", "Bayi Fiyatı", "Perakende Fiyatı", "Para Birimi", "Minimum Stok", "Kritik Stok", "Görsel URL / Base64", "Uyumluluk", "Not"]; const ornek = ["URN-001", "869000000001", "Örnek Ürün", "Genel", "Örnek Marka", "Model A", "ADET", 20, 100, 150, 140, 160, "TRY", 5, 3, "", "Model A, Model B", "Örnek satırı silip kendi ürünlerinizi yazın."]; const ws = XLSX.utils.aoa_to_sheet([basliklar, ornek]); ws["!cols"] = basliklar.map((x, i) => ({ wch: [16, 18, 34, 22, 18, 18, 10, 10, 14, 14, 14, 17, 14, 15, 13, 30, 28, 36][i] })); const bilgi = XLSX.utils.aoa_to_sheet([["Kullanım"], ["Ürün Kodu veya Barkod mevcutsa ürün güncellenir; yoksa yeni ürün eklenir."], ["Para Birimi: TRY, USD veya EUR."], ["Trendyol ve IdeaSoft dosyaları doğrudan seçilebilir; tanınan kolonlar otomatik eşlenir."]]); bilgi["!cols"] = [{ wch: 95 }]; const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Ürünler"); XLSX.utils.book_append_sheet(wb, bilgi, "Açıklamalar"); XLSX.writeFile(wb, "benimmuhasebe-urun-yukleme-sablonu.xlsx", { bookType: "xlsx", compression: true }); } catch (error) { alert(error.message || "Ürün şablonu indirilemedi."); } };
        panel.querySelector("#urunSablon").onclick = () => { try { urunExcelSablonuIndir(); } catch (error) { alert(error.message || "Ürün şablonu indirilemedi."); } };
        panel.querySelector("#urunExcelDosya").onchange = async event => { const hedef = panel.querySelector("#urunExcelOnizleme"); try { if (!window.XLSX) throw new Error("Excel kitaplığı yüklenemedi. Sayfayı yenileyin."); const file = event.target.files[0]; if (!file) return; const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false }); const sheet = wb.Sheets[wb.SheetNames[0]]; if (!sheet) throw new Error("Dosyada okunabilir çalışma sayfası yok."); const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false, blankrows: false }); if (!rows.length) throw new Error("Dosyada ürün satırı bulunamadı."); const eslesmeler = Object.fromEntries(Object.keys(rows[0]).map(baslik => [baslik, urunExcelAlanBul(baslik)]).filter(([, alan]) => alan)); if (!Object.values(eslesmeler).includes("ad")) throw new Error("Ürün adı kolonu tanınamadı. Şablonu kullanın veya dosyanızdaki ürün adı başlığını kontrol edin."); const sayisal = new Set(["kdv", "alisFiyati", "satisFiyati", "bayiFiyati", "perakendeFiyati", "minimumStok", "kritikStok"]); const veriler = rows.map(row => { const urun = {}; for (const [baslik, alan] of Object.entries(eslesmeler)) { let value = row[baslik]; if (sayisal.has(alan)) value = urunExcelSayi(value); else if (alan === "paraBirimi") value = urunExcelParaBirimi(value); else value = String(value ?? "").trim(); if (value !== "") urun[alan] = value; } urun.kod = String(urun.kod || urun.barkod || "").trim().toUpperCase(); urun.barkod = String(urun.barkod || "").trim(); urun.paraBirimi = urunExcelParaBirimi(urun.paraBirimi); urun.uyumluluk = String(urun.uyumluluk || "").split(/[,;|]/).map(x => x.trim()).filter(Boolean); return urun; }).filter(x => x.kod || x.ad || x.barkod); const mevcutKod = new Set(urunV2Liste.map(x => String(x.kod || "").toUpperCase())), mevcutBarkod = new Set(urunV2Liste.map(x => String(x.barkod || "")).filter(Boolean)); const hatalar = veriler.map((x, i) => !x.kod || !x.ad ? `${i + 2}. satır: ürün kodu/barkod ve ürün adı zorunlu` : null).filter(Boolean); const guncellenecek = veriler.filter(x => mevcutKod.has(x.kod) || (x.barkod && mevcutBarkod.has(x.barkod))).length; hedef.innerHTML = `<p><b>${veriler.length}</b> satır okundu · <b>${Object.keys(eslesmeler).length}</b> kolon eşlendi · <b>${guncellenecek}</b> güncelleme · <b>${veriler.length - guncellenecek}</b> yeni ürün</p>${hatalar.length ? `<div class="error">${hatalar.slice(0, 20).map(escapeHtml).join("<br>")}</div>` : `<button id="urunExcelAktar" class="erp-primary-button">Ürünleri Ekle / Güncelle</button>`}<div class="table-scroll"><table><thead><tr><th>Satır</th><th>İşlem</th><th>Kod</th><th>Barkod</th><th>Ürün</th><th>Kategori</th><th>Satış</th></tr></thead><tbody>${veriler.slice(0, 100).map((x, i) => `<tr><td>${i + 2}</td><td>${mevcutKod.has(x.kod) || (x.barkod && mevcutBarkod.has(x.barkod)) ? "Güncelle" : "Yeni"}</td><td>${escapeHtml(x.kod)}</td><td>${escapeHtml(x.barkod)}</td><td>${escapeHtml(x.ad)}</td><td>${escapeHtml(x.kategori || "")}</td><td>${urunParasi(x.satisFiyati, x.paraBirimi)}</td></tr>`).join("")}</tbody></table></div>`; hedef.querySelector("#urunExcelAktar")?.addEventListener("click", async e => { e.currentTarget.disabled = true; e.currentTarget.textContent = "Ürünler işleniyor..."; try { const sonuc = await api("/api/tenant/urunler/toplu-aktar", { method: "POST", body: JSON.stringify({ urunler: veriler }) }); hedef.insertAdjacentHTML("afterbegin", `<div class="${sonuc.atlanan ? "error" : "success"}">${escapeHtml(sonuc.mesaj)}${sonuc.hatalar?.length ? `<br>${sonuc.hatalar.slice(0, 20).map(x => `${x.satir}. satır: ${escapeHtml(x.mesaj)}`).join("<br>")}` : ""}</div>`); if (!sonuc.atlanan) setTimeout(() => urunlerYukle(), 900); } catch (error) { hedef.insertAdjacentHTML("afterbegin", `<div class="error">${escapeHtml(error.message)}</div>`); e.currentTarget.disabled = false; e.currentTarget.textContent = "Tekrar Dene"; } }); } catch (error) { hedef.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
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

    function kullaniciSifreFormu(kullanici) {
        document.getElementById("kullaniciModal")?.remove(); const overlay = document.createElement("div"); overlay.id = "kullaniciModal"; overlay.className = "erp-modal-overlay";
        overlay.innerHTML = `<div class="erp-modal" style="max-width:560px"><div class="erp-modal-header"><div><h2>Yeni Parola Belirle</h2><p>${escapeHtml(kullanici.adSoyad)} için en az 8 karakter</p></div><button class="erp-modal-close">×</button></div><form><label>Yeni parola<input name="sifre" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label><label class="permission-toggle"><input name="geciciSifre" type="checkbox"><span>İlk girişte değiştirilmek üzere geçici parola</span></label><div id="kullaniciMesaj"></div><div class="erp-modal-footer"><button type="button" data-kapat class="erp-small-button">Vazgeç</button><button class="erp-primary-button">Parolayı Kaydet</button></div></form></div>`;
        document.body.appendChild(overlay); const kapat = () => overlay.remove(); overlay.querySelectorAll(".erp-modal-close,[data-kapat]").forEach(x => x.onclick = kapat); overlay.querySelector("form").onsubmit = async e => { e.preventDefault(); try { const f = e.currentTarget; const sonuc = await api(`/api/tenant/kullanicilar/${encodeURIComponent(kullanici.id)}/sifre`, { method: "POST", body: JSON.stringify({ sifre: f.elements.sifre.value, geciciSifre: f.elements.geciciSifre.checked }) }); overlay.querySelector("#kullaniciMesaj").innerHTML = `<div class="success">${escapeHtml(sonuc.mesaj)}</div>`; setTimeout(kapat, 650); } catch (error) { overlay.querySelector("#kullaniciMesaj").innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
    }

    function kullaniciFormu(data, mevcut = null) {
        document.getElementById("kullaniciModal")?.remove(); const aktifRol = String(data.aktifKullaniciRol || "").toUpperCase(), yonetici = mevcut && (mevcut.rol === "OWNER" || String(mevcut.id) === String(data.aktifKullaniciId) || (aktifRol === "ADMIN" && mevcut.rol === "ADMIN")), overlay = document.createElement("div"); overlay.id = "kullaniciModal"; overlay.className = "erp-modal-overlay";
        const rol = mevcut?.rol || "SALES", secili = new Set(mevcut?.etkinYetkiler || data.roller.find(x => x.kod === rol)?.varsayilanYetkiler || []), gruplar = [...new Set(data.yetkiKatalogu.map(x => x.grup))];
        overlay.innerHTML = `<div class="erp-modal" style="max-width:980px"><div class="erp-modal-header"><div><h2>${mevcut ? "Kullanıcı ve Yetkileri" : "Yeni Saha Kullanıcısı"}</h2><p>E-posta veya telefonla mobil giriş; yetkiler kutucuklarla anında uygulanır.</p></div><button class="erp-modal-close">×</button></div><form><div class="erp-form-grid"><label>Ad Soyad<input name="adSoyad" minlength="2" maxlength="100" required value="${escapeHtml(mevcut?.adSoyad || "")}"></label><label>Görev / Ünvan<input name="unvan" maxlength="100" value="${escapeHtml(mevcut?.unvan || "")}" placeholder="Saha Satış Elemanı"></label>${mevcut ? `<label>E-posta / Telefon<input disabled value="${escapeHtml(mevcut.email || mevcut.telefon || "-")}"></label>` : `<label>E-posta<input name="email" type="email" maxlength="254" placeholder="Telefon varsa isteğe bağlı"></label><label>Cep Telefonu<input name="telefon" type="tel" maxlength="30" placeholder="05xx xxx xx xx"></label><label>Başlangıç Parolası<input name="sifre" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label>`}<label>Rol<select name="rol" ${yonetici ? "disabled" : ""}>${data.roller.map(x => `<option value="${x.kod}" ${x.kod === rol ? "selected" : ""}>${escapeHtml(x.ad)}</option>`).join("")}${mevcut?.rol === "OWNER" ? '<option value="OWNER" selected>İşletme Sahibi</option>' : ""}</select></label>${mevcut ? `<label>Hesap Durumu<select name="aktif" ${yonetici ? "disabled" : ""}><option value="true" ${mevcut.aktif ? "selected" : ""}>Aktif</option><option value="false" ${!mevcut.aktif ? "selected" : ""}>Pasif — girişi engelle</option></select></label>` : ""}</div><div class="permission-section"><div class="panel-heading"><div><h3>Modül ve İşlem Yetkileri</h3><p>İşaretli kutulara izin verilir. Kritik yetkileri yalnızca gerektiğinde açın.</p></div>${!yonetici ? '<button type="button" id="rolYetkileriniUygula" class="erp-small-button">Rol Önerisini Uygula</button>' : ""}</div><div class="permission-grid">${gruplar.map(grup => `<fieldset><legend>${escapeHtml(grup)}</legend>${data.yetkiKatalogu.filter(x => x.grup === grup).map(x => `<label class="permission-toggle"><input type="checkbox" name="yetki" value="${x.kod}" ${secili.has(x.kod) ? "checked" : ""} ${yonetici ? "disabled" : ""}><span>${escapeHtml(x.ad)}</span></label>`).join("")}</fieldset>`).join("")}</div></div><div id="kullaniciMesaj"></div><div class="erp-modal-footer"><button type="button" data-kapat class="erp-small-button">Vazgeç</button><button class="erp-primary-button" ${yonetici ? "disabled" : ""}>${mevcut ? "Değişiklikleri Kaydet" : "Kullanıcıyı Oluştur"}</button></div></form></div>`;
        overlay.querySelector(".erp-modal")?.classList.add("user-permission-modal");
        document.body.appendChild(overlay); const form = overlay.querySelector("form"), kapat = () => overlay.remove(), rolUygula = () => { const r = data.roller.find(x => x.kod === form.elements.rol.value), izinler = new Set(r?.varsayilanYetkiler || []); form.querySelectorAll('[name="yetki"]').forEach(x => x.checked = izinler.has(x.value)); }; overlay.querySelectorAll(".erp-modal-close,[data-kapat]").forEach(x => x.onclick = kapat); overlay.querySelector("#rolYetkileriniUygula")?.addEventListener("click", rolUygula); if (!mevcut) form.elements.rol.onchange = rolUygula;
        form.onsubmit = async e => { e.preventDefault(); const f = e.currentTarget, body = { adSoyad: f.elements.adSoyad.value, unvan: f.elements.unvan.value, rol: f.elements.rol.value, ozelYetkiler: [...f.querySelectorAll('[name="yetki"]:checked')].map(x => x.value) }; if (mevcut) body.aktif = f.elements.aktif.value === "true"; else { body.email = f.elements.email.value; body.telefon = f.elements.telefon.value; body.sifre = f.elements.sifre.value; } try { const sonuc = await api(mevcut ? `/api/tenant/kullanicilar/${encodeURIComponent(mevcut.id)}` : "/api/tenant/kullanicilar", { method: mevcut ? "PATCH" : "POST", body: JSON.stringify(body) }); overlay.querySelector("#kullaniciMesaj").innerHTML = `<div class="success">${escapeHtml(sonuc.mesaj)}</div>`; setTimeout(() => { kapat(); kullanicilarYukle(); }, 650); } catch (error) { overlay.querySelector("#kullaniciMesaj").innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
    }

    async function kullanicilarYukle() {
        setTitle("Kullanıcılar ve Yetkiler"); loading("Kullanıcı güvenliği hazırlanıyor...");
        try {
            const data = await api("/api/tenant/kullanicilar"), kullanicilar = data.kullanicilar || [], aktif = kullanicilar.filter(x => x.aktif), saha = kullanicilar.filter(x => x.rol === "SALES");
            content.innerHTML = `<div class="welcome-banner"><div><div class="eyebrow">KULLANICI VE YETKİ MERKEZİ</div><h2>Mobil ekibinizi güvenle yönetin</h2><p>Çalışanlar e-posta veya telefonuyla giriş yapar; yalnızca işaretlediğiniz modül ve işlemleri kullanabilir.</p></div><button id="yeniKullanici" class="erp-primary-button">+ Yeni Kullanıcı</button></div><div class="dashboard-grid">${card("Toplam Kullanıcı", kullanicilar.length, "Firma hesapları")}${card("Aktif Kullanıcı", aktif.length, "Giriş yapabilir")}${card("Saha Satış", saha.length, "Mobil satış ekibi")}${card("Pasif Hesap", kullanicilar.length - aktif.length, "Erişimi kapalı")}</div><div class="dashboard-panel"><div class="panel-heading"><div><h2>Kullanıcılar</h2><p>Yetki ve durum değişiklikleri açık oturumlarda dahi anında geçerlidir.</p></div><input id="kullaniciAra" class="erp-input" placeholder="Ad, e-posta, telefon veya rol ara..."></div><div class="table-scroll"><table><thead><tr><th>Kullanıcı</th><th>Giriş Kimliği</th><th>Rol / Görev</th><th>Yetki</th><th>Durum</th><th>Son Giriş</th><th>İşlem</th></tr></thead><tbody>${kullanicilar.map(k => { const aktifRol = String(data.aktifKullaniciRol || "").toUpperCase(), kilitli = k.rol === "OWNER" || String(k.id) === String(data.aktifKullaniciId) || (aktifRol === "ADMIN" && k.rol === "ADMIN"); return `<tr data-kullanici-row><td><b>${escapeHtml(k.adSoyad)}</b><small>${escapeHtml(k.unvan || "-")}</small></td><td>${escapeHtml(k.email || k.telefon || "-")}<small>${k.email && k.telefon ? escapeHtml(k.telefon) : "Mobil / web giriş"}</small></td><td>${escapeHtml(k.rolEtiketi)}</td><td><b>${k.etkinYetkiler.length}</b><small>${k.yetkiModu === "OZEL" ? "Özel seçim" : "Rol varsayılanı"}</small></td><td><span class="durum-badge ${k.aktif ? "aktif" : "pasif"}">${k.aktif ? "Aktif" : "Pasif"}</span></td><td>${k.sonGirisTarihi ? new Date(k.sonGirisTarihi).toLocaleString("tr-TR") : "Henüz giriş yok"}</td><td><button class="erp-small-button" data-kullanici-duzenle="${k.id}" ${kilitli ? "disabled" : ""}>Yetkiler / Düzenle</button> <button class="erp-small-button" data-kullanici-sifre="${k.id}" ${kilitli ? "disabled" : ""}>Parola</button></td></tr>`; }).join("") || '<tr><td colspan="7">Kullanıcı bulunamadı.</td></tr>'}</tbody></table></div><div id="permissionMessage"></div></div>`;
            content.querySelector("#yeniKullanici").onclick = () => kullaniciFormu(data); content.querySelector("#kullaniciAra").oninput = e => { const q = e.target.value.toLocaleLowerCase("tr-TR"); content.querySelectorAll("[data-kullanici-row]").forEach(x => x.hidden = !x.textContent.toLocaleLowerCase("tr-TR").includes(q)); }; content.querySelectorAll("[data-kullanici-duzenle]").forEach(b => b.onclick = () => kullaniciFormu(data, kullanicilar.find(x => String(x.id) === b.dataset.kullaniciDuzenle))); content.querySelectorAll("[data-kullanici-sifre]").forEach(b => b.onclick = () => kullaniciSifreFormu(kullanicilar.find(x => String(x.id) === b.dataset.kullaniciSifre)));
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
            const guvenlik = () => { panel.innerHTML=`<div class="dashboard-grid">${card("Firma Veri Güvenliği","Aktif","Her işletmenin verileri ayrıdır")}${card("Gizli Anahtarlar","Güvenli","Hassas bilgiler korunur")}${card("Kişisel Şablon","Aktif","Kullanıcı bazında tasarım")}${card("Yedekleme",g.otomatikYedekleme!==false?"Açık":"Kapalı","Genel ayarlardan yönetilir")}</div><div class="dashboard-panel"><h2>Güvenlik Kontrolü</h2><p>Entegrasyon anahtarlarını düzenli yenileyin, yalnızca güvenli bağlantıları kullanın ve kritik işlemler için çift onayı etkinleştirin.</p></div>`; };
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

    async function satisMusteriSec(tur = "satis", baslangicKalemleri = [], secenekler = {}) {
        const data = await api("/api/tenant/musteriler");
        const musteriler = (data.musteriler || []).filter(x => x.aktif !== false);
        musteriModalKapat();
        const overlay = document.createElement("div"); overlay.id = "musteriIslemOverlay"; overlay.className = "erp-modal-overlay";
        overlay.innerHTML = `<div class="erp-modal sales-customer-picker"><div class="erp-modal-header"><div><h2>Müşteri Seç</h2><p>Satış işlemine başlamak için müşteri arayın.</p></div><button class="erp-modal-close">×</button></div><input id="salesCustomerSearch" class="erp-input" placeholder="Kod, ünvan, telefon veya vergi no ara..." autofocus><div class="sales-customer-list">${musteriler.map(m => `<button type="button" data-sales-customer="${m._id}"><span><b>${escapeHtml(m.unvan || m.adSoyad)}</b><small>${escapeHtml(m.kod)} · ${escapeHtml(m.telefon || m.whatsapp || "Telefon yok")}</small></span><span class="${Number(m.bakiye || 0) > 0 ? "sales-debt" : "sales-clear"}">${para(m.bakiye)}</span></button>`).join("") || '<div class="empty-state">Aktif müşteri bulunamadı.</div>'}</div><div class="erp-modal-footer"><button id="salesNewCustomer" class="erp-small-button">+ Yeni Müşteri</button></div></div>`;
        document.body.appendChild(overlay);
        overlay.querySelector(".erp-modal-close").onclick = musteriModalKapat;
        overlay.querySelector("#salesNewCustomer").onclick = () => { musteriModalKapat(); yeniMusteriPaneli(); };
        overlay.querySelector("#salesCustomerSearch").oninput = e => { const q = e.target.value.toLocaleLowerCase("tr-TR"); overlay.querySelectorAll("[data-sales-customer]").forEach(x => x.hidden = !x.textContent.toLocaleLowerCase("tr-TR").includes(q)); };
        overlay.querySelectorAll("[data-sales-customer]").forEach(btn => btn.onclick = () => { const m = musteriler.find(x => String(x._id) === btn.dataset.salesCustomer); musteriBelgeFormu(tur, m, null, baslangicKalemleri, secenekler).catch(error => alert(error.message)); });
    }

    async function satisPaneliYukle(donem = "BU_AY", baslangic = "", bitis = "") {
        setTitle("Satış Merkezi"); loading();
        try {
            const satisFiltre = new URLSearchParams({ donem }); if (baslangic) satisFiltre.set("baslangic", baslangic); if (bitis) satisFiltre.set("bitis", bitis);
            const [data, urunData, stokData, depoData] = await Promise.all([api(`/api/tenant/satis/panel?${satisFiltre}`), api("/api/tenant/urunler"), api("/api/tenant/stok"), api("/api/tenant/stok/depolar")]), p = data.panel || {}, secili = p.secili || p.ay || {};
            const son = p.sonSatislar || [], cokSatanlar = p.enCokSatanlar || [], temsilciler = p.temsilciler || [];
            const finansSecili = secili.finansHareketleri || [], depolar = (depoData.depolar || []).filter(x => x.aktif !== false), donemBaslik = `${secili.donem?.baslangic || ""} – ${secili.donem?.bitis || ""}`;
            const katalog = (urunData.urunler || []).filter(x => x.aktif !== false);
            const stokHaritasi = new Map();
            (stokData.stoklar || []).forEach(x => { const id = String(x.urunId?._id || x.urunId || ""); stokHaritasi.set(id, (stokHaritasi.get(id) || 0) + Number(x.miktar || 0)); });
            const durum = x => x === "ODENDI" ? '<span class="sales-status paid">Ödendi</span>' : x === "KISMI" ? '<span class="sales-status partial">Kısmi</span>' : '<span class="sales-status open">Açık</span>';
            content.innerHTML = `<div class="sales-hero"><div><div class="eyebrow">SATIŞ OPERASYON MERKEZİ</div><h2>Satışın her adımı tek ekranda</h2><p>Müşteri, stok, cari, tahsilat, teklif ve sipariş süreçlerini kesintisiz yönetin.</p></div><button id="salesNew" class="sales-primary-cta">+ Yeni Satış</button></div>
            <div class="sales-actions"><button id="salesQuick">⚡ Ürün Seç</button><button id="salesRetail">🏪 Perakende Satış</button><button data-sales-page="teklifler">📝 Yeni Teklif</button><button data-sales-page="siparisler">📦 Siparişler</button><button id="salesReturn">↩ Satış İadesi</button><button data-sales-page="musteriler">👥 Müşteriler</button><button data-sales-page="cari">₺ Cari / Tahsilat</button></div>
            <div class="dashboard-panel sales-date-filter"><div class="report-period-tabs" aria-label="Satış raporu dönemi">${[["BUGUN","Günlük"],["BU_HAFTA","Haftalık"],["BU_AY","Aylık"],["BU_YIL","Yıllık"],["OZEL","Özel Tarih"]].map(x=>`<button type="button" data-sales-period="${x[0]}" class="${donem===x[0]?"active":""}">${x[1]}</button>`).join("")}</div><div id="salesCustomDates" class="report-custom-date" ${donem === "OZEL" ? "" : "hidden"}><label>Başlangıç<input id="salesDateStart" type="date" value="${escapeHtml(baslangic)}"></label><label>Bitiş<input id="salesDateEnd" type="date" value="${escapeHtml(bitis)}"></label><button id="salesDateApply" class="erp-primary-button">Uygula</button></div><small>Seçili dönem: ${escapeHtml(donemBaslik)}</small></div>
            <section id="salesPos" class="sales-pos"><div class="sales-catalog"><div class="panel-heading"><div><h2>Ürün Seçimi</h2><p>Kod, barkod veya ürün adıyla arayın; miktarı yazıp sepete ekleyin.</p></div><div><button id="salesQuickProduct" type="button" class="erp-small-button">+ Yeni Ürün Aç</button><div class="sales-product-search-wrap"><input id="salesProductSearch" class="erp-input" placeholder="Ürün adı, kod veya barkod ara..." autocomplete="off"><small id="salesProductResultCount">${katalog.length} ürün gösteriliyor</small></div></div></div><div class="sales-channel-switch" role="group" aria-label="Satış türü"><button type="button" data-sales-mode="NORMAL" class="active">Müşterili Satış</button><button type="button" data-sales-mode="PERAKENDE">Perakende Satış</button><span id="salesModeInfo">Satış fiyatı ve müşteri seçimi kullanılır.</span></div><div class="sales-product-grid">${katalog.map(u => { const stok = stokHaritasi.get(String(u._id)) || 0, arama = [u.kod,u.barkod,u.ad,u.marka,u.model,u.kategori].filter(Boolean).join(" "), normalFiyat = Number(u.satisFiyati || 0), perakendeFiyat = Number(u.perakendeFiyati || u.satisFiyati || 0); return `<article class="sales-product-card" data-sales-product="${u._id}" data-sales-search="${escapeHtml(arama)}" data-normal-price="${normalFiyat}" data-retail-price="${perakendeFiyat}"><span>${escapeHtml(u.kod || "ÜRÜN")}${u.barkod ? ` · ${escapeHtml(u.barkod)}` : ""}</span><b>${escapeHtml(u.ad)}</b><small>${escapeHtml([u.marka,u.model].filter(Boolean).join(" · ") || u.birim || "ADET")} · Stok <strong>${stok}</strong> ${escapeHtml(u.birim || "ADET")}</small><strong class="sales-product-price">${para(normalFiyat)}</strong><div class="sales-product-add"><label>Miktar<input type="number" min="1" max="${Math.max(1,stok)}" step="1" value="1" inputmode="numeric" data-sales-quantity="${u._id}" ${stok <= 0 ? "disabled" : ""}></label><button type="button" data-sales-add="${u._id}" ${stok <= 0 ? "disabled" : ""}>${stok > 0 ? "Sepete Ekle" : "Stok Yok"}</button></div></article>`; }).join("") || '<div class="empty-state">Satışa uygun aktif ürün bulunamadı.</div>'}<div id="salesProductEmpty" class="empty-state" hidden>Aramanızla eşleşen ürün bulunamadı.</div></div></div><aside class="sales-cart"><div><span id="salesCartMode">MÜŞTERİLİ SATIŞ</span><h2>Satış Sepeti</h2></div><div id="salesCartItems" class="sales-cart-items"><div class="empty-state">Henüz ürün eklenmedi.</div></div><div class="sales-cart-total"><span>Sepet Toplamı</span><strong id="salesCartTotal">₺0,00</strong></div><button id="salesChooseCustomer" class="erp-primary-button" disabled>Müşteri Seç ve Satışa Başla</button><small id="salesCartHelp">Müşteri seçildikten sonra depo ve ödeme bilgilerini tamamlayabilirsiniz.</small></aside></section>
            <div class="sales-kpis"><article><span>Bugünkü Ciro</span><strong>${para(p.bugun?.ciro)}</strong><small>${Number(p.bugun?.belge || 0)} satış belgesi</small></article><article><span>Bugünkü Tahsilat</span><strong>${para(p.bugun?.tahsilat)}</strong><small>Tüm cari tahsilatlar</small></article><article><span>Bugünkü Ödeme</span><strong>${para(p.bugun?.odeme)}</strong><small>Tedarikçi ödemeleri</small></article><article><span>Seçili Dönem Net Ciro</span><strong>${para(secili.netCiro)}</strong><small>${para(secili.iade)} iade düşüldü</small></article><article class="warning"><span>Dönem Açık Satış Bakiyesi</span><strong>${para(p.acikBakiye)}</strong><small>Tahsilat bekleyen tutar</small></article><article><span>Satış Hunisi</span><strong>${Number(p.aktifTeklif || 0)} / ${Number(p.acikSiparis || 0)}</strong><small>Aktif teklif / açık sipariş</small></article></div>
            <section class="dashboard-panel"><div class="panel-heading"><div><h2>Seçili Dönem Tahsilat ve Ödemeleri</h2><p>${escapeHtml(donemBaslik)} · Cari, satış, saha, kasa ve banka hareketleri.</p></div></div><div class="table-scroll"><table><thead><tr><th>Tarih / Saat</th><th>İşlem</th><th>Cari</th><th>Yöntem</th><th>Açıklama / Belge</th><th>Tutar</th></tr></thead><tbody>${finansSecili.length ? finansSecili.map(x => `<tr><td>${new Date(x.tarih).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}</td><td><b>${x.tur === "TAHSILAT" ? "Tahsilat" : "Ödeme"}</b></td><td>${escapeHtml(x.taraf?.unvan || x.taraf?.adSoyad || x.taraf?.kod || "-")}</td><td>${escapeHtml(raporKodEtiketi(x.odemeYontemi || "-"))}</td><td>${escapeHtml(x.aciklama || x.belgeNo || "-")}</td><td><strong>${para(x.tutar)}</strong></td></tr>`).join("") : '<tr><td colspan="6">Seçilen dönemde tahsilat veya ödeme hareketi yok.</td></tr>'}</tbody></table></div></section>
            <div class="sales-layout"><section class="dashboard-panel sales-wide"><div class="panel-heading"><div><h2>Son Satışlar</h2><p>Belge, müşteri veya temsilci ile anında arayın.</p></div><input id="salesSearch" class="erp-input" placeholder="Satış ara..."></div><div class="table-scroll"><table><thead><tr><th>Tarih / Belge</th><th>Müşteri</th><th>Temsilci</th><th>Ödeme</th><th>Toplam</th><th>Kalan</th><th>İşlem</th></tr></thead><tbody>${son.map(s => `<tr data-sales-row="${s._id}" style="cursor:pointer"><td><b>${escapeHtml(s.belgeNo)}</b><small>${tarihKisa(s.tarih)}</small></td><td>${escapeHtml(s.musteriId?.unvan || s.musteriId?.adSoyad || "-")}<small>${escapeHtml(s.musteriId?.kod || "")}</small></td><td>${escapeHtml(s.kullaniciId?.adSoyad || s.kullaniciId?.email || "Atanmamış")}</td><td>${durum(s.odemeDurumu)}<small>${escapeHtml(s.odemeTipi || "")}</small></td><td><b>${para(s.genelToplam)}</b></td><td class="${Number(s.kalanTutar || 0) > 0 ? "sales-debt" : "sales-clear"}">${para(s.kalanTutar)}</td><td><button class="erp-small-button" data-sales-view="${s._id}">Görüntüle</button> ${Number(s.odenenTutar || 0) === 0 ? `<button class="erp-small-button" data-sales-edit="${s._id}">Düzenle</button> <button class="erp-small-button danger-button" data-sales-delete="${s._id}">Sil</button>` : `<button class="erp-small-button" data-sales-return-id="${s._id}">İade</button>`}</td></tr>`).join("") || '<tr><td colspan="7">Henüz satış yok.</td></tr>'}</tbody></table></div></section>
            <aside class="dashboard-panel"><h2>En Çok Satanlar</h2><div class="sales-ranking">${cokSatanlar.map((u, i) => `<div><span>${i + 1}</span><p><b>${escapeHtml(u.ad)}</b><small>${escapeHtml(u.kod)} · ${Number(u.miktar || 0)} adet</small></p><strong>${para(u.ciro)}</strong></div>`).join("") || '<div class="empty-state">Seçili dönemde veri yok.</div>'}</div></aside></div>
            <div class="sales-layout"><section class="dashboard-panel sales-wide"><div class="panel-heading"><div><h2>Satış Temsilcisi Performansı</h2><p>Seçili dönem ciro, tahsilat ve belge üretimi.</p></div></div><div class="sales-reps">${temsilciler.map((r, i) => `<article><div class="sales-rep-avatar">${escapeHtml(String(r.temsilci || "?").slice(0, 2).toUpperCase())}</div><div><b>${escapeHtml(r.temsilci)}</b><small>${Number(r.belge || 0)} belge · Tahsilat ${para(r.tahsilat)}</small></div><strong>${para(r.ciro)}</strong><span style="--score:${Math.max(8, 100 - i * 15)}%"></span></article>`).join("") || '<div class="empty-state">Temsilci satış verisi yok.</div>'}</div></section><aside class="dashboard-panel sales-summary"><h2>Dönem Özeti</h2><div><span>Brüt satış</span><b>${para(secili.ciro)}</b></div><div><span>İade</span><b>${para(secili.iade)}</b></div><div><span>Net satış</span><b>${para(secili.netCiro)}</b></div><div><span>Tahsilat</span><b>${para(secili.tahsilat)}</b></div><div><span>Belge</span><b>${Number(secili.belge || 0)}</b></div></aside></div>`;
            content.querySelectorAll("[data-sales-period]").forEach(button => button.onclick = () => {
                const yeniDonem = button.dataset.salesPeriod;
                if (yeniDonem === "OZEL") { content.querySelector("#salesCustomDates").hidden = false; return; }
                satisPaneliYukle(yeniDonem);
            });
            content.querySelector("#salesDateApply").onclick = () => {
                const ilk = content.querySelector("#salesDateStart").value, sonTarih = content.querySelector("#salesDateEnd").value;
                if (!ilk || !sonTarih) return alert("Özel rapor için başlangıç ve bitiş tarihini seçin.");
                if (sonTarih < ilk) return alert("Bitiş tarihi başlangıç tarihinden önce olamaz.");
                satisPaneliYukle("OZEL", ilk, sonTarih);
            };
            const sepet = new Map(); let satisModu = "NORMAL", satisHizliDepoId = "";
            const seciliFiyat = u => Number(satisModu === "PERAKENDE" ? (u.perakendeFiyati || u.satisFiyati || 0) : (u.satisFiyati || 0));
            const sepetCiz = () => { const satirlar = [...sepet.values()]; content.querySelector("#salesCartItems").innerHTML = satirlar.map(x => `<div class="sales-cart-row"><div><b>${escapeHtml(x.ad)}</b><small>${escapeHtml(x.kod)} · ${para(x.birimFiyat)}</small></div><div class="sales-cart-quantity"><button type="button" data-cart-minus="${x._id}">−</button><input type="number" min="1" max="${stokHaritasi.get(String(x._id)) || 1}" step="1" value="${x.miktar}" data-cart-quantity="${x._id}" aria-label="${escapeHtml(x.ad)} miktarı"><button type="button" data-cart-plus="${x._id}">+</button></div><button type="button" class="sales-cart-remove" data-cart-remove="${x._id}">×</button></div>`).join("") || '<div class="empty-state">Henüz ürün eklenmedi.</div>'; content.querySelector("#salesCartTotal").textContent = para(satirlar.reduce((n, x) => n + x.miktar * Number(x.birimFiyat || 0) * (1 + Number(x.kdv ?? 20) / 100), 0)); content.querySelector("#salesChooseCustomer").disabled = !satirlar.length; content.querySelectorAll("[data-cart-minus]").forEach(b => b.onclick = () => { const x = sepet.get(b.dataset.cartMinus); if (x.miktar <= 1) sepet.delete(b.dataset.cartMinus); else x.miktar--; sepetCiz(); }); content.querySelectorAll("[data-cart-plus]").forEach(b => b.onclick = () => { const x = sepet.get(b.dataset.cartPlus), stok = stokHaritasi.get(String(x._id)) || 0; if (x.miktar < stok) x.miktar++; sepetCiz(); }); content.querySelectorAll("[data-cart-quantity]").forEach(input => input.onchange = () => { const x = sepet.get(input.dataset.cartQuantity), stok = stokHaritasi.get(String(x._id)) || 0; x.miktar = Math.max(1, Math.min(stok, Math.floor(Number(input.value || 1)))); sepetCiz(); }); content.querySelectorAll("[data-cart-remove]").forEach(b => b.onclick = () => { sepet.delete(b.dataset.cartRemove); sepetCiz(); }); };
            const satisModuSec = mod => { satisModu = mod === "PERAKENDE" ? "PERAKENDE" : "NORMAL"; content.querySelectorAll("[data-sales-mode]").forEach(x => x.classList.toggle("active", x.dataset.salesMode === satisModu)); content.querySelector("#salesPos").classList.toggle("retail-mode", satisModu === "PERAKENDE"); content.querySelector("#salesCartMode").textContent = satisModu === "PERAKENDE" ? "PERAKENDE SATIŞ" : "MÜŞTERİLİ SATIŞ"; content.querySelector("#salesChooseCustomer").textContent = satisModu === "PERAKENDE" ? "Perakende Satışı Tamamla" : "Müşteri Seç ve Satışa Başla"; content.querySelector("#salesModeInfo").textContent = satisModu === "PERAKENDE" ? "Perakende fiyatı, müşteri seçmeden peşin tahsilat." : "Satış fiyatı ve müşteri seçimi kullanılır."; content.querySelector("#salesCartHelp").textContent = satisModu === "PERAKENDE" ? "Depo ve nakit/kart/banka hesabını seçerek satışı tamamlayın." : "Müşteri seçildikten sonra depo ve ödeme bilgilerini tamamlayabilirsiniz."; content.querySelectorAll("[data-sales-product]").forEach(kart => { const u = katalog.find(x => String(x._id) === kart.dataset.salesProduct); kart.querySelector(".sales-product-price").textContent = para(seciliFiyat(u)); }); for (const x of sepet.values()) x.birimFiyat = seciliFiyat(x); sepetCiz(); };
            const sepeteEkle = id => { const u = katalog.find(x => String(x._id) === String(id)), stok = stokHaritasi.get(String(id)) || 0, input = content.querySelector(`[data-sales-quantity="${CSS.escape(String(id))}"]`); if (!u || stok <= 0) return; const miktar = Math.max(1, Math.min(stok, Math.floor(Number(input?.value || 1)))), mevcut = sepet.get(String(id)); if (mevcut) mevcut.miktar = Math.min(stok, mevcut.miktar + miktar); else sepet.set(String(id), { ...u, miktar, birimFiyat: seciliFiyat(u) }); if (input) input.value = "1"; sepetCiz(); };
            content.querySelectorAll("[data-sales-add]").forEach(btn => btn.onclick = () => sepeteEkle(btn.dataset.salesAdd));
            content.querySelectorAll("[data-sales-quantity]").forEach(input => input.onkeydown = event => { if (event.key === "Enter") { event.preventDefault(); sepeteEkle(input.dataset.salesQuantity); } });
            const uruneGit = mod => { satisModuSec(mod); content.querySelector("#salesPos").scrollIntoView({ behavior: "smooth", block: "start" }); content.querySelector("#salesProductSearch").focus(); };
            content.querySelector("#salesNew").onclick = () => uruneGit("NORMAL");
            content.querySelector("#salesQuick").onclick = () => uruneGit("NORMAL");
            content.querySelector("#salesRetail").onclick = () => uruneGit("PERAKENDE");
            content.querySelectorAll("[data-sales-mode]").forEach(x => x.onclick = () => satisModuSec(x.dataset.salesMode));
            content.querySelector("#salesQuickProduct").onclick = () => hizliSatisUrunuAc({ depolar, depoId: satisHizliDepoId, onSaved: async sonuc => { const u = sonuc.urun; katalog.push(u); stokHaritasi.set(String(u._id), Number(sonuc.stok.miktar || 0)); satisHizliDepoId = String(sonuc.depo._id); sepet.set(String(u._id), { ...u, miktar: 1, birimFiyat: seciliFiyat(u) }); sepetCiz(); content.querySelector("#salesProductResultCount").textContent = `${katalog.length} ürün · yeni ürün sepete eklendi`; } }).catch(error => alert(error.message));
            content.querySelector("#salesChooseCustomer").onclick = () => { const kalemler = [...sepet.values()].map(x => ({ urunId: x._id, miktar: x.miktar, birimFiyat: Number(x.birimFiyat || 0), kdv: Number(x.kdv ?? 20), iskonto: satisModu === "PERAKENDE" ? 0 : Number(x.iskonto || 0) })); if (satisModu === "PERAKENDE") musteriBelgeFormu("satis", { kod: "PERAKENDE", unvan: "Perakende Müşteri", bakiye: 0 }, null, kalemler, { perakende: true, depoId: satisHizliDepoId }).catch(error => alert(error.message)); else satisMusteriSec("satis", kalemler, { depoId: satisHizliDepoId }); };
            const urunFiltrele = () => { const q = content.querySelector("#salesProductSearch").value.trim().toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, ""), kartlar = [...content.querySelectorAll("[data-sales-product]")]; let gorunen = 0; kartlar.forEach(x => { const metin = String(x.dataset.salesSearch || x.textContent).toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, ""); x.hidden = Boolean(q) && !metin.includes(q); if (!x.hidden) gorunen++; }); content.querySelector("#salesProductResultCount").textContent = `${gorunen} ürün gösteriliyor`; content.querySelector("#salesProductEmpty").hidden = gorunen > 0; };
            content.querySelector("#salesProductSearch").oninput = urunFiltrele;
            content.querySelector("#salesProductSearch").onsearch = urunFiltrele;
            content.querySelector("#salesProductSearch").onkeydown = event => { if (event.key !== "Enter") return; event.preventDefault(); const ilk = [...content.querySelectorAll("[data-sales-product]")].find(x => !x.hidden && !x.querySelector("[data-sales-add]")?.disabled); if (ilk) ilk.querySelector("[data-sales-quantity]")?.focus(); };
            content.querySelector("#salesReturn").onclick = () => satisMusteriSec("iade");
            content.querySelectorAll("[data-sales-page]").forEach(x => x.onclick = () => sayfaYukle(x.dataset.salesPage));
            content.querySelector("#salesSearch").oninput = e => { const q = e.target.value.toLocaleLowerCase("tr-TR"); content.querySelectorAll("[data-sales-row]").forEach(x => x.hidden = !x.textContent.toLocaleLowerCase("tr-TR").includes(q)); };
            content.querySelectorAll("[data-sales-row]").forEach(row => row.onclick = event => { if (event.target.closest("button")) return; const s = son.find(x => String(x._id) === row.dataset.salesRow); musteriBelgeMerkeziAc("SATIS", s, s.musteriId || {}).catch(error => alert(error.message)); });
            content.querySelectorAll("[data-sales-view]").forEach(btn => btn.onclick = () => { const s = son.find(x => String(x._id) === btn.dataset.salesView); musteriBelgeMerkeziAc("SATIS", s, s.musteriId || {}).catch(error => alert(error.message)); });
            content.querySelectorAll("[data-sales-edit]").forEach(btn => btn.onclick = () => { const s = son.find(x => String(x._id) === btn.dataset.salesEdit); musteriBelgeFormu("satis", s.musteriId || {}, s).catch(error => alert(error.message)); });
            content.querySelectorAll("[data-sales-delete]").forEach(btn => btn.onclick = async () => { const s = son.find(x => String(x._id) === btn.dataset.salesDelete); if (!confirm(`${s.belgeNo} numaralı satış silinsin mi? Stok ve cari bakiye geri alınacak.`)) return; try { const sonuc = await api(`/api/tenant/satis/${encodeURIComponent(s._id)}`, { method: "DELETE" }); alert(sonuc.mesaj); await satisPaneliYukle(); } catch (error) { alert(error.message); } });
            content.querySelectorAll("[data-sales-return-id]").forEach(btn => btn.onclick = () => { const s = son.find(x => String(x._id) === btn.dataset.salesReturnId); musteriBelgeFormu("iade", s.musteriId || {}, null, s.kalemler || [], { orijinalSatisId: s._id, saha: s.satisKanali === "SAHA", sahaGun: new Date(s.tarih).toISOString().slice(0, 10) }).catch(error => alert(error.message)); });
        } catch (error) { errorBox(error); }
    }

    function finansPara(value, paraBirimi = "TRY") {
        return new Intl.NumberFormat("tr-TR", { style: "currency", currency: ["TRY", "USD", "EUR"].includes(paraBirimi) ? paraBirimi : "TRY" }).format(Number(value || 0));
    }

    function finansHesapAdi(hesap) { return hesap?.ad || hesap?.bankaAdi || "Hesap"; }

    function finansEkstreExcel(ekstre) {
        if (!window.XLSX) return alert("Excel kitaplığı yüklenemedi.");
        const rows = [
            { Tarih: ekstre.tarih.baslangic, Belge: "DEVİR", Açıklama: "Devreden bakiye", Giriş: "", Çıkış: "", Bakiye: Number(ekstre.ozet.devredenBakiye || 0), Kaynak: "DEVIR" },
            ...(ekstre.hareketler || []).map(x => ({ Tarih: String(x.tarih || "").slice(0, 10), Belge: x.belgeNo || "", Açıklama: x.aciklama || "", Giriş: x.tip === "GIRIS" ? Number(x.tutar || 0) : "", Çıkış: x.tip === "CIKIS" ? Number(x.tutar || 0) : "", Bakiye: Number(x.yuruyenBakiye || 0), Kaynak: x.kaynak || "" }))
        ];
        const ws = XLSX.utils.json_to_sheet(rows); ws["!cols"] = [{ wch: 13 }, { wch: 18 }, { wch: 38 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Kasa Ekstresi");
        XLSX.writeFile(wb, `kasa-ekstresi-${ekstre.kasa.kod}-${ekstre.tarih.baslangic}-${ekstre.tarih.bitis}.xlsx`, { compression: true });
    }

    function finansEkstreYazdir(ekstre) {
        const pb = ekstre.kasa.paraBirimi || "TRY", ozet = ekstre.ozet;
        const rows = [[ekstre.tarih.baslangic, "DEVİR", "Devreden bakiye", "-", "-", finansPara(ozet.devredenBakiye, pb)], ...(ekstre.hareketler || []).map(x => [tarihKisa(x.tarih), x.belgeNo || "-", x.aciklama || "-", x.tip === "GIRIS" ? finansPara(x.tutar, pb) : "-", x.tip === "CIKIS" ? finansPara(x.tutar, pb) : "-", finansPara(x.yuruyenBakiye, pb)])];
        stokYazdir(`Kasa Ekstresi · ${ekstre.kasa.kod} · ${finansHesapAdi(ekstre.kasa)}`, rows, ["Tarih", "Belge", "Açıklama", "Giriş", "Çıkış", "Bakiye"], `${ekstre.tarih.baslangic} – ${ekstre.tarih.bitis} · Toplam giriş ${finansPara(ozet.toplamGiris, pb)} · Toplam çıkış ${finansPara(ozet.toplamCikis, pb)} · Kapanış ${finansPara(ozet.kapanisBakiyesi, pb)}`);
    }

    async function finansKasaEkstresiAc(data, kasaId) {
        const kasalar = (data.kasalar || []), varsayilanKasa = kasalar.find(x => String(x._id) === String(kasaId)) || kasalar[0];
        if (!varsayilanKasa) return alert("Ekstre alınabilecek bir kasa hesabı bulunmuyor.");
        document.getElementById("finansEkstreModal")?.remove();
        const simdi = new Date(), ilkGun = `${simdi.getFullYear()}-${String(simdi.getMonth() + 1).padStart(2, "0")}-01`, bugun = simdi.toISOString().slice(0, 10), overlay = document.createElement("div");
        overlay.id = "finansEkstreModal"; overlay.className = "erp-modal-overlay";
        overlay.innerHTML = `<div class="erp-modal" style="max-width:1100px"><div class="erp-modal-header"><div><h2>Kasa Ekstresi</h2><p>Devreden bakiye, tarih tarih giriş/çıkış ve yürüyen bakiye</p></div><button class="erp-modal-close">×</button></div><div class="erp-form-grid"><label>Kasa<select id="kasaEkstreHesap">${kasalar.map(x => `<option value="${x._id}" ${String(x._id) === String(varsayilanKasa._id) ? "selected" : ""}>${escapeHtml(x.kod)} · ${escapeHtml(x.ad)} · ${finansPara(x.bakiye, x.paraBirimi)}</option>`).join("")}</select></label><label>Başlangıç<input id="kasaEkstreBaslangic" type="date" value="${ilkGun}"></label><label>Bitiş<input id="kasaEkstreBitis" type="date" value="${bugun}"></label><div style="align-self:end"><button id="kasaEkstreGetir" class="erp-primary-button">Ekstreyi Getir</button></div></div><div id="kasaEkstreIcerik" style="margin-top:18px"></div><div class="erp-modal-footer"><button id="kasaEkstreExcel" class="erp-small-button" disabled>Excel</button><button id="kasaEkstrePdf" class="erp-primary-button" disabled>Yazdır / PDF</button><button data-kapat class="erp-small-button">Kapat</button></div></div>`;
        document.body.appendChild(overlay); let sonEkstre = null; const kapat = () => overlay.remove(); overlay.querySelectorAll(".erp-modal-close,[data-kapat]").forEach(x => x.onclick = kapat);
        const getir = async () => { const id = overlay.querySelector("#kasaEkstreHesap").value, baslangic = overlay.querySelector("#kasaEkstreBaslangic").value, bitis = overlay.querySelector("#kasaEkstreBitis").value, alan = overlay.querySelector("#kasaEkstreIcerik"); alan.innerHTML = '<div class="loading">Kasa ekstresi hazırlanıyor...</div>'; try { sonEkstre = await api(`/api/tenant/finans/kasalar/${encodeURIComponent(id)}/ekstre?baslangic=${encodeURIComponent(baslangic)}&bitis=${encodeURIComponent(bitis)}`); const pb = sonEkstre.kasa.paraBirimi || "TRY", o = sonEkstre.ozet; alan.innerHTML = `<div class="dashboard-grid">${card("Devreden Bakiye", finansPara(o.devredenBakiye, pb), baslangic)}${card("Toplam Giriş", finansPara(o.toplamGiris, pb), `${sonEkstre.toplam} hareket`)}${card("Toplam Çıkış", finansPara(o.toplamCikis, pb), `${sonEkstre.toplam} hareket`)}${card("Kapanış Bakiyesi", finansPara(o.kapanisBakiyesi, pb), bitis)}</div><div class="table-scroll"><table><thead><tr><th>Tarih</th><th>Belge</th><th>Açıklama</th><th>Kaynak</th><th>Giriş</th><th>Çıkış</th><th>Bakiye</th></tr></thead><tbody><tr><td>${baslangic}</td><td>DEVİR</td><td><b>Devreden bakiye</b></td><td>DEVIR</td><td>-</td><td>-</td><td><b>${finansPara(o.devredenBakiye, pb)}</b></td></tr>${(sonEkstre.hareketler || []).map(x => `<tr><td>${tarihKisa(x.tarih)}</td><td>${escapeHtml(x.belgeNo || "-")}</td><td>${escapeHtml(x.aciklama || "-")}</td><td>${escapeHtml(x.kaynak || "-")}</td><td class="sales-clear">${x.tip === "GIRIS" ? finansPara(x.tutar, pb) : "-"}</td><td class="sales-debt">${x.tip === "CIKIS" ? finansPara(x.tutar, pb) : "-"}</td><td><b>${finansPara(x.yuruyenBakiye, pb)}</b></td></tr>`).join("")}</tbody></table></div>`; overlay.querySelector("#kasaEkstreExcel").disabled = false; overlay.querySelector("#kasaEkstrePdf").disabled = false; } catch (error) { alan.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
        overlay.querySelector("#kasaEkstreGetir").onclick = getir; overlay.querySelector("#kasaEkstreExcel").onclick = () => sonEkstre && finansEkstreExcel(sonEkstre); overlay.querySelector("#kasaEkstrePdf").onclick = () => sonEkstre && finansEkstreYazdir(sonEkstre); await getir();
    }

    async function finansHesapFormu(tip, mevcut = null) {
        document.getElementById("finansModal")?.remove();
        const banka = tip === "BANKA", v = mevcut || {}, overlay = document.createElement("div"); overlay.id = "finansModal"; overlay.className = "erp-modal-overlay";
        overlay.innerHTML = `<div class="erp-modal"><div class="erp-modal-header"><div><h2>${mevcut ? "Hesabı Düzenle" : banka ? "Yeni Banka Hesabı" : "Yeni Kasa"}</h2><p>${mevcut ? "Hesap bilgileri ve kullanım durumu" : "Açılış bakiyesi işlem geçmişine otomatik kaydedilir."}</p></div><button class="erp-modal-close">×</button></div><form><div class="erp-form-grid"><label>Hesap Kodu<input name="kod" required maxlength="30" value="${escapeHtml(v.kod || "")}"></label><label>${banka ? "Banka Adı" : "Kasa Adı"}<input name="${banka ? "bankaAdi" : "ad"}" required value="${escapeHtml(finansHesapAdi(v) === "Hesap" ? "" : finansHesapAdi(v))}"></label>${banka ? `<label>Şube<input name="sube" value="${escapeHtml(v.sube || "")}"></label><label>Hesap No<input name="hesapNo" value="${escapeHtml(v.hesapNo || "")}"></label><label class="full">IBAN<input name="iban" value="${escapeHtml(v.iban || "")}" placeholder="TR..."></label>` : ""}<label>Para Birimi<select name="paraBirimi" ${mevcut && Number(v.bakiye || 0) !== 0 ? "disabled" : ""}>${[["TRY", "Türk Lirası"], ["USD", "Amerikan Doları"], ["EUR", "Euro"]].map(([kod, ad]) => `<option value="${kod}" ${(v.paraBirimi || "TRY") === kod ? "selected" : ""}>${ad}</option>`).join("")}</select></label>${mevcut ? `<label>Durum<select name="aktif"><option value="true" ${v.aktif !== false ? "selected" : ""}>Aktif</option><option value="false" ${v.aktif === false ? "selected" : ""}>Pasif</option></select></label>` : `<label>Açılış Bakiyesi<input name="bakiye" type="number" step="0.01" value="0"></label>`}<label class="full">Açıklama<textarea name="aciklama">${escapeHtml(v.aciklama || "")}</textarea></label></div><div id="finansMesaj"></div><div class="erp-modal-footer"><button type="button" class="erp-small-button" data-kapat>Vazgeç</button><button class="erp-primary-button">Kaydet</button></div></form></div>`;
        if (!banka) {
            overlay.querySelector('[name="ad"]').closest("label").insertAdjacentHTML("afterend", `<label>Kasa Türü<select name="kasaTuru"><option value="NAKIT" ${(v.kasaTuru || "NAKIT") === "NAKIT" ? "selected" : ""}>Nakit Kasa</option><option value="DIGER" ${v.kasaTuru === "DIGER" ? "selected" : ""}>Diğer Kasa</option></select></label><label>Şube / Konum<input name="sube" value="${escapeHtml(v.sube || "")}" placeholder="Merkez"></label><label>Kasa Sorumlusu<input name="sorumlu" value="${escapeHtml(v.sorumlu || "")}"></label>${mevcut ? "" : `<label>Açılış Tarihi<input name="acilisTarihi" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label>`}`);
        }
        document.body.appendChild(overlay); const kapat = () => overlay.remove(); overlay.querySelectorAll(".erp-modal-close,[data-kapat]").forEach(x => x.onclick = kapat);
        overlay.querySelector("form").onsubmit = async event => { event.preventDefault(); const mesaj = overlay.querySelector("#finansMesaj"); try { const body = Object.fromEntries(new FormData(event.currentTarget)); body.aktif = body.aktif !== "false"; if (!mevcut) body.bakiye = Number(body.bakiye || 0); const url = mevcut ? `/api/tenant/finans/hesaplar/${tip}/${mevcut._id}` : `/api/tenant/finans/${banka ? "bankalar" : "kasalar"}`; const sonuc = await api(url, { method: mevcut ? "PATCH" : "POST", body: JSON.stringify(body) }); mesaj.innerHTML = `<div class="success">${escapeHtml(sonuc.mesaj)}</div>`; setTimeout(() => { kapat(); finansYukle("hesaplar"); }, 450); } catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
    }

    function finansHareketFormu(data, varsayilan = {}) {
        const hesaplar = [...(data.kasalar || []).map(x => ({ ...x, tip: "KASA" })), ...(data.bankalar || []).map(x => ({ ...x, tip: "BANKA" }))].filter(x => x.aktif !== false);
        document.getElementById("finansModal")?.remove(); const overlay = document.createElement("div"); overlay.id = "finansModal"; overlay.className = "erp-modal-overlay";
        overlay.innerHTML = `<div class="erp-modal" style="max-width:680px"><div class="erp-modal-header"><div><h2>Para Girişi / Çıkışı</h2><p>Satış ve cari dışındaki nakit hareketlerini belge numarasıyla kaydedin.</p></div><button class="erp-modal-close">×</button></div><form><div class="erp-form-grid"><label>Hesap<select name="hesap" required><option value="">Hesap seçin</option>${hesaplar.map(x => `<option value="${x.tip}|${x._id}" ${String(x._id) === String(varsayilan.hesapId || "") ? "selected" : ""}>${x.tip === "KASA" ? "Kasa" : "Banka"} · ${escapeHtml(finansHesapAdi(x))} · ${finansPara(x.bakiye, x.paraBirimi)}</option>`).join("")}</select></label><label>İşlem<select name="tip"><option value="GIRIS">Para Girişi</option><option value="CIKIS">Para Çıkışı</option></select></label><label>Tutar<input name="tutar" type="number" min="0.01" step="0.01" required></label><label>Tarih<input name="tarih" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label><label>Belge / Fiş No<input name="belgeNo" value="NK-${Date.now()}"></label><label class="full">Açıklama<input name="aciklama" required placeholder="İşlemin nedeni"></label></div><div id="finansMesaj"></div><div class="erp-modal-footer"><button type="button" class="erp-small-button" data-kapat>Vazgeç</button><button class="erp-primary-button">İşlemi Kaydet</button></div></form></div>`;
        document.body.appendChild(overlay); const kapat = () => overlay.remove(); overlay.querySelectorAll(".erp-modal-close,[data-kapat]").forEach(x => x.onclick = kapat); overlay.querySelector("form").onsubmit = async event => { event.preventDefault(); const fd = new FormData(event.currentTarget), [hesapTipi, hesapId] = String(fd.get("hesap")).split("|"); try { const sonuc = await api("/api/tenant/finans/para-hareketleri", { method: "POST", body: JSON.stringify({ hesapTipi, hesapId, tip: fd.get("tip"), tutar: Number(fd.get("tutar")), tarih: fd.get("tarih"), belgeNo: fd.get("belgeNo"), aciklama: fd.get("aciklama") }) }); overlay.querySelector("#finansMesaj").innerHTML = `<div class="success">${escapeHtml(sonuc.mesaj)}</div>`; setTimeout(() => { kapat(); finansYukle("hareketler"); }, 450); } catch (error) { overlay.querySelector("#finansMesaj").innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
    }

    function finansTransferFormu(data) {
        const hesaplar = [...(data.kasalar || []).map(x => ({ ...x, tip: "KASA" })), ...(data.bankalar || []).map(x => ({ ...x, tip: "BANKA" }))].filter(x => x.aktif !== false);
        document.getElementById("finansModal")?.remove(); const overlay = document.createElement("div"); overlay.id = "finansModal"; overlay.className = "erp-modal-overlay"; const secenekler = hesaplar.map(x => `<option value="${x.tip}|${x._id}" data-currency="${x.paraBirimi || "TRY"}">${x.tip === "KASA" ? "Kasa" : "Banka"} · ${escapeHtml(finansHesapAdi(x))} · ${finansPara(x.bakiye, x.paraBirimi)}</option>`).join("");
        overlay.innerHTML = `<div class="erp-modal" style="max-width:680px"><div class="erp-modal-header"><div><h2>Hesaplar Arası Transfer</h2><p>Aynı para birimindeki kasa ve banka hesapları arasında aktarım yapın.</p></div><button class="erp-modal-close">×</button></div><form><div class="erp-form-grid"><label>Kaynak Hesap<select name="kaynak" required><option value="">Seçin</option>${secenekler}</select></label><label>Hedef Hesap<select name="hedef" required><option value="">Seçin</option>${secenekler}</select></label><label>Tutar<input name="tutar" type="number" min="0.01" step="0.01" required></label><label>Tarih<input name="tarih" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label><label>Transfer No<input name="belgeNo" value="TRF-${Date.now()}"></label><label class="full">Açıklama<input name="aciklama" value="Hesaplar arası transfer"></label></div><div id="finansMesaj"></div><div class="erp-modal-footer"><button type="button" class="erp-small-button" data-kapat>Vazgeç</button><button class="erp-primary-button">Transferi Tamamla</button></div></form></div>`;
        document.body.appendChild(overlay); const kapat = () => overlay.remove(); overlay.querySelectorAll(".erp-modal-close,[data-kapat]").forEach(x => x.onclick = kapat); overlay.querySelector("form").onsubmit = async event => { event.preventDefault(); const fd = new FormData(event.currentTarget), [kaynakHesapTipi, kaynakHesapId] = String(fd.get("kaynak")).split("|"), [hedefHesapTipi, hedefHesapId] = String(fd.get("hedef")).split("|"); try { const sonuc = await api("/api/tenant/finans/transfer", { method: "POST", body: JSON.stringify({ kaynakHesapTipi, kaynakHesapId, hedefHesapTipi, hedefHesapId, tutar: Number(fd.get("tutar")), tarih: fd.get("tarih"), belgeNo: fd.get("belgeNo"), aciklama: fd.get("aciklama") }) }); overlay.querySelector("#finansMesaj").innerHTML = `<div class="success">${escapeHtml(sonuc.mesaj)}</div>`; setTimeout(() => { kapat(); finansYukle("hareketler"); }, 450); } catch (error) { overlay.querySelector("#finansMesaj").innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
    }

    async function finansHareketGecmisiRender(panel, data, hesapMap) {
        const simdi = new Date(), ilkGun = `${simdi.getFullYear()}-${String(simdi.getMonth() + 1).padStart(2, "0")}-01`, bugun = simdi.toISOString().slice(0, 10);
        const hesaplar = [...(data.kasalar || []).map(x => ({ ...x, tip: "KASA" })), ...(data.bankalar || []).map(x => ({ ...x, tip: "BANKA" }))];
        panel.innerHTML = `<div class="dashboard-panel"><div class="panel-heading"><div><h2>Hareket Geçmişi</h2><p>Tarih, hesap ve işlem türüne göre tüm finans hareketlerini kontrol edin.</p></div></div><div class="erp-form-grid"><label>Başlangıç<input id="finansGecmisBaslangic" type="date" value="${ilkGun}"></label><label>Bitiş<input id="finansGecmisBitis" type="date" value="${bugun}"></label><label>Hesap<select id="finansGecmisHesap"><option value="">Tüm hesaplar</option>${hesaplar.map(x => `<option value="${x.tip}|${x._id}">${x.tip === "KASA" ? "Kasa" : "Banka"} · ${escapeHtml(finansHesapAdi(x))}</option>`).join("")}</select></label><label>İşlem Türü<select id="finansGecmisTip"><option value="">Tümü</option><option value="GIRIS">Para Girişi</option><option value="CIKIS">Para Çıkışı</option></select></label></div><div class="stock-hero-actions" style="margin:14px 0"><button id="finansGecmisGetir" class="erp-primary-button">Hareketleri Getir</button><button id="finansGecmisExcel">Excel</button><button id="finansGecmisPdf">Yazdır / PDF</button></div><div id="finansGecmisSonuc"></div></div>`;
        let sonRows = [];
        const getir = async () => { const baslangic = panel.querySelector("#finansGecmisBaslangic").value, bitis = panel.querySelector("#finansGecmisBitis").value, hesap = panel.querySelector("#finansGecmisHesap").value, tip = panel.querySelector("#finansGecmisTip").value, params = new URLSearchParams({ baslangic, bitis, limit: "500" }); if (hesap) { const [hesapTipi, hesapId] = hesap.split("|"); params.set("hesapTipi", hesapTipi); params.set("hesapId", hesapId); } if (tip) params.set("tip", tip); const alan = panel.querySelector("#finansGecmisSonuc"); alan.innerHTML = '<div class="loading">Hareketler getiriliyor...</div>'; try { const sonuc = await api(`/api/tenant/finans/para-hareketleri?${params}`); sonRows = sonuc.hareketler || []; const adi = x => finansHesapAdi(hesapMap.get(`${x.hesapTipi}|${x.hesapId}`)); alan.innerHTML = `<p><b>${sonuc.toplam}</b> kayıt bulundu${sonuc.toplam > sonuc.gosterilen ? `; son ${sonuc.gosterilen} kayıt gösteriliyor` : ""}.</p><div class="table-scroll"><table><thead><tr><th>Tarih</th><th>Hesap</th><th>Belge</th><th>Açıklama</th><th>Kaynak</th><th>Giriş</th><th>Çıkış</th><th>Kullanıcı</th></tr></thead><tbody>${sonRows.length ? sonRows.map(x => `<tr><td>${tarihKisa(x.tarih)}</td><td><b>${escapeHtml(adi(x))}</b><small>${escapeHtml(x.hesapTipi)}</small></td><td>${escapeHtml(x.belgeNo || "-")}</td><td>${escapeHtml(x.aciklama || "-")}</td><td>${escapeHtml(x.kaynak || "-")}</td><td class="sales-clear">${x.tip === "GIRIS" ? finansPara(x.tutar, x.paraBirimi) : "-"}</td><td class="sales-debt">${x.tip === "CIKIS" ? finansPara(x.tutar, x.paraBirimi) : "-"}</td><td>${escapeHtml(x.kullaniciId?.adSoyad || x.kullaniciId?.email || "Sistem")}</td></tr>`).join("") : '<tr><td colspan="8">Seçilen tarihlerde hareket bulunamadı.</td></tr>'}</tbody></table></div>`; } catch (error) { alan.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
        const islemleriBagla = () => panel.querySelectorAll("#finansGecmisSonuc tbody tr").forEach((row, index) => { const x = sonRows[index]; if (!x) return; const alan = row.lastElementChild; const detay = document.createElement("button"); detay.className = "erp-small-button"; detay.textContent = "Detay Gör"; detay.onclick = () => alert(`Para hareketi\nTarih: ${tarihKisa(x.tarih)}\nBelge: ${x.belgeNo || "-"}\nAçıklama: ${x.aciklama || "-"}\nTutar: ${finansPara(x.tutar, x.paraBirimi)}\nKaynak: ${x.kaynak || "-"}`); alan.append(" ", detay); if (x.kaynak === "MANUEL" && x.durum !== "IPTAL") { const iptal = document.createElement("button"); iptal.className = "erp-small-button"; iptal.textContent = "İptal Et"; iptal.onclick = async () => { const neden = prompt("Para hareketi iptal nedenini yazın:"); if (neden === null) return; if (!neden.trim()) return alert("İptal nedeni zorunludur."); try { await api(`/api/tenant/finans/para-hareketleri/${x._id}/iptal`, { method: "POST", body: JSON.stringify({ neden: neden.trim() }) }); await getir(); islemleriBagla(); } catch (error) { alert(error.message); } }; alan.append(" ", iptal); } });
        panel.querySelector("#finansGecmisGetir").onclick = async () => { await getir(); islemleriBagla(); };
        panel.querySelector("#finansGecmisPdf").onclick = () => stokYazdir("Finans Hareket Geçmişi", sonRows.map(x => [tarihKisa(x.tarih), finansHesapAdi(hesapMap.get(`${x.hesapTipi}|${x.hesapId}`)), x.belgeNo || "-", x.aciklama || "-", x.tip === "GIRIS" ? finansPara(x.tutar, x.paraBirimi) : "-", x.tip === "CIKIS" ? finansPara(x.tutar, x.paraBirimi) : "-"]), ["Tarih", "Hesap", "Belge", "Açıklama", "Giriş", "Çıkış"]);
        panel.querySelector("#finansGecmisExcel").onclick = () => { if (!window.XLSX) return alert("Excel kitaplığı yüklenemedi."); const ws = XLSX.utils.json_to_sheet(sonRows.map(x => ({ Tarih: String(x.tarih || "").slice(0, 10), Hesap: finansHesapAdi(hesapMap.get(`${x.hesapTipi}|${x.hesapId}`)), Belge: x.belgeNo || "", Açıklama: x.aciklama || "", Kaynak: x.kaynak || "", Tür: x.tip, Tutar: Number(x.tutar || 0), "Para Birimi": x.paraBirimi || "TRY" }))); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Hareket Geçmişi"); XLSX.writeFile(wb, `finans-hareket-gecmisi-${bugun}.xlsx`, { compression: true }); };
        await getir(); islemleriBagla();
    }

    async function finansGunlukKasaRender(panel, data) {
        const kasalar = (data.kasalar || []).filter(x => x.aktif !== false), simdi = new Date(), bugun = `${simdi.getFullYear()}-${String(simdi.getMonth() + 1).padStart(2, "0")}-${String(simdi.getDate()).padStart(2, "0")}`;
        panel.innerHTML = `<div class="dashboard-panel cash-daily-panel"><div class="panel-heading"><div><h2>Günlük Kasa Defteri</h2><p>Dünden devir, gün içi giriş-çıkış ve kapanış bakiyesini işlem bazında izleyin.</p></div></div><div class="cash-daily-filters"><label>Kasa<select id="gunlukKasaId"><option value="">Kasa seçin</option>${kasalar.map(x => `<option value="${x._id}">${escapeHtml(x.kod)} · ${escapeHtml(x.ad)} · ${finansPara(x.bakiye,x.paraBirimi)}</option>`).join("")}</select></label><label>Rapor Tarihi<input id="gunlukKasaTarih" type="date" value="${bugun}"></label><label>Dönem<select id="gunlukKasaDonem"><option value="GUNLUK">Günlük</option><option value="HAFTALIK">Haftalık</option><option value="AYLIK">Aylık</option></select></label><div class="cash-daily-buttons"><button id="gunlukKasaGetir" class="erp-primary-button">Raporu Getir</button><button id="gunlukKasaExcel" class="erp-small-button">Excel</button><button id="gunlukKasaPdf" class="erp-small-button">Yazdır / PDF</button></div></div><div id="gunlukKasaSonuc"><div class="empty-state">Günlük kasa raporu için bir kasa seçin.</div></div></div>`;
        let son = null;
        const hareketSatirlari = rows => `<div class="table-scroll"><table class="cash-daily-table"><thead><tr><th>Tarih / Saat</th><th>İşlem Türü</th><th>Açıklama</th><th>İlgili Cari / Personel</th><th>Belge / İşlem No</th><th>Giriş</th><th>Çıkış</th><th>İşlem Sonrası</th><th>İşlemi Yapan</th></tr></thead><tbody>${rows.length ? rows.map(x => `<tr><td><b>${new Date(x.tarih).toLocaleDateString("tr-TR")}</b><small>${new Date(x.tarih).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</small></td><td><span class="cash-type">${escapeHtml(x.islemTuru||x.kaynak||"Diğer")}</span></td><td>${escapeHtml(x.aciklama||"-")}</td><td>${escapeHtml([x.ilgiliKod,x.ilgiliAd].filter(Boolean).join(" · ")||"-")}<small>${escapeHtml(x.ilgiliTip||"")}</small></td><td>${escapeHtml(x.islemNo||"-")}</td><td class="sales-clear">${x.tip==="GIRIS"?finansPara(x.tutar,x.paraBirimi):"-"}</td><td class="sales-debt">${x.tip==="CIKIS"?finansPara(x.tutar,x.paraBirimi):"-"}</td><td><b>${finansPara(x.yuruyenBakiye,x.paraBirimi)}</b></td><td>${escapeHtml(x.kullaniciId?.adSoyad||x.kullaniciId?.email||"Sistem")}</td></tr>`).join(""):'<tr><td colspan="9">Seçilen dönemde kasa hareketi bulunmuyor.</td></tr>'}</tbody></table></div>`;
        const getir = async () => {
            const id = panel.querySelector("#gunlukKasaId").value, tarih = panel.querySelector("#gunlukKasaTarih").value, donem = panel.querySelector("#gunlukKasaDonem").value, alan = panel.querySelector("#gunlukKasaSonuc");
            if (!id) { alan.innerHTML = '<div class="error">Lütfen kasa seçin.</div>'; return; }
            alan.innerHTML = '<div class="dashboard-loading">Kasa defteri hesaplanıyor...</div>';
            try {
                son = await api(`/api/tenant/finans/kasalar/${encodeURIComponent(id)}/rapor?tarih=${encodeURIComponent(tarih)}&donem=${encodeURIComponent(donem)}`);
                const o = son.ozet || {}, kod = son.kasa?.paraBirimi || "TRY", gunluk = son.donem === "GUNLUK";
                alan.innerHTML = `<div class="dashboard-grid cash-daily-kpis">${card(gunluk ? "Dünden Devreden Bakiye" : "Dönemden Devreden Bakiye",finansPara(o.devredenBakiye,kod),son.tarih.baslangic)}${card("Toplam Giriş",finansPara(o.toplamGiris,kod),`${son.toplam} hareket`)}${card("Toplam Çıkış",finansPara(o.toplamCikis,kod),son.donem)}${card(gunluk ? "Gün Sonu Bakiye" : "Dönem Sonu Bakiye",finansPara(o.kapanisBakiyesi,kod),son.tarih.bitis)}</div>${!gunluk?`<div class="table-scroll cash-period-table"><table><thead><tr><th>Gün</th><th>Devreden</th><th>Giriş</th><th>Çıkış</th><th>Kapanış</th><th>Hareket</th></tr></thead><tbody>${(son.gunler||[]).map(g=>`<tr><td><b>${new Date(`${g.gun}T12:00:00`).toLocaleDateString("tr-TR")}</b></td><td>${finansPara(g.devredenBakiye,kod)}</td><td class="sales-clear">${finansPara(g.toplamGiris,kod)}</td><td class="sales-debt">${finansPara(g.toplamCikis,kod)}</td><td><b>${finansPara(g.kapanisBakiyesi,kod)}</b></td><td>${g.hareketSayisi}</td></tr>`).join("")}</tbody></table></div>`:""}<div class="cash-flow-example"><b>Kasa eşitliği</b><span>${finansPara(o.devredenBakiye,kod)} + ${finansPara(o.toplamGiris,kod)} − ${finansPara(o.toplamCikis,kod)} = <strong>${finansPara(o.kapanisBakiyesi,kod)}</strong></span></div>${hareketSatirlari(son.hareketler||[])}`;
            } catch (error) { alan.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; }
        };
        panel.querySelector("#gunlukKasaGetir").onclick = getir; panel.querySelector("#gunlukKasaId").onchange = getir; panel.querySelector("#gunlukKasaTarih").onchange = getir; panel.querySelector("#gunlukKasaDonem").onchange = getir;
        panel.querySelector("#gunlukKasaExcel").onclick = () => {
            if (!son) return alert("Önce kasa raporunu getirin."); if (!window.XLSX) return alert("Excel kitaplığı yüklenemedi.");
            const o = son.ozet || {}, wb = XLSX.utils.book_new();
            const ozet = XLSX.utils.json_to_sheet([{ Kasa: `${son.kasa.kod} · ${son.kasa.ad}`, Dönem: son.donem, Başlangıç: son.tarih.baslangic, Bitiş: son.tarih.bitis, "Devreden Bakiye": Number(o.devredenBakiye), "Toplam Giriş": Number(o.toplamGiris), "Toplam Çıkış": Number(o.toplamCikis), "Kapanış Bakiyesi": Number(o.kapanisBakiyesi), "Para Birimi": son.kasa.paraBirimi || "TRY" }]);
            const gunler = XLSX.utils.json_to_sheet((son.gunler || []).map(g => ({ Gün: g.gun, Devreden: Number(g.devredenBakiye), Giriş: Number(g.toplamGiris), Çıkış: Number(g.toplamCikis), Kapanış: Number(g.kapanisBakiyesi), "Hareket Sayısı": g.hareketSayisi })));
            const hareketler = XLSX.utils.json_to_sheet((son.hareketler || []).map(x => ({ "Tarih/Saat": new Date(x.tarih).toLocaleString("tr-TR"), "İşlem Türü": x.islemTuru, Açıklama: x.aciklama, İlgili: [x.ilgiliKod,x.ilgiliAd].filter(Boolean).join(" · "), "Belge/İşlem No": x.islemNo || "", Giriş: x.tip === "GIRIS" ? Number(x.tutar) : 0, Çıkış: x.tip === "CIKIS" ? Number(x.tutar) : 0, "İşlem Sonrası Bakiye": Number(x.yuruyenBakiye), Kullanıcı: x.kullaniciId?.adSoyad || "Sistem", "Para Birimi": x.paraBirimi || "TRY" })));
            XLSX.utils.book_append_sheet(wb, ozet, "Özet"); XLSX.utils.book_append_sheet(wb, gunler, "Günler"); XLSX.utils.book_append_sheet(wb, hareketler, "Kasa Hareketleri"); XLSX.writeFile(wb, `kasa-raporu-${son.kasa.kod}-${son.tarih.baslangic}-${son.tarih.bitis}.xlsx`, { compression: true });
        };
        panel.querySelector("#gunlukKasaPdf").onclick = () => { if(!son)return alert("Önce kasa raporunu getirin.");const o=son.ozet,kod=son.kasa.paraBirimi||"TRY";stokYazdir(`${son.kasa.ad} · Kasa Raporu`,(son.hareketler||[]).map(x=>[new Date(x.tarih).toLocaleString("tr-TR"),x.islemTuru,x.aciklama||"-",[x.ilgiliKod,x.ilgiliAd].filter(Boolean).join(" · ")||"-",x.islemNo||"-",x.tip==="GIRIS"?finansPara(x.tutar,kod):"-",x.tip==="CIKIS"?finansPara(x.tutar,kod):"-",finansPara(x.yuruyenBakiye,kod),x.kullaniciId?.adSoyad||"Sistem"]),["Tarih / Saat","İşlem Türü","Açıklama","İlgili","Belge","Giriş","Çıkış","Bakiye","Kullanıcı"],`Devir ${finansPara(o.devredenBakiye,kod)} · Giriş ${finansPara(o.toplamGiris,kod)} · Çıkış ${finansPara(o.toplamCikis,kod)} · Kapanış ${finansPara(o.kapanisBakiyesi,kod)}`); };
        if (kasalar.length) { panel.querySelector("#gunlukKasaId").value = kasalar[0]._id; await getir(); }
    }

    async function finansYukle(aktifSekme = "ozet") {
        setTitle("Kasa ve Bankalar"); loading("Finansal durum hazırlanıyor...");
        try {
            const data = await api("/api/tenant/finans/ozet"), hesaplar = [...(data.kasalar || []).map(x => ({ ...x, tip: "KASA" })), ...(data.bankalar || []).map(x => ({ ...x, tip: "BANKA" }))], hesapMap = new Map(hesaplar.map(x => [`${x.tip}|${x._id}`, x])), genel = data.toplamlar?.genel || { TRY: data.toplamNakit || 0, USD: 0, EUR: 0 }, ay = data.nakitAkisi?.ay || {};
            const hesapAdi = hareket => finansHesapAdi(hesapMap.get(`${hareket.hesapTipi}|${hareket.hesapId}`));
            queueMicrotask(() => {
                const sekmeler = content.querySelector(".stock-tabs"); if (!sekmeler || sekmeler.querySelector('[data-finans-tab="kasalar"]')) return;
                const buton = document.createElement("button"); buton.dataset.finansTab = "kasalar"; buton.textContent = "Kasalar";
                sekmeler.querySelector('[data-finans-tab="hesaplar"]')?.before(buton);
                buton.onclick = () => {
                    content.querySelectorAll("[data-finans-tab]").forEach(x => x.classList.toggle("active", x === buton));
                    const panel = content.querySelector("#finansAltPanel"), kasalar = data.kasalar || [];
                    const tablo = (baslik, aciklama, rows) => `<section class="dashboard-panel"><div class="panel-heading"><div><h2>${baslik}</h2><p>${aciklama}</p></div></div><div class="table-scroll"><table><thead><tr><th>Kod / Kasa</th><th>Şube / Sorumlu</th><th>Para Birimi</th><th>Açılış / Devreden</th><th>Güncel Bakiye</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>${rows.length ? rows.map(x => `<tr><td><b>${escapeHtml(x.kod)}</b><small>${escapeHtml(x.ad)}</small></td><td>${escapeHtml([x.sube, x.sorumlu].filter(Boolean).join(" · ") || "-")}</td><td>${escapeHtml(x.paraBirimi || "TRY")}</td><td>${finansPara(x.acilisBakiyesi || 0, x.paraBirimi)}<small>${x.acilisTarihi ? tarihKisa(x.acilisTarihi) : "Eski kayıt"}</small></td><td><b>${finansPara(x.bakiye, x.paraBirimi)}</b></td><td>${x.aktif === false ? "Pasif" : "Aktif"}</td><td><button class="erp-small-button" data-kasa-ekstre="${x._id}">Ekstre / PDF</button> <button class="erp-small-button" data-kasa-duzenle="${x._id}">Düzenle</button> <button class="erp-small-button" data-kasa-islem="${x._id}">İşlem</button></td></tr>`).join("") : '<tr><td colspan="7">Bu grupta kasa bulunmuyor.</td></tr>'}</tbody></table></div></section>`;
                    const nakit = kasalar.filter(x => (x.kasaTuru || "NAKIT") === "NAKIT"), diger = kasalar.filter(x => x.kasaTuru === "DIGER");
                    panel.innerHTML = `<div class="dashboard-grid">${card("Nakit Kasa", nakit.length, "Fiziksel nakit kasaları")}${card("Diğer Kasalar", diger.length, "Sanal ve özel amaçlı kasalar")}</div><div class="sales-layout"><div>${tablo("Nakit Kasalar", "Elde bulunan fiziksel nakit hesapları", nakit)}</div><div>${tablo("Diğer Kasalar", "Sanal, çek, pos veya özel amaçlı kasalar", diger)}</div></div>`;
                    panel.querySelectorAll("[data-kasa-duzenle]").forEach(x => x.onclick = () => finansHesapFormu("KASA", kasalar.find(k => String(k._id) === x.dataset.kasaDuzenle)));
                    panel.querySelectorAll("[data-kasa-islem]").forEach(x => x.onclick = () => finansHareketFormu(data, { hesapId: x.dataset.kasaIslem }));
                    panel.querySelectorAll("[data-kasa-ekstre]").forEach(x => x.onclick = () => finansKasaEkstresiAc(data, x.dataset.kasaEkstre));
                };
                if (aktifSekme === "kasalar") buton.click();
            });
            const hareketTablosu = rows => `<div class="table-scroll"><table><thead><tr><th>Tarih</th><th>Hesap</th><th>Belge</th><th>Açıklama</th><th>Kaynak</th><th>Giriş</th><th>Çıkış</th><th>İşlemi Yapan</th></tr></thead><tbody>${rows.length ? rows.map(x => `<tr data-finans-hareket><td>${tarihKisa(x.tarih)}</td><td><b>${escapeHtml(hesapAdi(x))}</b><small>${escapeHtml(x.hesapTipi)}</small></td><td>${escapeHtml(x.belgeNo || "-")}</td><td>${escapeHtml(x.aciklama || "-")}</td><td>${escapeHtml(x.kaynak || "-")}</td><td class="sales-clear">${x.tip === "GIRIS" ? finansPara(x.tutar, x.paraBirimi) : "-"}</td><td class="sales-debt">${x.tip === "CIKIS" ? finansPara(x.tutar, x.paraBirimi) : "-"}</td><td>${escapeHtml(x.kullaniciId?.adSoyad || x.kullaniciId?.email || "Sistem")}</td></tr>`).join("") : '<tr><td colspan="8">Henüz para hareketi yok.</td></tr>'}</tbody></table></div>`;
            content.innerHTML = `<div class="purchase-hero"><div><span>FİNANS YÖNETİMİ</span><h2>Kasa, banka ve nakit kontrolü</h2><p>Tüm hesap bakiyelerini, para akışını ve transferleri tek merkezden yönetin.</p></div><div class="stock-hero-actions"><button id="finansExcel">Excel Dökümü</button><button id="finansHareket">+ Para Girişi / Çıkışı</button><button id="finansTransfer">Hesaplar Arası Transfer</button><button id="finansYeniKasa">+ Yeni Kasa</button><button id="finansYeniBanka">+ Yeni Banka</button></div></div><div class="dashboard-grid">${card("Toplam Türk Lirası", finansPara(genel.TRY, "TRY"), "Kasa ve banka")}${card("Toplam Dolar", finansPara(genel.USD, "USD"), "USD hesapları")}${card("Toplam Euro", finansPara(genel.EUR, "EUR"), "EUR hesapları")}${card("Bu Ay Para Girişi", finansPara(ay.TRY?.giris || 0), "Transferler hariç")}${card("Bu Ay Para Çıkışı", finansPara(ay.TRY?.cikis || 0), "Transferler hariç")}</div><div class="stock-tabs">${[["ozet", "Genel Bakış"], ["gunluk", "Günlük Kasa"], ["hesaplar", "Kasa ve Bankalar"], ["hareketler", "Hareket Geçmişi"]].map(([k, ad]) => `<button data-finans-tab="${k}" class="${aktifSekme === k ? "active" : ""}">${ad}</button>`).join("")}</div><div id="finansAltPanel"></div>`;
            const panel = content.querySelector("#finansAltPanel"), hesaplarRender = () => { panel.innerHTML = `<div class="dashboard-panel"><div class="panel-heading"><div><h2>Hesaplar</h2><p>Pasif hesaplar yeni işlemlerde kullanılamaz; geçmiş hareketleri korunur.</p></div><input id="finansHesapAra" class="erp-input" placeholder="Hesap ara..."></div><div class="table-scroll"><table><thead><tr><th>Tür</th><th>Kod / Hesap</th><th>Şube / IBAN</th><th>Para Birimi</th><th>Bakiye</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>${hesaplar.map(x => `<tr data-finans-hesap><td>${x.tip === "KASA" ? "Kasa" : "Banka"}</td><td><b>${escapeHtml(x.kod)}</b><small>${escapeHtml(finansHesapAdi(x))}</small></td><td>${escapeHtml(x.tip === "BANKA" ? [x.sube, x.iban].filter(Boolean).join(" · ") || "-" : x.aciklama || "-")}</td><td>${escapeHtml(x.paraBirimi || "TRY")}</td><td><b>${finansPara(x.bakiye, x.paraBirimi)}</b></td><td>${x.aktif === false ? "Pasif" : "Aktif"}</td><td><button class="erp-small-button" data-finans-ekstre="${x.tip}|${x._id}">Ekstre</button> <button class="erp-small-button" data-finans-islem="${x.tip}|${x._id}">İşlem</button> <button class="erp-small-button" data-finans-duzenle="${x.tip}|${x._id}">Düzenle</button></td></tr>`).join("") || '<tr><td colspan="7">Henüz hesap yok.</td></tr>'}</tbody></table></div></div>`; panel.querySelector("#finansHesapAra").oninput = e => { const q = e.target.value.toLocaleLowerCase("tr-TR"); panel.querySelectorAll("[data-finans-hesap]").forEach(x => x.hidden = !x.textContent.toLocaleLowerCase("tr-TR").includes(q)); }; panel.querySelectorAll("[data-finans-duzenle]").forEach(b => b.onclick = () => { const [tip, id] = b.dataset.finansDuzenle.split("|"); finansHesapFormu(tip, hesapMap.get(`${tip}|${id}`)); }); panel.querySelectorAll("[data-finans-islem]").forEach(b => b.onclick = () => { const [, id] = b.dataset.finansIslem.split("|"); finansHareketFormu(data, { hesapId: id }); }); panel.querySelectorAll("[data-finans-ekstre]").forEach(b => b.onclick = () => { const [tip, id] = b.dataset.finansEkstre.split("|"); aktifSekme = "hareketler"; hareketlerRender((data.sonHareketler || []).filter(x => x.hesapTipi === tip && String(x.hesapId) === id), hesapMap.get(`${tip}|${id}`)); }); };
            const hareketlerRender = (rows = data.sonHareketler || [], hesap = null) => { panel.innerHTML = `<div class="dashboard-panel"><div class="panel-heading"><div><h2>${hesap ? `${escapeHtml(finansHesapAdi(hesap))} Ekstresi` : "Para Hareketleri"}</h2><p>${rows.length} son işlem; satış, alış, tahsilat, ödeme ve transfer kayıtları birlikte gösterilir.</p></div><input id="finansHareketAra" class="erp-input" placeholder="Belge, hesap veya açıklama ara..."></div>${hareketTablosu(rows)}</div>`; panel.querySelector("#finansHareketAra").oninput = e => { const q = e.target.value.toLocaleLowerCase("tr-TR"); panel.querySelectorAll("[data-finans-hareket]").forEach(x => x.hidden = !x.textContent.toLocaleLowerCase("tr-TR").includes(q)); }; };
            const ozetRender = () => { const aktif = hesaplar.filter(x => x.aktif !== false), kritik = aktif.filter(x => Number(x.bakiye || 0) < 0); panel.innerHTML = `<div class="sales-layout"><section class="dashboard-panel sales-wide"><div class="panel-heading"><div><h2>Son Para Hareketleri</h2><p>Nakit akışının en güncel kayıtları</p></div></div>${hareketTablosu((data.sonHareketler || []).slice(0, 12))}</section><aside class="dashboard-panel"><h2>Hesap Durumu</h2><div class="supplier-info"><div><b>Aktif Kasa</b><span>${(data.kasalar || []).filter(x => x.aktif !== false).length}</span></div><div><b>Aktif Banka</b><span>${(data.bankalar || []).filter(x => x.aktif !== false).length}</span></div><div><b>Pasif Hesap</b><span>${hesaplar.filter(x => x.aktif === false).length}</span></div><div><b>Negatif Bakiye</b><span>${kritik.length}</span></div></div></aside></div>`; };
            const sekmeAc = key => { content.querySelectorAll("[data-finans-tab]").forEach(x => x.classList.toggle("active", x.dataset.finansTab === key)); if (key === "gunluk") finansGunlukKasaRender(panel,data); else if (key === "hesaplar") hesaplarRender(); else if (key === "hareketler") finansHareketGecmisiRender(panel, data, hesapMap); else ozetRender(); }; content.querySelectorAll("[data-finans-tab]").forEach(x => x.onclick = () => sekmeAc(x.dataset.finansTab)); content.querySelector("#finansYeniKasa").onclick = () => finansHesapFormu("KASA"); content.querySelector("#finansYeniBanka").onclick = () => finansHesapFormu("BANKA"); content.querySelector("#finansHareket").onclick = () => finansHareketFormu(data); content.querySelector("#finansTransfer").onclick = () => finansTransferFormu(data); content.querySelector("#finansExcel").onclick = () => { if (!window.XLSX) return alert("Excel kitaplığı yüklenemedi."); const ws = XLSX.utils.json_to_sheet((data.sonHareketler || []).map(x => ({ Tarih: String(x.tarih || "").slice(0, 10), Hesap: hesapAdi(x), Tür: x.tip === "GIRIS" ? "Para Girişi" : "Para Çıkışı", "Belge No": x.belgeNo || "", Açıklama: x.aciklama || "", Kaynak: x.kaynak || "", Tutar: Number(x.tutar || 0), "Para Birimi": x.paraBirimi || "TRY", Kullanıcı: x.kullaniciId?.adSoyad || "Sistem" }))); ws["!cols"] = [{ wch: 13 }, { wch: 25 }, { wch: 15 }, { wch: 18 }, { wch: 35 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 22 }]; const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Para Hareketleri"); XLSX.writeFile(wb, `nakit-hareketleri-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true }); }; sekmeAc(aktifSekme);
        } catch (error) { errorBox(error); }
    }

    const masrafKategorileri = {
        KIRA: "Kira", ELEKTRIK: "Elektrik", SU: "Su", INTERNET: "İnternet", TELEFON: "Telefon", KARGO: "Kargo",
        AKARYAKIT: "Akaryakıt / Mazot", PERSONEL: "Personel", VERGI: "Vergi", SGK: "SGK", REKLAM: "Reklam",
        OFIS: "Ofis", YEMEK: "Yemek", SEYAHAT: "Seyahat", BAKIM: "Bakım / Onarım", TEMIZLIK: "Temizlik",
        SIGORTA: "Sigorta", PAZARYERI_KOMISYON: "Pazaryeri Komisyonu", PAZARYERI_HIZMET: "Pazaryeri Hizmet Bedeli", DIGER: "Diğer"
    };
    const masrafOrnekleri = [
        { baslik: "Mazot / Yakıt", kategori: "AKARYAKIT", aciklama: "Araç için mazot alımı", ikon: "⛽" },
        { baslik: "Elektrik Faturası", kategori: "ELEKTRIK", aciklama: "İş yeri elektrik faturası", ikon: "⚡" },
        { baslik: "Kargo", kategori: "KARGO", aciklama: "Kargo ve gönderi gideri", ikon: "📦" },
        { baslik: "Ofis Malzemesi", kategori: "OFIS", aciklama: "Ofis malzemesi alımı", ikon: "🗂️" },
        { baslik: "Yemek", kategori: "YEMEK", aciklama: "Personel yemek gideri", ikon: "🍽️" },
        { baslik: "Bakım / Onarım", kategori: "BAKIM", aciklama: "Bakım ve onarım gideri", ikon: "🛠️" },
        { baslik: "Kira", kategori: "KIRA", aciklama: "İş yeri kira ödemesi", ikon: "🏢" },
        { baslik: "Diğer", kategori: "DIGER", aciklama: "Diğer işletme gideri", ikon: "🧾" }
    ];

    async function masrafFisHazirla(file) {
        if (!file || !/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error("JPG, PNG veya WebP fiş fotoğrafı seçin.");
        const veriUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error("Fiş fotoğrafı okunamadı.")); reader.readAsDataURL(file); });
        const resim = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error("Fiş fotoğrafı açılamadı.")); img.src = veriUrl; });
        const max = 1400, oran = Math.min(1, max / Math.max(resim.width, resim.height)), canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(resim.width * oran)); canvas.height = Math.max(1, Math.round(resim.height * oran)); canvas.getContext("2d").drawImage(resim, 0, 0, canvas.width, canvas.height);
        const sonuc = canvas.toDataURL("image/jpeg", 0.76); if (sonuc.length > 2_800_000) throw new Error("Fiş fotoğrafı küçültüldükten sonra hâlâ çok büyük."); return sonuc;
    }

    function masrafFormAc(finans, ornek = {}) {
        document.getElementById("masrafModal")?.remove();
        const hesaplar = [...(finans.kasalar || []).map(x => ({ ...x, tip: "KASA", adGoster: x.ad })), ...(finans.bankalar || []).map(x => ({ ...x, tip: "BANKA", adGoster: x.bankaAdi }))].filter(x => x.aktif !== false);
        const overlay = document.createElement("div"); overlay.id = "masrafModal"; overlay.className = "erp-modal-overlay";
        overlay.innerHTML = `<div class="erp-modal" style="max-width:900px"><div class="erp-modal-header"><div><h2>Yeni Masraf Kaydı</h2><p>Gideri ödeme hesabıyla ve fiş fotoğrafıyla birlikte kaydedin.</p></div><button class="erp-modal-close">×</button></div><form><div class="erp-form-grid"><label>Masraf Türü<select name="kategori">${Object.entries(masrafKategorileri).map(([kod, ad]) => `<option value="${kod}" ${ornek.kategori === kod ? "selected" : ""}>${ad}</option>`).join("")}</select></label><label>Tarih<input name="tarih" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label><label class="full">Açıklama<input name="aciklama" value="${escapeHtml(ornek.aciklama || "")}" required placeholder="Örn. Araç için mazot alımı"></label><label>Firma / İşyeri<input name="firma" placeholder="Akaryakıt istasyonu veya satıcı"></label><label>Fiş / Fatura No<input name="fisNo"></label><label>Tutar<input name="tutar" type="number" min="0.01" step="0.01" required></label><label>KDV Oranı<select name="kdvOrani"><option value="0">KDV Yok / Belirsiz</option><option value="1">%1</option><option value="10">%10</option><option value="20">%20</option></select></label><label>Ödeme Hesabı<select name="hesap" required><option value="">Kasa veya banka seçin</option>${hesaplar.map(x => `<option value="${x.tip}|${x._id}">${x.tip === "KASA" ? ((x.kasaTuru || "NAKIT") === "NAKIT" ? "Nakit Kasa" : "Diğer Kasa") : "Banka"} · ${escapeHtml(x.adGoster)} · ${finansPara(x.bakiye, x.paraBirimi)}</option>`).join("")}</select></label><label>Araç Plakası<input name="aracPlaka" placeholder="Akaryakıt giderleri için"></label><label class="full">Notlar<textarea name="notlar" placeholder="Masrafla ilgili ek açıklama"></textarea></label><div class="full product-photo-editor"><div id="masrafFisOnizleme" class="product-photo"><span>🧾</span></div><label class="erp-primary-button" style="cursor:pointer">Telefonla Fiş Çek / Galeriden Seç<input name="fisDosyasi" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden></label><small>Fotoğraf güvenli biçimde küçültülerek masraf kaydına eklenir.</small></div></div><div id="masrafMesaj"></div><div class="erp-modal-footer"><button type="button" class="erp-small-button" data-kapat>Vazgeç</button><button class="erp-primary-button">Masrafı Kaydet</button></div></form></div>`;
        document.body.appendChild(overlay); const kapat = () => overlay.remove(); overlay.querySelectorAll(".erp-modal-close,[data-kapat]").forEach(x => x.onclick = kapat);
        let fisGorseli = ""; overlay.querySelector('[name="fisDosyasi"]').onchange = async event => { const mesaj = overlay.querySelector("#masrafMesaj"); try { fisGorseli = await masrafFisHazirla(event.target.files[0]); overlay.querySelector("#masrafFisOnizleme").innerHTML = `<img src="${fisGorseli}" alt="Fiş önizleme">`; mesaj.innerHTML = '<div class="success">Fiş fotoğrafı hazır.</div>'; } catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
        overlay.querySelector("form").onsubmit = async event => { event.preventDefault(); const mesaj = overlay.querySelector("#masrafMesaj"), fd = new FormData(event.currentTarget), [hesapTipi, hesapId] = String(fd.get("hesap")).split("|"); try { const sonuc = await api("/api/tenant/masraflar", { method: "POST", body: JSON.stringify({ kategori: fd.get("kategori"), tarih: fd.get("tarih"), aciklama: fd.get("aciklama"), firma: fd.get("firma"), fisNo: fd.get("fisNo"), tutar: Number(fd.get("tutar")), kdvOrani: Number(fd.get("kdvOrani")), hesapTipi, hesapId, aracPlaka: fd.get("aracPlaka"), notlar: fd.get("notlar"), fisGorseli }) }); mesaj.innerHTML = `<div class="success">${escapeHtml(sonuc.mesaj)}</div>`; setTimeout(() => { kapat(); masraflarYukle(); }, 500); } catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
    }

    function masrafDetayAc(masraf, hesapAdi) {
        document.getElementById("masrafModal")?.remove(); const overlay = document.createElement("div"); overlay.id = "masrafModal"; overlay.className = "erp-modal-overlay";
        overlay.innerHTML = `<div class="erp-modal" style="max-width:850px"><div class="erp-modal-header"><div><h2>${escapeHtml(masraf.aciklama)}</h2><p>${tarihKisa(masraf.tarih)} · ${escapeHtml(masrafKategorileri[masraf.kategori] || masraf.kategori)}</p></div><button class="erp-modal-close">×</button></div><div class="sales-layout"><section class="dashboard-panel"><div class="supplier-info"><div><b>Tutar</b><span>${finansPara(masraf.tutar, masraf.paraBirimi)}</span></div><div><b>Ödeme Hesabı</b><span>${escapeHtml(hesapAdi)}</span></div><div><b>Firma</b><span>${escapeHtml(masraf.firma || "-")}</span></div><div><b>Fiş No</b><span>${escapeHtml(masraf.fisNo || "-")}</span></div><div><b>KDV</b><span>%${Number(masraf.kdvOrani || 0)} · ${finansPara(masraf.kdvTutari, masraf.paraBirimi)}</span></div><div><b>Plaka</b><span>${escapeHtml(masraf.aracPlaka || "-")}</span></div><div><b>Kaydeden</b><span>${escapeHtml(masraf.kullaniciId?.adSoyad || masraf.kullaniciId?.email || "Sistem")}</span></div><div><b>Durum</b><span>${masraf.durum === "IPTAL" ? "İptal" : "Aktif"}</span></div></div><p>${escapeHtml(masraf.notlar || "")}</p></section><aside class="dashboard-panel"><h3>Fiş / Fatura Görseli</h3>${masraf.fisGorseli ? `<a href="${masraf.fisGorseli}" target="_blank" rel="noopener"><img src="${masraf.fisGorseli}" alt="Fiş" style="width:100%;max-height:480px;object-fit:contain;border-radius:12px"></a>` : '<div class="empty-state">Fiş fotoğrafı eklenmemiş.</div>'}</aside></div>${masraf.durum === "IPTAL" ? `<div class="error">İptal nedeni: ${escapeHtml(masraf.iptalNedeni || "-")}</div>` : ""}<div id="masrafDetayMesaj"></div><div class="erp-modal-footer">${masraf.durum !== "IPTAL" ? '<button class="erp-small-button" id="masrafIptal">Masrafı İptal Et</button>' : ""}<button class="erp-primary-button" data-kapat>Kapat</button></div></div>`;
        document.body.appendChild(overlay); const kapat = () => overlay.remove(); overlay.querySelectorAll(".erp-modal-close,[data-kapat]").forEach(x => x.onclick = kapat);
        if (masraf.durum !== "IPTAL") { const duzenle = document.createElement("button"); duzenle.className = "erp-small-button"; duzenle.textContent = "Düzenle"; overlay.querySelector("#masrafIptal")?.before(duzenle); duzenle.onclick = async () => { const deger = prompt("Yeni masraf tutarını yazın:", Number(masraf.tutar || 0).toFixed(2)); if (deger === null) return; const tutar = Number(String(deger).replace(",", ".")); if (!(tutar > 0)) return alert("Geçerli pozitif tutar yazın."); try { const sonuc = await api(`/api/tenant/masraflar/${masraf._id}`, { method: "PATCH", body: JSON.stringify({ tutar }) }); alert(sonuc.mesaj); kapat(); await masraflarYukle(); } catch (error) { overlay.querySelector("#masrafDetayMesaj").innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } }; }
        overlay.querySelector("#masrafIptal")?.addEventListener("click", async () => { const neden = prompt("İptal nedenini yazın:", "Hatalı masraf kaydı"); if (neden === null) return; try { const sonuc = await api(`/api/tenant/masraflar/${masraf._id}/iptal`, { method: "POST", body: JSON.stringify({ neden }) }); alert(sonuc.mesaj); kapat(); await masraflarYukle(); } catch (error) { overlay.querySelector("#masrafDetayMesaj").innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } });
    }

    async function masraflarYukle(donem = "BU_AY", ozelBaslangic = "", ozelBitis = "") {
        setTitle("Masraflar"); loading("Masraf kayıtları hazırlanıyor...");
        try {
            const aralik = raporDonemTarihleri(donem, ozelBaslangic, ozelBitis), sorgu = new URLSearchParams({ limit: "500", baslangic: aralik.baslangic, bitis: aralik.bitis });
            const [liste, ozet, finans] = await Promise.all([api(`/api/tenant/masraflar?${sorgu}`), api("/api/tenant/masraflar/ozet"), api("/api/tenant/finans/ozet")]);
            const masraflar = liste.masraflar || [], hesapMap = new Map([...(finans.kasalar || []).map(x => [`KASA|${x._id}`, x.ad]), ...(finans.bankalar || []).map(x => [`BANKA|${x._id}`, x.bankaAdi])]);
            const hesapAdi = x => hesapMap.get(`${x.hesapTipi}|${x.hesapId}`) || (x.hesapTipi === "KASA" ? "Kasa" : "Banka");
            const donemToplami = masraflar.filter(x => x.durum !== "IPTAL" && (x.paraBirimi || "TRY") === "TRY").reduce((n, x) => n + Number(x.tutar || 0), 0);
            content.innerHTML = `<div class="purchase-hero"><div><span>MASRAF YÖNETİMİ</span><h2>Giderleri fişleriyle birlikte yönetin</h2><p>Masrafı kaydedin, telefonla fişini çekin ve ödemenin hangi hesaptan yapıldığını takip edin.</p></div><div class="stock-hero-actions"><button id="masrafExcel">Excel Dökümü</button><button id="masrafYeni">+ Yeni Masraf</button></div></div><div class="dashboard-grid">${card("Bugünkü Masraf", finansPara(ozet.bugunToplamlari?.TRY || 0), "Aktif kayıtlar")}${card("Bu Ay Masraf", finansPara(ozet.ayToplamlari?.TRY || 0), "Aylık toplam")}${card("Seçili Dönem Masraf", finansPara(donemToplami), `${aralik.baslangic} – ${aralik.bitis}`)}${card("Fişli Kayıt", masraflar.filter(x => x.fisGorseli).length, "Seçili dönemde")}</div><div class="dashboard-panel"><div class="panel-heading"><div><h2>Masraf Örnekleri</h2><p>Sık kullanılan giderlerden birini seçerek formu hazır açın.</p></div></div><div class="dashboard-grid">${masrafOrnekleri.map((x, i) => `<button class="dashboard-action" data-masraf-ornek="${i}"><span>${x.ikon}</span><b>${x.baslik}</b><small>${masrafKategorileri[x.kategori]}</small></button>`).join("")}</div></div><div class="dashboard-panel"><div class="panel-heading"><div><h2>Masraf Kayıtları</h2><p>${masraflar.length} kayıt · ${aralik.baslangic} – ${aralik.bitis}</p></div></div><div class="stock-filterbar"><input id="masrafAra" class="erp-input" placeholder="Firma, fiş no, açıklama veya plaka ara..."><select id="masrafKategori"><option value="">Tüm kategoriler</option>${Object.entries(masrafKategorileri).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select><select id="masrafDurum"><option value="">Tüm durumlar</option><option value="AKTIF">Aktif</option><option value="IPTAL">İptal</option></select><select id="masrafDonem">${raporDonemSecenekleri(donem)}</select><input id="masrafBaslangic" type="date" value="${aralik.baslangic}"><input id="masrafBitis" type="date" value="${aralik.bitis}"></div><div class="table-scroll"><table><thead><tr><th>Tarih</th><th>Masraf</th><th>Firma / Fiş</th><th>Hesap</th><th>Belge</th><th>Tutar</th><th>Durum</th></tr></thead><tbody id="masrafListe">${masraflar.length ? masraflar.map((x, i) => `<tr data-masraf-index="${i}" data-kategori="${x.kategori}" data-durum="${x.durum || "AKTIF"}" style="cursor:pointer"><td>${tarihKisa(x.tarih)}</td><td><b>${escapeHtml(x.aciklama)}</b><small>${escapeHtml(masrafKategorileri[x.kategori] || x.kategori)}</small></td><td>${escapeHtml(x.firma || "-")}<small>${escapeHtml(x.fisNo || "-")}</small></td><td>${escapeHtml(hesapAdi(x))}</td><td>${x.fisGorseli ? "📷 Fiş Var" : "-"}</td><td><b>${finansPara(x.tutar, x.paraBirimi)}</b></td><td>${x.durum === "IPTAL" ? "İptal" : "Aktif"}</td></tr>`).join("") : '<tr><td colspan="7">Seçili dönemde masraf kaydı yok.</td></tr>'}</tbody></table></div></div>`;
            content.querySelector("#masrafYeni").onclick = () => masrafFormAc(finans); content.querySelectorAll("[data-masraf-ornek]").forEach(x => x.onclick = () => masrafFormAc(finans, masrafOrnekleri[Number(x.dataset.masrafOrnek)]));
            content.querySelectorAll("[data-masraf-index]").forEach(x => x.onclick = () => masrafDetayAc(masraflar[Number(x.dataset.masrafIndex)], hesapAdi(masraflar[Number(x.dataset.masrafIndex)])));
            const filtrele = () => { const q = content.querySelector("#masrafAra").value.toLocaleLowerCase("tr-TR"), kategori = content.querySelector("#masrafKategori").value, durum = content.querySelector("#masrafDurum").value; content.querySelectorAll("[data-masraf-index]").forEach(x => x.hidden = (q && !x.textContent.toLocaleLowerCase("tr-TR").includes(q)) || (kategori && x.dataset.kategori !== kategori) || (durum && x.dataset.durum !== durum)); }; content.querySelector("#masrafAra").oninput = filtrele; content.querySelector("#masrafKategori").onchange = filtrele; content.querySelector("#masrafDurum").onchange = filtrele;
            content.querySelector("#masrafDonem").onchange = event => { const secili = raporDonemTarihleri(event.target.value, content.querySelector("#masrafBaslangic").value, content.querySelector("#masrafBitis").value); masraflarYukle(event.target.value, secili.baslangic, secili.bitis); };
            content.querySelector("#masrafBaslangic").onchange = () => masraflarYukle("OZEL", content.querySelector("#masrafBaslangic").value, content.querySelector("#masrafBitis").value);
            content.querySelector("#masrafBitis").onchange = () => masraflarYukle("OZEL", content.querySelector("#masrafBaslangic").value, content.querySelector("#masrafBitis").value);
            content.querySelector("#masrafExcel").onclick = () => { if (!window.XLSX) return alert("Excel kitaplığı yüklenemedi."); const ws = XLSX.utils.json_to_sheet(masraflar.map(x => ({ Tarih: String(x.tarih || "").slice(0, 10), Kategori: masrafKategorileri[x.kategori] || x.kategori, Açıklama: x.aciklama, Firma: x.firma || "", "Fiş No": x.fisNo || "", Hesap: hesapAdi(x), Tutar: Number(x.tutar || 0), "Para Birimi": x.paraBirimi || "TRY", "KDV Oranı": Number(x.kdvOrani || 0), "KDV Tutarı": Number(x.kdvTutari || 0), Plaka: x.aracPlaka || "", Durum: x.durum || "AKTIF", "Fiş Görseli": x.fisGorseli ? "Var" : "Yok" }))); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Masraflar"); XLSX.writeFile(wb, `masraflar-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true }); };
        } catch (error) { errorBox(error); }
    }

    async function musteriSecerekBelgeAc(tur) {
        const data = await api("/api/tenant/musteriler");
        const musteriler = (data.musteriler || []).filter(x => x.aktif !== false);
        if (!musteriler.length) throw new Error("Önce aktif bir müşteri oluşturun.");
        const overlay = document.createElement("div"); overlay.id = "musteriIslemOverlay"; overlay.className = "erp-modal-overlay";
        overlay.innerHTML = `<div class="erp-modal" style="max-width:620px"><div class="erp-modal-header"><div><h2>Müşteri Seçin</h2><p>${tur === "teklif" ? "Teklif" : "Sipariş"} hazırlanacak müşteriyi seçin.</p></div><button class="erp-modal-close">×</button></div><form><label>Müşteri<select name="musteriId" required><option value="">Müşteri seçin</option>${musteriler.map(x => `<option value="${x._id}">${escapeHtml(x.kod)} · ${escapeHtml(x.unvan || x.adSoyad)}</option>`).join("")}</select></label><div class="erp-modal-footer"><button type="button" class="erp-small-button" data-kapat>Vazgeç</button><button class="erp-primary-button">Devam Et</button></div></form></div>`;
        document.body.appendChild(overlay); const kapat = () => overlay.remove(); overlay.querySelectorAll(".erp-modal-close,[data-kapat]").forEach(x => x.onclick = kapat);
        overlay.querySelector("form").onsubmit = event => { event.preventDefault(); const m = musteriler.find(x => x._id === event.currentTarget.elements.musteriId.value); kapat(); musteriBelgeFormu(tur, m).catch(error => alert(error.message)); };
    }

    function belgeGuncellemeGovdesi(belge, durum) {
        return { teklifNo: belge.teklifNo, siparisNo: belge.siparisNo, tarih: belge.tarih, gecerlilikTarihi: belge.gecerlilikTarihi, teslimTarihi: belge.teslimTarihi, depoId: belge.depoId?._id || belge.depoId, paraBirimi: belge.paraBirimi || "TRY", teslimSuresiGun: belge.teslimSuresiGun || 0, odemeKosullari: belge.odemeKosullari || "", teslimatKosullari: belge.teslimatKosullari || "", sevkAdresi: belge.sevkAdresi || "", notlar: belge.notlar || "", durum, kalemler: (belge.kalemler || []).map(k => ({ urunId: k.urunId?._id || k.urunId, miktar: k.miktar, birimFiyat: k.birimFiyat, kdv: k.kdv, iskonto: k.iskonto })) };
    }

    async function katalogIslemi(tip, urunler, kategori) {
        const liste = kategori ? urunler.filter(x => x.kategori === kategori) : urunler;
        if (!liste.length) return alert("Seçilen katalogda ürün yok.");
        const firma = await firmaProfiliGetir(), baslik = kategori ? `${kategori} Kataloğu` : "Ürün Kataloğu";
        if (tip === "excel") {
            if (!window.XLSX) return alert("Excel kitaplığı yüklenemedi.");
            const ws = XLSX.utils.json_to_sheet(liste.map(x => ({ "Ürün Kodu": x.kod, Barkod: x.barkod || "", Ürün: x.ad, Kategori: x.kategori || "", Marka: x.marka || "", Model: x.model || "", Birim: x.birim, "Satış Fiyatı": Number(x.satisFiyati || 0), "Para Birimi": x.paraBirimi || "TRY", "İskonto %": Number(x.iskonto || 0), "KDV %": Number(x.kdv || 0), "Görsel URL": x.gorsel || "" })));
            ws["!cols"] = [{wch:16},{wch:18},{wch:34},{wch:20},{wch:18},{wch:18},{wch:10},{wch:14},{wch:12},{wch:12},{wch:10},{wch:45}]; const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Katalog"); XLSX.writeFile(wb, `${baslik.replaceAll(" ", "-")}.xlsx`, { compression: true }); return;
        }
        if (tip === "pdf") {
            const kartlar = liste.map(x => `<article style="break-inside:avoid;border:1px solid #ddd;border-radius:10px;padding:12px">${x.gorsel ? `<img src="${escapeHtml(x.gorsel)}" style="width:100%;height:130px;object-fit:contain">` : ""}<small>${escapeHtml([x.kategori,x.marka,x.model].filter(Boolean).join(" · "))}</small><h3>${escapeHtml(x.ad)}</h3><div>${escapeHtml(x.kod)} · ${escapeHtml(x.birim)}</div><b>${finansPara(x.satisFiyati,x.paraBirimi)}</b></article>`).join("");
            const pencere = window.open("", "_blank"); if (!pencere) return alert("Yazdırma penceresi açılamadı."); pencere.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(baslik)}</title><style>body{font-family:Arial;padding:30px;color:#172033}header{border-bottom:2px solid #ddd;margin-bottom:20px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}b{display:block;margin-top:10px;color:#1857a8}@media print{body{padding:0}}</style></head><body><header><h1>${escapeHtml(firma.unvan)}</h1><h2>${escapeHtml(baslik)}</h2><p>${new Date().toLocaleDateString("tr-TR")} · ${liste.length} ürün</p></header><main class="grid">${kartlar}</main></body></html>`); pencere.document.close(); pencere.onload = () => pencere.print(); return;
        }
        const sonuc = await api("/api/tenant/paylasim", { method: "POST", body: JSON.stringify({ tur: "KATALOG", kategori, baslik, gecerlilikGun: 30 }) });
        const link = `${location.origin}/erp/paylasim.html?token=${encodeURIComponent(sonuc.paylasim.token)}`;
        await navigator.clipboard.writeText(link);
        alert(`Katalog bağlantısı kopyalandı.\n\n${profesyonelPaylasimMesaji({ firmaAdi: firma.unvan, belgeAdi: baslik, link })}`);
    }

    async function teklifSiparisYukle(tur) {
        const teklifMi = tur === "teklif", endpoint = teklifMi ? "/api/tenant/teklifler" : "/api/tenant/siparisler";
        setTitle(teklifMi ? "Teklifler ve Kataloglar" : "Siparişler"); loading("Satış belgeleri hazırlanıyor...");
        try {
            const [data, urunData] = await Promise.all([api(endpoint), teklifMi ? api("/api/tenant/urunler") : Promise.resolve({ urunler: [] })]);
            const kayitlar = data[teklifMi ? "teklifler" : "siparisler"] || [], urunler = (urunData.urunler || []).filter(x => x.aktif !== false), kategoriler = [...new Set(urunler.map(x => x.kategori).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"tr"));
            const durumlar = teklifMi ? ["TASLAK","GONDERILDI","ONAYLANDI","REDDEDILDI","SURESI_DOLDU","IPTAL"] : ["TASLAK","ONAYLANDI","HAZIRLANIYOR","KISMI_SEVK","SEVK_EDILDI","TAMAMLANDI","IPTAL"];
            const aktif = kayitlar.filter(x => !["REDDEDILDI","IPTAL","TAMAMLANDI","SIPARISE_DONUSTU"].includes(x.durum));
            content.innerHTML = `<div class="sales-hero"><div><div class="eyebrow">${teklifMi ? "TEKLİF VE KATALOG YÖNETİMİ" : "SİPARİŞ YÖNETİMİ"}</div><h2>${teklifMi ? "Tekliften siparişe profesyonel satış akışı" : "Siparişleri teslimata kadar yönetin"}</h2><p>${teklifMi ? "Teklif hazırlayın, PDF/Excel paylaşın, ürün kataloğu oluşturun ve kabul edilen teklifi siparişe çevirin." : "Onay, hazırlık, sevk ve satışa dönüşüm adımlarını tek ekrandan izleyin."}</p></div><button id="belgeYeni" class="sales-primary-cta">+ Yeni ${teklifMi ? "Teklif" : "Sipariş"}</button></div><div class="dashboard-grid">${card("Toplam", kayitlar.length, "Tüm kayıtlar")}${card("Aktif Süreç", aktif.length, "İşlem bekleyen")}${card(teklifMi ? "Onaylanan" : "Sevk Bekleyen", kayitlar.filter(x => teklifMi ? x.durum === "ONAYLANDI" : ["ONAYLANDI","HAZIRLANIYOR"].includes(x.durum)).length, "Takip edilecek")}${card("Toplam Tutar", para(kayitlar.reduce((n,x)=>n+Number(x.genelToplam||0),0)), "Belge toplamı")}</div>${teklifMi ? `<div class="dashboard-panel"><div class="panel-heading"><div><h2>Ürün Katalogları</h2><p>Örneğin Balata kategorisini seçerek müşteriye PDF, Excel veya 30 gün geçerli güvenli bağlantı gönderin.</p></div></div><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end"><label>Katalog<select id="katalogKategori"><option value="">Tüm Ürünler</option>${kategoriler.map(x=>`<option>${escapeHtml(x)}</option>`).join("")}</select></label><button id="katalogPdf" class="erp-small-button">PDF / Yazdır</button><button id="katalogExcel" class="erp-small-button">Excel İndir</button><button id="katalogLink" class="erp-primary-button">Güvenli Link Oluştur</button></div><small>Bağlantılar alıcı verisini URL'ye yazmaz, arama motorlarına kapalıdır ve 30 gün sonra sona erer.</small></div>` : ""}<div class="dashboard-panel"><div class="panel-heading"><div><h2>${teklifMi ? "Teklifler" : "Siparişler"}</h2><p>${kayitlar.length} belge</p></div><input id="belgeAra" class="erp-input" placeholder="Belge no veya müşteri ara..."></div><div class="table-scroll"><table><thead><tr><th>Belge</th><th>Tarih</th><th>Müşteri</th><th>Geçerlilik / Teslim</th><th>Durum</th><th>Tutar</th><th>İşlem</th></tr></thead><tbody>${kayitlar.length ? kayitlar.map((x,i)=>`<tr data-belge-satir="${i}"><td><b>${escapeHtml(x.teklifNo||x.siparisNo)}</b></td><td>${tarihKisa(x.tarih)}</td><td>${escapeHtml(x.musteriId?.unvan||x.musteriId?.adSoyad||"-")}</td><td>${tarihKisa(teklifMi?x.gecerlilikTarihi:x.teslimTarihi)}</td><td><select data-durum="${i}" ${["TAMAMLANDI","SIPARISE_DONUSTU"].includes(x.durum)?"disabled":""}>${durumlar.map(d=>`<option ${x.durum===d?"selected":""}>${d.replaceAll("_"," ")}</option>`).join("")}</select></td><td><b>${finansPara(x.genelToplam,x.paraBirimi)}</b></td><td><button class="erp-small-button" data-gor="${i}">Görüntüle</button> <button class="erp-small-button" data-duzenle="${i}" ${["TAMAMLANDI","SIPARISE_DONUSTU"].includes(x.durum)?"disabled":""}>Düzenle</button>${teklifMi&&x.durum==="ONAYLANDI"?` <button class="erp-primary-button" data-donustur="${i}">Siparişe Çevir</button>`:""}${!teklifMi&&["ONAYLANDI","HAZIRLANIYOR"].includes(x.durum)?` <button class="erp-primary-button" data-satis="${i}">Satışa Çevir</button>`:""}</td></tr>`).join("") : '<tr><td colspan="7">Henüz belge bulunmuyor.</td></tr>'}</tbody></table></div></div>`;
            content.querySelector("#belgeYeni").onclick = () => musteriSecerekBelgeAc(tur).catch(error => alert(error.message));
            content.querySelector("#belgeAra").oninput = e => content.querySelectorAll("[data-belge-satir]").forEach(x => x.hidden = !x.textContent.toLocaleLowerCase("tr-TR").includes(e.target.value.toLocaleLowerCase("tr-TR")));
            content.querySelectorAll("[data-gor]").forEach(btn => btn.onclick = () => { const x=kayitlar[Number(btn.dataset.gor)]; musteriBelgeMerkeziAc(teklifMi?"TEKLIF":"SIPARIS",x,x.musteriId); });
            content.querySelectorAll("[data-duzenle]").forEach(btn => btn.onclick = () => { const x=kayitlar[Number(btn.dataset.duzenle)]; musteriBelgeFormu(tur,x.musteriId,x).catch(error=>alert(error.message)); });
            content.querySelectorAll("[data-durum]").forEach(sel => sel.onchange = async () => { const x=kayitlar[Number(sel.dataset.durum)]; try { await api(`${endpoint}/${x._id}`,{method:"PATCH",body:JSON.stringify(belgeGuncellemeGovdesi(x,sel.value))}); await teklifSiparisYukle(tur); } catch(error){ alert(error.message); sel.value=x.durum; } });
            content.querySelectorAll("[data-donustur]").forEach(btn => btn.onclick = async () => { try { const depolar=(await api("/api/tenant/stok/depolar")).depolar||[]; if(!depolar.length)throw new Error("Aktif depo bulunamadı."); const x=kayitlar[Number(btn.dataset.donustur)], no=prompt("Sipariş numarası:",`SIP-${Date.now()}`); if(!no)return; await api(`/api/tenant/teklifler/${x._id}/siparise-donustur`,{method:"POST",body:JSON.stringify({siparisNo:no,depoId:depolar[0]._id})}); await teklifSiparisYukle(tur); }catch(error){alert(error.message);} });
            content.querySelectorAll("[data-satis]").forEach(btn => btn.onclick = async () => { const x=kayitlar[Number(btn.dataset.satis)], no=prompt("Satış belge numarası:",x.siparisNo); if(!no)return; try{await api(`/api/tenant/siparisler/${x._id}/satisa-donustur`,{method:"POST",body:JSON.stringify({belgeNo:no})});await teklifSiparisYukle(tur);}catch(error){alert(error.message);} });
            if(teklifMi){const kategori=()=>content.querySelector("#katalogKategori").value; content.querySelector("#katalogPdf").onclick=()=>katalogIslemi("pdf",urunler,kategori()).catch(e=>alert(e.message));content.querySelector("#katalogExcel").onclick=()=>katalogIslemi("excel",urunler,kategori()).catch(e=>alert(e.message));content.querySelector("#katalogLink").onclick=()=>katalogIslemi("link",urunler,kategori()).catch(e=>alert(e.message));}
        } catch (error) { errorBox(error); }
    }

    const personelDurumEtiketi = {
        AKTIF: "Aktif", IZINLI: "İzinli", ASKIDA: "Askıda", AYRILDI: "Ayrıldı",
        BEKLIYOR: "Bekliyor", ONAYLANDI: "Onaylandı", REDDEDILDI: "Reddedildi", IPTAL: "İptal",
        GELDI: "Geldi", GEC: "Geç", GELMEDI: "Gelmedi", RAPORLU: "Raporlu", UZAKTAN: "Uzaktan"
    };
    const personelFinansEtiketi = { MAAS_TAHAKKUK: "Maaş Tahakkuku", PRIM_TAHAKKUK: "Prim Tahakkuku", MAAS_ODEME: "Maaş Ödemesi", PRIM_ODEME: "Prim Ödemesi", AVANS_ODEME: "Avans Ödemesi", AVANS_TAHSILAT: "Avans Geri Ödemesi", AVANS_MAHSUP: "Avans Mahsubu", KESINTI: "Bordro Kesintisi" };

    let personelMerkeziVeri = { personeller: [], izinler: [], devam: [], panel: {} };

    function personelRozet(durum) {
        return `<span class="personnel-status status-${escapeHtml(String(durum || "").toLowerCase())}">${escapeHtml(personelDurumEtiketi[durum] || durum || "-")}</span>`;
    }

    function personelSecenekleri(secili = "") {
        return personelMerkeziVeri.personeller.filter(x => x.aktif !== false).map(x => `<option value="${x._id}" ${String(x._id) === String(secili) ? "selected" : ""}>${escapeHtml(x.kod)} · ${escapeHtml(x.adSoyad)}</option>`).join("");
    }

    function personelModalKapat() {
        document.getElementById("personelModal")?.remove();
    }

    function personelFormuAc(personel = null) {
        personelModalKapat();
        const p = personel || {};
        const overlay = document.createElement("div");
        overlay.id = "personelModal";
        overlay.className = "erp-modal-overlay";
        const sec = (alan, deger) => p[alan] === deger ? "selected" : "";
        const iso = value => value ? new Date(value).toISOString().slice(0, 10) : "";
        overlay.innerHTML = `<div class="erp-modal personnel-modal"><div class="erp-modal-header"><div><h2>${p._id ? "Personel Bilgilerini Düzenle" : "Yeni Personel"}</h2><p>Özlük, görev ve ücret bilgilerini eksiksiz yönetin.</p></div><button type="button" class="erp-modal-close">×</button></div>
        <form id="personelForm"><div class="personnel-form-section"><h3>Kimlik ve iletişim</h3><div class="erp-form-grid">
        <label>Personel Kodu<input name="kod" value="${escapeHtml(p.kod || "")}" required></label><label>Ad Soyad<input name="adSoyad" value="${escapeHtml(p.adSoyad || "")}" required></label>
        <label>E-posta<input name="email" type="email" value="${escapeHtml(p.email || "")}"></label><label>Telefon<input name="telefon" value="${escapeHtml(p.telefon || "")}"></label>
        <label>Doğum Tarihi<input name="dogumTarihi" type="date" value="${iso(p.dogumTarihi)}"></label><label>Lokasyon<input name="lokasyon" value="${escapeHtml(p.lokasyon || "")}"></label></div></div>
        <div class="personnel-form-section"><h3>Görev ve çalışma</h3><div class="erp-form-grid"><label>Departman<input name="departman" value="${escapeHtml(p.departman || "")}"></label><label>Görev / Ünvan<input name="gorev" value="${escapeHtml(p.gorev || "")}"></label>
        <label>Yönetici<input name="yonetici" value="${escapeHtml(p.yonetici || "")}"></label><label>İstihdam Türü<select name="istihdamTuru"><option value="TAM_ZAMANLI" ${sec("istihdamTuru", "TAM_ZAMANLI")}>Tam zamanlı</option><option value="YARI_ZAMANLI" ${sec("istihdamTuru", "YARI_ZAMANLI")}>Yarı zamanlı</option><option value="STAJYER" ${sec("istihdamTuru", "STAJYER")}>Stajyer</option><option value="DONEMSEL" ${sec("istihdamTuru", "DONEMSEL")}>Dönemsel</option></select></label>
        <label>İşe Giriş<input name="iseGirisTarihi" type="date" value="${iso(p.iseGirisTarihi)}"></label><label>Çalışma Durumu<select name="calismaDurumu"><option value="AKTIF" ${sec("calismaDurumu", "AKTIF")}>Aktif</option><option value="IZINLI" ${sec("calismaDurumu", "IZINLI")}>İzinli</option><option value="ASKIDA" ${sec("calismaDurumu", "ASKIDA")}>Askıda</option><option value="AYRILDI" ${sec("calismaDurumu", "AYRILDI")}>Ayrıldı</option></select></label>
        <label>Çıkış Tarihi<input name="cikisTarihi" type="date" value="${iso(p.cikisTarihi)}"></label><label>Yıllık İzin Hakkı<input name="yillikIzinHakki" type="number" min="0" value="${Number(p.yillikIzinHakki ?? 14)}"></label></div></div>
        <div class="personnel-form-section"><h3>Ücret ve yasal bilgiler</h3><div class="erp-form-grid"><label>Aylık Ücret<input name="maas" type="number" min="0" step="0.01" value="${Number(p.maas || 0)}"></label><label>Para Birimi<select name="maasParaBirimi"><option ${sec("maasParaBirimi", "TRY")}>TRY</option><option ${sec("maasParaBirimi", "USD")}>USD</option><option ${sec("maasParaBirimi", "EUR")}>EUR</option></select></label>
        <label>SGK Meslek Kodu<input name="sgkMeslekKodu" value="${escapeHtml(p.sgkMeslekKodu || "")}"></label><label>IBAN<input name="iban" value="${escapeHtml(p.iban || "")}"></label></div></div>
        <div class="personnel-form-section"><h3>Adres ve acil durum</h3><div class="erp-form-grid"><label>İl<input name="il" value="${escapeHtml(p.adres?.il || "")}"></label><label>İlçe<input name="ilce" value="${escapeHtml(p.adres?.ilce || "")}"></label><label class="full">Açık Adres<textarea name="acikAdres">${escapeHtml(p.adres?.acikAdres || "")}</textarea></label>
        <label>Acil Durum Kişisi<input name="acilAdSoyad" value="${escapeHtml(p.acilDurum?.adSoyad || "")}"></label><label>Yakınlık<input name="acilYakinlik" value="${escapeHtml(p.acilDurum?.yakinlik || "")}"></label><label>Acil Telefon<input name="acilTelefon" value="${escapeHtml(p.acilDurum?.telefon || "")}"></label><label class="full">Notlar<textarea name="notlar">${escapeHtml(p.notlar || "")}</textarea></label></div></div>
        <div id="personelFormMesaj"></div><div class="erp-modal-footer"><button type="button" class="erp-small-button secondary" data-kapat>Vazgeç</button><button class="erp-primary-button" type="submit">${p._id ? "Değişiklikleri Kaydet" : "Personeli Kaydet"}</button></div></form></div>`;
        document.body.appendChild(overlay);
        overlay.querySelectorAll(".erp-modal-close,[data-kapat]").forEach(x => x.onclick = personelModalKapat);
        overlay.querySelector("form").onsubmit = async event => {
            event.preventDefault();
            const fd = new FormData(event.currentTarget);
            const body = Object.fromEntries(fd.entries());
            body.maas = Number(body.maas || 0); body.yillikIzinHakki = Number(body.yillikIzinHakki || 0);
            body.adres = { il: body.il, ilce: body.ilce, acikAdres: body.acikAdres };
            body.acilDurum = { adSoyad: body.acilAdSoyad, yakinlik: body.acilYakinlik, telefon: body.acilTelefon };
            ["il", "ilce", "acikAdres", "acilAdSoyad", "acilYakinlik", "acilTelefon"].forEach(x => delete body[x]);
            try {
                await api(p._id ? `/api/tenant/personeller/${p._id}` : "/api/tenant/personeller", { method: p._id ? "PATCH" : "POST", body: JSON.stringify(body) });
                personelModalKapat(); await personelMerkeziYukle();
            } catch (error) { overlay.querySelector("#personelFormMesaj").innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; }
        };
    }

    function personelKisaFormAc(tur) {
        personelModalKapat();
        const izinMi = tur === "izin";
        const overlay = document.createElement("div"); overlay.id = "personelModal"; overlay.className = "erp-modal-overlay";
        overlay.innerHTML = `<div class="erp-modal" style="max-width:680px"><div class="erp-modal-header"><div><h2>${izinMi ? "Yeni İzin Talebi" : "Günlük Devam Kaydı"}</h2><p>${izinMi ? "İzin süresini ve türünü kaydedin; onay sürecinden takip edin." : "Aynı personel ve tarihe ait kayıt otomatik güncellenir."}</p></div><button class="erp-modal-close" type="button">×</button></div><form><div class="erp-form-grid"><label class="full">Personel<select name="personelId" required><option value="">Personel seçin</option>${personelSecenekleri()}</select></label>${izinMi ? `<label>İzin Türü<select name="tur"><option value="YILLIK">Yıllık izin</option><option value="MAZERET">Mazeret</option><option value="HASTALIK">Hastalık</option><option value="UCRETSIZ">Ücretsiz</option><option value="DOGUM">Doğum</option><option value="DIGER">Diğer</option></select></label><label>Başlangıç<input name="baslangicTarihi" type="date" required></label><label>Bitiş<input name="bitisTarihi" type="date" required></label>` : `<label>Tarih<input name="tarih" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label><label>Durum<select name="durum"><option value="GELDI">Geldi</option><option value="GEC">Geç</option><option value="GELMEDI">Gelmedi</option><option value="IZINLI">İzinli</option><option value="RAPORLU">Raporlu</option><option value="UZAKTAN">Uzaktan</option></select></label><label>Giriş<input name="girisSaati" type="time"></label><label>Çıkış<input name="cikisSaati" type="time"></label>`}<label class="full">Açıklama / Not<textarea name="${izinMi ? "aciklama" : "notlar"}"></textarea></label></div><div id="personelFormMesaj"></div><div class="erp-modal-footer"><button type="button" class="erp-small-button secondary" data-kapat>Vazgeç</button><button class="erp-primary-button">Kaydet</button></div></form></div>`;
        document.body.appendChild(overlay); overlay.querySelectorAll(".erp-modal-close,[data-kapat]").forEach(x => x.onclick = personelModalKapat);
        overlay.querySelector("form").onsubmit = async event => { event.preventDefault(); const body = Object.fromEntries(new FormData(event.currentTarget).entries()); try { await api(`/api/tenant/personeller/${izinMi ? "izinler" : "devam"}`, { method: "POST", body: JSON.stringify(body) }); personelModalKapat(); await personelMerkeziYukle(izinMi ? "izinler" : "devam"); } catch (error) { overlay.querySelector("#personelFormMesaj").innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
    }

    async function personelFinansDetayAc(personelId) {
        personelModalKapat();
        const overlay = document.createElement("div"); overlay.id = "personelModal"; overlay.className = "erp-modal-overlay";
        overlay.innerHTML = '<div class="erp-modal personnel-modal"><div class="erp-modal-header"><div><h2>Personel Finans Profili</h2><p>Tahakkuk ve ödeme bilgileri hazırlanıyor...</p></div><button class="erp-modal-close">×</button></div><div class="empty-state">Yükleniyor...</div></div>';
        document.body.appendChild(overlay); overlay.querySelector(".erp-modal-close").onclick = personelModalKapat;
        try {
            const data = await api(`/api/tenant/personeller/${personelId}/finans?_=${Date.now()}`);
            const p = data.personel, kod = p.maasParaBirimi || "TRY", o = data.ozetler?.[kod] || {}, islemler = data.islemler || [];
            let hesaplar = data.hesaplar || [];
            if (!hesaplar.length) { const finans = await api(`/api/tenant/finans/ozet?_=${Date.now()}`); hesaplar = [...(finans.kasalar || []).map(x => ({ ...x, paraBirimi: x.paraBirimi || "TRY", tip: "KASA", adGoster: x.ad })), ...(finans.bankalar || []).map(x => ({ ...x, paraBirimi: x.paraBirimi || "TRY", tip: "BANKA", adGoster: x.bankaAdi }))].filter(x => x.aktif !== false); }
            overlay.querySelector(".erp-modal").innerHTML = `<div class="erp-modal-header"><div><h2>${escapeHtml(p.adSoyad)}</h2><p>${escapeHtml(p.kod)} · ${escapeHtml(p.gorev || "Görev belirtilmemiş")} · ${escapeHtml(p.departman || "Departman belirtilmemiş")}</p></div><button class="erp-modal-close">×</button></div>
            <div class="personnel-finance-summary"><div><span>Kalan Hak Ediş</span><strong>${finansPara(o.kalanHakEdis || 0, kod)}</strong></div><div><span>Açık Avans</span><strong>${finansPara(o.acikAvans || 0, kod)}</strong></div><div><span>Ödenen Maaş</span><strong>${finansPara(o.maasOdeme || 0, kod)}</strong></div><div><span>Ödenen Prim</span><strong>${finansPara(o.primOdeme || 0, kod)}</strong></div><div class="${Number(o.netDurum || 0) < 0 ? "negative" : ""}"><span>Net Personel Durumu</span><strong>${finansPara(o.netDurum || 0, kod)}</strong></div></div>
            <div class="personnel-finance-actions"><button data-personel-finans="MAAS_TAHAKKUK">Maaş Tahakkuk Et</button><button data-personel-finans="PRIM_TAHAKKUK">Prim Tahakkuk Et</button><button data-personel-finans="MAAS_ODEME">Maaş Öde</button><button data-personel-finans="PRIM_ODEME">Prim Öde</button><button data-personel-finans="AVANS_ODEME">Avans Ver</button><button data-personel-finans="AVANS_TAHSILAT">Ödeme Al</button><button data-personel-finans="AVANS_MAHSUP">Avans Mahsup Et</button><button data-personel-finans="KESINTI">Kesinti Gir</button></div>
            <div class="panel-heading"><div><h3>Finans Hareketleri</h3><p>Tahakkuk, ödeme, avans ve ters kayıt geçmişi</p></div></div><div class="table-scroll"><table class="personnel-table"><thead><tr><th>Tarih</th><th>İşlem</th><th>Dönem</th><th>Tutar</th><th>Hesap</th><th>Durum</th><th></th></tr></thead><tbody>${islemler.length ? islemler.map(x => { const h = hesaplar.find(a => String(a._id) === String(x.hesapId)); return `<tr><td>${tarihKisa(x.tarih)}</td><td><strong>${escapeHtml(personelFinansEtiketi[x.tur] || x.tur)}</strong><small>${escapeHtml(x.aciklama || x.belgeNo || "")}</small></td><td>${escapeHtml(x.donem || "-")}</td><td><strong>${finansPara(x.tutar, x.paraBirimi)}</strong></td><td>${escapeHtml(h ? `${h.tip} · ${h.adGoster}` : "-")}</td><td>${personelRozet(x.durum)}</td><td>${x.durum === "AKTIF" ? `<button class="erp-small-button secondary" data-personel-finans-iptal="${x._id}">İptal</button>` : "-"}</td></tr>`; }).join("") : '<tr><td colspan="7"><div class="empty-state">Henüz finans işlemi bulunmuyor.</div></td></tr>'}</tbody></table></div><div id="personelFinansMesaj"></div><div class="erp-modal-footer"><button class="erp-small-button" data-personel-duzenle-finans>Düzenle</button><button class="erp-primary-button" data-kapat>Kapat</button></div>`;
            overlay.querySelectorAll(".erp-modal-close,[data-kapat]").forEach(x => x.onclick = personelModalKapat);
            overlay.querySelector("[data-personel-duzenle-finans]").onclick = () => personelFormuAc(p);
            overlay.querySelectorAll("[data-personel-finans]").forEach(x => x.onclick = () => personelFinansIslemFormu(p, x.dataset.personelFinans, o, hesaplar));
            overlay.querySelectorAll("[data-personel-finans-iptal]").forEach(x => x.onclick = async () => { if (!confirm("Bu finans işlemi ters kayıtla iptal edilsin mi? Kasa ve masraf bağlantıları da düzeltilecektir.")) return; try { await api(`/api/tenant/personeller/${p._id}/finans/${x.dataset.personelFinansIptal}/iptal`, { method: "POST", body: JSON.stringify({ neden: "Kullanıcı tarafından iptal edildi" }) }); await personelFinansDetayAc(p._id); } catch (error) { overlay.querySelector("#personelFinansMesaj").innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } });
        } catch (error) { overlay.querySelector(".erp-modal").innerHTML = `<div class="erp-modal-header"><h2>Personel Finans Profili</h2><button class="erp-modal-close">×</button></div><div class="error">${escapeHtml(error.message)}</div>`; overlay.querySelector(".erp-modal-close").onclick = personelModalKapat; }
    }

    function personelFinansIslemFormu(personel, tur, ozet, hesaplar) {
        personelModalKapat();
        const nakit = ["MAAS_ODEME", "PRIM_ODEME", "AVANS_ODEME", "AVANS_TAHSILAT"].includes(tur), kod = personel.maasParaBirimi || "TRY";
        const varsayilan = tur === "MAAS_TAHAKKUK" ? Number(personel.maas || 0) : tur === "MAAS_ODEME" ? Math.min(Number(ozet.kalanMaas || 0), Number(ozet.kalanHakEdis || 0)) : tur === "PRIM_ODEME" ? Math.min(Number(ozet.kalanPrim || 0), Number(ozet.kalanHakEdis || 0)) : tur === "AVANS_TAHSILAT" ? Number(ozet.acikAvans || 0) : tur === "AVANS_MAHSUP" ? Math.min(Number(ozet.acikAvans || 0), Number(ozet.kalanHakEdis || 0)) : 0;
        const hesapSecenekleri = hesaplar.length ? hesaplar.map(h => `<option value="${h.tip}|${h._id}" data-para="${h.paraBirimi}">${escapeHtml(h.tip)} · ${escapeHtml(h.adGoster)} · ${finansPara(h.bakiye, h.paraBirimi)}</option>`).join("") : '<option value="" disabled>Aktif hesap bulunamadı</option>';
        const islemBilgisi = tur === "AVANS_ODEME" ? "Avans, personel masrafı değil çalışan alacağı olarak takip edilir." : ["MAAS_ODEME", "PRIM_ODEME"].includes(tur) ? "Ödeme kasadan düşer ve Personel kategorisinde otomatik masraf oluşturur." : tur === "AVANS_TAHSILAT" ? "Çalışandan alınan ödeme seçilen hesaba para girişi oluşturur." : tur === "AVANS_MAHSUP" ? "Açık avans, çalışanın ödenecek hak edişinden düşülür; kasa hareketi oluşmaz." : "Tahakkuk kasa bakiyesini etkilemez; ödeme yapılabilir borç oluşturur.";
        const uygunHesapVar = !nakit || hesaplar.some(h => (h.paraBirimi || "TRY") === kod);
        const overlay = document.createElement("div"); overlay.id = "personelModal"; overlay.className = "erp-modal-overlay";
        overlay.innerHTML = `<div class="erp-modal" style="max-width:680px"><div class="erp-modal-header"><div><h2>${escapeHtml(personelFinansEtiketi[tur])}</h2><p>${escapeHtml(personel.adSoyad)} · Kayıtlar finans ve masraf modülleriyle otomatik eşleşir.</p></div><button class="erp-modal-close">×</button></div><form><div class="erp-form-grid"><label>Tutar<input name="tutar" type="number" min="0.01" step="0.01" value="${varsayilan || ""}" required></label><label>Para Birimi<select name="paraBirimi"><option ${kod === "TRY" ? "selected" : ""}>TRY</option><option ${kod === "USD" ? "selected" : ""}>USD</option><option ${kod === "EUR" ? "selected" : ""}>EUR</option></select></label><label>Dönem<input name="donem" type="month" value="${new Date().toISOString().slice(0, 7)}" required></label><label>Tarih<input name="tarih" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label>${nakit ? `<label class="full">Kasa / Banka<select name="hesap" required><option value="">Hesap seçin</option>${hesapSecenekleri}</select></label>` : ""}<label>Belge No<input name="belgeNo" placeholder="Otomatik oluşturulur"></label><label class="full">Açıklama<textarea name="aciklama" placeholder="İşlem açıklaması"></textarea></label></div><div id="personelFinansBilgi" class="personnel-finance-note">${uygunHesapVar ? islemBilgisi : `Seçili ${kod} para biriminde aktif kasa/banka bulunamadı. Finans modülünden uygun hesap oluşturun.`}</div><div id="personelFormMesaj"></div><div class="erp-modal-footer">${nakit ? `<button type="button" class="erp-small-button" data-finans-git ${uygunHesapVar ? "hidden" : ""}>Finans Modülüne Git</button>` : ""}<button type="button" class="erp-small-button secondary" data-kapat>Vazgeç</button><button data-islem-kaydet class="erp-primary-button" ${uygunHesapVar ? "" : "disabled"}>İşlemi Kaydet</button></div></form></div>`;
        document.body.appendChild(overlay); overlay.querySelectorAll(".erp-modal-close,[data-kapat]").forEach(x => x.onclick = personelModalKapat);
        overlay.querySelector("[data-finans-git]")?.addEventListener("click", () => { personelModalKapat(); sayfaYukle("finans"); });
        if (nakit) { const paraSec = overlay.querySelector('[name="paraBirimi"]'), hesapSec = overlay.querySelector('[name="hesap"]'), kaydet = overlay.querySelector("[data-islem-kaydet]"), bilgi = overlay.querySelector("#personelFinansBilgi"), finansGit = overlay.querySelector("[data-finans-git]"); const hesaplariEsle = () => { let uygun = false; [...hesapSec.options].forEach(option => { if (option.dataset.para) { option.hidden = option.dataset.para !== paraSec.value; if (!option.hidden) uygun = true; } }); if (hesapSec.selectedOptions[0]?.hidden) hesapSec.value = ""; kaydet.disabled = !uygun; finansGit.hidden = uygun; bilgi.textContent = uygun ? islemBilgisi : `Seçili ${paraSec.value} para biriminde aktif kasa/banka bulunamadı. Finans modülünden uygun hesap oluşturun.`; }; paraSec.onchange = hesaplariEsle; hesaplariEsle(); }
        overlay.querySelector("form").onsubmit = async event => { event.preventDefault(); const fd = new FormData(event.currentTarget), body = Object.fromEntries(fd.entries()); body.tur = tur; body.tutar = Number(body.tutar); if (body.hesap) [body.hesapTipi, body.hesapId] = String(body.hesap).split("|"); delete body.hesap; try { await api(`/api/tenant/personeller/${personel._id}/finans/islem`, { method: "POST", body: JSON.stringify(body) }); await personelFinansDetayAc(personel._id); } catch (error) { overlay.querySelector("#personelFormMesaj").innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
    }

    function topluMaasTahakkukFormu() {
        personelModalKapat(); const overlay = document.createElement("div"); overlay.id = "personelModal"; overlay.className = "erp-modal-overlay";
        overlay.innerHTML = `<div class="erp-modal" style="max-width:580px"><div class="erp-modal-header"><div><h2>Toplu Maaş Tahakkuku</h2><p>Aktif personellerin kartlarındaki aylık ücretleri seçilen döneme tek seferde işler.</p></div><button class="erp-modal-close">×</button></div><form><div class="erp-form-grid"><label>Dönem<input name="donem" type="month" value="${new Date().toISOString().slice(0, 7)}" required></label><label>Tahakkuk Tarihi<input name="tarih" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label></div><div class="personnel-finance-note">Aynı personel ve dönem için ikinci maaş tahakkuku oluşturulmaz.</div><div id="personelFormMesaj"></div><div class="erp-modal-footer"><button type="button" class="erp-small-button secondary" data-kapat>Vazgeç</button><button class="erp-primary-button">Tahakkukları Oluştur</button></div></form></div>`;
        document.body.appendChild(overlay); overlay.querySelectorAll(".erp-modal-close,[data-kapat]").forEach(x => x.onclick = personelModalKapat); overlay.querySelector("form").onsubmit = async event => { event.preventDefault(); const body = Object.fromEntries(new FormData(event.currentTarget)); try { const sonuc = await api("/api/tenant/personeller/bordro/tahakkuk", { method: "POST", body: JSON.stringify(body) }); alert(sonuc.mesaj); personelModalKapat(); await personelMerkeziYukle(); } catch (error) { overlay.querySelector("#personelFormMesaj").innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
    }

    function personelTabloSatirlari(personeller) {
        if (!personeller.length) return `<tr><td colspan="7"><div class="empty-state">Filtreye uygun personel bulunamadı.</div></td></tr>`;
        return personeller.map(p => `<tr data-personel-ac="${p._id}" class="personnel-clickable"><td><div class="personnel-person"><span>${escapeHtml((p.adSoyad || "?").split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase())}</span><div><strong>${escapeHtml(p.adSoyad)}</strong><small>${escapeHtml(p.kod)} · ${escapeHtml(p.email || p.telefon || "İletişim yok")}</small></div></div></td><td><strong>${escapeHtml(p.gorev || "-")}</strong><small>${escapeHtml(p.departman || "Departman yok")}</small></td><td>${escapeHtml((p.istihdamTuru || "TAM_ZAMANLI").replaceAll("_", " "))}</td><td>${personelRozet(p.calismaDurumu || (p.aktif ? "AKTIF" : "AYRILDI"))}</td><td>${p.iseGirisTarihi ? tarihKisa(p.iseGirisTarihi) : "-"}</td><td><strong>${finansPara(p.maas || 0, p.maasParaBirimi || "TRY")}</strong></td><td><button class="erp-small-button" data-personel-duzenle="${p._id}">Düzenle</button></td></tr>`).join("");
    }

    function personelIcerikCiz(aktifTab = "personeller") {
        const d = personelMerkeziVeri, p = d.panel || {};
        const tryBordro = (p.bordro || []).find(x => !x._id || x._id === "TRY")?.toplam || 0;
        const departmanlar = [...new Set(d.personeller.map(x => x.departman).filter(Boolean))].sort();
        content.innerHTML = `<div class="sales-hero personnel-hero"><div><div class="eyebrow">PERSONEL VE İK YÖNETİMİ</div><h2>Ekibinizi tek merkezden yönetin</h2><p>Özlük bilgileri, bordro, avans, izin ve devam takibi tenant güvenliğiyle korunur.</p></div><div class="personnel-hero-actions"><button id="topluMaasTahakkuk" class="erp-small-button">Toplu Maaş Tahakkuku</button><button id="yeniPersonel" class="erp-primary-button">+ Yeni Personel</button></div></div>
        <div class="dashboard-grid personnel-kpis">${card("Aktif Personel", Number(p.aktif || 0), `${Number(p.toplam || 0)} toplam kayıt`)}${card("Bugün İzinli", Number(p.izinde || 0), "Onaylı izinler")}${card("Bekleyen İzin", Number(p.bekleyenIzin || 0), "Karar bekliyor")}${card("Aylık Ücret", finansPara(tryBordro, "TRY"), "Aktif personel · TRY")}</div>
        <section class="dashboard-panel"><div class="personnel-toolbar"><div class="personnel-tabs"><button data-personel-tab="personeller" class="${aktifTab === "personeller" ? "active" : ""}">Personeller</button><button data-personel-tab="izinler" class="${aktifTab === "izinler" ? "active" : ""}">İzin Yönetimi <span>${Number(p.bekleyenIzin || 0)}</span></button><button data-personel-tab="devam" class="${aktifTab === "devam" ? "active" : ""}">Devam / Puantaj</button></div><div class="personnel-actions">${aktifTab === "izinler" ? '<button id="yeniIzin" class="erp-primary-button">+ İzin Kaydı</button>' : aktifTab === "devam" ? '<button id="yeniDevam" class="erp-primary-button">+ Devam Kaydı</button>' : ""}</div></div><div id="personelTabIcerik"></div></section>`;
        const alan = document.getElementById("personelTabIcerik");
        if (aktifTab === "personeller") alan.innerHTML = `<div class="personnel-filters"><input id="personelArama" type="search" placeholder="Ad, kod, görev veya e-posta ara"><select id="personelDepartman"><option value="">Tüm departmanlar</option>${departmanlar.map(x => `<option>${escapeHtml(x)}</option>`).join("")}</select></div><div class="table-scroll"><table class="personnel-table"><thead><tr><th>Personel</th><th>Görev</th><th>İstihdam</th><th>Durum</th><th>İşe Giriş</th><th>Aylık Ücret</th><th></th></tr></thead><tbody id="personelSatirlari">${personelTabloSatirlari(d.personeller)}</tbody></table></div>`;
        if (aktifTab === "izinler") alan.innerHTML = `<div class="table-scroll"><table class="personnel-table"><thead><tr><th>Personel</th><th>İzin Türü</th><th>Tarih Aralığı</th><th>Süre</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>${d.izinler.length ? d.izinler.map(i => `<tr><td><strong>${escapeHtml(i.personelId?.adSoyad || "Silinmiş personel")}</strong><small>${escapeHtml(i.personelId?.departman || "")}</small></td><td>${escapeHtml(i.tur.replaceAll("_", " "))}</td><td>${tarihKisa(i.baslangicTarihi)} – ${tarihKisa(i.bitisTarihi)}</td><td>${Number(i.gun)} gün</td><td>${personelRozet(i.durum)}</td><td>${i.durum === "BEKLIYOR" ? `<button class="erp-small-button" data-izin-onay="${i._id}">Onayla</button> <button class="erp-small-button secondary" data-izin-red="${i._id}">Reddet</button>` : "-"}</td></tr>`).join("") : '<tr><td colspan="6"><div class="empty-state">İzin kaydı bulunmuyor.</div></td></tr>'}</tbody></table></div>`;
        if (aktifTab === "devam") alan.innerHTML = `<div class="table-scroll"><table class="personnel-table"><thead><tr><th>Tarih</th><th>Personel</th><th>Durum</th><th>Giriş</th><th>Çıkış</th><th>Çalışma</th><th>Not</th></tr></thead><tbody>${d.devam.length ? d.devam.map(k => `<tr><td>${tarihKisa(k.tarih)}</td><td><strong>${escapeHtml(k.personelId?.adSoyad || "Silinmiş personel")}</strong><small>${escapeHtml(k.personelId?.departman || "")}</small></td><td>${personelRozet(k.durum)}</td><td>${escapeHtml(k.girisSaati || "-")}</td><td>${escapeHtml(k.cikisSaati || "-")}</td><td>${Math.floor(Number(k.calismaDakika || 0) / 60)} sa ${Number(k.calismaDakika || 0) % 60} dk</td><td>${escapeHtml(k.notlar || "-")}</td></tr>`).join("") : '<tr><td colspan="7"><div class="empty-state">Devam kaydı bulunmuyor.</div></td></tr>'}</tbody></table></div>`;
        document.getElementById("yeniPersonel").onclick = () => personelFormuAc();
        document.getElementById("topluMaasTahakkuk").onclick = topluMaasTahakkukFormu;
        document.getElementById("yeniIzin")?.addEventListener("click", () => personelKisaFormAc("izin"));
        document.getElementById("yeniDevam")?.addEventListener("click", () => personelKisaFormAc("devam"));
        document.querySelectorAll("[data-personel-tab]").forEach(x => x.onclick = () => personelIcerikCiz(x.dataset.personelTab));
        document.querySelectorAll("[data-personel-duzenle]").forEach(x => x.onclick = () => personelFormuAc(d.personeller.find(p => p._id === x.dataset.personelDuzenle)));
        document.querySelectorAll("[data-personel-ac]").forEach(x => x.onclick = event => { if (!event.target.closest("button,a,input,select")) personelFinansDetayAc(x.dataset.personelAc); });
        const filtrele = () => { const arama = String(document.getElementById("personelArama")?.value || "").toLocaleLowerCase("tr-TR"), dep = document.getElementById("personelDepartman")?.value || ""; const sonuc = d.personeller.filter(x => (!dep || x.departman === dep) && (!arama || [x.adSoyad, x.kod, x.gorev, x.email].some(v => String(v || "").toLocaleLowerCase("tr-TR").includes(arama)))); document.getElementById("personelSatirlari").innerHTML = personelTabloSatirlari(sonuc); document.querySelectorAll("[data-personel-duzenle]").forEach(x => x.onclick = () => personelFormuAc(d.personeller.find(p => p._id === x.dataset.personelDuzenle))); document.querySelectorAll("[data-personel-ac]").forEach(x => x.onclick = event => { if (!event.target.closest("button,a,input,select")) personelFinansDetayAc(x.dataset.personelAc); }); };
        document.getElementById("personelArama")?.addEventListener("input", filtrele); document.getElementById("personelDepartman")?.addEventListener("change", filtrele);
        document.querySelectorAll("[data-izin-onay],[data-izin-red]").forEach(x => x.onclick = async () => { const id = x.dataset.izinOnay || x.dataset.izinRed; const durum = x.dataset.izinOnay ? "ONAYLANDI" : "REDDEDILDI"; try { await api(`/api/tenant/personeller/izinler/${id}/durum`, { method: "PATCH", body: JSON.stringify({ durum }) }); await personelMerkeziYukle("izinler"); } catch (error) { alert(error.message); } });
    }

    async function personelMerkeziYukle(aktifTab = "personeller") {
        setTitle("Personel ve İK"); loading("Personel merkezi hazırlanıyor...");
        try {
            const [panel, personeller, izinler, devam] = await Promise.all([api("/api/tenant/personeller/panel"), api("/api/tenant/personeller"), api("/api/tenant/personeller/izinler"), api("/api/tenant/personeller/devam")]);
            personelMerkeziVeri = { panel: panel.panel || {}, personeller: personeller.personeller || [], izinler: izinler.izinler || [], devam: devam.devam || [] };
            personelIcerikCiz(aktifTab);
        } catch (error) { errorBox(error); }
    }

    let sahaMerkezi = null;
    function sahaGpsAl() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) return reject(new Error("Bu cihaz GPS konumunu desteklemiyor."));
            navigator.geolocation.getCurrentPosition(p => resolve({ enlem: p.coords.latitude, boylam: p.coords.longitude, hassasiyet: p.coords.accuracy }), () => reject(new Error("GPS konum izni verilmedi veya konum alınamadı.")), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
        });
    }
    function sahaModal(baslik, aciklama, alanlar, kaydet) {
        document.getElementById("sahaModal")?.remove(); const overlay = document.createElement("div"); overlay.id = "sahaModal"; overlay.className = "erp-modal-overlay";
        overlay.innerHTML = `<div class="erp-modal saha-modal"><div class="erp-modal-header"><div><h2>${escapeHtml(baslik)}</h2><p>${escapeHtml(aciklama)}</p></div><button class="erp-modal-close">×</button></div><form><div class="erp-form-grid">${alanlar}</div><div data-saha-mesaj></div><div class="erp-modal-footer"><button type="button" data-kapat class="erp-small-button">Vazgeç</button><button class="erp-primary-button">Kaydet</button></div></form></div>`;
        document.body.appendChild(overlay); const kapat = () => overlay.remove(); overlay.querySelectorAll(".erp-modal-close,[data-kapat]").forEach(x => x.onclick = kapat);
        overlay.querySelector("form").onsubmit = async e => { e.preventDefault(); const btn = e.submitter, mesaj = overlay.querySelector("[data-saha-mesaj]"); try { btn.disabled = true; btn.textContent = "GPS ve kayıt işleniyor..."; await kaydet(new FormData(e.currentTarget)); kapat(); await sahaYukle(sahaMerkezi?.gun, sahaMerkezi?.seciliKullaniciId); } catch (error) { mesaj.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; btn.disabled = false; btn.textContent = "Tekrar Dene"; } };
    }
    const sahaMusteriAdi = m => m?.unvan || m?.adSoyad || m?.kod || "Müşteri";
    function sahaMusteriFormu(m = null) {
        const v = m || {}; sahaModal(m ? "Müşteriyi Düzenle" : "Yeni Müşteri", "Müşteri kartı saha temsilcinize atanır ve GPS konumuyla kaydedilir.", `<label>Müşteri Kodu<input name="kod" required value="${escapeHtml(v.kod || `M-${Date.now().toString().slice(-7)}`)}"></label><label>Ünvan<input name="unvan" value="${escapeHtml(v.unvan || "")}"></label><label>Ad Soyad<input name="adSoyad" value="${escapeHtml(v.adSoyad || "")}"></label><label>Telefon<input name="telefon" value="${escapeHtml(v.telefon || "")}"></label><label>WhatsApp<input name="whatsapp" value="${escapeHtml(v.whatsapp || v.telefon || "")}"></label><label>E-posta<input name="email" type="email" value="${escapeHtml(v.email || "")}"></label><label>İl<input name="il" value="${escapeHtml(v.il || "")}"></label><label>İlçe<input name="ilce" value="${escapeHtml(v.ilce || "")}"></label><label class="full">Adres<textarea name="adres">${escapeHtml(v.adres || "")}</textarea></label><label class="full">Notlar<textarea name="notlar">${escapeHtml(v.notlar || "")}</textarea></label>`, async fd => { const body = Object.fromEntries(fd); body.konum = await sahaGpsAl(); await api(m ? `/api/tenant/musteriler/${encodeURIComponent(m._id)}` : "/api/tenant/musteriler", { method: m ? "PATCH" : "POST", body: JSON.stringify(body) }); });
    }
    async function sahaEkstreWhatsapp(m) {
        const result = await api(`/api/tenant/cari/musteri/${encodeURIComponent(m._id)}/ekstre-paylas`, { method: "POST" }); let tel = String(m.whatsapp || m.telefon || "").replace(/\D/g, ""); if (!tel) return alert("Müşterinin WhatsApp numarası kayıtlı değil."); if (tel.startsWith("0")) tel = `90${tel.slice(1)}`; window.open(`https://wa.me/${tel}?text=${encodeURIComponent(`Merhaba ${sahaMusteriAdi(m)}, güncel cari hesap ekstrenize güvenli bağlantıdan ulaşabilirsiniz:\n${result.link}`)}`, "_blank", "noopener");
    }
    function sahaTahsilatFormu(m, d) {
        const kasa = (d.kasalar || []).map(x => `<option value="NAKIT|KASA|${x._id}">Nakit · ${escapeHtml(x.kod || "")} ${escapeHtml(x.ad || "")}</option>`).join("");
        const pos = (d.bankalar || []).map(x => `<option value="KREDI_KARTI|BANKA|${x._id}">POS / Kredi Kartı · ${escapeHtml(x.bankaAdi || x.kod || "")}</option>`).join("");
        const iban = (d.bankalar || []).map(x => `<option value="IBAN|BANKA|${x._id}">IBAN / Havale · ${escapeHtml(x.bankaAdi || x.kod || "")} ${escapeHtml(x.iban || "")}</option>`).join("");
        const islemAnahtari = globalThis.crypto?.randomUUID?.() || `saha-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        return sahaModal("Tahsilat / Ödeme Al", `${sahaMusteriAdi(m)} · Güncel bakiye ${para(m.bakiye)}. Bakiye sıfırsa alınan tutar ön ödeme olarak cari hesaba işlenir.`, `<label class="full">Tahsilat Yöntemi<select name="kanal" required><option value="">Seçin</option>${kasa}${pos}${iban}<option value="CEK||">Çek</option><option value="SENET||">Senet</option></select></label><label>Tutar<input name="tutar" type="number" min="0.01" step="0.01" required></label><label>Tarih<input name="tarih" type="date" value="${new Date().toISOString().slice(0,10)}" required></label><label>Belge / Makbuz No<input name="belgeNo" placeholder="Çek/senet veya makbuz no"></label><label>Vade Tarihi<input name="vadeTarihi" type="date"></label><label>Keşideci<input name="kesideci"></label><label class="full">Açıklama<input name="aciklama" value="Saha müşteri tahsilatı"></label>`, async fd => {
            const [odemeYontemi, hesapTipi, hesapId] = String(fd.get("kanal") || "").split("|");
            await api("/api/tenant/cari/musteri/tahsilat", { method: "POST", body: JSON.stringify({ musteriId: m._id, kaynakKanal: "SAHA", sahaGun: d.gun, islemAnahtari, odemeYontemi, hesapTipi: hesapTipi || null, hesapId: hesapId || null, tutar: Number(fd.get("tutar")), tarih: fd.get("tarih"), belgeNo: fd.get("belgeNo"), vadeTarihi: fd.get("vadeTarihi") || null, kesideci: fd.get("kesideci"), aciklama: fd.get("aciklama") }) });
        });
    }
    async function sahaMusteriDetayAc(m, d) {
        document.getElementById("sahaModal")?.remove();
        const overlay = document.createElement("div"); overlay.id = "sahaModal"; overlay.className = "erp-modal-overlay";
        overlay.innerHTML = '<div class="erp-modal saha-modal"><div class="erp-modal-header"><div><h2>Müşteri İşlem Merkezi</h2><p>Cari, satış ve sipariş bilgileri yükleniyor...</p></div><button class="erp-modal-close">×</button></div><div class="empty-state">Yükleniyor...</div></div>';
        document.body.appendChild(overlay); overlay.querySelector(".erp-modal-close").onclick = () => overlay.remove();
        try {
            const data = await api(`/api/tenant/saha/musteriler/${encodeURIComponent(m._id)}/finans?_=${Date.now()}`), musteri = data.musteri;
            const hareketler = (data.cariHareketler || []).slice(0, 20), satislar = data.satislar || [], siparisler = data.siparisler || [];
            const bakiye = Number(musteri.bakiye || 0), bakiyeSinifi = bakiye > 0 ? "debt" : bakiye < 0 ? "credit" : "zero";
            overlay.querySelector(".erp-modal").innerHTML = `<div class="erp-modal-header"><div><h2>${escapeHtml(sahaMusteriAdi(musteri))}</h2><p>${escapeHtml(musteri.kod || "")} · ${escapeHtml(musteri.telefon || musteri.whatsapp || "Telefon yok")}</p></div><button class="erp-modal-close">×</button></div>
            <div class="saha-cari-summary ${bakiyeSinifi}"><span>Güncel Cari Bakiye</span><strong>${para(bakiye)}</strong><small>${bakiye > 0 ? "Müşteriden tahsil edilecek" : bakiye < 0 ? "Müşterinin ön ödemesi / alacağı" : "Hesap dengede; ön ödeme alınabilir"}</small></div>
            <div class="saha-detail-actions"><button data-smd="tahsilat" class="primary">💰 Tahsilat / Ödeme Al</button><button data-smd="siparis">📋 Sipariş Oluştur</button><button data-smd="satis">🧾 Satış Yap</button><button data-smd="ekstre">📄 Cari Ekstre / PDF</button><button data-smd="wa">WhatsApp Ekstre</button></div>
            <div class="saha-finans-counts"><div><span>Satış</span><b>${satislar.length}</b></div><div><span>Sipariş</span><b>${siparisler.length}</b></div><div><span>Cari Hareket</span><b>${data.cariHareketler?.length || 0}</b></div></div>
            <div class="panel-heading"><div><h3>Cari Hareketler</h3><p>Tahsilat, satış borcu, iade ve düzeltmeler aynı ekstreye bağlıdır.</p></div></div><div class="table-scroll"><table><thead><tr><th>Tarih</th><th>İşlem</th><th>Açıklama / Belge</th><th>Yöntem</th><th>Tutar</th><th>Son Bakiye</th></tr></thead><tbody>${hareketler.length ? hareketler.map(x => `<tr><td>${tarihKisa(x.tarih)}</td><td><strong>${escapeHtml(x.tip || "-")}</strong></td><td>${escapeHtml(x.aciklama || x.belgeNo || "-")}<small>${escapeHtml(x.belgeNo || "")}</small></td><td>${escapeHtml(x.odemeYontemi || "-")}</td><td>${para(x.tutar)}</td><td>${x.sonrakiBakiye === null || x.sonrakiBakiye === undefined ? "-" : para(x.sonrakiBakiye)}</td></tr>`).join("") : '<tr><td colspan="6"><div class="empty-state">Henüz cari hareket yok. Tahsilat ön ödeme olarak da alınabilir.</div></td></tr>'}</tbody></table></div>
            <div class="panel-heading"><div><h3>Siparişler</h3><p>Satışa dönüşmemiş siparişler cari bakiyeyi değiştirmez.</p></div></div><div class="saha-document-list">${siparisler.slice(0,10).map(x => `<div><span>${tarihKisa(x.tarih)} · ${escapeHtml(x.siparisNo || "Sipariş")}</span><b>${para(x.genelToplam)} · ${escapeHtml(x.durum || "-")}</b></div>`).join("") || '<div class="empty-state">Henüz sipariş yok.</div>'}</div>`;
            overlay.querySelector(".erp-modal-close").onclick = () => overlay.remove();
            overlay.querySelectorAll("[data-smd]").forEach(btn => btn.onclick = () => { overlay.remove(); if (btn.dataset.smd === "tahsilat") return sahaTahsilatFormu(musteri, d); if (btn.dataset.smd === "siparis") return musteriBelgeFormu("siparis", musteri).catch(e => alert(e.message)); if (btn.dataset.smd === "satis") return musteriBelgeFormu("satis", musteri, null, [], { saha: true, sahaGun: d.gun }).catch(e => alert(e.message)); if (btn.dataset.smd === "ekstre") return cariEkstreAc("musteri", musteri._id); if (btn.dataset.smd === "wa") return sahaEkstreWhatsapp(musteri).catch(e => alert(e.message)); });
        } catch (error) { overlay.querySelector(".erp-modal").innerHTML = `<div class="erp-modal-header"><h2>Müşteri İşlem Merkezi</h2><button class="erp-modal-close">×</button></div><div class="error">${escapeHtml(error.message)}</div>`; overlay.querySelector(".erp-modal-close").onclick = () => overlay.remove(); }
    }
    function sahaTesellumYazdir(d) {
        const t = d.tesellum || {}, m = t.masraflar || {}, k = d.sahaGun?.kasaTeslimi || {}; stokYazdir(`Gün Sonu Tesellüm · ${d.gun}`, [["Ciro", para(t.ciro)], ["Nakit", para(t.nakit)], ["POS / Kredi Kartı", para(t.posKrediKarti)], ["IBAN", para(t.iban)], ["Çek", para(t.cek)], ["Senet", para(t.senet)], ["Açık Hesap", para(t.acikHesap)], ["İadeler", para(t.iadeler)], ["Mazot", para(m.mazot)], ["Yemek", para(m.yemek)], ["Diğer Masraflar", para(m.diger)], ["Teslim Edilmesi Gereken", para(t.teslimEdilmesiGereken)], ["Teslim Edilen", para(k.teslimEdilen)], ["Eksik / Fazla", `${para(k.fark)} · ${k.durum || "BEKLİYOR"}`]], ["Kalem", "Tutar"], `${d.sahaGun?.kullaniciId?.adSoyad || oturumKullanici?.adSoyad || "Temsilci"} · ${d.sahaGun?.toplamKm || 0} km`);
    }
    async function sahaTesellumWhatsapp(d) {
        const result = await api("/api/tenant/saha/tesellum/paylas", { method: "POST", body: JSON.stringify({ gun: d.gun, kullaniciId: d.seciliKullaniciId }) }); const link = `${location.origin}/erp/paylasim.html?token=${encodeURIComponent(result.token)}`; const metin = `Gün sonu tesellüm raporu (${d.gun}) güvenli bağlantısı:\n${link}`; if (navigator.share) return navigator.share({ title: "Tesellüm Raporu", text: metin, url: link }); window.open(`https://wa.me/?text=${encodeURIComponent(metin)}`, "_blank", "noopener");
    }
    async function sahaTakipYukle(gun = new Date().toISOString().slice(0, 10)) {
        setTitle("Saha Personeli Takip / Gün Sonu Tesellüm"); loading("Saha personeli tesellüm raporu hazırlanıyor...");
        try {
            const d = await api(`/api/tenant/saha/takip?gun=${encodeURIComponent(gun)}`), kasaOpts = (d.anaKasalar || []).map(x => `<option value="${x._id}">${escapeHtml(x.kod)} · ${escapeHtml(x.ad)}</option>`).join("");
            content.innerHTML = `<div class="saha-hero"><div><div class="eyebrow">YÖNETİCİ KONTROLÜ</div><h2>Saha Personeli Takip / Gün Sonu Tesellüm</h2><p>Personel bazında satış, tahsilat, masraf ve teslim edilmesi gereken net nakdi izleyin.</p></div><div class="saha-filter"><input id="sahaTakipGun" type="date" value="${escapeHtml(d.gun)}"><button id="sahaTakipGeri" class="erp-small-button">Saha Paneli</button></div></div><div class="dashboard-panel"><div class="table-scroll"><table><thead><tr><th>Personel</th><th>Ciro / Satış</th><th>Tahsilatlar</th><th>Nakit</th><th>POS</th><th>IBAN</th><th>Çek</th><th>Senet</th><th>Açık Hesap</th><th>İadeler</th><th>Masraflar</th><th>TESLİM ETMESİ GEREKEN NET TUTAR</th><th>Teslim Al</th></tr></thead><tbody>${(d.satirlar || []).map(x => { const k=x.sahaGun?.kasaTeslimi||{}, tamam=Boolean(k.teslimTarihi); return `<tr data-tesellum-row="${x.sahaGun?._id || ""}"><td><b>${escapeHtml(x.personel?.adSoyad || x.personel?.email || "-")}</b><small>${escapeHtml(x.sahaGun?.durum || "GÜN AÇILMADI")}</small></td><td>${para(x.ciro)}<small>${Number(x.satisAdedi||0)} satış</small></td><td>${para(x.tahsilatlar)}</td><td>${para(x.nakit)}</td><td>${para(x.posKrediKarti)}</td><td>${para(x.iban)}</td><td>${para(x.cek)}</td><td>${para(x.senet)}</td><td>${para(x.acikHesap)}</td><td>${para(x.iadeler)}</td><td>${para(x.masraflar?.toplam)}</td><td><strong>${para(x.teslimEdilmesiGereken)}</strong></td><td>${tamam ? `<b>${escapeHtml(k.durum)}</b><small>${para(k.teslimEdilen)}</small>` : x.sahaGun ? `<select data-ana-kasa><option value="">Ana kasa</option>${kasaOpts}</select><input data-teslim-tutar type="number" min="0" step="0.01" value="${Number(x.teslimEdilmesiGereken||0)}"><button data-teslim-al class="erp-primary-button">Teslim Al</button>` : "-"}</td></tr>`; }).join("") || '<tr><td colspan="13">Saha personeli bulunamadı.</td></tr>'}</tbody></table></div></div>`;
            document.getElementById("sahaTakipGun").onchange = e => sahaTakipYukle(e.target.value);
            document.getElementById("sahaTakipGeri").onclick = () => sahaYukle(d.gun);
            document.querySelectorAll("[data-tesellum-row]").forEach(row => { if (row.dataset.tesellumRow && !row.querySelector("[data-teslim-al]")) { const btn = document.createElement("button"); btn.className = "erp-small-button"; btn.dataset.teslimIptal = "1"; btn.textContent = "İptal Et"; row.lastElementChild.appendChild(btn); } });
            document.querySelectorAll("[data-teslim-al]").forEach(btn => btn.onclick = async () => { const row=btn.closest("tr"), hedefKasaId=row.querySelector("[data-ana-kasa]").value, teslimEdilen=Number(row.querySelector("[data-teslim-tutar]").value); if(!hedefKasaId)return alert("Ana kasayı seçin."); if(!confirm(`${para(teslimEdilen)} teslim alınarak ana kasaya aktarılsın mı?`))return; try{btn.disabled=true;await api(`/api/tenant/saha/tesellum/${encodeURIComponent(row.dataset.tesellumRow)}/teslim-al`,{method:"POST",body:JSON.stringify({hedefKasaId,teslimEdilen})});await sahaTakipYukle(d.gun);}catch(error){alert(error.message);btn.disabled=false;} });
            document.querySelectorAll("[data-teslim-iptal]").forEach(btn => btn.onclick = async () => { const row = btn.closest("tr"), neden = prompt("Tesellüm iptal nedenini yazın:"); if (neden === null) return; if (!neden.trim()) return alert("İptal nedeni zorunludur."); try { btn.disabled = true; await api(`/api/tenant/saha/tesellum/${encodeURIComponent(row.dataset.tesellumRow)}/iptal`, { method: "POST", body: JSON.stringify({ neden: neden.trim() }) }); await sahaTakipYukle(d.gun); } catch (error) { alert(error.message); btn.disabled = false; } });
        } catch (error) { errorBox(error); }
    }
    function sahaIcerikCiz(d) {
        sahaMerkezi = d; const g = d.sahaGun, t = d.tesellum || {}, ziyaretler = g?.ziyaretler || [], tamam = ziyaretler.filter(x => x.durum === "TAMAMLANDI").length, aktifZ = ziyaretler.find(x => x.durum === "AKTIF"), aktifM = g?.molalar?.find(x => !x.bitisTarihi), k = g?.kasaTeslimi || {}, aktif = g?.durum === "AKTIF";
        const secimler = d.yonetici ? `<select id="sahaTemsilci"><option value="">Kendi hesabım</option>${(d.temsilciler || []).map(x => `<option value="${x._id}" ${String(x._id) === String(d.seciliKullaniciId) ? "selected" : ""}>${escapeHtml(x.adSoyad || x.email)}</option>`).join("")}</select><button id="sahaTakip" class="erp-primary-button">Personel Takip / Gün Sonu</button>` : "";
        content.innerHTML = `<div class="saha-hero"><div><div class="eyebrow">MOBİL SAHA SATIŞ</div><h2>${g ? (aktif ? "Saha günü devam ediyor" : "Saha günü tamamlandı") : "Sahaya çıkmaya hazır mısınız?"}</h2><p>GPS, müşteri, ziyaret, satış, masraf ve kasa teslimi tek güvenli akışta.</p></div><div class="saha-filter"><input id="sahaGun" type="date" value="${escapeHtml(d.gun)}">${secimler}<button id="sahaYenile" class="erp-small-button">Yenile</button></div></div>
        <div class="dashboard-grid saha-kpis">${card("Ziyaret", `${tamam}/${Number(g?.gunlukZiyaretHedefi || 0)}`, aktifZ ? "Ziyaret sürüyor" : "Günlük hedef")}${card("Araç KM", g ? `${Number(g.toplamKm || 0)} km` : "-", g ? `Çıkış: ${Number(g.cikisKm || 0)} km · Dönüş: ${g.donusKm === null || g.donusKm === undefined ? "Bekliyor" : `${Number(g.donusKm)} km`}` : "Araç çıkışı bekliyor")}${card("Net Ciro", para(t.netCiro), `${Number(t.satisAdedi || 0)} satış`)}${card("Ciro Primi", para(g?.hesaplananPrim || 0), g?.ciroHedefi ? `Hedef ${para(g.ciroHedefi)}` : "Gün sonunda hesaplanır")}${card("Teslim Kasa", para(t.teslimEdilmesiGereken), k.durum || "BEKLİYOR")}</div>
        <div class="saha-layout"><section class="dashboard-panel"><div class="panel-heading"><div><h2>Günlük Akış</h2><p>İşlemleri sırayla veya ihtiyacınıza göre tamamlayın.</p></div></div><div class="saha-actions">${!g ? '<button data-saha="baslat" class="primary">☀ Güne Başla</button>' : aktif ? `<button data-saha="bitir" class="danger">✓ Günü Bitir</button><button data-saha="rota">🗺 Rota / Hedef</button>${aktifZ ? '<button data-saha="ziyaret-bitir">■ Ziyareti Bitir</button>' : '<button data-saha="ziyaret-baslat">▶ Ziyaret Başlat</button>'}${aktifM ? '<button data-saha="mola-bitir">▶ Molayı Bitir</button>' : '<button data-saha="mola-baslat">☕ Mola Başlat</button>'}<button data-saha="masraf">⛽ Masraf Ekle</button><button data-saha="teslim">💰 Kasa Teslimi</button>` : ""}<button data-saha="musteri">＋ Yeni Müşteri</button><button data-saha="satis">🧾 Satış Yap</button><button data-saha="pdf">PDF Tesellüm</button><button data-saha="paylas">WhatsApp Tesellüm</button></div><div class="saha-progress"><span style="width:${Math.min(100, Number(g?.gunlukZiyaretHedefi) ? tamam / g.gunlukZiyaretHedefi * 100 : 0)}%"></span></div><div class="saha-timeline">${ziyaretler.slice().reverse().map(z => `<div><b>${escapeHtml(sahaMusteriAdi(z.musteriId))}</b><span>${z.durum === "AKTIF" ? "Devam ediyor" : `${Number(z.sureDakika || 0)} dk · ${escapeHtml(z.sonuc || "GORUSULDU")}`}</span></div>`).join("") || '<div><b>Henüz ziyaret yok</b><span>Rotadan veya müşteri listesinden ziyaret başlatın.</span></div>'}</div></section>
        <aside class="dashboard-panel"><h2>Tesellüm Özeti</h2><div class="saha-tesellum">${[["Ciro",t.ciro],["Nakit",t.nakit],["POS / Kart",t.posKrediKarti],["IBAN",t.iban],["Çek",t.cek],["Senet",t.senet],["Açık hesap",t.acikHesap],["İade",t.iadeler],["Mazot",t.masraflar?.mazot],["Yemek",t.masraflar?.yemek],["Diğer",t.masraflar?.diger]].map(x=>`<div><span>${x[0]}</span><b>${para(x[1])}</b></div>`).join("")}<div class="total"><span>Teslim gereken</span><button type="button" class="erp-primary-button" data-saha-teslim-ozet>${para(t.teslimEdilmesiGereken)}</button></div>${k.teslimTarihi ? `<div class="total ${k.durum === "TAM" ? "ok" : "warn"}"><span>${escapeHtml(k.durum)}</span><b>${para(k.fark)}</b></div>` : ""}</div></aside></div>
        <section class="dashboard-panel saha-customers"><div class="panel-heading"><div><h2>Müşterilerim</h2><p>Cari bakiye, tahsilat, sipariş, satış ve ekstre tek müşteri kartında.</p></div><input id="sahaMusteriAra" placeholder="Müşteri ara..."></div><div class="saha-customer-grid">${(d.musteriler || []).map(m => `<article data-saha-musteri-kart><div><strong>${escapeHtml(sahaMusteriAdi(m))}</strong><small>${escapeHtml(m.kod)} · ${escapeHtml(m.il || m.ilce || "Konum bilgisi yok")}</small><div class="saha-card-balance ${Number(m.bakiye || 0) > 0 ? "debt" : Number(m.bakiye || 0) < 0 ? "credit" : "zero"}"><span>Cari Bakiye</span><b>${para(m.bakiye)}</b></div></div><div class="saha-customer-actions"><button data-sm="detay" data-id="${m._id}" class="primary">İşlemler</button><button data-sm="tahsilat" data-id="${m._id}">Tahsilat</button><button data-sm="siparis" data-id="${m._id}">Sipariş</button><button data-sm="ziyaret" data-id="${m._id}">Ziyaret</button><button data-sm="satis" data-id="${m._id}">Satış</button><button data-sm="ekstre" data-id="${m._id}">Ekstre</button><button data-sm="wa" data-id="${m._id}">WhatsApp</button><button data-sm="duzenle" data-id="${m._id}">Düzenle</button></div></article>`).join("") || '<div class="empty-state">Henüz size atanmış müşteri bulunmuyor.</div>'}</div></section>`;
        document.querySelector('[data-saha="teslim"]')?.remove();
        const teslimHazir = d.kendiHesabi && !k.teslimTarihi && ((g && !aktif) || (!g && Number(d.sahaKasa?.bakiye || 0) > 0));
        if (teslimHazir) {
            const teslimButonu = document.createElement("button");
            teslimButonu.dataset.saha = "teslim";
            teslimButonu.className = "primary";
            teslimButonu.textContent = "💰 Saha Kasasını Ana Kasaya Teslim Et";
            document.querySelector(".saha-actions")?.prepend(teslimButonu);
        }
        document.getElementById("sahaYenile").onclick = () => sahaYukle(document.getElementById("sahaGun").value, document.getElementById("sahaTemsilci")?.value); document.getElementById("sahaGun").onchange = e => sahaYukle(e.target.value, document.getElementById("sahaTemsilci")?.value); document.getElementById("sahaTemsilci")?.addEventListener("change", e => sahaYukle(document.getElementById("sahaGun").value, e.target.value));
        document.getElementById("sahaTakip")?.addEventListener("click", () => sahaTakipYukle(d.gun));
        document.querySelector("[data-saha-teslim-ozet]")?.addEventListener("click", () => {
            if (k.teslimTarihi) return alert("Bu günün saha kasa teslimi zaten tamamlandı.");
            if (g && aktif) return alert("Kasa transferinden önce saha gününü bitirin.");
            const aktarilabilir = g ? Number(t.teslimEdilmesiGereken || 0) : Number(d.sahaKasa?.bakiye || 0);
            if (aktarilabilir <= 0) return alert("Ana kasaya aktarılacak saha kasa bakiyesi bulunmuyor.");
            sahaAksiyonBagli("teslim", d);
        });
        document.getElementById("sahaMusteriAra").oninput = e => { const q=e.target.value.toLocaleLowerCase("tr-TR"); document.querySelectorAll("[data-saha-musteri-kart]").forEach(x => x.hidden=!x.textContent.toLocaleLowerCase("tr-TR").includes(q)); };
        document.querySelectorAll("[data-sm]").forEach(x => x.onclick = async () => { const m=d.musteriler.find(y=>String(y._id)===x.dataset.id); if(x.dataset.sm==="detay")return sahaMusteriDetayAc(m,d); if(x.dataset.sm==="tahsilat")return sahaTahsilatFormu(m,d); if(x.dataset.sm==="siparis")return musteriBelgeFormu("siparis",m).catch(e=>alert(e.message)); if(x.dataset.sm==="duzenle")return sahaMusteriFormu(m); if(x.dataset.sm==="satis")return musteriBelgeFormu("satis",m,null,[],{saha:true,sahaGun:d.gun}).catch(e=>alert(e.message)); if(x.dataset.sm==="ekstre")return cariEkstreAc("musteri",m._id); if(x.dataset.sm==="wa")return sahaEkstreWhatsapp(m).catch(e=>alert(e.message)); if(x.dataset.sm==="ziyaret"){ try{await api("/api/tenant/saha/ziyaret/baslat",{method:"POST",body:JSON.stringify({gun:d.gun,musteriId:m._id,konum:await sahaGpsAl()})});await sahaYukle(d.gun,d.seciliKullaniciId)}catch(e){alert(e.message)} } });
        document.querySelectorAll("[data-saha]").forEach(x => x.onclick = () => sahaAksiyonBagli(x.dataset.saha,d));
    }
    function sahaAksiyon(tur,d){const g=d.sahaGun, musteriOpts=(d.musteriler||[]).map(m=>`<option value="${m._id}">${escapeHtml(m.kod)} · ${escapeHtml(sahaMusteriAdi(m))}</option>`).join(""), kasaOpts=(d.kasalar||[]).map(k=>`<option value="${k._id}">${escapeHtml(k.kod)} · ${escapeHtml(k.ad)}</option>`).join(""); if(tur==="musteri")return sahaMusteriFormu(); if(tur==="pdf")return sahaTesellumYazdir(d); if(tur==="paylas")return sahaTesellumWhatsapp(d).catch(e=>alert(e.message)); if(tur==="satis")return sahaModal("Satış Yap","Müşteriyi seçin; satış belgesi, ödeme ve stok bağlantısı açılacaktır.",`<label class="full">Müşteri<select name="musteriId" required><option value="">Seçin</option>${musteriOpts}</select></label>`,async fd=>{const m=d.musteriler.find(x=>String(x._id)===fd.get("musteriId"));document.getElementById("sahaModal")?.remove();await musteriBelgeFormu("satis",m)}); if(tur==="baslat")return sahaModal("Güne Başla","Araç çıkış bilgisi, hedef ve başlangıç GPS konumu kaydedilir.",`<label>Araç Plaka<input name="aracPlaka" required></label><label>Çıkış KM<input name="cikisKm" type="number" min="0" step="0.1" required></label><label>Ziyaret Hedefi<input name="gunlukZiyaretHedefi" type="number" min="0" value="10"></label><label>Ciro Hedefi<input name="ciroHedefi" type="number" min="0" step="0.01" value="0"></label><label>Ciro Primi %<input name="primOrani" type="number" min="0" max="100" step="0.01" value="0"></label><label>Satış Başı Prim<input name="satisBasiPrim" type="number" min="0" step="0.01" value="0"></label>`,async fd=>{const b=Object.fromEntries(fd);["cikisKm","gunlukZiyaretHedefi","ciroHedefi","primOrani","satisBasiPrim"].forEach(k=>b[k]=Number(b[k]));b.gun=d.gun;b.konum=await sahaGpsAl();await api("/api/tenant/saha/gun/baslat",{method:"POST",body:JSON.stringify(b)})}); if(tur==="bitir")return sahaModal("Günü Bitir","Dönüş kilometresi ve GPS kaydıyla günü kapatın.",`<label class="full">Dönüş KM<input name="donusKm" type="number" min="${Number(g.cikisKm||0)}" step="0.1" required></label>`,async fd=>api("/api/tenant/saha/gun/bitir",{method:"POST",body:JSON.stringify({gun:d.gun,donusKm:Number(fd.get("donusKm")),konum:await sahaGpsAl()})})); if(tur==="ziyaret-baslat")return sahaModal("Ziyaret Başlat","Müşteri ve başlangıç GPS konumu kaydedilir.",`<label class="full">Müşteri<select name="musteriId" required><option value="">Seçin</option>${musteriOpts}</select></label><label class="full">Not<textarea name="notlar"></textarea></label>`,async fd=>api("/api/tenant/saha/ziyaret/baslat",{method:"POST",body:JSON.stringify({gun:d.gun,musteriId:fd.get("musteriId"),notlar:fd.get("notlar"),konum:await sahaGpsAl()})})); if(tur==="ziyaret-bitir")return sahaModal("Ziyareti Bitir","Sonuç, süre ve bitiş GPS konumu kaydedilir.",`<label>Sonuç<select name="sonuc"><option value="GORUSULDU">Görüşüldü</option><option value="SATIS">Satış</option><option value="SIPARIS">Sipariş</option><option value="TAHSILAT">Tahsilat</option><option value="ULASILAMADI">Ulaşılamadı</option><option value="DIGER">Diğer</option></select></label><label class="full">Not<textarea name="notlar"></textarea></label>`,async fd=>api(`/api/tenant/saha/ziyaret/${g.ziyaretler.find(x=>x.durum==="AKTIF")._id}/bitir`,{method:"POST",body:JSON.stringify({gun:d.gun,sonuc:fd.get("sonuc"),notlar:fd.get("notlar"),konum:await sahaGpsAl()})})); if(tur==="mola-baslat")return sahaModal("Mola Başlat","Mola başlangıcı GPS konumuyla kaydedilir.",`<label>Tür<select name="tur"><option value="YEMEK">Yemek</option><option value="DINLENME">Dinlenme</option><option value="DIGER">Diğer</option></select></label><label class="full">Not<input name="notlar"></label>`,async fd=>api("/api/tenant/saha/mola/baslat",{method:"POST",body:JSON.stringify({gun:d.gun,tur:fd.get("tur"),notlar:fd.get("notlar"),konum:await sahaGpsAl()})})); if(tur==="mola-bitir")return api(`/api/tenant/saha/mola/${g.molalar.find(x=>!x.bitisTarihi)._id}/bitir`,{method:"POST",body:JSON.stringify({gun:d.gun})}).then(()=>sahaYukle(d.gun,d.seciliKullaniciId)).catch(e=>alert(e.message)); if(tur==="rota")return sahaModal("Rota ve Günlük Hedef","Müşteri ID'lerini seçmek yerine aşağıdaki listeden rota sırasını virgülle yazın.",`<label>Ziyaret Hedefi<input name="hedef" type="number" min="0" value="${Number(g.gunlukZiyaretHedefi||0)}"></label><label class="full">Rota<select name="rota" multiple size="${Math.min(8,Math.max(3,(d.musteriler||[]).length))}">${musteriOpts}</select></label>`,async fd=>api("/api/tenant/saha/rota",{method:"PATCH",body:JSON.stringify({gun:d.gun,gunlukZiyaretHedefi:Number(fd.get("hedef")),rota:[...document.querySelector("#sahaModal select[name=rota]").selectedOptions].map(x=>({musteriId:x.value}))})})); if(tur==="masraf")return sahaModal("Saha Masrafı","Mazot, yemek veya diğer gider seçilen sahra kasasına işlenir.",`<label>Kategori<select name="kategori"><option value="AKARYAKIT">Mazot</option><option value="YEMEK">Yemek</option><option value="DIGER">Diğer</option></select></label><label>Tutar<input name="tutar" type="number" min="0.01" step="0.01" required></label><label>Kasa<select name="kasaId" required><option value="">Seçin</option>${kasaOpts}</select></label><label>Fiş No<input name="fisNo"></label><label class="full">Açıklama<input name="aciklama" required></label>`,async fd=>{const b=Object.fromEntries(fd);b.gun=d.gun;b.tutar=Number(b.tutar);await api("/api/tenant/saha/masraf",{method:"POST",body:JSON.stringify(b)})}); if(tur==="teslim")return sahaModal("Kasa Teslimi",`Teslim edilmesi gereken: ${para(d.tesellum?.teslimEdilmesiGereken)}`,`<label>Kaynak Kasa<select name="kaynakKasaId" required><option value="">Seçin</option>${kasaOpts}</select></label><label>Teslim Kasası<select name="hedefKasaId" required><option value="">Seçin</option>${kasaOpts}</select></label><label class="full">Teslim Edilen<input name="teslimEdilen" type="number" min="0" step="0.01" value="${Number(d.tesellum?.teslimEdilmesiGereken||0)}" required></label>`,async fd=>{const b=Object.fromEntries(fd);b.gun=d.gun;b.teslimEdilen=Number(b.teslimEdilen);await api("/api/tenant/saha/kasa-teslim",{method:"POST",body:JSON.stringify(b)})});}
    function sahaAksiyonBagli(tur, d) {
        if (tur === "teslim") {
            const kaynak = d.sahaKasa || (d.kasalar || []).find(x => x.sahaKasasi) || (d.kasalar || [])[0];
            const anaKasaOpts = (d.anaKasalar || []).map(x => `<option value="${x._id}">${escapeHtml(x.kod)} · ${escapeHtml(x.ad)}</option>`).join("");
            const teslimTutari = d.sahaGun ? Number(d.tesellum?.teslimEdilmesiGereken || 0) : Number(kaynak?.bakiye || 0);
            return sahaModal(
                "Akşam Kasa Teslimi",
                "Teslim onaylandığında tutar saha kasanızdan düşer, ana kasaya eklenir ve iki taraflı transfer hareketi oluşur.",
                `<label>Kaynak Saha Kasası<input value="${escapeHtml(kaynak ? `${kaynak.kod} · ${kaynak.ad} · ${para(kaynak.bakiye || 0)}` : "Saha kasası")}" disabled></label><label>Ana Kasa<select name="hedefKasaId" required><option value="">Ana kasa seçin</option>${anaKasaOpts}</select></label><label class="full">Teslim Edilen<input name="teslimEdilen" type="number" min="0.01" max="${Number(kaynak?.bakiye || teslimTutari)}" step="0.01" value="${teslimTutari}" required></label>`,
                async fd => api("/api/tenant/saha/kasa-teslim", { method: "POST", body: JSON.stringify({ gun: d.gun, hedefKasaId: fd.get("hedefKasaId"), teslimEdilen: Number(fd.get("teslimEdilen")) }) })
            );
        }
        if (tur !== "satis") return sahaAksiyon(tur, d);
        const musteriOpts=(d.musteriler||[]).map(m=>`<option value="${m._id}">${escapeHtml(m.kod)} · ${escapeHtml(sahaMusteriAdi(m))}</option>`).join("");
        return sahaModal("Satış Yap", "Müşteriyi seçin; satış, cari, stok ve ödeme hareketleri birlikte oluşturulacaktır.", `<label class="full">Müşteri<select name="musteriId" required><option value="">Seçin</option>${musteriOpts}</select></label>`, async fd => { const m=d.musteriler.find(x=>String(x._id)===fd.get("musteriId")); document.getElementById("sahaModal")?.remove(); await musteriBelgeFormu("satis",m,null,[],{saha:true,sahaGun:d.gun}); });
    }
    async function sahaYukle(gun = new Date().toISOString().slice(0,10), kullaniciId = "") { setTitle("Saha Satış"); loading("Saha operasyonu hazırlanıyor..."); try { const q=new URLSearchParams({gun}); if(kullaniciId)q.set("kullaniciId",kullaniciId); sahaIcerikCiz(await api(`/api/tenant/saha/panel?${q}`)); } catch(error){errorBox(error);} }

    let profesyonelRaporDurumu = null;
    const RAPOR_ALAN_ETIKETLERI = {
        kod: "Kod", ad: "Ad", urun: "Ürün", urunKodu: "Ürün Kodu", tarih: "Tarih", createdAt: "İşlem Tarihi",
        belgeNo: "Belge No", musteriId: "Müşteri", tedarikciId: "Tedarikçi", kullaniciId: "İşlem Yapan",
        depoId: "Depo", urunId: "Ürün", taraf: "Cari Hesap", tarafTipi: "Hesap Türü", hesapTipi: "Hesap Türü",
        tip: "İşlem Türü", kaynak: "İşlem Kaynağı", odemeTipi: "Ödeme Tipi", odemeYontemi: "Ödeme Yöntemi",
        kalemler: "Belge İçeriği", aciklama: "Açıklama", kategori: "Kategori", marka: "Marka", sube: "Şube",
        paraBirimi: "Para Birimi", miktar: "Miktar", satilanMiktar: "Satılan Miktar", alinanMiktar: "Alınan Miktar",
        iadeMiktari: "İade Miktarı", netMiktar: "Net Miktar", kritikSeviye: "Kritik Seviye",
        belgeSayisi: "Belge Sayısı", kayitSayisi: "Kayıt Sayısı", araToplam: "Ara Toplam", genelToplam: "Genel Toplam",
        tutar: "Tutar", toplam: "Toplam", satis: "Satış", netSatis: "Net Satış", alis: "Alış", netAlis: "Net Alış",
        iade: "İade", maliyet: "Maliyet", birimMaliyet: "Birim Maliyet", kar: "Kâr", bakiye: "Bakiye",
        deger: "Değer", stokDegeri: "Stok Değeri", tahsilat: "Tahsilat", odeme: "Ödeme", fisNo: "Fiş No",
        vadeTarihi: "Vade Tarihi", tur: "Belge Türü", durum: "Durum"
    };
    const RAPOR_KOD_ETIKETLERI = {
        NAKIT: "Nakit", KREDI_KARTI: "Kredi Kartı", BANKA: "Banka", HAVALE: "Havale", EFT: "EFT", IBAN: "IBAN / Havale",
        CEK: "Çek", SENET: "Senet", ACIK_HESAP: "Açık Hesap", MUSTERI: "Müşteri", TEDARIKCI: "Tedarikçi",
        GIRIS: "Giriş", CIKIS: "Çıkış", IADE_GIRIS: "İade Girişi", IADE_CIKIS: "İade Çıkışı",
        TRANSFER_GIRIS: "Transfer Girişi", TRANSFER_CIKIS: "Transfer Çıkışı", DEVIR_GIRIS: "Devir Girişi", DEVIR_CIKIS: "Devir Çıkışı",
        SAYIM_ARTI: "Sayım Fazlası", SAYIM_EKSI: "Sayım Eksiği", SATIS: "Satış", ALIS: "Alış",
        SATIS_IADE: "Satış İadesi", ALIS_IADE: "Alış İadesi", TAHSILAT: "Tahsilat", ODEME: "Ödeme",
        BORC: "Borç", ALACAK: "Alacak", MANUEL: "Manuel İşlem", PORTFOYDE: "Portföyde", IADE: "İade", DUZELTME: "Düzeltme",
        AKARYAKIT: "Akaryakıt", YEMEK: "Yemek", KIRA: "Kira", FATURA: "Fatura", DIGER: "Diğer",
        TRY: "Türk Lirası", USD: "Amerikan Doları", EUR: "Euro",
        PENDING: "Bekliyor", PROCESSING: "İşleniyor", COMPLETED: "Tamamlandı", FAILED: "Başarısız", PARTIAL: "Kısmen Tamamlandı",
        UNMATCHED: "Eşleşmedi", MATCHED: "Eşleşti", IGNORED: "İşlem Dışı", APPROVED: "Onaylandı", ARCHIVED: "Arşivlendi",
        WAITING: "Bekliyor", PREPARING: "Hazırlanıyor", SHIPPED: "Kargoya Verildi", DELIVERED: "Teslim Edildi", CANCELLED: "İptal Edildi", RETURNED: "İade Edildi",
        ORDER_PULL: "Sipariş Alma", RETURN_PULL: "İade Alma", FINANCE_PULL: "Finans Hareketi Alma", DOCUMENT_PULL: "Belge Alma",
        PRODUCT_PUSH: "Ürün Gönderme", STOCK_PUSH: "Stok Gönderme", PRICE_PUSH: "Fiyat Gönderme", QUESTION_PULL: "Müşteri Sorusu Alma",
        AUTHENTICATION: "Kimlik Doğrulama", VALIDATION: "Veri Doğrulama", RATE_LIMIT: "İstek Sınırı", PROVIDER: "Sağlayıcı Hatası", INTERNAL: "Sistem Hatası",
        SUCCESS: "Başarılı", ACTIVE: "Aktif", INACTIVE: "Devre Dışı", NEW: "Yeni", ANSWERED: "Yanıtlandı", CLOSED: "Kapandı",
        ALINDI: "Alındı", ESLESME_BEKLIYOR: "Ürün Eşleşmesi Bekliyor", SIPARISE_DONUSTU: "ERP Siparişine Aktarıldı", BEKLIYOR: "Bekliyor", IPTAL: "İptal Edildi", HAZIRLANIYOR: "Hazırlanıyor", KARGODA: "Kargoda", TESLIM_EDILDI: "Teslim Edildi",
        UNPROCESSED: "Yeni", APPROVAL_REQUIRED: "Onay Bekliyor", PROCESSED: "İşlendi", SUGGESTED: "Eşleşme Önerildi", RESOLVED: "Çözüldü", RETRYING: "Tekrar Deneniyor", OPEN: "Açık",
        E_FATURA: "E-Fatura", E_ARSIV: "E-Arşiv", E_IRSALIYE: "E-İrsaliye", IADE_FATURASI: "İade Faturası", ALIS_FATURASI: "Alış Faturası", HIZMET_FATURASI: "Hizmet Faturası", KOMISYON_FATURASI: "Komisyon Faturası", KARGO_FATURASI: "Kargo Faturası",
        SALE: "Satış", REFUND: "İade", COMMISSION: "Komisyon", COMMISSION_REFUND: "Komisyon İadesi", CARGO: "Kargo", SERVICE_FEE: "Hizmet Bedeli", ADVERTISING: "Reklam", DISCOUNT: "İndirim", COUPON: "Kupon", WITHHOLDING: "Tevkifat", PAYMENT: "Ödeme", TRANSFER: "Transfer"
    };
    function raporKodEtiketi(value) { return RAPOR_KOD_ETIKETLERI[String(value || "").toUpperCase()] || value; }
    function raporAlanBasligi(key) {
        if (RAPOR_ALAN_ETIKETLERI[key]) return RAPOR_ALAN_ETIKETLERI[key];
        return key.replace(/Id$/, "").replace(/([A-Z])/g, " $1").replace(/^./, c => c.toLocaleUpperCase("tr-TR"));
    }
    function raporDegeriHazirla(value, key) {
        if (value === null || value === undefined) return value;
        if (Array.isArray(value)) return `${value.length} kalem`;
        if (typeof value === "object") return value.adSoyad || value.unvan || value.ad || value.bankaAdi || value.kod || "Kayıt bilgisi";
        if (typeof value === "boolean") return value ? "Evet" : "Hayır";
        return typeof value === "string" ? raporKodEtiketi(value) : value;
    }
    function raporHucre(value, key = "") {
        if (value === null || value === undefined) return "Hesaplanamadı";
        if (typeof value === "number") return /miktar|sayısı|adet|seviye/i.test(key) ? value.toLocaleString("tr-TR") : para(value);
        if (typeof value === "object") return escapeHtml(value.adSoyad || value.unvan || value.ad || value.bankaAdi || value.kod || "Kayıt bilgisi");
        if (/tarih/i.test(key) && /^\d{4}-\d{2}-\d{2}/.test(String(value))) return new Date(String(value).slice(0, 10) + "T12:00:00").toLocaleDateString("tr-TR");
        return escapeHtml(String(value));
    }
    function raporSatirlariniHazirla(rapor) {
        if (rapor.kod === "donemRaporu") return (profesyonelRaporDurumu?.donemRaporu || []).map(x => ({ İşaret: x.isaret, Kalem: x.ad, Tutar: x.tutar === null || x.tutar === undefined ? null : Number(x.tutar) }));
        return (rapor.satirlar || []).map(x => { const sonuc = {}; for (const [key, value] of Object.entries(x)) { if (key.startsWith("_") || key === "__v" || key === "tenantId" || key === "kaynakId" || key === "orijinalSatisId" || (/Id$/.test(key) && (typeof value === "string" || typeof value === "number"))) continue; sonuc[raporAlanBasligi(key)] = raporDegeriHazirla(value, key); } return sonuc; });
    }
    function raporTablosu(rapor) {
        const satirlar = raporSatirlariniHazirla(rapor), kolonlar = [...new Set(satirlar.flatMap(x => Object.keys(x)))];
        if (!satirlar.length) return '<div class="empty-state">Seçilen filtrelerde gerçek kayıt bulunamadı.</div>';
        const toplam = rapor.toplam === null || rapor.toplam === undefined ? "Hesaplanamadı" : para(rapor.toplam);
        return `<div class="table-scroll report-result-table"><table><thead><tr>${kolonlar.map(x => `<th>${escapeHtml(x)}</th>`).join("")}</tr></thead><tbody>${satirlar.map(row => `<tr>${kolonlar.map(key => `<td>${raporHucre(row[key], key)}</td>`).join("")}</tr>`).join("")}</tbody><tfoot><tr><td colspan="${Math.max(1, kolonlar.length - 1)}"><b>TOPLAM</b></td><td><b>${toplam}</b></td></tr></tfoot></table></div>`;
    }
    function raporGrafikleri(d) {
        const gunler = d.grafikler?.gunluk || [], max = Math.max(1, ...gunler.flatMap(x => [Math.abs(x.satis || 0), Math.abs(x.alis || 0), Math.abs(x.gider || 0)]));
        const gunluk = gunler.length ? `<div class="report-bars">${gunler.map(x => `<div class="report-bar-day"><div class="report-bar-stack"><i class="sales" style="height:${Math.max(2, Math.abs(x.satis || 0) / max * 130)}px" title="Satış ${para(x.satis)}"></i><i class="purchase" style="height:${Math.max(2, Math.abs(x.alis || 0) / max * 130)}px" title="Alış ${para(x.alis)}"></i><i class="expense" style="height:${Math.max(2, Math.abs(x.gider || 0) / max * 130)}px" title="Gider ${para(x.gider)}"></i></div><small>${escapeHtml(x.tarih.slice(5))}</small></div>`).join("")}</div>` : '<div class="empty-state">Grafik için dönem hareketi bulunamadı.</div>';
        const top = (d.grafikler?.enCokSatan || []).slice(0, 8), topMax = Math.max(1, ...top.map(x => Math.abs(x.netMiktar || 0)));
        return `<div class="report-chart-grid"><section class="dashboard-panel"><div class="panel-heading"><div><h3>Günlük Hareket</h3><p><span class="report-legend sales"></span> Satış <span class="report-legend purchase"></span> Alış <span class="report-legend expense"></span> Gider</p></div></div>${gunluk}</section><section class="dashboard-panel"><h3>En Çok Satan Ürünler</h3><div class="report-ranking">${top.map(x => `<div><span>${escapeHtml(x.kod)} · ${escapeHtml(x.urun)}</span><b>${Number(x.netMiktar || 0).toLocaleString("tr-TR")}</b><i><em style="width:${Math.max(2, Math.abs(x.netMiktar || 0) / topMax * 100)}%"></em></i></div>`).join("") || '<div class="empty-state">Satış kaydı yok.</div>'}</div></section></div>`;
    }
    function raporSeciliCiz() {
        const d = profesyonelRaporDurumu, kod = document.getElementById("raporTuru")?.value || "donemRaporu";
        if (!d) return; const rapor = kod === "donemRaporu" ? { kod, ad: "Dönem Kâr ve Stok Raporu", toplam: d.degerler?.netKarZarar ?? null, satirlar: d.donemRaporu } : d.raporlar[kod];
        if (!rapor) return; const toplam = rapor.toplam === null || rapor.toplam === undefined ? '<span class="report-unavailable">Hesaplanamadı</span>' : para(rapor.toplam);
        const alan = document.getElementById("raporDetayAlan"); if (alan) alan.innerHTML = `<div class="panel-heading"><div><h2>${escapeHtml(rapor.ad)}</h2><p>${escapeHtml(d.meta.donem.baslangicYazi)} – ${escapeHtml(d.meta.donem.bitisYazi)} · Gerçek kayıtlardan hesaplandı</p></div><b>${toplam}</b></div>${raporTablosu(rapor)}`;
    }
    function raporExcelIndir() {
        if (!profesyonelRaporDurumu || !window.XLSX) return alert("Önce raporu oluşturun; Excel kitaplığının yüklendiğini kontrol edin.");
        const d = profesyonelRaporDurumu, kod = document.getElementById("raporTuru").value, rapor = kod === "donemRaporu" ? { kod, ad: "Dönem Kâr ve Stok Raporu", toplam: d.degerler.netKarZarar } : d.raporlar[kod], satirlar = raporSatirlariniHazirla(rapor), filtre = document.getElementById("profesyonelRaporForm").dataset.filtreOzeti || "Tüm kayıtlar";
        const bilgi = [[d.meta.firmaAdi], [rapor.ad], [`Tarih aralığı: ${d.meta.donem.baslangicYazi} - ${d.meta.donem.bitisYazi}`], [`Filtreler: ${filtre}`], [`Oluşturulma: ${new Date(d.meta.olusturulmaTarihi).toLocaleString("tr-TR")}`], [`Maliyet durumu: ${d.meta.maliyetDurumu?.mesaj || "Doğrulandı"}`], [], ...XLSX.utils.sheet_to_json(XLSX.utils.json_to_sheet(satirlar), { header: 1 }), [], ["TOPLAM", rapor.toplam === null || rapor.toplam === undefined ? "Hesaplanamadı" : Number(rapor.toplam)], ["Sayfa", "1 / 1"]];
        const ws = XLSX.utils.aoa_to_sheet(bilgi); ws["!cols"] = Array.from({ length: Math.max(2, Object.keys(satirlar[0] || {}).length) }, () => ({ wch: 24 })); ws["!pageSetup"] = { orientation: "landscape", fitToWidth: 1, fitToHeight: 0 }; ws["!headerFooter"] = { oddHeader: `&C${d.meta.firmaAdi} · ${rapor.ad}`, oddFooter: "&CSayfa &P / &N" };
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Rapor"); XLSX.writeFile(wb, `${rapor.kod}-${d.meta.donem.baslangicYazi}-${d.meta.donem.bitisYazi}.xlsx`, { compression: true });
    }
    function raporYazdir() {
        if (!profesyonelRaporDurumu) return alert("Önce raporu oluşturun."); const d = profesyonelRaporDurumu, kod = document.getElementById("raporTuru").value, rapor = kod === "donemRaporu" ? { kod, ad: "Dönem Kâr ve Stok Raporu", toplam: d.degerler.netKarZarar } : d.raporlar[kod], filtre = document.getElementById("profesyonelRaporForm").dataset.filtreOzeti || "Tüm kayıtlar", pencere = window.open("", "_blank"); if (!pencere) return alert("Yazdırma penceresine izin verin."); pencere.opener = null;
        pencere.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(rapor.ad)}</title><style>@page{size:A4 landscape;margin:15mm}@media print{footer{position:fixed;bottom:0}.no-print{display:none}}body{font:12px Arial;color:#172033}h1{margin-bottom:4px}.meta{color:#596579;margin-bottom:18px}.warning{padding:10px;background:#fff7ed;color:#9a3412;margin-bottom:12px}table{width:100%;border-collapse:collapse}th,td{padding:7px;border:1px solid #ccd3df;text-align:left}th{background:#edf2f7}tfoot{font-weight:bold}footer{margin-top:20px;width:100%;display:flex;justify-content:space-between;color:#667085}.page:after{content:"Sayfa " counter(page) " / " counter(pages)}</style></head><body><h1>${escapeHtml(d.meta.firmaAdi)}</h1><h2>${escapeHtml(rapor.ad)}</h2><div class="meta">Tarih: ${escapeHtml(d.meta.donem.baslangicYazi)} – ${escapeHtml(d.meta.donem.bitisYazi)}<br>Filtreler: ${escapeHtml(filtre)}<br>Oluşturulma: ${new Date(d.meta.olusturulmaTarihi).toLocaleString("tr-TR")}</div>${d.meta.maliyetDurumu&&!d.meta.maliyetDurumu.stokDegeriGuvenilir?`<div class="warning">${escapeHtml(d.meta.maliyetDurumu.mesaj)}</div>`:""}${raporTablosu(rapor)}<footer><span>Toplam: ${rapor.toplam===null||rapor.toplam===undefined?"Hesaplanamadı":para(rapor.toplam)}</span><span class="page"></span></footer><script>window.onload=()=>window.print()<\/script></body></html>`); pencere.document.close();
    }
    async function raporMerkeziYukle(yuklemeNo = sayfaYuklemeNo) {
        setTitle("ERP Raporları"); loading("Yönetici rapor özeti hazırlanıyor...");
        try {
            const f = await api("/api/tenant/raporlar/filtreler"); if (yuklemeNo !== sayfaYuklemeNo) return; const s = f.secenekler || {}, opts = (liste, etiket) => (liste || []).map(x => `<option value="${x._id}">${escapeHtml(x.kod ? `${x.kod} · ` : "")}${escapeHtml(x[etiket] || x.unvan || x.adSoyad || x.ad || "-")}</option>`).join("");
            const raporSecenekleri = [...(f.raporlar || []), { kod: "stokMevcudu", ad: "Stok Mevcudu" }, { kod: "stokHareketleri", ad: "Stok Hareketleri" }, { kod: "gelirGider", ad: "Gelir / Gider" }];
            const kategoriler = [{ baslik: "SATIŞ RAPORLARI", raporlar: [["Günlük / Aylık / Yıllık Satış", "toplamSatisGeliri"], ["Ürün Satışları", "netSatislar"], ["Müşteri Satışları", "musteriBazliSatis"], ["Satış Temsilcisi", "satisTemsilcisiPerformansi"], ["İadeler", "satisIadeleri"], ["En Çok Satanlar", "enCokSatanUrunler"], ["En Çok Kâr Bırakanlar", "enCokKarBirakanUrunler"]] }, { baslik: "STOK RAPORLARI", raporlar: [["Stok Mevcudu", "stokMevcudu"], ["Stok Değeri", "stokDegeri"], ["Dönem Başı Stok", "donemBasiMalMevcudu"], ["Dönem Sonu Stok", "donemSonuMalMevcudu"], ["Stok Hareketleri", "stokHareketleri"], ["Kritik Stok", "kritikStoklar"], ["Satılan Malın Maliyeti", "satilanMalinMaliyeti"]] }, { baslik: "FİNANS RAPORLARI", raporlar: [["Gelir / Gider", "gelirGider"], ["Kâr / Zarar", "netKarZarar"], ["Kasa", "kasaBakiyesi"], ["Banka", "bankaBakiyesi"], ["Tahsilatlar", "tahsilatRaporu"], ["Ödemeler", "odemeRaporu"], ["Çek / Senet", "cekSenetPortfoyu"], ["Müşteri Alacakları", "musteriAlacaklari"], ["Tedarikçi Borçları", "tedarikciBorclari"]] }, { baslik: "DÖNEM RAPORLARI", raporlar: [["Günlük Özet", "donemRaporu", "BUGUN"], ["Aylık Özet", "donemRaporu", "BU_AY"], ["Yıllık Özet", "donemRaporu", "BU_YIL"], ["Dönem Kâr / Zarar", "netKarZarar"], ["Dönem Mal Mevcudu", "donemRaporu"]] }];
            content.innerHTML = `<div class="welcome-banner report-hero"><div><div class="eyebrow">ERP RAPORLARI</div><h2>Yönetici özeti</h2><p>Gerçek satış, stok ve finans hareketlerinden hesaplanan sade rapor merkezi.</p></div></div><nav class="report-period-tabs" aria-label="Rapor dönemi"><button data-rapor-donem="BUGUN">Bugün</button><button data-rapor-donem="BU_HAFTA">Bu Hafta</button><button data-rapor-donem="BU_AY" class="active">Bu Ay</button><button data-rapor-donem="BU_YIL">Bu Yıl</button><button data-rapor-donem="OZEL">Özel Tarih</button></nav><div id="raporOzelTarih" class="report-custom-date" hidden><label>Başlangıç<input id="raporOzelBaslangic" type="date"></label><label>Bitiş<input id="raporOzelBitis" type="date"></label><button id="raporOzelUygula" class="erp-primary-button">Uygula</button></div><div id="raporSonuc"><div class="dashboard-loading">Rapor hesaplanıyor...</div></div><section id="raporKategoriler" class="report-category-grid">${kategoriler.map(k => `<article class="dashboard-panel report-category"><h3>${k.baslik}</h3>${k.raporlar.map(x => `<button data-rapor-ac="${x[1]}"${x[2] ? ` data-rapor-donem-sec="${x[2]}"` : ""}><span>${escapeHtml(x[0])}</span><b>›</b></button>`).join("")}</article>`).join("")}</section><section id="raporDetayKabuk" class="report-detail-shell" hidden><div class="dashboard-panel report-advanced"><div class="panel-heading"><div><h3>Gelişmiş Filtreler</h3><p>Bu rapor için sonuç kapsamını daraltın.</p></div></div><form id="profesyonelRaporForm" class="erp-form-grid report-filter-grid"><input type="hidden" name="donem" value="BU_AY"><input type="hidden" name="baslangic"><input type="hidden" name="bitis"><label>Rapor<select id="raporTuru">${raporSecenekleri.map(x => `<option value="${x.kod}">${escapeHtml(x.ad)}</option>`).join("")}<option value="donemRaporu">Dönem Kâr ve Stok Raporu</option></select></label><label>Şube<select name="sube"><option value="">Tüm şubeler</option>${(s.subeler || []).map(x => `<option>${escapeHtml(x)}</option>`).join("")}</select></label><label>Depo<select name="depoId"><option value="">Tüm depolar</option>${opts(s.depolar,"ad")}</select></label><label>Müşteri<select name="musteriId"><option value="">Tüm müşteriler</option>${opts(s.musteriler,"unvan")}</select></label><label>Tedarikçi<select name="tedarikciId"><option value="">Tüm tedarikçiler</option>${opts(s.tedarikciler,"unvan")}</select></label><label>Ürün<select name="urunId"><option value="">Tüm ürünler</option>${opts(s.urunler,"ad")}</select></label><label>Marka<select name="marka"><option value="">Tüm markalar</option>${(s.markalar || []).map(x => `<option>${escapeHtml(x)}</option>`).join("")}</select></label><label>Kategori<select name="kategori"><option value="">Tüm kategoriler</option>${(s.kategoriler || []).map(x => `<option>${escapeHtml(x)}</option>`).join("")}</select></label><label>Satış Temsilcisi<select name="temsilciId"><option value="">Tüm temsilciler</option>${opts(s.temsilciler,"adSoyad")}</select></label><label>Ödeme Tipi<select name="odemeTipi"><option value="">Tüm ödeme tipleri</option>${(s.odemeTipleri || []).map(x => `<option value="${escapeHtml(x)}">${escapeHtml(raporKodEtiketi(x))}</option>`).join("")}</select></label><div class="full report-filter-actions"><button class="erp-primary-button">Filtreleri Uygula</button><button type="button" id="raporTemizle" class="erp-small-button">Filtreleri Temizle</button></div></form></div><section class="dashboard-panel"><div class="report-toolbar"><button id="raporExcel" class="erp-small-button">Excel</button><button id="raporPdf" class="erp-small-button">PDF</button><button id="raporYazdir" class="erp-small-button">Yazdır</button></div><div id="raporDetayAlan"></div></section><div id="raporDetayGrafik"></div></section>`;
            const form = content.querySelector("#profesyonelRaporForm"), sonuc = content.querySelector("#raporSonuc");
            const getir = async () => { const fd = new FormData(form), q = new URLSearchParams(); for (const [k, v] of fd) if (v) q.set(k, v); if (fd.get("donem") === "OZEL" && (!fd.get("baslangic") || !fd.get("bitis"))) return alert("Özel dönem için başlangıç ve bitiş tarihini seçin."); const etiketler = [...form.querySelectorAll("select:not(#raporTuru)")].filter(x => x.value).map(x => `${x.closest("label").childNodes[0].textContent.trim()}: ${x.selectedOptions[0].textContent.trim()}`); form.dataset.filtreOzeti = etiketler.join(" · ") || "Tüm kayıtlar"; sonuc.innerHTML='<div class="dashboard-loading">Gerçek hareketlerden rapor hesaplanıyor...</div>'; try { const d = await api(`/api/tenant/raporlar/profesyonel?${q}`); if (yuklemeNo !== sayfaYuklemeNo) return; profesyonelRaporDurumu = d; const o=d.ozet||{}, cmp=d.karsilastirma||{}, kart=(ad,value,key)=>{ const yok=value===null||value===undefined, fark=cmp[key]?.fark; return `<article class="summary-card ${yok?"unavailable":""}"><span>${escapeHtml(ad)}</span><strong>${yok?"Hesaplanamadı":para(value)}</strong><small class="${Number(fark||0)>=0?"sales-clear":"sales-debt"}">${yok?"Geçmiş maliyet eksik":cmp[key]?.yuzde===null?"Önceki dönem veri yok":`${Number(fark||0)>=0?"▲":"▼"} %${Math.abs(Number(cmp[key]?.yuzde||0)).toLocaleString("tr-TR")}`}</small></article>`; }; const durum=d.meta?.maliyetDurumu, uyari=durum&&(!durum.smmGuvenilir||!durum.stokDegeriGuvenilir)?`<div class="report-data-warning"><b>${escapeHtml(durum.mesaj)}</b>${(durum.uyarilar||[]).map(x=>`<span>${escapeHtml(x)}</span>`).join("")}</div>`:""; sonuc.innerHTML=`${uyari}<div class="dashboard-grid report-summary-grid">${[["Satış",o.toplamSatis,"toplamSatis"],["Alış",o.toplamAlis,"toplamAlis"],["Tahsilat",o.tahsilat,"tahsilat"],["Ödeme",o.odeme,"odeme"],["Gider",o.gider,"gider"],["Brüt Kâr",o.brutKar,"brutKar"],["Net Kâr / Zarar",o.netKarZarar,"netKarZarar"],["Kasa",o.kasa,"kasa"],["Banka",o.banka,"banka"],["Müşteri Alacağı",o.musteriAlacagi,"musteriAlacagi"],["Tedarikçi Borcu",o.tedarikciBorcu,"tedarikciBorcu"],["Stok Değeri",o.stokDegeri,"stokDegeri"]].map(x=>kart(...x)).join("")}</div>`; if(!content.querySelector("#raporDetayKabuk").hidden){raporSeciliCiz();content.querySelector("#raporDetayGrafik").innerHTML=raporGrafikleri(d);} } catch(error) { sonuc.innerHTML=`<div class="error">${escapeHtml(error.message)}</div>`; } };
            form.onsubmit = e => { e.preventDefault(); getir(); }; content.querySelector("#raporTemizle").onclick = () => { const donem=form.elements.donem.value, baslangic=form.elements.baslangic.value, bitis=form.elements.bitis.value; form.reset(); form.elements.donem.value=donem;form.elements.baslangic.value=baslangic;form.elements.bitis.value=bitis;getir(); }; content.querySelector("#raporTuru").onchange=raporSeciliCiz; content.querySelector("#raporExcel").onclick=raporExcelIndir; content.querySelector("#raporPdf").onclick=raporYazdir; content.querySelector("#raporYazdir").onclick=raporYazdir;
            content.querySelectorAll("[data-rapor-donem]").forEach(button=>button.onclick=()=>{const donem=button.dataset.raporDonem;if(donem==="OZEL"){content.querySelector("#raporOzelTarih").hidden=false;return;}content.querySelector("#raporOzelTarih").hidden=true;form.elements.donem.value=donem;form.elements.baslangic.value="";form.elements.bitis.value="";content.querySelectorAll("[data-rapor-donem]").forEach(x=>x.classList.toggle("active",x===button));getir();});
            content.querySelector("#raporOzelUygula").onclick=()=>{const baslangic=content.querySelector("#raporOzelBaslangic").value,bitis=content.querySelector("#raporOzelBitis").value;if(!baslangic||!bitis)return alert("Başlangıç ve bitiş tarihini seçin.");form.elements.donem.value="OZEL";form.elements.baslangic.value=baslangic;form.elements.bitis.value=bitis;content.querySelectorAll("[data-rapor-donem]").forEach(x=>x.classList.toggle("active",x.dataset.raporDonem==="OZEL"));getir();};
            content.querySelectorAll("[data-rapor-ac]").forEach(button=>button.onclick=async()=>{const kabuk=content.querySelector("#raporDetayKabuk");kabuk.hidden=false;content.querySelector("#raporTuru").value=button.dataset.raporAc;if(button.dataset.raporDonemSec){form.elements.donem.value=button.dataset.raporDonemSec;await getir();}else{raporSeciliCiz();content.querySelector("#raporDetayGrafik").innerHTML=raporGrafikleri(profesyonelRaporDurumu||{});}kabuk.scrollIntoView({behavior:"smooth",block:"start"});}); await getir();
        } catch (error) { errorBox(error); }
    }

    const eticaretSekmeleri = [["overview", "Genel Bakış"], ["connections", "Pazaryeri Hesapları"], ["products", "Ürün Entegrasyonu"], ["orders", "Siparişler"], ["returns", "İade & İptaller"], ["cargo", "Kargo & Sevkiyat"], ["invoices", "E-Fatura / E-Arşiv"], ["documents", "Gelen Belgeler & Masraflar"], ["finance", "Finans / Komisyon / Hakediş"], ["categories", "Kategori & Özellik Eşleştirme"], ["sync", "Senkronizasyon Geçmişi"], ["errors", "Hatalar"], ["settings", "Ayarlar"]];
    const eticaretProviderEtiketi = new Proxy({ TRENDYOL: "Trendyol", HEPSIBURADA: "Hepsiburada", N11: "N11", AMAZON_TR: "Amazon TR", CICEKSEPETI: "ÇiçekSepeti", PAZARAMA: "Pazarama", IDEASOFT: "IdeaSoft", CUSTOM: "Diğer", EDOCUMENT_CUSTOM: "E-Belge Sağlayıcısı", TEST_MAGAZA: "Test Mağaza" }, { get(target, key) { if (typeof key !== "string") return target[key]; return target[key] || key.replaceAll("_", " ").toLocaleLowerCase("tr-TR").replace(/(^|\s)\S/g, c => c.toLocaleUpperCase("tr-TR")); } });

    function eticaretBaglantiFormuLegacy(mevcut = null) {
        const overlay = document.createElement("div"); overlay.className = "erp-modal-overlay"; overlay.id = "eticaretModal";
        overlay.innerHTML = `<div class="erp-modal" style="max-width:720px"><div class="erp-modal-header"><div><h2>${mevcut ? "Bağlantıyı Düzenle" : "Yeni Entegrasyon Hesabı"}</h2><p>API anahtarı ve secret yalnızca şifrelenmiş saklanır; ekrana geri gönderilmez.</p></div><button class="erp-modal-close">×</button></div><form><div class="erp-form-grid"><label>Tür<select name="type"><option value="MARKETPLACE">Pazaryeri</option><option value="EDOCUMENT">E-Belge</option></select></label><label>Sağlayıcı<select name="provider">${Object.entries(eticaretProviderEtiketi).map(([k,v]) => `<option value="${k}" ${mevcut?.provider === k ? "selected" : ""}>${v}</option>`).join("")}</select></label><label>Mağaza / Hesap Adı<input name="storeName" required value="${escapeHtml(mevcut?.storeName || "")}"></label><label>Satıcı / Merchant ID<input name="sellerId" value="${escapeHtml(mevcut?.sellerId || mevcut?.merchantId || "")}"></label><label>Ortam<select name="environment"><option value="PRODUCTION">Canlı</option><option value="STAGE" ${mevcut?.environment === "STAGE" ? "selected" : ""}>Test / Stage</option></select></label><label>API Key / Kullanıcı<input name="apiKey" ${mevcut ? "" : "required"} autocomplete="off" placeholder="${mevcut ? "Değişmeyecekse boş bırakın" : "API Key"}"></label><label>API Secret / Parola<input name="apiSecret" type="password" ${mevcut ? "" : "required"} autocomplete="new-password" placeholder="********"></label><label class="full">Token (sağlayıcı istiyorsa)<input name="token" type="password" autocomplete="new-password" placeholder="********"></label></div><div class="personnel-finance-note">Gerçek bilgiler girilmeden bağlantı başarılı gösterilmez. Doğrulanmamış sağlayıcılar açıkça “entegrasyon ayarlanmadı” yanıtı verir.</div><div id="eticaretFormMesaj"></div><div class="erp-modal-footer"><button type="button" class="erp-small-button" data-kapat>Vazgeç</button><button class="erp-primary-button">Kaydet</button></div></form></div>`;
        document.body.appendChild(overlay); const kapat = () => overlay.remove(); overlay.querySelectorAll(".erp-modal-close,[data-kapat]").forEach(x => x.onclick = kapat);
        overlay.querySelector("form").onsubmit = async event => { event.preventDefault(); const fd = new FormData(event.currentTarget), body = { type: fd.get("type"), provider: fd.get("provider"), storeName: fd.get("storeName"), sellerId: fd.get("sellerId"), environment: fd.get("environment") }, credentials = {}; for (const key of ["apiKey", "apiSecret", "token"]) if (fd.get(key)) credentials[key] = fd.get(key); if (Object.keys(credentials).length) body.credentials = credentials; try { await api(mevcut ? `/api/tenant/eticaret/connections/${mevcut._id}` : "/api/tenant/eticaret/connections", { method: mevcut ? "PATCH" : "POST", body: JSON.stringify(body) }); kapat(); await eticaretYukle("connections"); } catch (error) { overlay.querySelector("#eticaretFormMesaj").innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } };
    }

    function eticaretTabloAraclari(panel) {
        const table = panel?.querySelector("table"), heading = panel?.querySelector(".panel-heading");
        if (!table || !heading || heading.querySelector(".ecommerce-table-tools")) return;
        const title = heading.querySelector("h2")?.textContent?.trim() || "E-Ticaret Kayıtları";
        const tools = document.createElement("div"); tools.className = "ecommerce-table-tools";
        tools.innerHTML = '<input type="search" aria-label="Tabloda ara" placeholder="Bu tabloda ara..."><button type="button" class="erp-small-button" data-ec-excel>Excel</button><button type="button" class="erp-small-button" data-ec-pdf>PDF</button>';
        heading.appendChild(tools);
        const rows = [...table.tBodies[0]?.rows || []].filter(row => !row.querySelector("td[colspan]"));
        const pageSize = 25; let page = 1, filtered = rows;
        const pagination = document.createElement("div"); pagination.className = "ecommerce-pagination"; table.closest(".table-scroll")?.after(pagination);
        const draw = () => { const total = Math.max(1, Math.ceil(filtered.length / pageSize)); page = Math.min(page, total); rows.forEach(row => row.hidden = true); filtered.slice((page - 1) * pageSize, page * pageSize).forEach(row => row.hidden = false); pagination.innerHTML = `<button type="button" class="erp-small-button" data-prev ${page === 1 ? "disabled" : ""}>Önceki</button><span>${filtered.length} kayıt · Sayfa ${page}/${total}</span><button type="button" class="erp-small-button" data-next ${page === total ? "disabled" : ""}>Sonraki</button>`; pagination.querySelector("[data-prev]")?.addEventListener("click", () => { page--; draw(); }); pagination.querySelector("[data-next]")?.addEventListener("click", () => { page++; draw(); }); };
        tools.querySelector("input").oninput = event => { const q = event.target.value.toLocaleLowerCase("tr-TR").trim(); filtered = rows.filter(row => row.textContent.toLocaleLowerCase("tr-TR").includes(q)); page = 1; draw(); };
        tools.querySelector("[data-ec-excel]").onclick = () => { if (!window.XLSX) return alert("Excel kitaplığı yüklenemedi."); const ws = XLSX.utils.table_to_sheet(table), wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Kayıtlar"); XLSX.writeFile(wb, `${title.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9çğıöşü]+/gi, "-")}-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression:true }); };
        tools.querySelector("[data-ec-pdf]").onclick = () => { const win = window.open("", "_blank"); if (!win) return alert("PDF/yazdırma penceresine izin verin."); win.opener = null; win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>@page{size:A4 landscape;margin:12mm}body{font:11px Arial;color:#172033}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:6px;text-align:left}th{background:#f1f5f9}button,input{display:none}</style></head><body><h1>${escapeHtml(title)}</h1><p>${new Date().toLocaleString("tr-TR")}</p>${table.outerHTML}<script>window.onload=()=>window.print()<\/script></body></html>`); win.document.close(); };
        draw();
    }

    async function eticaretYukleLegacy(aktifSekme = "overview", filtre = {}) {
        setTitle("E-Ticaret & E-Belge Entegrasyon Merkezi"); loading("Entegrasyon merkezi hazırlanıyor...");
        try {
            const now = new Date(), iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; if (!filtre.baslangic) filtre = { baslangic: iso(new Date(now.getFullYear(), now.getMonth(), 1)), bitis: iso(now), donem: "BU_AY" };
            const query = new URLSearchParams({ baslangic: filtre.baslangic, bitis: filtre.bitis }); if (filtre.provider) query.set("provider", filtre.provider);
            const results = await Promise.allSettled([api(`/api/tenant/eticaret/dashboard?${query}`), api("/api/tenant/eticaret/connections"), api(`/api/tenant/eticaret/siparisler?${query}`), api("/api/tenant/eticaret/sync-jobs"), api("/api/tenant/eticaret/errors")]), val = (i, fallback) => results[i].status === "fulfilled" ? results[i].value : fallback;
            const d = val(0,{cards:{},durum:"ENTEGRASYON AYARLANMADI"}), connections = val(1,{connections:[]}).connections||[], orders = val(2,{siparisler:[]}).siparisler||[], c=d.cards||{};
            const kpis = [["Bugünkü Pazaryeri Siparişleri",c.bugunkuPazaryeriSiparisleri],["Bekleyen Sipariş",c.bekleyenSiparis],["Hazırlanan Sipariş",c.hazirlananSiparis],["Kargoya Verilen",c.kargoyaVerilen],["İade / İptal",c.iadeIptal],["Pazaryeri Cirosu",para(c.pazaryeriCirosu)],["Pazaryeri Komisyonları",para(c.pazaryeriKomisyonlari)],["Kargo Kesintileri",para(c.kargoKesintileri)],["Diğer Kesintiler",para(c.digerKesintiler)],["Net Hakediş",para(c.netHakedis)],["Beklenen Ödeme",para(c.beklenenOdeme)],["Gelen E-Fatura",c.gelenEFatura],["İşlenmemiş Masraf Faturası",c.islenmemisMasrafFaturasi],["Gönderilemeyen E-Fatura",c.gonderilemeyenEFatura],["Senkronizasyon Hatası",c.senkronizasyonHatasi]];
            content.innerHTML = `<div class="purchase-hero ecommerce-hero"><div><span>ENTEGRASYON MERKEZİ</span><h2>E-Ticaret & E-Belge Entegrasyon Merkezi</h2><p>Pazaryeri siparişlerini, ürünleri, e-belgeleri ve hakedişleri tek merkezden yönetin.</p></div><div class="stock-hero-actions">${oturumYetkisiVar("ecommerce.settings")?'<button id="eticaretYeniBaglanti">+ Hesap Bağla</button>':""}<button id="eticaretYenile">Yenile</button></div></div><div class="ecommerce-status ${d.configured?"connected":"not-connected"}"><b>${escapeHtml(d.durum||"ENTEGRASYON AYARLANMADI")}</b><span>${d.configured?`${connections.length} hesap kayıtlı`:"Gerçek API bilgileri girilmeden senkronizasyon yapılmaz."}</span></div><div class="stock-filterbar ecommerce-filters"><select id="eticaretDonem"><option value="BUGUN">Bugün</option><option value="DUN">Dün</option><option value="BU_HAFTA">Bu Hafta</option><option value="BU_AY" selected>Bu Ay</option><option value="OZEL">Özel Tarih Aralığı</option></select><input id="eticaretBaslangic" type="date" value="${filtre.baslangic}"><input id="eticaretBitis" type="date" value="${filtre.bitis}"><select id="eticaretProvider"><option value="">Tüm Pazaryerleri</option>${Object.entries(eticaretProviderEtiketi).filter(([k])=>k!=="EDOCUMENT_CUSTOM").map(([k,v])=>`<option value="${k}" ${filtre.provider===k?"selected":""}>${v}</option>`).join("")}</select><button id="eticaretFiltrele" class="erp-primary-button">Uygula</button></div><div class="dashboard-grid ecommerce-kpis">${kpis.map(([a,v])=>card(a,v??0,"Seçili dönem")).join("")}</div><div class="stock-tabs ecommerce-tabs">${eticaretSekmeleri.map(([k,a])=>`<button data-eticaret-tab="${k}" class="${aktifSekme===k?"active":""}">${a}</button>`).join("")}</div><div id="eticaretPanel"></div>`;
            const panel=content.querySelector("#eticaretPanel"), table=(title,headers,rows)=>`<div class="dashboard-panel"><div class="panel-heading"><div><h2>${title}</h2><p>${rows.length} kayıt</p></div></div><div class="table-scroll"><table><thead><tr>${headers.map(x=>`<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.length?rows.join(""):`<tr><td colspan="${headers.length}">Kayıt bulunmuyor.</td></tr>`}</tbody></table></div></div>`;
            const render=async key=>{content.querySelectorAll("[data-eticaret-tab]").forEach(x=>x.classList.toggle("active",x.dataset.eticaretTab===key)); if(key==="overview")panel.innerHTML=`<div class="sales-layout"><section class="dashboard-panel"><h2>Operasyon Özeti</h2><p>Sipariş → stok → fatura → hakediş akışı bağlantı bazında izlenir. Dış işlem kimlikleri tenant içinde tekildir.</p></section><section class="dashboard-panel"><h2>Güvenlik</h2><p>Secret’lar AES-256-GCM ile şifrelenir; tarayıcıya veya loglara gönderilmez.</p></section></div>`; else if(["connections","settings"].includes(key))panel.innerHTML=table("Pazaryeri ve E-Belge Hesapları",["Sağlayıcı / Mağaza","Satıcı","Ortam","Secret","Son Başarı","Durum","İşlem"],connections.map((x,i)=>`<tr><td><b>${escapeHtml(eticaretProviderEtiketi[x.provider]||x.provider)}</b><small>${escapeHtml(x.storeName)}</small></td><td>${escapeHtml(x.sellerId||x.merchantId||"-")}</td><td>${x.environment==="STAGE"?"Test":"Canlı"}</td><td>********</td><td>${tarihKisa(x.lastSuccessfulSyncAt)}</td><td>${x.active?"Bağlı":"Devre Dışı"}</td><td>${oturumYetkisiVar("ecommerce.settings")?`<button class="erp-small-button" data-ec-test="${i}">Test Et</button> <button class="erp-small-button" data-ec-edit="${i}">Düzenle</button> <button class="erp-small-button" data-ec-sync="${i}">Şimdi Senkronize Et</button> <button class="erp-small-button secondary" data-ec-disable="${i}" ${x.active?"":"disabled"}>Devre Dışı</button>`:"Yetkiniz yok"}</td></tr>`)); else if(["orders","cargo"].includes(key))panel.innerHTML=table(key==="cargo"?"Kargo & Sevkiyat":"Pazaryeri Siparişleri",["Tarih","Pazaryeri","Sipariş / Paket","Müşteri","Tutar","Durum","Kargo"],orders.map(x=>`<tr><td>${tarihKisa(x.siparisTarihi||x.createdAt)}</td><td>${escapeHtml(eticaretProviderEtiketi[x.platform]||x.platform)}</td><td><b>${escapeHtml(x.externalOrderId||x.platformSiparisNo)}</b><small>${escapeHtml(x.packageId||x.kargo?.paketNo||"")}</small></td><td>${escapeHtml(x.musteriId?.unvan||x.musteriId?.adSoyad||x.musteriBilgisi?.adSoyad||"-")}</td><td>${finansPara(x.toplam,x.paraBirimi)}</td><td>${raporKodEtiketi(x.durum)}</td><td>${escapeHtml([x.kargo?.firma,x.kargo?.takipNo].filter(Boolean).join(" · ")||"Bekliyor")}</td></tr>`)); else {const endpoint={products:"products/mappings",returns:"returns",documents:"documents",invoices:"documents",finance:"finance",sync:"sync-jobs",errors:"errors",categories:"category-mappings"}[key];panel.innerHTML='<div class="dashboard-loading">Kayıtlar getiriliyor...</div>';try{const data=await api(`/api/tenant/eticaret/${endpoint}?${query}`),rows=data.mappings||data.categoryMappings||data.returns||data.documents||data.transactions||data.jobs||data.errors||[];panel.innerHTML=table(eticaretSekmeleri.find(x=>x[0]===key)?.[1]||"Kayıtlar",["Tarih","Sağlayıcı","Kayıt","Durum","Açıklama"],rows.map(x=>`<tr><td>${tarihKisa(x.transactionDate||x.issueDate||x.returnDate||x.createdAt)}</td><td>${escapeHtml(eticaretProviderEtiketi[x.provider||x.marketplace]||x.provider||x.marketplace||"-")}</td><td><b>${escapeHtml(x.invoiceNo||x.externalReturnId||x.externalTransactionId||x.externalProductId||x.externalCategoryName||x.erpCategory||x.type||x.operation||"-")}</b></td><td>${raporKodEtiketi(x.processingStatus||x.status||x.syncStatus||x.reconciliationStatus||"-")}</td><td>${escapeHtml(x.errorMessage||x.lastError||x.senderTitle||x.reason||"-")}</td></tr>`));}catch(error){panel.innerHTML=`<div class="error">${escapeHtml(error.message)}</div>`;}} panel.querySelectorAll("[data-ec-test]").forEach(x=>x.onclick=()=>api(`/api/tenant/eticaret/connections/${connections[+x.dataset.ecTest]._id}/test`,{method:"POST"}).then(()=>alert("Bağlantı başarılı.")).catch(e=>alert(e.message)));panel.querySelectorAll("[data-ec-edit]").forEach(x=>x.onclick=()=>eticaretBaglantiFormu(connections[+x.dataset.ecEdit]));panel.querySelectorAll("[data-ec-sync]").forEach(x=>x.onclick=()=>api("/api/tenant/eticaret/sync",{method:"POST",body:JSON.stringify({connectionId:connections[+x.dataset.ecSync]._id,type:"STOCK_PUSH"})}).then(()=>alert("Senkronizasyon kuyruğa alındı.")).catch(e=>alert(e.message)));panel.querySelectorAll("[data-ec-disable]").forEach(x=>x.onclick=async()=>{if(confirm("Bağlantı devre dışı bırakılsın mı?")){await api(`/api/tenant/eticaret/connections/${connections[+x.dataset.ecDisable]._id}`,{method:"DELETE"});eticaretYukle("connections",filtre);}});};
            content.querySelectorAll("[data-eticaret-tab]").forEach(x=>x.onclick=async()=>{aktifSekme=x.dataset.eticaretTab;await render(aktifSekme);eticaretTabloAraclari(panel);});content.querySelector("#eticaretYeniBaglanti")?.addEventListener("click",()=>eticaretBaglantiFormu());content.querySelector("#eticaretYenile").onclick=()=>eticaretYukle(aktifSekme,filtre);content.querySelector("#eticaretFiltrele").onclick=()=>eticaretYukle(aktifSekme,{baslangic:content.querySelector("#eticaretBaslangic").value,bitis:content.querySelector("#eticaretBitis").value,provider:content.querySelector("#eticaretProvider").value,donem:content.querySelector("#eticaretDonem").value});content.querySelector("#eticaretDonem").value=filtre.donem||"BU_AY";content.querySelector("#eticaretDonem").onchange=e=>{const s=new Date(now),b=new Date(now);if(e.target.value==="DUN"){s.setDate(now.getDate()-1);b.setDate(now.getDate()-1);}else if(e.target.value==="BU_HAFTA")s.setDate(now.getDate()-((now.getDay()+6)%7));else if(e.target.value==="BU_AY")s.setDate(1);content.querySelector("#eticaretBaslangic").value=iso(s);content.querySelector("#eticaretBitis").value=iso(b);filtre.donem=e.target.value;};await render(aktifSekme);eticaretTabloAraclari(panel);
        } catch (error) { errorBox(error); }
    }

    const eticaretMenuGruplari = [
        { kod:"GENEL", ad:"Genel", sekmeler:["overview"] },
        { kod:"PAZARYERI", ad:"Pazaryeri", sekmeler:["connections","products","orders","returns","cargo"] },
        { kod:"E_BELGE", ad:"E-Belge", sekmeler:["invoices","documents"] },
        { kod:"FINANS", ad:"Finans", sekmeler:["finance"] },
        { kod:"SISTEM", ad:"Sistem", sekmeler:["categories","sync","errors","settings"] }
    ];
    function eticaretTarihSaat(value) { if (!value) return "Henüz yok"; const d=new Date(value); return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString("tr-TR",{dateStyle:"short",timeStyle:"short"}); }
    function eticaretDurumSinifi(value) { const v=String(value||"").toUpperCase(); if (/SUCCESS|ACTIVE|MATCHED|PROCESSED|COMPLETED|ANSWERED|TAMAMLANDI/.test(v)) return "success"; if (/ERROR|FAILED|IPTAL|CANCEL|OPEN/.test(v)) return "danger"; if (/PENDING|WAIT|QUEUED|RUNNING|RETRY|ALINDI|UNPROCESSED|SUGGESTED/.test(v)) return "warning"; return "neutral"; }
    function eticaretBadge(value, label="") { return `<span class="ecommerce-badge ${eticaretDurumSinifi(value)}">${escapeHtml(label||raporKodEtiketi(value)||"-")}</span>`; }
    function eticaretTablo(baslik, aciklama, kolonlar, satirlar, ek="") { return `<section class="dashboard-panel ecommerce-table-card"><div class="panel-heading"><div><h2>${escapeHtml(baslik)}</h2><p>${escapeHtml(aciklama||`${satirlar.length} kayıt`)}</p></div>${ek}</div><div class="table-scroll"><table><thead><tr>${kolonlar.map(x=>`<th>${escapeHtml(x)}</th>`).join("")}</tr></thead><tbody>${satirlar.length?satirlar.join(""):`<tr><td colspan="${kolonlar.length}"><div class="empty-state">Kayıt bulunmuyor.</div></td></tr>`}</tbody></table></div></section>`; }
    function eticaretDrawer(baslik, icerik) { document.getElementById("eticaretDrawer")?.remove(); const root=document.createElement("div"); root.id="eticaretDrawer"; root.className="ecommerce-drawer-shell"; root.innerHTML=`<button class="ecommerce-drawer-backdrop" aria-label="Kapat"></button><aside class="ecommerce-drawer" role="dialog" aria-modal="true"><div class="erp-modal-header"><div><small>ENTEGRASYON DETAYI</small><h2>${escapeHtml(baslik)}</h2></div><button class="erp-modal-close" aria-label="Kapat">×</button></div><div class="ecommerce-drawer-body">${icerik}</div></aside>`; document.body.appendChild(root); root.querySelectorAll(".ecommerce-drawer-backdrop,.erp-modal-close").forEach(x=>x.onclick=()=>root.remove()); }
    function eticaretSiparisDetayi(siparis) { const musteri=siparis.musteriId?.unvan||siparis.musteriId?.adSoyad||siparis.musteriBilgisi?.adSoyad||"-", adres=siparis.teslimatAdresi||{}; eticaretDrawer(`Sipariş ${siparis.externalOrderId||siparis.platformSiparisNo}`,`<div class="ecommerce-detail-grid"><div><span>Pazaryeri</span><b>${escapeHtml(eticaretProviderEtiketi[siparis.platform]||siparis.platform)}</b></div><div><span>Durum</span>${eticaretBadge(siparis.durum)}</div><div><span>Müşteri</span><b>${escapeHtml(musteri)}</b></div><div><span>Tarih</span><b>${eticaretTarihSaat(siparis.siparisTarihi||siparis.createdAt)}</b></div><div><span>Tutar</span><b>${finansPara(siparis.toplam,siparis.paraBirimi)}</b></div><div><span>Fatura</span>${eticaretBadge(siparis.providerInvoiceStatus)}</div></div><section class="ecommerce-detail-section"><h3>Kargo</h3><p>${escapeHtml([siparis.kargo?.firma,siparis.kargo?.takipNo].filter(Boolean).join(" · ")||"Henüz kargo bilgisi yok.")}</p></section><section class="ecommerce-detail-section"><h3>Teslimat</h3><p>${escapeHtml([adres.address1||adres.adres,adres.district||adres.ilce,adres.city||adres.il].filter(Boolean).join(" · ")||"Adres bilgisi bulunmuyor.")}</p></section><section class="ecommerce-detail-section"><h3>Ürünler</h3><div class="ecommerce-line-list">${(siparis.urunler||[]).map(x=>`<div><span>${escapeHtml(x.externalSku||x.externalBarcode||"Ürün")}</span><b>${Number(x.miktar||0).toLocaleString("tr-TR")} × ${para(x.birimFiyat)}</b></div>`).join("")||"<p>Ürün satırı bulunmuyor.</p>"}</div></section>`); }

    function eticaretBaglantiFormu(mevcut=null) {
        const providers=["TRENDYOL","HEPSIBURADA","N11","AMAZON_TR","CICEKSEPETI","PAZARAMA","IDEASOFT","EDOCUMENT_CUSTOM"], overlay=document.createElement("div"); let secili=mevcut?.provider||"TRENDYOL", kayitId=mevcut?._id||"";
        overlay.className="erp-modal-overlay"; overlay.id="eticaretModal";
        overlay.innerHTML=`<div class="erp-modal ecommerce-connect-modal"><div class="erp-modal-header"><div><small>GÜVENLİ ENTEGRASYON</small><h2>${mevcut?"Hesap Ayarları":"Hesap Bağla"}</h2><p>Sağlayıcınızı seçin ve bağlantı bilgilerini doğrulayın.</p></div><button class="erp-modal-close" aria-label="Kapat">×</button></div><form><div class="ecommerce-provider-grid">${providers.map(k=>`<button type="button" class="ecommerce-provider-card ${secili===k?"active":""}" data-provider="${k}"><span>${k==="EDOCUMENT_CUSTOM"?"EB":k.slice(0,2)}</span><b>${escapeHtml(eticaretProviderEtiketi[k])}</b></button>`).join("")}</div><input type="hidden" name="provider" value="${secili}"><div class="erp-form-grid ecommerce-credential-fields"><label class="full">Mağaza Adı<input name="storeName" required value="${escapeHtml(mevcut?.storeName||"")}" placeholder="Örn. AKN Motosiklet"></label><label class="full" data-domain-label>Mağaza Domaini<input name="apiBaseUrl" value="${escapeHtml(mevcut?.apiBaseUrl||"")}" autocomplete="url" placeholder="https://magaza-adiniz.myideasoft.com"></label><label data-seller-label>Seller ID<input name="sellerId" value="${escapeHtml(mevcut?.sellerId||mevcut?.merchantId||"")}" autocomplete="off"></label><label>Durum<select name="active"><option value="true" ${mevcut?.active!==false?"selected":""}>Aktif</option><option value="false" ${mevcut?.active===false?"selected":""}>Pasif</option></select></label><label data-client-label>API Key / Kullanıcı<input name="apiKey" ${mevcut?"":"required"} autocomplete="off" placeholder="${mevcut?"Değişmeyecekse boş bırakın":"API Key"}"></label><label data-secret-label>API Secret<input name="apiSecret" type="password" ${mevcut?"":"required"} autocomplete="new-password" placeholder="********"></label><label class="full" data-token-label>Token <small>Yalnızca sağlayıcınız istiyorsa</small><input name="token" type="password" autocomplete="new-password" placeholder="********"></label></div><div class="ecommerce-secret-note">Client Secret, API secret ve token değerleri AES-256-GCM ile şifrelenir; ekranda veya loglarda gösterilmez.</div><div id="eticaretFormMesaj" aria-live="polite"></div><div class="erp-modal-footer"><button type="button" class="erp-small-button" data-kapat>Vazgeç</button><button class="erp-primary-button" data-test-submit>${mevcut?"Kaydet ve Bağlantıyı Test Et":"Bağlantıyı Test Et"}</button></div></form></div>`;
        document.body.appendChild(overlay); const form=overlay.querySelector("form"), mesaj=overlay.querySelector("#eticaretFormMesaj"), kapat=()=>{overlay.remove();if(kayitId)eticaretYukle("connections");}; overlay.querySelectorAll(".erp-modal-close,[data-kapat]").forEach(x=>x.onclick=kapat);
        const alanlariGuncelle=()=>{const idea=secili==="IDEASOFT";overlay.querySelector("[data-domain-label]").hidden=!idea;overlay.querySelector("[data-domain-label] input").required=idea;overlay.querySelector("[data-seller-label]").hidden=idea;overlay.querySelector("[data-seller-label]").childNodes[0].textContent=secili==="EDOCUMENT_CUSTOM"?"Hesap / Mükellef ID":"Seller ID";overlay.querySelector("[data-client-label]").childNodes[0].textContent=idea?"Client ID":"API Key / Kullanıcı";overlay.querySelector("[data-secret-label]").childNodes[0].textContent=idea?"Client Secret":"API Secret";overlay.querySelector("[data-token-label]").hidden=idea;}; alanlariGuncelle();
        overlay.querySelectorAll("[data-provider]").forEach(btn=>btn.onclick=()=>{secili=btn.dataset.provider;form.elements.provider.value=secili;overlay.querySelectorAll("[data-provider]").forEach(x=>x.classList.toggle("active",x===btn));alanlariGuncelle();});
        form.onsubmit=async event=>{
            event.preventDefault(); const submit=form.querySelector("[data-test-submit]"); submit.disabled=true; mesaj.innerHTML='<div class="ecommerce-inline-status">Bağlantı güvenli biçimde doğrulanıyor...</div>';
            const fd=new FormData(form),credentials={};
            if(secili==="IDEASOFT"){if(fd.get("apiKey"))credentials.clientId=fd.get("apiKey");if(fd.get("apiSecret"))credentials.clientSecret=fd.get("apiSecret");}
            else for(const key of ["apiKey","apiSecret","token"])if(fd.get(key))credentials[key]=fd.get(key);
            const body={type:secili==="EDOCUMENT_CUSTOM"?"EDOCUMENT":"MARKETPLACE",provider:secili,storeName:fd.get("storeName"),sellerId:fd.get("sellerId"),apiBaseUrl:fd.get("apiBaseUrl"),active:fd.get("active")==="true",environment:"PRODUCTION"}; if(Object.keys(credentials).length)body.credentials=credentials;
            try {
                const saved=await api(kayitId?`/api/tenant/eticaret/connections/${kayitId}`:"/api/tenant/eticaret/connections",{method:kayitId?"PATCH":"POST",body:JSON.stringify(body)}); kayitId=saved.connection?._id||kayitId;
                if(!body.active){mesaj.innerHTML='<div class="ecommerce-connect-result success"><b>Hesap pasif kaydedildi</b><span>Aktifleştirilene kadar IdeaSoft çağrısı yapılmayacak.</span></div>';return;}
                await api(`/api/tenant/eticaret/connections/${kayitId}/test`,{method:"POST"}); mesaj.innerHTML='<div class="ecommerce-connect-result success"><b>✓ Bağlantı başarılı</b><span>Hesap güvenli biçimde kaydedildi ve doğrulandı.</span></div>'; submit.textContent="Bağlantıyı Yeniden Test Et";
            } catch(error) {
                if(error.code==="OAUTH_AUTHORIZATION_REQUIRED"&&error.data?.authorizationUrl){mesaj.innerHTML='<div class="ecommerce-inline-status">IdeaSoft yetkilendirme sayfasına yönlendiriliyorsunuz...</div>';window.location.assign(error.data.authorizationUrl);return;}
                mesaj.innerHTML=`<div class="ecommerce-connect-result danger"><b>Bağlantı kurulamadı</b><span>${escapeHtml(error.message)}</span></div>`;
            } finally { submit.disabled=false; }
        };
    }

    let eticaretSonOtomatikSiparisCekme = 0;
    let eticaretOtomatikSiparisCalisiyor = false;
    async function eticaretYukle(aktifSekme="overview", filtre={}) {
        setTitle("E-Ticaret & E-Belge Entegrasyon Merkezi"); loading("Entegrasyon merkezi hazırlanıyor...");
        try {
            const now=new Date(), iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; if(!filtre.baslangic)filtre={baslangic:iso(new Date(now.getFullYear(),now.getMonth(),1)),bitis:iso(now),donem:"BU_AY"};
            const query=new URLSearchParams({baslangic:filtre.baslangic,bitis:filtre.bitis});if(filtre.provider)query.set("provider",filtre.provider);
            const results=await Promise.allSettled([api(`/api/tenant/eticaret/dashboard?${query}`),api("/api/tenant/eticaret/connections"),api(`/api/tenant/eticaret/siparisler?${query}`)]),val=(i,f)=>results[i].status==="fulfilled"?results[i].value:f,d=val(0,{cards:{},durum:"ENTEGRASYON AYARLANMADI"}),connections=val(1,{connections:[]}).connections||[],orders=val(2,{siparisler:[]}).siparisler||[],c=d.cards||{};
            const otomatikIdeaSoft=connections.find(x=>x.provider==="IDEASOFT"&&x.active);if(otomatikIdeaSoft&&oturumYetkisiVar("ecommerce.sync")&&!eticaretOtomatikSiparisCalisiyor&&Date.now()-eticaretSonOtomatikSiparisCekme>=300000){eticaretOtomatikSiparisCalisiyor=true;eticaretSonOtomatikSiparisCekme=Date.now();try{await api("/api/tenant/eticaret/sync",{method:"POST",body:JSON.stringify({connectionId:otomatikIdeaSoft._id,type:"ORDER_PULL"})});}catch(error){if(error.code==="OAUTH_AUTHORIZATION_REQUIRED")console.warn("IdeaSoft OAuth yetkilendirmesi bekleniyor.");}finally{eticaretOtomatikSiparisCalisiyor=false;}return eticaretYukle(aktifSekme,filtre);}
            const kpiGruplari=[[["Bugünkü Sipariş",c.bugunkuPazaryeriSiparisleri,"Bugün alınan sipariş"],["Bekleyen Sipariş",c.bekleyenSiparis,"İşleme alınmayı bekliyor"],["Hazırlanan",c.hazirlananSiparis,"Paketleme sürecinde"],["Kargoda",c.kargoyaVerilen,"Sevkiyata aktarılmış"],["İade / İptal",c.iadeIptal,"Seçili dönemde"]],[["Pazaryeri Cirosu",para(c.pazaryeriCirosu),"Brüt satış"],["Komisyon",para(c.pazaryeriKomisyonlari),"Pazaryeri kesintisi"],["Kargo Kesintileri",para(c.kargoKesintileri),"Kargo bedelleri"],["Diğer Kesintiler",para(c.digerKesintiler),"Hizmet ve diğer"],["Net Hakediş",para(c.netHakedis),"Kesintiler sonrası"]],[["Beklenen Ödeme",para(c.beklenenOdeme),"Banka eşleşmesi bekliyor"],["Gelen E-Fatura",c.gelenEFatura,"Seçili dönemde"],["İşlenmemiş Masraf",c.islenmemisMasrafFaturasi,"Onay bekliyor"],["Gönderilemeyen E-Fatura",c.gonderilemeyenEFatura,"Kontrol gerekli"],["Senkronizasyon Hatası",c.senkronizasyonHatasi,"Açık hata"]]];
            const grup=eticaretMenuGruplari.find(g=>g.sekmeler.includes(aktifSekme))||eticaretMenuGruplari[0], altSekmeler=grup.sekmeler.map(k=>eticaretSekmeleri.find(x=>x[0]===k));
            content.innerHTML=`<section class="ecommerce-hero-v2"><div><small>ENTEGRASYON MERKEZİ</small><h2>E-Ticaret & E-Belge Entegrasyon Merkezi</h2><p>Pazaryeri, sipariş, ürün, e-belge ve hakedişlerinizi tek merkezden yönetin.</p></div><div class="ecommerce-hero-actions">${oturumYetkisiVar("ecommerce.settings")?'<button id="eticaretYeniBaglanti" class="erp-primary-button">+ Hesap Bağla</button>':""}<button id="eticaretYenile" class="erp-small-button">↻ Şimdi Yenile</button></div></section><div class="ecommerce-status ${d.configured?"connected":"not-connected"}"><div>${eticaretBadge(d.configured?"ACTIVE":"PENDING",d.configured?"Entegrasyon Aktif":"Entegrasyon Ayarlanmadı")}<span>${d.configured?`${connections.filter(x=>x.active).length} aktif hesap bağlı`:'Gerçek API bilgileri girilmeden veri senkronizasyonu yapılamaz.'}</span></div></div><div class="stock-filterbar ecommerce-filters"><select id="eticaretDonem"><option value="BUGUN">Bugün</option><option value="DUN">Dün</option><option value="BU_HAFTA">Bu Hafta</option><option value="BU_AY">Bu Ay</option><option value="OZEL">Özel Tarih Aralığı</option></select><input id="eticaretBaslangic" type="date" value="${filtre.baslangic}"><input id="eticaretBitis" type="date" value="${filtre.bitis}"><select id="eticaretProvider"><option value="">Tüm Pazaryerleri</option>${Object.entries(eticaretProviderEtiketi).filter(([k])=>k!=="EDOCUMENT_CUSTOM"&&k!=="TEST_MAGAZA").map(([k,v])=>`<option value="${k}" ${filtre.provider===k?"selected":""}>${escapeHtml(v)}</option>`).join("")}</select><button id="eticaretFiltrele" class="erp-primary-button">Uygula</button></div><div class="ecommerce-kpi-sections">${kpiGruplari.map((rows,index)=>`<div class="ecommerce-kpi-row row-${index+1}">${rows.map(([ad,value,desc])=>`<article class="ecommerce-kpi-card"><span>${escapeHtml(ad)}</span><strong>${value??0}</strong><small>${escapeHtml(desc)}</small></article>`).join("")}</div>`).join("")}</div><nav class="ecommerce-main-tabs" aria-label="Entegrasyon kategorileri">${eticaretMenuGruplari.map(g=>`<button data-ec-grup="${g.kod}" class="${g.kod===grup.kod?"active":""}">${g.ad}</button>`).join("")}</nav><div class="ecommerce-mobile-nav"><label>Bölüm<select id="eticaretMobilSekme">${eticaretSekmeleri.map(([k,a])=>`<option value="${k}" ${k===aktifSekme?"selected":""}>${a}</option>`).join("")}</select></label></div><div class="ecommerce-workspace"><aside class="ecommerce-subnav"><small>${grup.ad.toLocaleUpperCase("tr-TR")}</small>${altSekmeler.map(([k,a])=>`<button data-eticaret-tab="${k}" class="${k===aktifSekme?"active":""}">${a}</button>`).join("")}</aside><div id="eticaretPanel" class="ecommerce-panel"></div></div>`;
            const panel=content.querySelector("#eticaretPanel");
            const renderOverview=()=>{panel.innerHTML=`<div class="ecommerce-overview-grid"><section class="dashboard-panel"><h2>Operasyon Akışı</h2><p>Siparişten hakedişe kadar tüm adımlar bağlantı bazında izlenir.</p><div class="ecommerce-flow"><span>Sipariş</span><i>→</i><span>Stok</span><i>→</i><span>Fatura</span><i>→</i><span>Hakediş</span></div></section><section class="dashboard-panel"><h2>Güvenli Bağlantı</h2><p>API secret ve token bilgileri şifrelenir; ekranlarda ve kayıtlarda açık gösterilmez.</p>${connections.length?eticaretBadge("ACTIVE",`${connections.filter(x=>x.active).length} aktif hesap`):eticaretBadge("PENDING","Hesap bağlantısı bekleniyor")}</section></div>`;};
            const renderConnections=()=>{panel.innerHTML=`<div class="panel-heading ecommerce-section-heading"><div><h2>Pazaryeri ve E-Belge Hesapları</h2><p>Bağlı hesapları, durumlarını ve son senkronizasyonlarını yönetin.</p></div></div><div class="ecommerce-account-grid">${connections.map((x,i)=>{
                const productStage=x.pilotResults?.stages?.find(s=>s.step==="PRODUCT_PULL_5"), unmatched=productStage?.unmatchedProducts||[];
                return `<article class="ecommerce-account-card"><div class="ecommerce-account-head"><span class="ecommerce-provider-mark">${escapeHtml((eticaretProviderEtiketi[x.provider]||x.provider).slice(0,2))}</span><div><small>${escapeHtml(eticaretProviderEtiketi[x.provider]||x.provider)}</small><h3>${escapeHtml(x.storeName)}</h3></div>${eticaretBadge(x.active?"ACTIVE":"INACTIVE",x.active?"Bağlı":"Devre Dışı")}</div><dl><div><dt>${x.provider==="IDEASOFT"?"Mağaza Domaini":"Satıcı / Hesap"}</dt><dd>${escapeHtml(x.provider==="IDEASOFT"?(x.apiBaseUrl||"-"):(x.sellerId||x.merchantId||"-"))}</dd></div><div><dt>Secret</dt><dd>********</dd></div><div><dt>Son senkronizasyon</dt><dd>${eticaretTarihSaat(x.lastSuccessfulSyncAt)}</dd></div>${x.provider==="IDEASOFT"?`<div><dt>Küçük Test</dt><dd>${eticaretBadge(x.pilotStatus||"NOT_STARTED")}</dd></div><div><dt>Eşleşmeyen Ürün</dt><dd>${Number(productStage?.unmatched||0)}</dd></div>`:""}</dl>${unmatched.length?`<div class="ecommerce-secret-note"><b>Kullanıcı eşleştirmesi bekleyen ürünler</b>${unmatched.map(p=>`<span>${escapeHtml(p.name||"IdeaSoft ürünü")} · ${escapeHtml(p.externalSku||p.externalBarcode||p.externalProductId)}</span>`).join("")}<small>ERP'de SKU veya barkodu doğrulayıp küçük testi yeniden çalıştırın. Otomatik ürün oluşturulmaz.</small></div>`:""}<div class="ecommerce-card-actions">${oturumYetkisiVar("ecommerce.settings")?`<button class="erp-small-button" data-ec-test="${i}">Bağlantıyı Test Et</button>${x.provider==="IDEASOFT"?`<button class="erp-primary-button" data-ec-orders="${i}">Siparişleri Şimdi Çek</button><button class="erp-small-button" data-ec-pilot="${i}">Küçük Testi Çalıştır</button>`:""}<button class="erp-small-button" data-ec-sync="${i}" ${x.provider==="IDEASOFT"&&x.pilotStatus!=="SUCCESS"?"disabled title=\"Önce küçük test başarıyla tamamlanmalı\"":""}>Stok Gönder</button><button class="erp-small-button" data-ec-edit="${i}">Ayarlar</button><button class="erp-small-button danger-button-soft" data-ec-disable="${i}" ${x.active?"":"disabled"}>Devre Dışı Bırak</button>`:"<span>Görüntüleme yetkisi</span>"}</div></article>`;
            }).join("")||'<div class="dashboard-panel empty-state">Henüz hesap bağlanmadı. “Hesap Bağla” ile başlayabilirsiniz.</div>'}</div>`;};
            const renderOrders=()=>{const draw=()=>{const q=(panel.querySelector("#ecOrderSearch")?.value||"").toLocaleLowerCase("tr-TR"),status=panel.querySelector("#ecOrderStatus")?.value||"",provider=panel.querySelector("#ecOrderProvider")?.value||"",rows=orders.filter(x=>(!q||[x.externalOrderId,x.platformSiparisNo,x.musteriId?.unvan,x.musteriId?.adSoyad,x.musteriBilgisi?.adSoyad].some(v=>String(v||"").toLocaleLowerCase("tr-TR").includes(q)))&&(!status||x.durum===status)&&(!provider||x.platform===provider));panel.querySelector("#ecOrderTable").innerHTML=eticaretTablo("Pazaryeri Siparişleri",`${rows.length} sipariş`,["Sipariş No","Pazaryeri","Müşteri","Tarih","Tutar","Kargo","Durum","Fatura","İşlem"],rows.map((x,i)=>`<tr><td><b>${escapeHtml(x.externalOrderId||x.platformSiparisNo)}</b><small>${escapeHtml(x.packageId||"")}</small></td><td>${escapeHtml(eticaretProviderEtiketi[x.platform]||x.platform)}</td><td>${escapeHtml(x.musteriId?.unvan||x.musteriId?.adSoyad||x.musteriBilgisi?.adSoyad||"-")}</td><td>${eticaretTarihSaat(x.siparisTarihi||x.createdAt)}</td><td><b>${finansPara(x.toplam,x.paraBirimi)}</b></td><td>${escapeHtml([x.kargo?.firma,x.kargo?.takipNo].filter(Boolean).join(" · ")||"Bekliyor")}</td><td>${eticaretBadge(x.durum)}</td><td>${eticaretBadge(x.providerInvoiceStatus)}</td><td><button class="erp-small-button" data-order-index="${orders.indexOf(x)}">Detay</button></td></tr>`));panel.querySelectorAll("[data-order-index]").forEach(b=>b.onclick=()=>eticaretSiparisDetayi(orders[+b.dataset.orderIndex]));eticaretTabloAraclari(panel);};panel.innerHTML=`<section class="dashboard-panel ecommerce-filter-panel"><div class="ecommerce-order-filters"><label>Sipariş No / Müşteri<input id="ecOrderSearch" placeholder="Sipariş veya müşteri ara"></label><label>Pazaryeri<select id="ecOrderProvider"><option value="">Tümü</option>${[...new Set(orders.map(x=>x.platform))].map(x=>`<option value="${x}">${escapeHtml(eticaretProviderEtiketi[x]||x)}</option>`).join("")}</select></label><label>Durum<select id="ecOrderStatus"><option value="">Tümü</option>${[...new Set(orders.map(x=>x.durum))].map(x=>`<option value="${x}">${escapeHtml(raporKodEtiketi(x))}</option>`).join("")}</select></label><label>Başlangıç<input type="date" value="${filtre.baslangic}" disabled></label><label>Bitiş<input type="date" value="${filtre.bitis}" disabled></label></div></section><div id="ecOrderTable"></div>`;panel.querySelectorAll("#ecOrderSearch,#ecOrderProvider,#ecOrderStatus").forEach(x=>x.oninput=draw);draw();};
            const loadRows=async(key)=>{const endpoint={products:"products/mappings",returns:"returns",invoices:"documents",documents:"documents",finance:"finance",categories:"category-mappings",sync:"sync-jobs",errors:"errors",cargo:"siparisler"}[key];panel.innerHTML='<div class="dashboard-loading">Kayıtlar getiriliyor...</div>';try{const data=await api(`/api/tenant/eticaret/${endpoint}?${query}`),rows=data.mappings||data.categoryMappings||data.returns||data.documents||data.transactions||data.jobs||data.errors||data.siparisler||[];
                if(["invoices","documents"].includes(key)){panel.innerHTML=eticaretTablo(key==="invoices"?"E-Fatura / E-Arşiv":"Gelen Belgeler & Masraflar",`${rows.length} belge`,["Belge No","Gönderen","VKN/TCKN","Tarih","Belge Türü","Tutar","Durum","Eşleşme","İşlem"],rows.map((x,i)=>`<tr><td><b>${escapeHtml(x.invoiceNo||x.uuid||"-")}</b></td><td>${escapeHtml(x.senderTitle||"-")}</td><td>${escapeHtml(x.senderVknTckn||"-")}</td><td>${tarihKisa(x.issueDate)}</td><td>${escapeHtml(raporKodEtiketi(x.invoiceType))}</td><td><b>${finansPara(x.grandTotal,x.currency)}</b></td><td>${eticaretBadge(x.processingStatus)}</td><td>${x.matchedSupplierId?eticaretBadge("MATCHED","Tedarikçiye Bağlandı"):x.matchedExpenseId?eticaretBadge("PROCESSED","Masrafa Aktarıldı"):eticaretBadge("UNMATCHED","Eşleşmedi")}</td><td><div class="ecommerce-row-actions"><button class="erp-small-button" data-doc-file="pdf|${x._id}">PDF</button><button class="erp-small-button" data-doc-file="xml|${x._id}">XML</button><button class="erp-small-button" data-doc-action="expense|${i}">Masraf Olarak Kaydet</button><button class="erp-small-button" data-doc-action="supplier|${i}">Tedarikçiye Bağla</button><button class="erp-small-button" disabled title="Bu işlem için mevcut backend akışı bulunmuyor">Cari Hesaba İşle</button></div></td></tr>`));panel.querySelectorAll("[data-doc-file]").forEach(b=>b.onclick=async()=>{const [format,id]=b.dataset.docFile.split("|");try{const file=await api(`/api/tenant/eticaret/documents/${id}/file/${format}`),win=window.open("","_blank");if(!win)return alert("Belge penceresine izin verin.");win.opener=null;if(format==="xml")win.document.write(`<pre style="white-space:pre-wrap;font:13px monospace">${escapeHtml(file.content)}</pre>`);else win.document.write(`<iframe src="${escapeHtml(file.content)}" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>`);}catch(e){alert(e.message);}});panel.querySelectorAll("[data-doc-action]").forEach(b=>b.onclick=()=>{const [action,i]=b.dataset.docAction.split("|"),doc=rows[+i];eticaretDrawer(action==="expense"?"Masraf Olarak Kaydet":"Tedarikçiye Bağla",`<div class="ecommerce-action-note"><b>${escapeHtml(doc.invoiceNo||doc.uuid)}</b><p>${action==="expense"?"Masraf kaydı ödeme hesabı seçimi ve açık kullanıcı onayı gerektirir.":"Tedarikçi seçimi mevcut kayıtlarla güvenli biçimde yapılır."}</p><button class="erp-primary-button" disabled>${action==="expense"?"Ödeme hesabı seçerek devam edin":"Tedarikçi seçerek devam edin"}</button><small>Bu ekranda yeni backend davranışı oluşturulmadı.</small></div>`);});}
                else if(key==="finance"){const sum=t=>rows.filter(x=>x.type===t).reduce((n,x)=>n+Math.abs(Number(x.amount||0)),0),gross=sum("SALE"),refund=sum("REFUND"),commission=sum("COMMISSION"),cargo=sum("CARGO"),service=sum("SERVICE_FEE"),ads=sum("ADVERTISING"),other=sum("OTHER")+sum("WITHHOLDING"),net=gross-refund-commission-cargo-service-ads-other;panel.innerHTML=`<div class="ecommerce-finance-summary">${[["Brüt Satış",gross,"plus"],["İade",refund,"minus"],["Komisyon",commission,"minus"],["Kargo",cargo,"minus"],["Hizmet Bedeli",service,"minus"],["Reklam",ads,"minus"],["Diğer Kesintiler",other,"minus"],["Net Hakediş",net,"total"]].map(([a,v,k])=>`<div class="${k}"><span>${k==="minus"?"− ":k==="total"?"= ":""}${a}</span><b>${para(v)}</b></div>`).join("")}</div>${eticaretTablo("Ödeme ve Hakedişler",`${rows.length} finans hareketi`,["Pazaryeri","Dönem","Brüt Satış","Toplam Kesinti","Net Hakediş","Ödeme Tarihi","Banka Eşleşmesi","Durum"],rows.map(x=>`<tr><td>${escapeHtml(eticaretProviderEtiketi[x.provider]||x.provider)}</td><td>${tarihKisa(x.transactionDate)}</td><td>${x.type==="SALE"?finansPara(x.amount,x.currency):"-"}</td><td>${!["SALE","PAYMENT"].includes(x.type)?finansPara(Math.abs(x.amount),x.currency):"-"}</td><td>${finansPara(x.amount,x.currency)}</td><td>${tarihKisa(x.paymentDate)}</td><td>${eticaretBadge(x.reconciliationStatus)}</td><td>${eticaretBadge(x.type)}</td></tr>`))}`;}
                else if(key==="errors"){panel.innerHTML=eticaretTablo("Entegrasyon Hataları",`${rows.length} hata kaydı`,["Tarih","Sağlayıcı","İşlem","Kayıt","Hata Kodu","Hata Mesajı","Deneme","Durum","İşlem"],rows.map((x,i)=>`<tr><td>${eticaretTarihSaat(x.createdAt)}</td><td>${escapeHtml(eticaretProviderEtiketi[x.provider]||x.provider)}</td><td>${escapeHtml(raporKodEtiketi(x.operation))}</td><td>${escapeHtml(x.entityId||x.entityType||"-")}</td><td><code>${escapeHtml(x.errorCode)}</code></td><td>${escapeHtml(x.errorMessage)}</td><td>${Number(x.attemptCount||0)}</td><td>${eticaretBadge(x.status)}</td><td><button class="erp-small-button" data-error-detail="${i}">Ayrıntı</button>${x.retryable?` <button class="erp-small-button" data-error-retry="${x._id}">Tekrar Dene</button>`:""}</td></tr>`));panel.querySelectorAll("[data-error-detail]").forEach(b=>b.onclick=()=>{const x=rows[+b.dataset.errorDetail];eticaretDrawer("Hata Ayrıntısı",`<div class="ecommerce-detail-grid"><div><span>Hata Kodu</span><b>${escapeHtml(x.errorCode)}</b></div><div><span>Durum</span>${eticaretBadge(x.status)}</div><div><span>İşlem</span><b>${escapeHtml(raporKodEtiketi(x.operation))}</b></div><div><span>Deneme</span><b>${Number(x.attemptCount||0)}</b></div></div><section class="ecommerce-detail-section"><h3>Hata Mesajı</h3><p>${escapeHtml(x.errorMessage)}</p></section><div class="ecommerce-secret-note">Teknik detaylar güvenlik nedeniyle ana listede gösterilmez.</div>`);});panel.querySelectorAll("[data-error-retry]").forEach(b=>b.onclick=async()=>{try{await api(`/api/tenant/eticaret/errors/${b.dataset.errorRetry}/retry`,{method:"POST"});alert("Tekrar deneme kuyruğa alındı.");await loadRows("errors");}catch(e){alert(e.message);}});}
                else {const title=eticaretSekmeleri.find(x=>x[0]===key)?.[1]||"Kayıtlar";panel.innerHTML=eticaretTablo(title,`${rows.length} kayıt`,["Tarih","Sağlayıcı","Kayıt","Durum","Açıklama"],rows.map(x=>`<tr><td>${tarihKisa(x.returnDate||x.createdAt||x.updatedAt)}</td><td>${escapeHtml(eticaretProviderEtiketi[x.provider||x.marketplace||x.platform]||x.provider||x.marketplace||x.platform||"-")}</td><td><b>${escapeHtml(x.externalReturnId||x.externalProductId||x.externalCategoryName||x.erpCategory||x.externalOrderId||x.type||x.operation||"-")}</b></td><td>${eticaretBadge(x.processingStatus||x.status||x.syncStatus||x.reconciliationStatus||"-")}</td><td>${escapeHtml(x.reason||x.lastError||x.errorMessage||"-")}</td></tr>`));}eticaretTabloAraclari(panel);
            }catch(error){panel.innerHTML=`<div class="error">${escapeHtml(error.message)}</div>`;}};
            const render=async key=>{aktifSekme=key;if(key==="overview")renderOverview();else if(["connections","settings"].includes(key))renderConnections();else if(key==="orders")renderOrders();else await loadRows(key);panel.querySelectorAll("[data-ec-test]").forEach(b=>b.onclick=async()=>{try{await api(`/api/tenant/eticaret/connections/${connections[+b.dataset.ecTest]._id}/test`,{method:"POST"});alert("Bağlantı başarılı.");}catch(e){if(e.code==="OAUTH_AUTHORIZATION_REQUIRED"&&e.data?.authorizationUrl)return window.location.assign(e.data.authorizationUrl);alert(e.message);}});panel.querySelectorAll("[data-ec-orders]").forEach(b=>b.onclick=async()=>{const original=b.textContent;b.disabled=true;b.textContent="Siparişler çekiliyor...";try{const d=await api("/api/tenant/eticaret/sync",{method:"POST",body:JSON.stringify({connectionId:connections[+b.dataset.ecOrders]._id,type:"ORDER_PULL"})}),jobId=String(d.job?._id||"");let job=null;for(let i=0;i<30;i++){await new Promise(resolve=>setTimeout(resolve,1000));const jobs=(await api("/api/tenant/eticaret/sync-jobs")).jobs||[];job=jobs.find(x=>String(x._id)===jobId);if(job&&!["QUEUED","RUNNING"].includes(job.status))break;}if(!job||["QUEUED","RUNNING"].includes(job.status))alert("Sipariş çekme arka planda devam ediyor. Siparişler ekranı otomatik senkronizasyonda güncellenecek.");else if(job.status==="FAILED")alert(`Siparişler alındı ancak ${Number(job.errorCount||0)} kayıt ürün eşleşmesi bekliyor. Siparişler ekranında kontrol edin.`);else alert(`${Number(job.successCount||0)} yeni sipariş alındı${Number(job.errorCount||0)?`, ${Number(job.errorCount)} kayıt eşleşme bekliyor`:""}.`);await eticaretYukle("orders",filtre);}catch(e){alert(e.message);}finally{if(document.body.contains(b)){b.disabled=false;b.textContent=original;}}});panel.querySelectorAll("[data-ec-pilot]").forEach(b=>b.onclick=async()=>{if(!confirm("5 ürün, bir stok/fiyat ve en fazla 5 siparişle küçük IdeaSoft testi çalıştırılsın mı?"))return;try{const d=await api(`/api/tenant/eticaret/connections/${connections[+b.dataset.ecPilot]._id}/ideasoft/pilot-test`,{method:"POST"});alert(d.result?.status==="SUCCESS"?"Küçük test başarıyla tamamlandı.":"Küçük test kısmen tamamlandı; sonuçları hesap kartından kontrol edin.");eticaretYukle("connections",filtre);}catch(e){alert(e.message);}});panel.querySelectorAll("[data-ec-edit]").forEach(b=>b.onclick=()=>eticaretBaglantiFormu(connections[+b.dataset.ecEdit]));panel.querySelectorAll("[data-ec-sync]").forEach(b=>b.onclick=async()=>{try{await api("/api/tenant/eticaret/sync",{method:"POST",body:JSON.stringify({connectionId:connections[+b.dataset.ecSync]._id,type:"STOCK_PUSH"})});alert("Stok gönderimi kuyruğa alındı.");}catch(e){alert(e.message);}});panel.querySelectorAll("[data-ec-disable]").forEach(b=>b.onclick=async()=>{if(confirm("Bu hesap devre dışı bırakılsın mı?")){await api(`/api/tenant/eticaret/connections/${connections[+b.dataset.ecDisable]._id}`,{method:"DELETE"});eticaretYukle("connections",filtre);}});};
            content.querySelectorAll("[data-eticaret-tab]").forEach(b=>b.onclick=()=>eticaretYukle(b.dataset.eticaretTab,filtre));content.querySelectorAll("[data-ec-grup]").forEach(b=>b.onclick=()=>{const g=eticaretMenuGruplari.find(x=>x.kod===b.dataset.ecGrup);eticaretYukle(g.sekmeler[0],filtre);});content.querySelector("#eticaretMobilSekme").onchange=e=>eticaretYukle(e.target.value,filtre);content.querySelector("#eticaretYeniBaglanti")?.addEventListener("click",()=>eticaretBaglantiFormu());content.querySelector("#eticaretYenile").onclick=()=>eticaretYukle(aktifSekme,filtre);content.querySelector("#eticaretFiltrele").onclick=()=>eticaretYukle(aktifSekme,{baslangic:content.querySelector("#eticaretBaslangic").value,bitis:content.querySelector("#eticaretBitis").value,provider:content.querySelector("#eticaretProvider").value,donem:content.querySelector("#eticaretDonem").value});content.querySelector("#eticaretDonem").value=filtre.donem||"BU_AY";content.querySelector("#eticaretDonem").onchange=e=>{const s=new Date(now),b=new Date(now);if(e.target.value==="DUN"){s.setDate(now.getDate()-1);b.setDate(now.getDate()-1);}else if(e.target.value==="BU_HAFTA")s.setDate(now.getDate()-((now.getDay()+6)%7));else if(e.target.value==="BU_AY")s.setDate(1);content.querySelector("#eticaretBaslangic").value=iso(s);content.querySelector("#eticaretBitis").value=iso(b);};await render(aktifSekme);
        } catch(error) { errorBox(error); }
    }

    async function sayfaYukle(page) {
        const buYukleme = ++sayfaYuklemeNo;
        if (!sayfaErisimiVar(page)) {
            setTitle("Yetkisiz Erişim");
            content.innerHTML = '<div class="error"><strong>Bu modül için yetkiniz bulunmuyor.</strong><div style="margin-top:8px">İşletme yöneticiniz Kullanıcılar / Yetkiler ekranından erişim verebilir.</div></div>';
            return;
        }
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

        if (page === "saha") {
            if (buYukleme !== sayfaYuklemeNo) return;
            await sahaYukle();
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

        if (page === "masraflar") {
            if (buYukleme !== sayfaYuklemeNo) return;
            await masraflarYukle();
            return;
        }

        if (page === "personeller") {
            if (buYukleme !== sayfaYuklemeNo) return;
            await personelMerkeziYukle();
            return;
        }

        if (page === "teklifler" || page === "siparisler") {
            if (buYukleme !== sayfaYuklemeNo) return;
            await teklifSiparisYukle(page === "teklifler" ? "teklif" : "siparis");
            return;
        }

        if (configs[page]) {
            if (buYukleme !== sayfaYuklemeNo) return;
            await basitSayfa(page);
            return;
        }

        if (page === "finans" || page === "kasa" || page === "banka") {
            if (buYukleme !== sayfaYuklemeNo) return;
            await finansYukle();
            return;
        }

        if (page === "raporlar") {
            await raporMerkeziYukle(buYukleme);
            return;
        }

        if (page === "eticaret") {
            if (buYukleme !== sayfaYuklemeNo) return;
            await eticaretYukle();
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

    // Başlangıç: menüyü güncel rol/yetki bilgisine göre daralt.
    (async function uygulamayiBaslat() {
        try {
            const profil = await api("/api/auth/profil");
            oturumKullanici = profil.kullanici || null;
            mobilYetkiMenusunuUygula();
            document.querySelector("#accountButton strong").textContent = oturumKullanici?.adSoyad || "Hesabım";
            document.querySelector("#accountButton small").textContent = oturumKullanici?.unvan || oturumKullanici?.rol || "Profil ve güvenlik";
        } catch (_) {
            window.location.replace("/erp/login.html");
            return;
        }
        anaSayfa();
    })();
})();
