(function () {
    "use strict";
    const message = document.getElementById("resetMessage"), forgot = document.getElementById("forgotForm"), reset = document.getElementById("resetForm");
    const token = new URLSearchParams(location.hash.slice(1)).get("token") || "";
    if (location.hash) history.replaceState(null, "", location.pathname);
    if (token) { forgot.hidden = true; reset.hidden = false; document.querySelector("h1").textContent = "Yeni parola belirle"; document.getElementById("description").textContent = "En az 12 karakterli yeni bir parola belirleyin."; }
    async function submit(event) {
        event.preventDefault(); const button = event.submitter; button.disabled = true; message.textContent = "İşleniyor…";
        try {
            const body = Object.fromEntries(new FormData(event.target));
            if (event.target === reset) { if (body.yeniSifre !== body.tekrar) throw new Error("Parolalar eşleşmiyor."); body.token = token; delete body.tekrar; }
            const response = await fetch("/api/auth/" + (event.target === reset ? "sifre-yenile" : "sifremi-unuttum"), { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            const data = await response.json(); if (!response.ok || !data.basarili) throw new Error(data.mesaj || "İşlem tamamlanamadı.");
            message.textContent = data.mesaj; event.target.reset(); if (event.target === reset) reset.hidden = true;
        } catch (error) { message.textContent = error.message; } finally { button.disabled = false; }
    }
    forgot.addEventListener("submit", submit); reset.addEventListener("submit", submit);
})();