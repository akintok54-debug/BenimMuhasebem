(function () {
    "use strict";
    const $ = id => document.getElementById(id), view = $("view");
    const esc = x => String(x ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
    const money = (x, currency) => BelgeSunum.para(x, currency), qty = x => BelgeSunum.miktar(x);
    const date = x => new Date(x).toLocaleDateString("tr-TR");
    let me, cart = [], current = "catalog", listPage = 0, filter = { q: "", kategori: "", marka: "" }, catalogItems = [], quote, challenge = "", key = "", revision = 0;
    let bannerTimer;
    let sessionRevision = 0, signingOut = false, guest = false, storeInfo = null;
    let catalogTaxIncluded = false;
    const isRetail = () => me?.cari?.musteriTipi === "PERAKENDE";
    const message = x => { $("message").textContent = x; };
    async function api(path, method = "GET", body) {
        const csrf = document.cookie.split(";").map(x => x.trim()).find(x => x.startsWith("bm_b2b_csrf="))?.slice(12) || "";
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
    function image(url, eager = false) { return /^(https:\/\/|\/[^/]|data:image\/(png|jpeg|webp);base64,)/i.test(url || "") ? `<img src="${esc(url)}" alt="" loading="${eager ? "eager" : "lazy"}" decoding="async" referrerpolicy="no-referrer">` : '<div class="image-placeholder" aria-hidden="true">▦</div>'; }
    async function catalog(turn) {
        const query = new URLSearchParams({ ...filter, page: listPage, favorites: current === "favorites" ? "1" : "0" });
        if (guest) query.set("firma", storeInfo.firma.slug);
        const d = await api((guest ? "/api/b2b/store/catalog?" : "/api/b2b/catalog?") + query); if (turn !== revision) return;
        catalogItems = d.products; catalogTaxIncluded = d.kdvDahilGoster === true;
        const options = (values, selected) => '<option value="">Tümü</option>' + values.filter(Boolean).sort().map(x => `<option ${selected === x ? "selected" : ""}>${esc(x)}</option>`).join("");
        view.innerHTML = `<p class="eyebrow">${isRetail() ? "PERAKENDE MAĞAZA" : "SİZE ÖZEL FİYATLAR"}</p>${guest ? '<div class="actions"><button data-account="register">Üye ol</button><button data-account="login">Giriş yap</button></div>' : ""}<h1>${current === "favorites" ? "Favorilerim" : "Ürün kataloğu"}</h1><p>${d.total} ürün · ${esc(d.depo || (isRetail() ? "Online mağaza" : "Bayi kataloğu"))} · ${catalogTaxIncluded ? "Gösterilen fiyatlar KDV dahildir." : "Net birim fiyatlar KDV hariçtir."} Stok sipariş anında tekrar kontrol edilir.</p><form id="search" class="filters"><label>Ürün adı, kod veya barkod<input name="q" value="${esc(filter.q)}" placeholder="Ürün ara…"></label><label>Kategori<select name="kategori">${options(d.categories, filter.kategori)}</select></label><label>Marka<select name="marka">${options(d.brands, filter.marka)}</select></label><button>Ara</button></form><details><summary>Hızlı sipariş: kod / barkod ile ekle</summary><form id="quick"><label>Her satıra kod veya barkod; miktar<textarea name="lines" rows="4" placeholder="URUN001; 2" required></textarea></label><button>Sepete ekle</button></form></details><div class="cards">${d.products.map(x => `<article class="product">${image(x.gorsel) === '<div class="image-placeholder" aria-hidden="true">▦</div>' ? `<button type="button" class="product-image" data-preview="${esc(x._id)}" aria-label="${esc(x.ad)} ürününü incele">${image(x.gorsel)}<span>Ürünü incele</span></button>` : `<button type="button" class="product-image" data-preview="${esc(x._id)}" aria-label="${esc(x.ad)} resmini büyüt">${image(x.gorsel)}<span>Yakından incele ⤢</span></button>`}<p>${esc(x.marka)} · ${esc(x.kategori)}</p><h3><button type="button" class="product-title" data-preview="${esc(x._id)}">${esc(x.ad)}</button></h3><p>Kod: ${esc(x.kod)}${x.barkod !== undefined ? `<br>Barkod: ${esc(x.barkod || "—")}` : ""}</p>${x.stok !== undefined ? `<span class="pill">Stok: ${x.stok === null ? "Tanımsız" : qty(x.stok)} ${esc(x.birim)}</span>` : ""}${x.netFiyat !== undefined ? `${(x.etiketler || []).map(t=>`<span class="pill">${esc({YENI:"Yeni",INDIRIMLI:"İndirimli",KAMPANYA:"Kampanya"}[t] || t)}</span>`).join("")}${x.eskiFiyat > x.netFiyat ? `<del>${money(catalogTaxIncluded ? x.eskiKdvDahilFiyat : x.eskiFiyat,x.paraBirimi)}</del>` : ""}<div class="price">${money(catalogTaxIncluded ? x.kdvDahilFiyat : x.netFiyat, x.paraBirimi)}</div><p>KDV %${qty(x.kdv)} ${catalogTaxIncluded ? "dahil" : "hariç"}</p>` : `<p>Fiyatı sipariş onayında görebilirsiniz.</p>`}<label>Miktar<input type="number" min="0.0001" max="1000000" step="any" value="1" data-card-amount="${esc(x._id)}"></label><div class="actions"><button class="primary" data-add="${x._id}" ${!me.cari.siparisYetkisi || x.paraBirimi !== "TRY" || (isRetail() && !(x.netFiyat > 0)) ? "disabled" : ""}>Sepete ekle</button><button data-favorite="${x._id}" aria-label="Favori durumunu değiştir">${me.favoriler.includes(x._id) ? "★" : "☆"}</button></div>${x.paraBirimi !== "TRY" ? '<p>Dövizli ürün için firma ile görüşün.</p>' : ""}</article>`).join("") || empty("Aramanıza uygun ürün bulunamadı.")}</div>${pager((listPage + 1) * 24 < d.total)}`;
        if(!guest) loadBanners(turn).catch(()=>{});
    }
    async function loadBanners(turn){
        const d=await api('/api/b2b/contents');if(turn!==revision)return;
        const rows=d.icerikler.filter(x=>x.gorsel||x.tur==='REKLAM');if(!rows.length)return;
        view.insertAdjacentHTML('afterbegin','<aside class="supplier-banner" aria-label="Firma duyuruları"></aside>');
        const host=view.querySelector('.supplier-banner');let index=0;
        const draw=()=>{const x=rows[index];host.innerHTML=(x.gorsel?image(x.gorsel):'')+'<div><strong>'+esc(x.baslik)+'</strong><p>'+esc(x.tur==='REKLAM'?'Tedarikçi duyurusu':'Kampanya')+'</p></div>'+(x.hedef&&/^(https:\/\/|\/[^/\\])/i.test(x.hedef)?'<a rel="noopener noreferrer" href="'+esc(x.hedef)+'">İncele</a>':x.urunId?'<button data-banner-product="'+esc(x.urunId)+'">Ürünü gör</button>':x.kategori?'<button data-banner-category="'+esc(x.kategori)+'">Kategoriyi gör</button>':'')+(rows.length>1?'<button data-banner-next aria-label="Sonraki duyuru">›</button>':'');host.querySelector('[data-banner-next]')?.addEventListener('click',()=>{index=(index+1)%rows.length;draw();});host.querySelector('[data-banner-category]')?.addEventListener('click',()=>{filter.kategori=x.kategori;listPage=0;render();});host.querySelector('[data-banner-product]')?.addEventListener('click',()=>{const p=catalogItems.find(p=>p._id===String(x.urunId));if(p){filter.q=p.kod;listPage=0;render();}else message('Ürün bu sayfada bulunmuyor; katalogdan arayabilirsiniz.');});};
        draw();if(rows.length>1)bannerTimer=setInterval(()=>{if(turn!==revision||!host.isConnected)return clearInterval(bannerTimer);index=(index+1)%rows.length;draw();},8000);
    }
    async function renderCart(turn) {
        if (guest && cart.length) { view.innerHTML = '<h1>Sepetim</h1><p>Sepetinizdeki ürünler korunur. Siparişi tamamlamak için giriş yapın veya hesap oluşturun.</p><button data-account="register" class="primary">Hesap oluştur</button> <button data-account="login">Giriş yap</button>'; return; }
        if (!cart.length) { view.innerHTML = '<h1>Sepetim</h1>' + empty("Sepetiniz boş. Katalogdan ürün ekleyin."); return; }
        view.innerHTML = '<h1>Sepetim</h1><p>Güncel fiyat ve stoklar kontrol ediliyor…</p>';
        try { const d = await api("/api/b2b/quote", "POST", { kalemler: cart }); if (turn !== revision) return; quote = d.teklif; }
        catch (e) { if (turn !== revision) return; quote = null; message(e.message); }
        view.innerHTML = `<h1>Sepetim</h1><p>${isRetail() ? "Teslimat adresinizi ve ödeme yönteminizi seçin." : `Minimum sipariş: ${money(me.cari.minimumSiparis)} · Vade: ${qty(me.cari.vadeGun)} gün`}</p><div class="panel">${cart.map((x, i) => { const product = quote?.urunler.find(y => y._id === x.urunId), line = quote?.kalemler.find(y => y.urunId === x.urunId); return `<div class="row"><div><strong>${esc(product?.ad || "Ürün " + (i + 1))}</strong><p>${esc(product?.kod || x.urunId)} ${line ? "· " + money(line.birimFiyat) + " + KDV" : ""}</p></div><label>Miktar<input type="number" min="0.0001" max="1000000" step="any" data-amount="${x.urunId}" value="${x.miktar}"></label><button data-remove="${x.urunId}">Kaldır</button></div>`; }).join("")}${quote ? BelgeSunum.tutarOzeti(quote) : '<p>Kontrol başarısız. Ürünleri düzeltip yeniden deneyin.</p>'}</div><form id="checkout"><div class="fields"><label>Sevk adresi<textarea name="sevkAdresi" maxlength="700" ${isRetail() ? 'required minlength="10"' : ""}>${esc(me.cari.adres)}</textarea></label><label>Sipariş notu<textarea name="notlar" maxlength="700"></textarea></label></div>${isRetail() ? `<label>Ödeme yöntemi<select name="odemeYontemi" required><option value="">Seçin</option>${(me.odemeYontemleri || []).map(x => `<option value="${x.kod}">${esc(x.ad)}</option>`).join("")}</select></label><p>${(me.odemeYontemleri || []).length ? "Havale ve kapıda ödeme, firma tahsilatı doğruladığında tamamlanır." : "Şu anda kullanılabilir ödeme yöntemi yok."}</p>` : ""}<div class="checkout"><strong>${quote ? money(quote.genelToplam) : "Fiyat doğrulanamadı"}</strong><button class="primary" ${!quote || !me.cari.siparisYetkisi ? "disabled" : ""}>${isRetail() ? "Satın al / ödemeye geç" : "Siparişi onaya gönder"}</button></div></form>`;
    }
    async function list(turn) {
        const paths = { orders: "orders", ledger: "ledger", documents: "documents", payments: "payments" };
        const d = await api(`/api/b2b/${paths[current]}?page=${listPage}`); if (turn !== revision) return;
        const titles = { orders: "Sipariş geçmişim", ledger: "Cari bakiye ve ekstre", documents: "Satış belgelerim", payments: "Ödeme bilgileri" };
        let rows, content;
        if (current === "orders") { rows = d.orders; content = rows.map(x => `<div class="row"><div><strong>${esc(x.siparisNo)}</strong><p>${date(x.tarih)} · ${money(x.genelToplam, x.paraBirimi)}</p></div><span class="pill">${esc(x.durum)}${x.musteriTipi === "PERAKENDE" ? " · " + esc(x.magazaOdemeYontemi) + " · " + esc(x.magazaOdemeDurumu) : ""}</span>${x.magazaOdemeYontemi === "KART" && x.magazaOdemeDurumu === "BEKLIYOR" && x.durum !== "IPTAL" ? `<button data-pay="${x._id}">Kartla öde</button>` : ""}<button data-order="${x._id}">Görüntüle</button><button data-repeat="${x._id}">Tekrar sipariş</button></div>`).join(""); }
        if (current === "ledger" || current === "payments") { rows = d.hareketler || d.odemeler; content = (current === "ledger" ? `<h2>Güncel bakiye: ${money(d.bakiye)}</h2><p>Pozitif bakiye firmaya borcunuzu gösterir. Tüm hareketler ERP cari defterinden gelir.</p>` : `<p>Ödeme vadesi: ${qty(d.vadeGun)} gün. Havale açıklamasına cari kodunuzu yazın: ${esc(me.cari.kod)}</p>${d.hesaplar.map(x => `<div class="panel"><strong>${esc(x.bankaAdi)}</strong><p>${esc(x.hesapSahibi || "")}<br>${esc(x.iban || "IBAN tanımlanmamış")} · ${esc(x.paraBirimi)}</p><button data-copy-iban="${esc(x.iban)}">IBAN kopyala</button></div>`).join("") || empty("Firma henüz banka hesabı tanımlamamış.")}<h2>Tahsilat kayıtları</h2>`) + rows.map(x => `<div class="row"><div><strong>${date(x.tarih)} · ${esc(x.tip || "TAHSILAT")}</strong><p>${esc(x.belgeNo || "")} · ${esc(x.odemeYontemi || "")} · ${esc(x.durum)}</p></div><strong>${money(x.tutar)}</strong>${x.sonrakiBakiye !== undefined ? `<span>Bakiye: ${money(x.sonrakiBakiye)}</span>` : ""}</div>`).join(""); }
        if (current === "documents") { rows = d.documents; content = '<p>ERP satış kayıtları ve sevk çıktıları. Bu portal yeni bir e-fatura veya resmî e-irsaliye üretmez.</p>' + rows.map(x => `<div class="row"><div><strong>${esc(x.belgeNo)}</strong><p>${date(x.tarih)} · ${esc(x.odemeDurumu)}</p></div><strong>${money(x.genelToplam, x.paraBirimi)}</strong><button data-document="${x._id}">Fatura / satış çıktısı</button><button data-dispatch="${x._id}">İrsaliye çıktısı</button></div>`).join(""); }
        view.innerHTML = `<h1>${titles[current]}</h1><div class="panel">${content}${!rows.length ? empty("Henüz kayıt yok.") : ""}</div>${pager(rows.length === (current === "ledger" ? 50 : 25))}`;
    }
    async function statement(turn) {
        const d=await api('/api/b2b/account-statement');if(turn!==revision)return;
        view.innerHTML='<h1>Cari hesap ekstresi</h1><div data-statement></div><div data-linked></div>';
        CariEkstre.mount(view.querySelector('[data-statement]'),d);
        const linked=d.hareketler.filter(x=>x.kaynak==='SATIS'&&(x.sourceId||x.kaynakId));
        view.querySelector('[data-linked]').innerHTML='<h2>Bağlı satış belgeleri</h2>'+linked.map(x=>'<button data-document="'+esc(x.sourceId||x.kaynakId)+'">'+esc(x.belgeNo||date(x.tarih))+'</button>').join('');
    }
    async function analytics(turn,days=90) {
        const d=await api('/api/b2b/purchase-analysis?gun='+days);if(turn!==revision)return;
        view.innerHTML='<h1>Satın alma analizim</h1><label>Dönem<select data-period>'+[30,90,180,365].map(n=>'<option '+(n===days?'selected':'')+' value="'+n+'">Son '+n+' gün</option>').join('')+'</select></label><p>'+esc(d.aciklama)+'</p><p>Bekleyen sipariş: '+qty(d.bekleyenSiparis)+' · Dövizli belge (TL toplamına dahil değil): '+qty(d.digerParaBirimiBelge)+'</p><div class="panel">'+d.urunler.map(p=>'<div class="row"><div><strong>'+esc(p.kod)+' · '+esc(p.ad)+'</strong><p>'+qty(p.miktar)+' '+esc(p.birim)+' · '+money(p.tutar)+' · Son alım: '+date(p.sonAlis)+'</p>'+(p.uzunSuredirAlinmayan?'<span class="pill">Uzun süredir alınmıyor</span>':'')+'</div><button data-reorder="'+esc(p.urunId)+'" data-quantity="'+p.sonMiktar+'">Tekrar siparişe ekle</button></div>').join('')+(!d.urunler.length?empty('Bu dönemde satış kaydı yok.'):'')+'</div>';
        view.querySelector('[data-period]').onchange=e=>analytics(turn,Number(e.target.value)).catch(e=>message(e.message));
        view.querySelectorAll('[data-reorder]').forEach(b=>b.onclick=()=>add(b.dataset.reorder,Number(b.dataset.quantity)));
    }
    async function render() {
        clearInterval(bannerTimer); const turn = ++revision; message(""); view.innerHTML = '<p role="status">Yükleniyor…</p>';
        document.querySelectorAll("[data-view]").forEach(x => x.classList.toggle("selected", x.dataset.view === current));
        try { if (["catalog", "favorites"].includes(current)) await catalog(turn); else if (current === "cart") await renderCart(turn); else if(current === "ledger") await statement(turn); else if(current === "analytics") await analytics(turn); else await list(turn); }
        catch (e) { if (turn === revision) { view.innerHTML = empty(e.message) + '<button data-retry="1">Yeniden dene</button>'; message(e.message); } }
    }
    async function showDocument(id, kind) {
        const d = await api(`/api/b2b/${kind === "order" ? "orders" : "documents"}/${id}`), x = d.document;
        $("detailBody").innerHTML = `<p class="eyebrow">${esc(me.firma?.unvan)}</p><p>${esc(me.firma?.adres)}<br>${esc(me.firma?.vergiDairesi)} · ${esc(me.firma?.vergiNo)}<br>${esc(me.firma?.telefon)}</p><h3>Alıcı: ${esc(me.cari.unvan)}</h3><p>${esc(me.cari.vergiDairesi)} · ${esc(me.cari.vergiNo)}</p><h1>${kind === "dispatch" ? "İrsaliye / sevk çıktısı" : kind === "order" ? "Sipariş" : "Fatura / satış çıktısı"}</h1><h2>${esc(x.siparisNo || x.belgeNo)}</h2><p>${date(x.tarih)} · ${esc(x.durum || x.odemeDurumu || "")}<br>${esc(x.sevkAdresi || me.cari.adres)}</p>${x.kalemler.map(k => `<div class="row"><div><strong>${esc(k.urunId?.ad || "Ürün")}</strong><p>${esc(k.urunId?.kod || "")}</p></div><span>${BelgeSunum.miktar(k.miktar, k.urunId?.birim || "")}</span>${kind === "dispatch" ? "" : `<span>${money(k.toplam, x.paraBirimi)}</span>`}</div>`).join("")}${kind === "dispatch" ? "" : BelgeSunum.tutarOzeti(x)}<p class="subtle">ERP kayıt çıktısıdır; resmî e-belge yerine geçmez.</p>`;
        $("detail").showModal();
    }
    async function start() {
        const turn = ++sessionRevision;
        const d = await api("/api/b2b/me"); if (turn !== sessionRevision || signingOut) return; const guestCart = guest && storeInfo?.firma.slug === d.firma?.slug ? cart : []; guest = false; me = d;
        if (guestCart.length) { try { sessionStorage.setItem("b2b-cart-" + me.kullanici.id, JSON.stringify(guestCart)); } catch (_) {} }
        try { const stored = JSON.parse(sessionStorage.getItem("b2b-cart-" + me.kullanici.id) || "[]"); cart = Array.isArray(stored) ? stored.filter(x => /^[a-f\d]{24}$/i.test(x.urunId) && Number.isFinite(x.miktar) && x.miktar > 0).slice(0, 100) : []; } catch (_) { cart = []; }
        updateNavigation();
        $("cartCount").textContent = cart.length; $("identity").textContent = (me.firma?.unvan || "") + " · " + me.cari.unvan; $("login").hidden = true; $("logout").hidden = false; $("portal").hidden = false; await render();
    }
    function updateNavigation() {
        document.querySelectorAll("[data-view]").forEach(button => { button.hidden = guest ? !["catalog", "cart"].includes(button.dataset.view) : isRetail() && button.dataset.view === "ledger"; });
    }
    function openAccount(mode) {
        $("portal").hidden = true; $("login").hidden = false;
        $("registerForm").hidden = mode !== "register"; $("loginForm").hidden = mode === "register"; $("mfaForm").hidden = true;
    }
    function startGuest() {
        if (!storeInfo) return;
        guest = true; me = { kullanici: { id: "guest-" + storeInfo.firma.slug }, cari: { musteriTipi: "PERAKENDE", siparisYetkisi: true, gorunum: { gorsel: true } }, favoriler: [] };
        try { const saved = JSON.parse(sessionStorage.getItem("b2b-cart-" + me.kullanici.id) || "[]"); cart = Array.isArray(saved) ? saved.filter(x => /^[a-f\d]{24}$/i.test(x.urunId) && Number.isFinite(x.miktar) && x.miktar > 0).slice(0, 100) : []; } catch (_) { cart = []; }
        current = "catalog"; listPage = 0; updateNavigation(); $("cartCount").textContent = cart.length;
        $("login").hidden = true; $("portal").hidden = false; $("logout").hidden = true; render();
    }
    $("loginTab").onclick = () => openAccount("login");
    $("registerTab").onclick = () => openAccount("register");
    $("browseStore").onclick = startGuest;
    $("commercialApplication").onchange = event => { $("commercialFields").hidden = !event.target.checked; $("commercialFields").querySelectorAll("input").forEach(x => x.required = event.target.checked); };
    $("registerForm").addEventListener("submit", async event => {
        event.preventDefault(); const button = event.submitter; button.disabled = true;
        try {
            const body = Object.fromEntries(new FormData(event.target));
            if (body.sifre !== body.sifreTekrar) throw new Error("Parolalar aynı değil.");
            delete body.sifreTekrar; body.firma = storeInfo?.firma.slug; body.ticariBasvuru = body.ticariBasvuru === "on";
            await api("/api/b2b/auth/register", "POST", body);
            await api("/api/b2b/auth/login", "POST", { email: body.email, sifre: body.sifre });
            event.target.reset(); await start(); message("Perakende hesabınız hazır. Alışverişe başlayabilirsiniz.");
        } catch (error) { message(error.message); } finally { button.disabled = false; }
    });
    async function pay(orderId) {
        const result = await api("/api/b2b/orders/" + orderId + "/pay", "POST", {});
        if (result.odendi) { message("Ödeme doğrulandı."); await render(); return; }
        if (!/^https:\/\/www\.paytr\.com\/odeme\/guvenli\/[a-zA-Z0-9_-]+$/.test(result.iframeUrl || "")) throw new Error("Ödeme adresi doğrulanamadı.");
        const frame = document.createElement("iframe"); frame.src = result.iframeUrl; frame.title = "PayTR güvenli ödeme"; frame.allow = "payment";
        $("paymentBody").replaceChildren(frame); $("paymentDialog").showModal();
    }
    $("closePayment").onclick = () => { $("paymentDialog").close(); $("paymentBody").replaceChildren(); current = "orders"; render(); };
    $("loginForm").addEventListener("submit", async e => { e.preventDefault(); const button = e.submitter; button.disabled = true; try { const data = await api("/api/b2b/auth/login", "POST", Object.fromEntries(new FormData(e.target))); if (data.ikiFaktorGerekli) { challenge = data.challengeToken; $("mfaForm").hidden = false; $("loginForm").hidden = true; } else await start(); } catch (err) { message(err.message); } finally { button.disabled = false; } });
    $("mfaForm").addEventListener("submit", async e => { e.preventDefault(); try { await api("/api/b2b/auth/2fa-dogrula", "POST", { challengeToken: challenge, kod: new FormData(e.target).get("kod") }); await start(); } catch (err) { message(err.message); } });
    function showLogin() {
        sessionRevision++; revision++; guest = false; me = null; cart = []; quote = null; key = ""; challenge = "";
        view.replaceChildren(); $("identity").textContent = ""; $("cartCount").textContent = "0";
        $("portal").hidden = true; $("logout").hidden = true; $("login").hidden = false;
        $("registerForm").hidden = true; $("loginForm").hidden = false; $("mfaForm").hidden = true; $("loginForm").reset(); $("mfaForm").reset();
        document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
    }
    $("logout").addEventListener("click", async () => {
        if (signingOut) return;
        signingOut = true; sessionRevision++; const button = $("logout"); button.disabled = true;
        try {
            await api("/api/b2b/auth/logout", "POST", {});
            try { if (me) sessionStorage.removeItem("b2b-cart-" + me.kullanici.id); } catch (_) {}
            showLogin(); message("Çıkış yapıldı. Yeniden giriş yapmak için bilgilerinizi girin.");
        } catch (e) { message("Çıkış tamamlanamadı: " + e.message); }
        finally { signingOut = false; button.disabled = false; }
    });
    window.addEventListener("pageshow", e => { if (e.persisted) { showLogin(); start().catch(err => message([401,403].includes(err.status) ? "Oturum kapalı. Lütfen giriş yapın." : err.message)); } });
    const imageDialog = $("productImageDialog");
    $("closeProductImage").addEventListener("click", () => imageDialog.close());
    imageDialog.addEventListener("click", e => { if (e.target === imageDialog) { const r = imageDialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) imageDialog.close(); } });
    imageDialog.addEventListener("close", () => $("productImageBody").replaceChildren());
    $("productImageBody").addEventListener("error", e => { if (e.target.tagName === "IMG") $("productImageBody").textContent = "Ürün resmi yüklenemedi."; }, true);
    $("closeDetail").addEventListener("click", () => $("detail").close()); $("printDetail").addEventListener("click", () => window.print());
    document.querySelector(".b2b-nav").addEventListener("click", e => { const b = e.target.closest("[data-view]"); if (b) { current = b.dataset.view; listPage = 0; render(); } });
    view.addEventListener("click", async e => {
        const b = e.target.closest("button"); if (!b) return;
        try {
            if (b.dataset.account) { openAccount(b.dataset.account); return; }
            if (b.dataset.pay) { b.disabled = true; try { await pay(b.dataset.pay); } finally { b.disabled = false; } return; }
            if (guest && b.dataset.favorite) { openAccount("register"); return; }
            if (b.dataset.preview) {
                const product = catalogItems.find(x => String(x._id) === b.dataset.preview);
                if (!product) return;
                $("productImageTitle").textContent = product.ad;
                $("productImageInfo").textContent = [product.kod, ...(product.netFiyat !== undefined ? [money(catalogTaxIncluded ? product.kdvDahilFiyat : product.netFiyat, product.paraBirimi) + (catalogTaxIncluded ? " KDV dahil" : " + KDV")] : []), ...(product.stok !== undefined ? ["Stok: " + (product.stok === null ? "Tanımsız" : qty(product.stok) + " " + product.birim)] : [])].join(" · ");
                $("productImageBody").innerHTML = product.gorsel ? image(product.gorsel, true) : `<p>${me.cari.gorunum?.gorsel === true ? "Bu ürüne henüz resim eklenmemiş." : "Bu bayi için ürün resmi gösterimi kapalı."}</p>`;
                $("productImageBody").querySelector("img")?.setAttribute("alt", product.ad);
                $("productImageDialog").showModal(); return;
            }
            if(b.dataset.copyIban){await navigator.clipboard.writeText(b.dataset.copyIban);message("IBAN kopyalandı.");return;}
            if (b.dataset.add) { const amount=Number(view.querySelector(`[data-card-amount="${CSS.escape(b.dataset.add)}"]`)?.value || 1); if(!Number.isFinite(amount)||amount<=0||amount>1000000)throw Error("Geçerli miktar girin."); add(b.dataset.add,amount); return; }
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
                if (guest) { openAccount("register"); message("Hızlı sipariş için hesap oluşturun veya giriş yapın."); return; }
                const lines = fields.lines.split(/\r?\n/).filter(x => x.trim()); if (lines.length > 100) throw new Error("En fazla 100 satır ekleyin.");
                const resolved = [];
                for (const line of lines) { const [code, value = "1"] = line.split(";").map(x => x.trim()); const amount = Number(value.replace(",", ".")); if (!Number.isFinite(amount) || amount <= 0) throw new Error("Miktar geçersiz: " + code); const d = await api("/api/b2b/catalog?exact=1&q=" + encodeURIComponent(code)); const p = d.products.find(x => String(x.kod || "").toLocaleUpperCase("tr-TR") === code.toLocaleUpperCase("tr-TR") || x.barkod === code); if (!p) throw new Error("Kod/barkod bulunamadı: " + code); resolved.push({ id: p._id, amount }); }
                resolved.forEach(x => add(x.id, x.amount)); current = "cart"; await render();
            }
            if (e.target.id === "checkout") {
                key ||= crypto.randomUUID(); const d = await api("/api/b2b/orders", "POST", { ...fields, transactionId: key, fiyatOnayi: quote?.fiyatOnayi, kalemler: cart }); cart = []; remember(); current = "orders"; listPage = 0; await render(); message("Siparişiniz alındı: " + d.siparis.siparisNo); if (d.siparis.magazaOdemeYontemi === "KART") await pay(d.siparis._id); else if (d.siparis.magazaOdemeYontemi === "HAVALE") { const bank = me.odemeYontemleri.find(x => x.kod === "HAVALE"); message(`Siparişiniz alındı. ${bank.bankaAdi} · ${bank.iban} · Açıklama: ${d.siparis.siparisNo}. Ödeme kontrol edildikten sonra hazırlanacak.`); }
            }
        } catch (err) { message(err.message); } finally { if (b) b.disabled = false; }
    });
    const companySlug = new URLSearchParams(location.search).get("firma");
    if (companySlug) api("/api/b2b/company/" + encodeURIComponent(companySlug)).then(data => {
        $("companyName").textContent = data.firma.unvan;
        document.title = data.firma.unvan + " · Bayi Portalı";
    }).catch(e => message(e.message));
    (async () => {
        try { storeInfo = await api("/api/b2b/store" + (companySlug ? "?firma=" + encodeURIComponent(companySlug) : "")); $("registerTab").hidden = false; $("browseStore").hidden = false; $("companyName").textContent = storeInfo.firma.unvan; } catch (_) {}
        try { if (new URLSearchParams(location.search).has("odeme")) current = "orders"; await start(); }
        catch (e) { if ([401,403].includes(e.status) && storeInfo) startGuest(); else if (![401,403].includes(e.status)) message(e.message); }
    })();
})();
