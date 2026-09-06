# Mevcut platform paneli geliştirmesi — 6 Eylül 2026

Mevcut `/platform/` paneli ve sidebar genişletildi. İkinci panel oluşturulmadı. Normal tenant ERP arayüzü (`public/erp`) değiştirilmedi; dosya silinmedi veya sıfırlanmadı.

## Ekranlar

- Genel Bakış: firma durumları, kullanıcı sayıları, Türkiye gün başlangıcına göre bugün giriş yapanlar, aktif/yaklaşan abonelikler, 24 saatlik hatalar ve ölçülen sağlık durumu.
- Firmalar: tenantId, yetkili, trial tarihleri, gerçek kullanıcı/depo/şube sayıları ve son giriş; firma ayrıntısında abonelik, paket, süre, askıya alma, kullanıcılar, MFA, gözlenen oturumlar, audit ve entegrasyon bağlantıları.
- Abonelikler: paket, aylık/yıllık dönem, ödeme durumu, tarihler, kullanıcı/şube/depo limitleri ve modül izinleri. Kritik değişiklik onay gerektirir; yeni firma abonelik işlemi firma + abonelik + audit kaydını MongoDB transaction ile yazar.
- Entegrasyon Merkezi: firma filtresi, IdeaSoft/e-belge/pazaryeri bağlantıları, son senkronizasyon, açık hata kodu ve tarihi, bekleyen işler, eşleşmemiş kayıtlar. Kimlik bilgileri sorgulanmaz veya gösterilmez.
- Sistem Sağlığı: API, gerçek MongoDB ping, mail yapılandırması, Cron/backup audit kanıtları, açık entegrasyon hataları ve son kritik hata.
- Hata Merkezi: aktör/firma/modül/endpoint/HTTP/requestId, aynı hatanın son 24 saatteki olay sayısı; açıklamalı çözüm/yeniden açma. Audit satırı değiştirilmez, çözüm ayrı modelde tutulur.
- Audit: firma filtresi, aktör, eski/yeni değerler, tarih, IP, requestId; hassas değerler maskelenir.
- Destek Modu: gerekçeli, 30 dakika süreli, yöneticiye ve tek firmaya bağlı salt okunur context; kalıcı uyarı, görüntüleme audit kaydı ve kapatma. SUPER_ADMIN rolü veya normal ERP yetkileri değiştirilmez.

## Yeni endpointler

Hepsi mevcut `/api/platform` altında JWT + veritabanında aktif SUPER_ADMIN kontrolünden geçer. Yazma işlemleri `onay: "ONAYLIYORUM"` gerektirir; mevcut CSRF ve platform rate limit zinciri uygulanır.

| Metot | Yol | İşlev |
|---|---|---|
| GET | `/health` | Sistem sağlık kanıtları |
| GET | `/integrations?tenantId=...` | Firma bazında entegrasyon tanıları |
| GET | `/tenants/:id/overview` | Firma, abonelik, gerçek sayımlar, kullanıcılar ve gözlenen oturumlar |
| PATCH | `/tenants/:id/subscription` | Onaylı paket/dönem/durum/süre değişikliği |
| POST | `/tenants/:id/users/:userId/password-reset` | Seçilen firmanın kullanıcısına mevcut e-posta servisiyle parola yenileme başlatma |
| POST | `/support` | Süreli destek context oluşturma |
| GET | `/support/:id` | Süre, sahibi ve firma bağı doğrulanmış destek görünümü |
| POST | `/support/:id/close` | Destek context kapatma |
| PATCH | `/errors/:id/resolution` | Açıklamalı hata çözüm durumu |

Mevcut dashboard, tenants, users, audit-kayitlari ve sistem-hatalari endpointleri genişletildi. Mevcut endpointler kaldırılmadı.

## Değişen / eklenen dosyalar

- `public/platform/{index.html,platform.css,platform.js}`
- `src/modules/platform/controllers/{dashboardController,guvenlikController,kullaniciController,tenantController,operationsController}.js`
- `src/modules/platform/middleware/superAdmin.js`
- `src/modules/platform/models/{Plan,Tenant,TenantSubscription,PlatformAuditLog,PlatformErrorResolution,PlatformSession,PlatformSupportSession}.js`
- `src/modules/platform/routes/platformRotasi.js`
- `src/modules/platform/services/{auditServisi,platformGuvenligi,sessionTelemetry}.js`
- `src/middleware/kimlikKontrol.js`, `src/modules/auth/controllers/authController.js`: mevcut kimlik kararını veya token biçimini değiştirmeyen, gizli token saklamayan oturum gözlem kaydı.
- `src/uygulama.js`: kodlanmış statik platform URL’leri dahil rol koruması.
- `src/routes/cronRotasi.js`: gerçek Cron tamamlanma kanıtı.
- `scripts/mongodb-backup.js`, `scripts/platform-backup-telemetry.js`: mevcut şifreli yedek tamamlandıktan sonra sağlık audit kaydı.
- `src/platformPanel-test.js`, `tests/platformOperations.test.js`

## Doğrulama

`node --test --test-concurrency=2 tests/*.test.js src/*-test.js`

**260 test geçti; 0 hata, 0 atlanan test.** Platform odaklı 18 test; SUPER_ADMIN parola girişi, güncel hesap/rol kontrolü, normal kullanıcı için platform 403, kodlanmış dosya yolu koruması, abonelik transaction bağlantısı, değiştirilemez audit işlemleri, onay/kimlik doğrulama, secret masking, destek sahibi/süresi/tenant izolasyonu ve sağlık/entegrasyon filtrelerini kapsar.

Yerel tarayıcıda gerçek platform HTML/JS kullanılarak genel bakış, firma listesi/ayrıntısı, abonelik onayı/kaydetme ve entegrasyon ekranı kontrol edildi. Veritabanı işlemleri test double’larıyla doğrulandı; canlı müşteri kayıtlarına test yazılmadı. Yerel arayüz test verileri yalnızca geçici, dağıtımdan dışlanan test sunucusundaydı.

## Sınırlar ve yayın durumu

- Bu çalışma canlıya dağıtılmadı. Canlı SUPER_ADMIN parolasıyla giriş ve gerçek MongoDB transaction/geri alma testi yapılmadı; canlı doğrulama tamamlandı iddiası yoktur.
- Destek erişimi salt okunurdur; normal tenant ERP’ye kullanıcı taklidi veya finansal yazma yetkisi sağlamaz.
- Oturum listesi bu sürümden itibaren gözlenen, süresi dolmamış ve çıkış kaydı olmayan token oturumlarını gösterir. Henüz yeniden kullanılmamış eski oturumlar veya tarayıcının fiziksel olarak açık olup olmadığı bilinmez. Bu kayıt mevcut token iptal mekanizmasının yerine geçmez.
- Şube sayısı mevcut `Depo.sube` değerlerinden gelir; ayrı şube sicili bulunmadığından kayıtlı farklı şube adları sayılır. Tanımlanmamış limitler sıfır veya sınırsız diye uydurulmaz.
- Mail göstergesi yapılandırma kontrolüdür; canlı teslimat testi değildir. Token geçerliliği için yeni bağlantı testi yapılmaz. Kayıt olmayan Cron/backup durumu “Doğrulanmadı” olarak gösterilir. Yeni backup kaydı geri yüklemenin test edildiği anlamına gelmez.
- Audit değişmezliği uygulamanın Mongoose kayıt/güncelleme/silme/toplu yazma yollarında uygulanır. MongoDB’ye doğrudan yönetici erişimi için ayrıca veritabanı rolü/altyapı politikası gerekir.
- Mevcut tenant erişim/finans hesaplama kuralları yeniden yazılmadı. Bu çalışma ödeme tahsilatı, yeni şube/depo kota denetimi veya sağlayıcı token yenileme motoru eklemez.
