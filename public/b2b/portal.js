(function () {
    "use strict";
    const $ = id => document.getElementById(id), view = $("view");
    const esc = x => String(x ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
    const money = (x, currency) => BelgeSunum.para(x, currency), qty = x => BelgeSunum.miktar(x);
    const date = x => new Date(x).toLocaleDateString("tr-TR");
    let me, cart = [], current = "catalog", listPage = 0, filter = { q: "", kategori: "", marka: "" }, catalogItems = [], quote, challenge = "", key = "", revision = 0;
    const message = x => { $("message").textContent = x; };
    async function api(path, method = "GET", body) {
        const csrf = document.cookie.split(";").map(x => x.trim()).find(x => x.startsWith("bm_csrf="))?.slice(8) || "";
        const response = await fetch(path, { method, credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", "X-CSRF-Token": decodeURIComponent(csrf) }, body: body === undefined ? undefined : JSON.stringify(body) });
        let data; try { data = await response.json(); } catch (_) { data = {}; }
        if (!response.ok || !data.basarili) throw Object.assign(new Error(data.mesaj || (response.status === 403 ? "Bayi erişimi kapalı veya bu işlem için yetkiniz yok." : "İşlem tamamlanamadı.")), { status: response.status });
        return data;
    }
    function remember() {
        quote = null; key = ""; $("cartCount").textContent = cart.length;
        try { sessionStorage.setItem("b2b-cart-" + me.kullanici.id, JSON.stringify(cart)); } catch (_) { /* storage optional */ }
    }
    function add(id, amount = 1) { const item = cart.find(x => x.urunId === id); if (item) item.miktar += amount; else cart.push({ urunId: id, miktar: amount }); remember(); message("Ürün sepete eklendi."); }
    const empty = text => `<div class="empty">${esc(text)}</div>`;
    const pager = hasNext => `<div class="actions"><button data-page="prev" ${listPage === 0 ? "disabled" : ""}>Önceki</button><span>Sayfa ${listPage + 1}</span><button data-page="next" ${hasNext ? "" : "disabled"}>Sonraki</button></div>`;
    function image(url) { return /^(https:\/\/|\/[^/]|data:image\/(png|jpeg|webp);base64,)/i.test(url || "") ? `<img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="image-placeholder" aria-hidden="true">▦</div>'; }
    async function catalog(turn) {
        const query = new URLSearchParams({ ...filter, page: listPage, favorites: current === "favorites" ? "1" : "0" });
        const d = await api("/api/b2b/catalog?" + query); if (turn !== revision) return;
        catalogItems = d.products;
        const options = (values, selected) => '<option value="">Tümü</option>' + values.filter(Boolean).sort().map(x => `<option ${selected === x ? "selected" : ""}>${esc(x)}</option>`).join("");
        view.innerHTML = `<p class="eyebrow">SİZE ÖZEL FİYATLAR</p><h1>${current === "favorites" ? "Favorilerim" : "Ürün kataloğu"}</h1><p>${d.total} ürün · ${esc(d.depo || "Depo tanımlanmamış")} · Net birim fiyatlar KDV hariçtir. Stok sipariş anında tekrar kontrol edilir.</p><form id="search" class="filters"><label>Ürün adı, kod veya barkod<input name="q" value="${esc(filter.q)}" placeholder="Ürün ara…"></label><label>Kategori<select name="kategori">${options(d.categories, filter.kategori)}</select></label><label>Marka<select name="marka">${options(d.brands, filter.marka)}</select></label><button>Ara</button></form><details><summary>Hızlı sipariş: kod / barkod ile ekle</summary><form id="quick"><label>Her satıra kod veya barkod; miktar<textarea name="lines" rows="4" placeholder="URUN001; 2" required></textarea></label><button>Sepete ekle</button></form></details><div class="cards">${d.products.map(x => `<article class="product">${image(x.gorsel)}<p>${esc(x.marka)} · ${esc(x.kategori)}</p><h3>${esc(x.ad)}</h3><p>Kod: ${esc(x.kod)}<br>Barkod: ${esc(x.barkod || "—")}</p><span class="pill">Stok: ${x.stok === null ? "Tanımsız" : qty(x.stok)} ${esc(x.birim)}</span><div class="price">${money(x.netFiyat, x.paraBirimi)}</div><p>KDV %${qty(x.kdv)} hariç</p><div class="actions"><button class="primary" data-add="${x._id}" ${!me.cari.siparisYetkisi || x.paraBirimi !== "TRY" ? "disabled" : ""}>Sepete ekle</button><button data-favorite="${x._id}" aria-label="Favori durumunu değiştir">${me.favoriler.includes(x._id) ? "★" : "☆"}</button></div>${x.paraBirimi !== "TRY" ? '<p>Dövizli ürün için firma ile görüşün.</p>' : ""}</article>`).join("") || empty("Aramanıza uygun ürün bulunamadı.")}</div>${pager((listPage + 1) * 24 < d.total)}`;
    }
    async function renderCart(turn) {
        if (!cart.length) { view.innerHTML = '<h1>Sepetim</h1>' + empty("Sepetiniz boş. Katalogdan ürün ekleyin."); return; }
        view.innerHTML = '<h1>Sepetim</h1><p>Güncel fiyat ve stoklar kontrol ediliyor…</p>';
        try { const d = await api("/api/b2b/quote", "POST", { kalemler: cart }); if (turn !== revision) return; quote = d.teklif; }
        catch (e) { if (turn !== revision) return; quote = null; message(e.message); }
        view.innerHTML = `<h1>Sepetim</h1><p>Minimum sipariş: ${money(me.cari.minimumSiparis)} · Vade: ${qty(me.cari.vadeGun)} gün</p><div class="panel">${cart.map((x, i) => { const product = quote?.urunler.find(y => y._id === x.urunId), line = quote?.kalemler.find(y => y.urunId === x.urunId); return `<div class="row"><div><strong>${esc(product?.ad || "Ürün " + (i + 1))}</strong><p>${esc(product?.kod || x.urunId)} ${line ? "· " + money(line.birimFiyat) + " + KDV" : ""}</p></div><label>Miktar<input type="number" min="0.0001" max="1000000" step="any" data-amount="${x.urunId}" value="${x.miktar}"></label><button data-remove="${x.urunId}">Kaldır</button></div>`; }).join("")}${quote ? BelgeSunum.tutarOzeti(quote) : '<p>Kontrol başarısız. Ürünleri düzeltip yeniden deneyin.</p>'}</div><form id="checkout"><div class="fields"><label>Sevk adresi<textarea name="sevkAdresi" maxlength="700">${esc(me.cari.adres)}</textarea></label><label>Sipariş notu<textarea name="notlar" maxlength="700"></textarea></label></div><div class="checkout"><strong>${quote ? money(quote.genelToplam) : "Fiyat doğrulanamadı"}</strong><button class="primary" ${!quote || !me.cari.siparisYetkisi ? "disabled" : ""}>Siparişi onaya gönder</button></div></form>`;
    }
    async function list(turn) {
        const paths = { orders: "orders", ledger: "ledger", documents: "documents", payments: "payments" };
        const d = await api(`/api/b2b/${paths[current]}?page=${listPage}`); if (turn !== revision) return;
        const titles = { orders: "Sipariş geçmişim", ledger: "Cari bakiye ve ekstre", documents: "Satış belgelerim", payments: "Ödeme bilgileri" };
        let rows, content;
        if (current === "orders") { rows = d.orders; content = rows.map(x => `<div class="row"><div><strong>${esc(x.siparisNo)}</strong><p>${date(x.tarih)} · ${money(x.genelToplam, x.paraBirimi)}</p></div><span class="pill">${esc(x.durum)}</span><button data-order="${x._id}">Görüntüle</button><button data-repeat="${x._id}">Tekrar sipariş</button></div>`).join(""); }
        if (current === "ledger" || current === "payments") { rows = d.hareketler || d.odemeler; content = (current === "ledger" ? `<h2>Güncel bakiye: ${money(d.bakiye)}</h2><p>Pozitif bakiye firmaya borcunuzu gösterir. Tüm hareketler ERP cari defterinden gelir.</p>` : `<p>Ödeme vadesi: ${qty(d.vadeGun)} gün. Havale açıklamasına cari kodunuzu yazın: ${esc(me.cari.kod)}</p>${d.hesaplar.map(x => `<div class="panel"><strong>${esc(x.bankaAdi)}</strong><p>${esc(x.iban || "IBAN tanımlanmamış")} · ${esc(x.paraBirimi)}</p></div>`).join("") || empty("Firma henüz banka hesabı tanımlamamış.")}<h2>Tahsilat kayıtları</h2>`) + rows.map(x => `<div class="row"><div><strong>${date(x.tarih)} · ${esc(x.tip || "TAHSILAT")}</strong><p>${esc(x.belgeNo || "")} · ${esc(x.odemeYontemi || "")} · ${esc(x.durum)}</p></div><strong>${money(x.tutar)}</strong>${x.sonrakiBakiye !== undefined ? `<span>Bakiye: ${money(x.sonrakiBakiye)}</span>` : ""}</div>`).join(""); }
        if (current === "documents") { rows = d.documents; content = '<p>ERP satış kayıtları ve sevk çıktıları. Bu portal yeni bir e-fatura veya resmî e-irsaliye üretmez.</p>' + rows.map(x => `<div class="row"><div><strong>${esc(x.belgeNo)}</strong><p>${date(x.tarih)} · ${esc(x.odemeDurumu)}</p></div><strong>${money(x.genelToplam, x.paraBirimi)}</strong><button data-document="${x._id}">Fatura / satış çıktısı</button><button data-dispatch="${x._id}">İrsaliye çıktısı</button></div>`).join(""); }
        view.innerHTML = `<h1>${titles[current]}</h1><div class="panel">${content}${!rows.length ? empty("Henüz kayıt yok.") : ""}</div>${pager(rows.length === (current === "ledger" ? 50 : 25))}`;
    }
    async function render() {
        const turn = ++revision; message(""); view.innerHTML = '<p role="status">Yükleniyor…</p>';
        document.querySelectorAll("[data-view]").forEach(x => x.classList.toggle("selected", x.dataset.view === current));
        try { if (["catalog", "favorites"].includes(current)) await catalog(turn); else if (current === "cart") await renderCart(turn); else await list(turn); }
        catch (e) { if (turn === revision) { view.innerHTML = empty(e.message) + '<button data-retry="1">Yeniden dene</button>'; message(e.message); } }
    }
    async function showDocument(id, kind) {
        const d = await api(`/api/b2b/${kind === "order" ? "orders" : "documents"}/${id}`), x = d.document;
        $("detailBody").innerHTML = `<p class="eyebrow">${esc(me.firma?.unvan)}</p><p>${esc(me.firma?.adres)}<br>${esc(me.firma?.vergiDairesi)} · ${esc(me.firma?.vergiNo)}<br>${esc(me.firma?.telefon)}</p><h3>Alıcı: ${esc(me.cari.unvan)}</h3><p>${esc(me.cari.vergiDairesi)} · ${esc(me.cari.vergiNo)}</p><h1>${kind === "dispatch" ? "İrsaliye / sevk çıktısı" : kind === "order" ? "Sipariş" : "Fatura / satış çıktısı"}</h1><h2>${esc(x.siparisNo || x.belgeNo)}</h2><p>${date(x.tarih)} · ${esc(x.durum || x.odemeDurumu || "")}<br>${esc(x.sevkAdresi || me.cari.adres)}</p>${x.kalemler.map(k => `<div class="row"><div><strong>${esc(k.urunId?.ad || "Ürün")}</strong><p>${esc(k.urunId?.kod || "")}</p></div><span>${BelgeSunum.miktar(k.miktar, k.urunId?.birim || "")}</span>${kind === "dispatch" ? "" : `<span>${money(k.toplam, x.paraBirimi)}</span>`}</div>`).join("")}${kind === "dispatch" ? "" : BelgeSunum.tutarOzeti(x)}<p class="subtle">ERP kayıt çıktısıdır; resmî e-belge yerine geçmez.</p>`;
        $("detail").showModal();
    }
    async function start() {
        const d = await api("/api/b2b/me"); me = d;
        try { const stored = JSON.parse(sessionStorage.getItem("b2b-cart-" + me.kullanici.id) || "[]"); cart = Array.isArray(stored) ? stored.filter(x => /^[a-f\d]{24}$/i.test(x.urunId) && Number.isFinite(x.miktar) && x.miktar > 0).slice(0, 100) : []; } catch (_) { cart = []; }
        $("cartCount").textContent = cart.length; $("identity").textContent = me.cari.unvan; $("login").hidden = true; $("logout").hidden = false; $("portal").hidden = false; await render();
    }
    $("loginForm").addEventListener("submit", async e => { e.preventDefault(); const button = e.submitter; button.disabled = true; try { const data = await api("/api/auth/login", "POST", Object.fromEntries(new FormData(e.target))); if (data.ikiFaktorGerekli) { challenge = data.challengeToken; $("mfaForm").hidden = false; $("loginForm").hidden = true; } else await start(); } catch (err) { message(err.message); } finally { button.disabled = false; } });
    $("mfaForm").addEventListener("submit", async e => { e.preventDefault(); try { await api("/api/auth/2fa-dogrula", "POST", { challengeToken: challenge, kod: new FormData(e.target).get("kod") }); await start(); } catch (err) { message(err.message); } });
    $("logout").addEventListener("click", async () => { try { await api("/api/auth/logout", "POST", {}); location.reload(); } catch (e) { message(e.message); } });
    $("closeDetail").addEventListener("click", () => $("detail").close()); $("printDetail").addEventListener("click", () => window.print());
    document.querySelector(".b2b-nav").addEventListener("click", e => { const b = e.target.closest("[data-view]"); if (b) { current = b.dataset.view; listPage = 0; render(); } });
    view.addEventListener("click", async e => {
        const b = e.target.closest("button"); if (!b) return;
        try {
            if (b.dataset.add) { add(b.dataset.add); return; }
            if (b.dataset.favorite) { const id = b.dataset.favorite, active = !me.favoriler.includes(id); await api("/api/b2b/favorites/" + id, "PUT", { aktif: active }); me.favoriler = active ? [...me.favoriler, id] : me.favoriler.filter(x => x !== id); b.textContent = active ? "★" : "☆"; return; }
            if (b.dataset.remove) { cart = cart.filter(x => x.urunId !== b.dataset.remove); remember(); await render(); return; }
            if (b.dataset.page) { listPage += b.dataset.page === "next" ? 1 : -1; await render(); return; }
            if (b.dataset.repeat) { const d = await api("/api/b2b/orders/" + b.dataset.repeat); cart = d.document.kalemler.filter(k => k.urunId?._id).map(k => ({ urunId: k.urunId._id, miktar: k.miktar })); remember(); current = "cart"; await render(); message("Ürünler güncel fiyatlarla sepete alındı. Kontrol ederek gönderin."); return; }
            if (b.dataset.order || b.dataset.document || b.dataset.dispatch) await showDocument(b.dataset.order || b.dataset.document || b.dataset.dispatch, b.dataset.order ? "order" : b.dataset.dispatch ? "dispatch" : "sale");
            if (b.dataset.retry) await render();
        } catch (err) { message(err.message); }
    });
    view.addEventListener("change", e => { if (e.target.dataset.amount) { const amount = Number(e.target.value); if (!Number.isFinite(amount) || amount <= 0 || amount > 1e6) { message("Miktar geçersiz."); return; } cart.find(x => x.urunId === e.target.dataset.amount).miktar = amount; remember(); render(); } });
    view.addEventListener("submit", async e => {
        e.preventDefault(); const b = e.submitter; if (b) b.disabled = true;
        try {
            const fields = Object.fromEntries(new FormData(e.target));
            if (e.target.id === "search") { filter = fields; listPage = 0; await render(); }
            if (e.target.id === "quick") {
                const lines = fields.lines.split(/\r?\n/).filter(x => x.trim()); if (lines.length > 100) throw new Error("En fazla 100 satır ekleyin.");
                const resolved = [];
                for (const line of lines) { const [code, value = "1"] = line.split(";").map(x => x.trim()); const amount = Number(value.replace(",", ".")); if (!Number.isFinite(amount) || amount <= 0) throw new Error("Miktar geçersiz: " + code); const d = await api("/api/b2b/catalog?exact=1&q=" + encodeURIComponent(code)); const p = d.products.find(x => x.kod.toLocaleUpperCase("tr-TR") === code.toLocaleUpperCase("tr-TR") || x.barkod === code); if (!p) throw new Error("Kod/barkod bulunamadı: " + code); resolved.push({ id: p._id, amount }); }
                resolved.forEach(x => add(x.id, x.amount)); current = "cart"; await render();
            }
            if (e.target.id === "checkout") {
                key ||= crypto.randomUUID(); const d = await api("/api/b2b/orders", "POST", { ...fields, transactionId: key, fiyatOnayi: quote?.fiyatOnayi, kalemler: cart }); cart = []; remember(); current = "orders"; listPage = 0; await render(); message("Sipariş ERP'ye iletildi: " + d.siparis.siparisNo);
            }
        } catch (err) { message(err.message); } finally { if (b) b.disabled = false; }
    });
    start().catch(e => { if (![401, 403].includes(e.status)) message(e.message); });
})();
