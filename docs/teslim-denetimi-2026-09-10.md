# ERP teslim denetimi — 10 Eylül 2026

**Karar: Genel teslim onayı verilmedi.** Bütün modüllerde gerçek uçtan uca kabul testi tamamlanmış değildir. Bu rapor yapılan kontrolleri ve eksik kanıtları ayırır. Önceki ayrıntılar: [9 Eylül raporu](teslim-denetimi-2026-09-09.md).

| Kontrol | Gerçek sonuç |
|---|---|
| Mobil v1.4.9 yayını | Canlı ERP/B2B JS/CSS kaynakları eşleşti; önceki 360/390/768/1440 yerleşim kontrolleri mevcut |
| Temel canlı erişim | ERP/B2B/sağlık 200; kontrol edilen korumalı API'ler oturumsuz 401 |
| Rapor mutabakatı | 33 rapor: 25 satır-toplam uyumlu, 0 tutar uyuşmazlığı, 8 eksik kaynak |
| Müşteri alacakları | Kart ve rapor toplamı 70.403,86 TL, uyumlu |
| Tedarikçi borçları | Kart ve rapor toplamı 77.600,66 TL, uyumlu |
| Mükerrer aday taraması | Koleksiyon başına en yeni 50.000 uygun kayıtla sınırlı. Transaction bazında cari/para/stok 0 aday; eski stok kaynaklarında 3 aday |
| SAT-1788782163284 stok bağlantısı | Sonradan eklenen ürünün 1 adet çıkışı SATIS_DUZELTME/SAYIM_EKSI içinde mevcut. Önceki denetim bu kaynağı atlıyordu. Maliyet 0, bu eksiklik devam ediyor |
| Production bağımlılık güvenliği | Önce morgan orta / multer yüksek riskli 2 paket; morgan 1.12.0 ve multer 2.3.0 kurulumu sonrası npm taraması 0 bilinen açık |
| Yedek güvenlik testleri | Kaynak/hedef kısıtları, AES-GCM dosya bütünlüğü, bozulmuş dosyanın reddi ve geçici açık dosya temizliği: 3 test geçti |
| Paket güncellemesi sonrası regresyon | 306 test geçti, 0 başarısız; statik/mocked kontroller de içerir, tam E2E yerine geçmez |

Eksik kaynaklı raporlar: dönem başı mal mevcudu, satılan malın maliyeti, dönem sonu mal mevcudu, brüt kâr, faaliyet kârı, net kâr/zarar, stok değeri, en çok kâr bırakan ürünler. Rakam uydurulmadı. Rapor satır-toplam tutarlılığı bütün kaynak belgelerinin bağımsız muhasebe kabulünü tek başına kanıtlamaz.

## Doğrulanan düzeltmeler

- Güvenlik duyurularından etkilenen production bağımlılıkları düzeltme sürümlerine yükseltildi.
- Backup --check artık koşulsuz başarılı değil: açık kaynak DB adı, şifreleme anahtarı ve mongodump aracı gerekli. Ön kontrol, gerçek yedek olarak raporlanmıyor.
- Restore production çalışma modunu reddeder; kaynakla aynı DB adı kullanılamaz, hedef restore_test_ önekli olmalıdır. Yalnızca belirtilen kaynak namespace'i hedef test namespace'ine eşlenir. --drop kaldırıldı, --stopOnError eklendi.
- AES-GCM bütünlüğü doğrulanmadan mongorestore başlamaz. Geçici açık arşiv ve URI dosyaları başarı/hata sonunda temizlenir. Yarım şifreli dosya başarı olarak bırakılmaz. Restore --check dosya bütünlüğünü doğrular, gerçek restore yaptığını iddia etmez.
- Backup telemetrisi indeksleri otomatik oluşturmadan bağlanır.
- Muhasebe audit scripti satış düzeltmesinin pozitif miktarlı SAYIM_EKSI stok izini tanır. Finansal veri değiştirilmedi. Değişiklik sonrası canlı muhasebe tekrar taraması kullanıcı tarafından reddedildi; geçilmiş sayılmadı.

## Teslimi engelleyen açık işler

1. Tam DB yedeği ve izole hedefe gerçek geri yükleme tatbikatı yapılmadı. Yerel ön kontrol açık DB adı içeren kaynak URI olmadığı için durdu. Anahtar, araçlar, saklama politikası, hedef ortam ayrıca doğrulanmalı. Şifreli dosya testi MongoDB restore testi değildir. Ayrı test ortamı bilgisi kullanıcıdan istendi, henüz alınmadı.
2. Eksik maliyetler ve önceki rapordaki 3 engelli tarihsel satış gerçek kaynak belgeleriyle mutabakat bekliyor. Maliyet/bakiye üretilmedi. Eski 3 stok mükerrer adayı kesin mükerrer değildir: aynı üründen çok kalem ve sıfır miktarlı eski düzeltmeler içerir; kayıt silinmedi.
3. IdeaSoft/pazaryeri/e-belge/mail/SMS/WhatsApp gerçek sağlayıcı kabul/red/webhook/retry akışları bu turda E2E doğrulanmadı. Mesaj veya ticari belge gönderilmedi. Cron gerçekleşme ve uyarı teslim kanıtı eksik.
4. Tenant/yetki/oturum regresyonları var; bütün gerçek rollerle login, MFA, destek modu, tenantlar arası IDOR ve dosya erişimi penetrasyon testi tamamlanmadı.
5. Finans–stok–cari–kasa–banka bağlantıları için rapor/bağlantı/mükerrer testleri var; bütün düzenleme/iptal/iade/dönüşüm ve eşzamanlılık/kesinti senaryoları ayrı veritabanında gerçek işlem olarak tamamlanmadı.
6. PDF/Excel helper testleri ve belirli mobil ekran kontrolleri var; tüm şablonların vergi/iskonto kombinasyonlarıyla render ve Excel yeniden okuma kabulü, bütün ekranların mobil/tablet/masaüstü incelemesi tamamlanmadı.
7. Production yük testi, uzun süreli performans ve hata izleme, yedek yaşını/restore başarısını operasyonel doğrulama tamamlanmadı.

## Dosyalar / kanıtlar

Değişiklikler: package.json, package-lock.json, scripts/backup-safety.js, mongodb-backup.js, mongodb-restore-check.js, platform-backup-telemetry.js, muhasebe-butunluk-audit.js, tests/backupSafety.test.js ve sürüm notları.

Yerel kanıtlar backups/delivery-audit-2026-09-10/ altında: reports.log, duplicates.log, dependencies.json (düzeltme öncesi), stock-link.json, final-tests.log. Finansal tanı dosyaları git/web yayınına dahil edilmez. Kaynak ZIP'i tam veritabanı yedeği değildir. Bilinmeyen veya engellenen kontrol başarılı sayılmamıştır.

## Yayın sonucu

v1.4.10, dpl_F7ZG21DsQY3EYM76zegHt2oJmaKd ile canlıya yayımlandı. Yayın sonrası ERP/B2B/sağlık 200, kontrol edilen korumalı API uçları 401; statik kaynak eşleşmeleri başarılı. Kaynak arşivi ve manifest backups/release-1.4.10/ altında. Genel teslim kararı değişmedi: onaylanmadı.

## Devam denetimi — v1.4.11

Önceki açık işler listesindeki yedek ve test ortamı engeli bu devam çalışmasında giderildi. Gerçek kaynak veritabanından 664.427 bayt şifreli yedek alındı, boş ve ayrı restore_test_delivery_20260910_01 veritabanına geri yüklendi. 56 koleksiyonun 55'i içerik özetiyle eşleşti; audit koleksiyonundaki tek fark yedek sonrası BACKUP_COMPLETED kaydıydı. Bu, sürekli yedekleme/harici saklama veya atomik anlık görüntü garantisi değildir.

Gerçek Express API ve geri yüklenmiş MongoDB ile 8 kontrol geçti: ERP/B2B ayrı parola girişleri, yabancı tenant reddi, bayi oturumuyla ERP reddi, iki oturumun birlikte çalışması, yanlış portal girişinin reddi, tenant kullanıcısına platform reddi, eşzamanlı satış düzenlemede tek işlem ve aynı cari satırın güncellenmesi, satış iptalinde bağlı cari iptali. Test kullanıcıları ve işlem değişiklikleri yalnızca geri yüklenen veritabanındadır. Canlıya demo kayıt eklenmedi.

20 ana ekran 390/768/1440 genişlikte 60 kez gerçek API ile açıldı. Mobilde sayfa taşması ve gizlenen çıkış düğmesi düzeltildi; liste tabloları etiketli kartlara dönüştürüldü. Bu tarama bütün alt formların işlevsel kabul testi değildir. Bazı tablet tablolarında içeride yatay kaydırma sürer. WhatsApp ekranı ayrıca üç boyutta kontrol edildi; gerçek kayıtları ve müşteri görüşmesi açmayı sunar, otomatik gönderim iddiası yoktur. Dış sağlayıcı gönderimi yapılmadı.

Satış müşterisi değişiminde bağlı çek/senetin müşteri bağlantısı aynı transaction içinde taşınır; çelişkili müşteri kaydı işlemi durdurur. WhatsApp kayıtları satış temsilcisinin müşteri kapsamıyla ve tenant güvenli populate ile sınırlandırıldı. Yeni endpoint eklenmedi.

Kanıtlar: backups/delivery-audit-2026-09-10/restore-verification.json, real-http-e2e.json, real-browser-pages-after.json, real-browser-whatsapp.json ve mobil ekran görüntüleri. Test ortamı ayrı veritabanı olarak korunmuştur.

Genel teslim onayı hâlâ verilmemiştir: eksik tarihsel maliyet belgeleri, sağlayıcı uçtan uca gönderim/webhook testleri, cron ve bildirim teslimi, tüm roller/MFA/IDOR, bütün finansal dönüşüm ve çıktı kombinasyonları, yük testi ve sürekli yedek saklama kabulü tamamlanmamıştır.

Son regresyon: npm test ile 310 test geçti, 0 başarısız, 0 atlanan. Birim/statik testler ve yukarıda ayrı belirtilen gerçek API/tarayıcı kanıtları birlikte değerlendirilmiştir.

### v1.4.11 canlı doğrulama

v1.4.11 (bbf22bb), dpl_EKSFLw4hKUfnvWLMZ4hkcnn2XXwb dağıtımıyla READY durumunda yayımlandı. Yayın sonrası ERP, B2B ve sağlık 200; kontrol edilen dört korumalı API oturumsuz 401. Beş ERP/B2B JS/CSS kaynağı yerel sürümle eşleşti. Kaynak ZIP, 310 test çıktısı, manifest ve canlı kontrol sonucu backups/release-1.4.11/ altında kayıtlıdır. Bu doğrulama oturumlu tüm canlı iş akışlarının kabulü anlamına gelmez.
