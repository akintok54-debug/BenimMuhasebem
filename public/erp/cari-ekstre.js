(function(root) {
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const money = v => new Intl.NumberFormat('tr-TR', {minimumFractionDigits:2, maximumFractionDigits:2}).format(Number(v || 0)) + ' TL';
    const quantity = v => new Intl.NumberFormat('tr-TR', {maximumFractionDigits:4}).format(Number(v || 0));
    const day = v => { const d = new Date(v); return Number.isNaN(+d) ? '' : new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Istanbul'}).format(d); };
    function summarize(data, start = '', end = '') {
        const all = [...data.hareketler].sort((a,b) => +new Date(a.tarih)-+new Date(b.tarih) || +new Date(a.createdAt || 0)-+new Date(b.createdAt || 0) || String(a._id).localeCompare(String(b._id)));
        let balance = Number(data.musteri.cariAcilisBakiyesi ?? all[0]?.oncekiBakiye ?? 0), opening = balance, debit = 0, credit = 0;
        const rows = [];
        for (const h of all) {
            const delta = h.durum === 'IPTAL' ? 0 : h.bakiyeDegisimi != null ? Number(h.bakiyeDegisimi) : (['BORC','ODEME'].includes(h.tip) ? 1 : -1) * Number(h.tutar || 0);
            if (!Number.isFinite(delta)) throw new Error('Cari hareket tutarı geçersiz.');
            const date = day(h.tarih);
            if (end && date > end) continue;
            balance += delta;
            if (start && date < start) { opening = balance; continue; }
            const borc = Math.max(delta,0), alacak = Math.max(-delta,0);
            debit += borc; credit += alacak; rows.push({...h, borc, alacak, balance});
        }
        return {rows, opening, debit, credit, balance};
    }
    function mount(host, data, options = {}) {
        let detailed = new URLSearchParams(location.search).get('detay') === '1';
        const m = data.musteri, f = data.firma || {};
        host.classList.add('ce-root');
        host.innerHTML = `<header class="ce-company"><h2>${esc(f.unvan || 'Firma')}</h2><p>${esc(f.adres || '')}</p></header><section class="ce-customer"><div><small>CARİ HESAP</small><h2>${esc(m.unvan || m.adSoyad || '-')}</h2><p>${esc(m.kod || '')}</p></div><div><small>Güncel bakiye</small><strong>${money(m.bakiye)}</strong></div><div><small>Telefon</small><p>${esc(m.telefon || m.whatsapp || '-')}</p></div><div><small>Adres</small><p>${esc(m.adres || '-')}</p></div></section><section class="ce-panel"><h3>HESAP EKSTRESİ</h3><div class="ce-controls"><div class="ce-modes"><button type="button" data-mode="normal">Normal Ekstre</button><button type="button" data-mode="detail">Detaylı Ekstre</button></div><form class="ce-filter"><label>Başlangıç tarihi<input type="date" name="start"></label><label>Bitiş tarihi<input type="date" name="end"></label><button>Raporu Hazırla</button></form><div class="ce-actions"><button type="button" data-action="excel">Excel</button><button type="button" data-action="print">Yazdır / PDF</button>${options.manual ? '<button type="button" data-action="manual">+ Cari İşlem</button>' : ''}${options.share ? '<button type="button" data-action="share">WhatsApp / Ekstre Linki</button>' : ''}</div><div class="ce-share" aria-live="polite"></div><p class="ce-error" role="alert"></p></div><div class="ce-report"></div></section>`;
        const report = host.querySelector('.ce-report'), form = host.querySelector('form'), error = host.querySelector('.ce-error');
        const params = new URLSearchParams(location.search);
        form.start.value = params.get("baslangic") || ""; form.end.value = params.get("bitis") || "";
        if(options.manual) host.querySelector('[data-action="manual"]').onclick = options.manual;
        let summary;
        const cell = (label,value) => `<td data-label="${label}">${value}</td>`;
        function render() {
            error.textContent = '';
            if (form.start.value && form.end.value && form.start.value > form.end.value) { error.textContent = 'Başlangıç tarihi bitiş tarihinden sonra olamaz.'; return false; }
            summary = summarize(data, form.start.value, form.end.value);
            host.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.mode === 'detail') === detailed)));
            report.innerHTML = `<h4>${detailed ? 'Detaylı' : 'Normal'} Ekstre</h4><p>${esc(form.start.value || 'İlk hareket')} — ${esc(form.end.value || 'Son hareket')}</p><table><thead><tr>${['Tarih','Hareket','Açıklama','Belge','Borç','Alacak','Bakiye'].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody><tr>${cell('Tarih','—')}${cell('Hareket','Devir')}${cell('Açıklama','Dönem başı bakiye')}${cell('Belge','—')}${cell('Borç','—')}${cell('Alacak','—')}${cell('Bakiye',money(summary.opening))}</tr>${summary.rows.map(r=>`<tr>${cell('Tarih',esc(new Date(r.tarih).toLocaleDateString('tr-TR')))}${cell('Hareket',esc(r.durum==='IPTAL'?'İptal':r.tip))}${cell('Açıklama',esc(r.aciklama || '-'))}${cell('Belge',esc(r.belgeNo || '-'))}${cell('Borç',money(r.borc))}${cell('Alacak',money(r.alacak))}${cell('Bakiye',money(r.balance))}</tr>${detailed && r.kalemler?.length ? `<tr class="ce-detail"><td colspan="7"><ul>${r.kalemler.map(k=>`<li><strong>${esc(k.kod)} ${esc(k.ad)}</strong><span>${quantity(k.miktar)} ${esc(k.birim)} · Birim fiyat ${money(k.birimFiyat)} · Satır toplamı ${money(k.toplam)}</span></li>`).join('')}</ul></td></tr>` : ''}`).join('')}</tbody></table><div class="ce-totals"><div><span>Devreden bakiye</span><strong>${money(summary.opening)}</strong></div><div><span>Toplam borç</span><strong>${money(summary.debit)}</strong></div><div><span>Toplam alacak</span><strong>${money(summary.credit)}</strong></div><div><span>Dönem sonu bakiye</span><strong>${money(summary.balance)}</strong></div><div><span>Güncel bakiye</span><strong>${money(m.bakiye)}</strong></div></div>`;
            return true;
        }
        form.onsubmit = e => { e.preventDefault(); render(); };
        host.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { detailed = b.dataset.mode === 'detail'; render(); });
        host.querySelector('[data-action="excel"]').onclick = () => {
            if (!render()) return;
            if (!root.XLSX) { error.textContent = 'Excel bileşeni yüklenemedi. Sayfayı yenileyin.'; return; }
            const rows = [['Tarih','Hareket','Açıklama','Belge','Borç','Alacak','Bakiye'],['','Devir','','','','',summary.opening]];
            summary.rows.forEach(r => { rows.push([day(r.tarih),r.tip,r.aciklama || '',r.belgeNo || '',r.borc,r.alacak,r.balance]); if(detailed) (r.kalemler || []).forEach(k=>rows.push(['','Ürün',`${k.kod} ${k.ad} · ${quantity(k.miktar)} ${k.birim} · ${money(k.birimFiyat)} · ${money(k.toplam)}`])); });
            rows.push(['','TOPLAM','','',summary.debit,summary.credit,summary.balance]);
            const book = root.XLSX.utils.book_new(); root.XLSX.utils.book_append_sheet(book,root.XLSX.utils.aoa_to_sheet(rows),'Cari Ekstre'); root.XLSX.writeFile(book,'cari-ekstre.xlsx');
        };
        host.querySelector('[data-action="print"]').onclick = () => {
            if (!render()) return;
            const win = window.open('','_blank');
            if (!win) { error.textContent = 'Yazdırma için tarayıcınızda açılır pencereye izin verin.'; return; }
            win.opener = null;
            win.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Cari Ekstre</title><link rel="stylesheet" href="${location.origin}/erp/cari-ekstre.css"></head><body><main class="ce-root">${host.querySelector('.ce-company').outerHTML}${host.querySelector('.ce-customer').outerHTML}${report.outerHTML}</main></body></html>`); win.document.close(); win.onload = () => { win.focus(); win.print(); };
        };
        const shareButton = host.querySelector('[data-action="share"]');
        if (shareButton) shareButton.onclick = async () => {
            shareButton.disabled = true; error.textContent = '';
            try {
                const link = new URL(await options.share()); link.searchParams.set('detay', detailed ? '1' : '0'); link.searchParams.set('baslangic',form.start.value); link.searchParams.set('bitis',form.end.value);
                const text = `${f.unvan || 'Firma'} · ${m.unvan || m.adSoyad || ''}\nCari Hesap Ekstresi\n${link.href}`;
                let phone = String(m.whatsapp || m.telefon || '').replace(/\D/g,''); if(phone.startsWith('00'))phone=phone.slice(2); if(phone.length===10&&phone.startsWith('5'))phone='90'+phone; if(phone.length===11&&phone.startsWith('0'))phone='9'+phone;
                if (!/^[1-9][0-9]{9,14}$/.test(phone)) phone = '';
                host.querySelector('.ce-share').innerHTML = `<p>Bağlantı hazır. WhatsApp'ta gönderimi siz onaylayın.</p><a target="_blank" rel="noopener noreferrer" href="https://wa.me/${phone}?text=${encodeURIComponent(text)}">WhatsApp'ta Aç</a><a target="_blank" rel="noopener noreferrer" href="${esc(link.href)}">Ekstreyi Aç</a><label>Paylaşım bağlantısı<input readonly value="${esc(link.href)}"></label>`;
            } catch(e) { error.textContent = e.message; } finally { shareButton.disabled = false; }
        };
        render();
    }
    const api = {mount, summarize}; if(typeof module === 'object') module.exports = api; else root.CariEkstre = api;
})(typeof window === 'undefined' ? globalThis : window);
