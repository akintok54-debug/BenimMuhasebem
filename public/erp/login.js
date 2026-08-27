(function () {
    "use strict";

    const form = document.getElementById("loginForm");
    const mesaj = document.getElementById("mesaj");
    const btn = document.getElementById("girisBtn");

    form.addEventListener("submit", async function (event) {

        event.preventDefault();

        mesaj.textContent = "";
        btn.disabled = true;
        btn.textContent = "Giriş yapılıyor...";

        try {

            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify({
                    email: document.getElementById("email").value.trim(),
                    sifre: document.getElementById("sifre").value
                })
            });

            let data = await response.json();

            if (response.ok && data.ikiFaktorGerekli) {
                const kod = window.prompt("Kimlik doğrulama uygulamanızdaki 6 haneli kodu veya kurtarma kodunu girin:");
                if (!kod) throw new Error("İki faktörlü doğrulama gerekli.");
                const ikinci = await fetch("/api/auth/2fa-dogrula", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify({ challengeToken: data.challengeToken, kod }) });
                data = await ikinci.json();
                if (!ikinci.ok) throw new Error(data.mesaj || "İki faktörlü doğrulama başarısız.");
            }

            if (!response.ok || !data.basarili) {
                throw new Error(
                    data.mesaj || "Giriş başarısız."
                );
            }

            localStorage.removeItem("tenantToken");
            localStorage.removeItem("token");
            localStorage.removeItem("accessToken");

            if (data.csrfToken) sessionStorage.setItem("bmCsrfToken", data.csrfToken);

            window.location.replace("/erp/");

        } catch (error) {

            mesaj.textContent =
                error.message || "Giriş yapılamadı.";

            btn.disabled = false;
            btn.textContent = "Giriş Yap";
        }

    });

})();
