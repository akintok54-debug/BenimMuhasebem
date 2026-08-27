(function () {
    "use strict";
    const form = document.getElementById("resetForm"), mesaj = document.getElementById("mesaj"), btn = document.getElementById("resetBtn");
    form.addEventListener("submit", async event => {
        event.preventDefault();
        const yeniSifre = document.getElementById("yeniSifre").value;
        if (yeniSifre !== document.getElementById("yeniSifreTekrar").value) return mesaj.textContent = "Parolalar eşleşmiyor.";
        btn.disabled = true;
        try {
            const response = await fetch("/api/auth/sifre-yenile", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify({ token: new URLSearchParams(location.search).get("token"), yeniSifre }) });
            const data = await response.json();
            if (!response.ok) throw new Error(data.mesaj || "Parola yenilenemedi.");
            mesaj.className = "success"; mesaj.textContent = data.mesaj;
            setTimeout(() => location.replace("/erp/login.html"), 1800);
        } catch (e) { mesaj.textContent = e.message; btn.disabled = false; }
    });
})();
