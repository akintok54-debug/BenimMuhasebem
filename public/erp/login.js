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

            const data = await response.json();

            if (!response.ok || !data.token) {
                throw new Error(
                    data.mesaj || "Giriş başarısız."
                );
            }

            localStorage.setItem(
                "tenantToken",
                data.token
            );

            localStorage.setItem(
                "token",
                data.token
            );

            window.location.replace("/erp/");

        } catch (error) {

            mesaj.textContent =
                error.message || "Giriş yapılamadı.";

            btn.disabled = false;
            btn.textContent = "Giriş Yap";
        }

    });

})();
