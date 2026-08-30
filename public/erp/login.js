(function () {
    "use strict";

    const form = document.getElementById("loginForm");
    const mesaj = document.getElementById("mesaj");
    const btn = document.getElementById("girisBtn");
    const forgotBtn = document.getElementById("forgotBtn");
    const registerForm = document.getElementById("registerForm");
    const loginTab = document.getElementById("loginTab");
    const registerTab = document.getElementById("registerTab");
    const formBaslik = document.getElementById("formBaslik");
    const formAciklama = document.getElementById("formAciklama");
    const kayitMesaj = document.getElementById("kayitMesaj");
    const kayitBtn = document.getElementById("kayitBtn");

    function ekranDegistir(kayitAcik) {
        form.hidden = kayitAcik;
        registerForm.hidden = !kayitAcik;
        loginTab.classList.toggle("active", !kayitAcik);
        registerTab.classList.toggle("active", kayitAcik);
        loginTab.setAttribute("aria-selected", String(!kayitAcik));
        registerTab.setAttribute("aria-selected", String(kayitAcik));
        formBaslik.textContent = kayitAcik ? "Ücretsiz Üye Ol" : "Giriş Yap";
        formAciklama.textContent = kayitAcik ? "İşletme hesabınızı oluşturun, 30 gün ücretsiz kullanmaya başlayın." : "İşletme hesabınızla güvenli şekilde giriş yapın.";
        mesaj.textContent = "";
        kayitMesaj.textContent = "";
        (kayitAcik ? document.getElementById("firmaAdi") : document.getElementById("email")).focus();
    }

    loginTab.addEventListener("click", function () { ekranDegistir(false); });
    registerTab.addEventListener("click", function () { ekranDegistir(true); });

    forgotBtn.addEventListener("click", async function () {
        const emailInput = document.getElementById("email");
        if (!emailInput.value.trim()) {
            mesaj.textContent = "Önce e-posta adresinizi yazın.";
            emailInput.focus();
            return;
        }
        forgotBtn.disabled = true;
        mesaj.textContent = "Parola yenileme isteği gönderiliyor...";
        try {
            const response = await fetch("/api/auth/sifremi-unuttum", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify({ email: emailInput.value.trim() }) });
            const data = await response.json();
            mesaj.textContent = data.mesaj || "İstek alındı.";
            mesaj.classList.toggle("success", response.ok);
        } catch (_) {
            mesaj.textContent = "İstek gönderilemedi. Lütfen tekrar deneyin.";
        } finally {
            forgotBtn.disabled = false;
        }
    });

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

            window.location.replace(data.kullanici?.rol === "SUPER_ADMIN" ? "/platform/" : "/erp/");

        } catch (error) {

            mesaj.textContent =
                error.message || "Giriş yapılamadı.";

            btn.disabled = false;
            btn.textContent = "Giriş Yap";
        }

    });

    registerForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        kayitMesaj.textContent = "";
        kayitBtn.disabled = true;
        kayitBtn.textContent = "Hesabınız oluşturuluyor...";
        try {
            const response = await fetch("/api/auth/kayit", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({
                    firmaAdi: document.getElementById("firmaAdi").value.trim(),
                    adSoyad: document.getElementById("kayitAdSoyad").value.trim(),
                    email: document.getElementById("kayitEmail").value.trim(),
                    telefon: document.getElementById("kayitTelefon").value.trim(),
                    sifre: document.getElementById("kayitSifre").value,
                    kosullariKabul: document.getElementById("kosullariKabul").checked
                })
            });
            const data = await response.json().catch(function () { return {}; });
            if (!response.ok || !data.basarili) throw new Error(data.mesaj || "Hesap oluşturulamadı.");
            localStorage.removeItem("tenantToken");
            localStorage.removeItem("token");
            localStorage.removeItem("accessToken");
            if (data.csrfToken) sessionStorage.setItem("bmCsrfToken", data.csrfToken);
            kayitMesaj.classList.add("success");
            kayitMesaj.textContent = "Hesabınız hazır. Yönetim ekranı açılıyor...";
            window.location.replace("/erp/");
        } catch (error) {
            kayitMesaj.classList.remove("success");
            kayitMesaj.textContent = error.message || "Hesap oluşturulamadı. Lütfen tekrar deneyin.";
            kayitBtn.disabled = false;
            kayitBtn.textContent = "30 Gün Ücretsiz Başla";
        }
    });

})();
