# ERP teslim denetimi — 9 Eylül 2026

**Karar: Tüm ERP için teslime hazır onayı verilmedi.** Aşağıdaki satış-cari hatası düzeltildi ve gerçek veride doğrulandı. Otomatik testlerin geçmesi tüm modüllerin kullanıcıyla uçtan uca kabulü, güvenlik sızma testi veya yedekten kurtarma kanıtı değildir.

## Doğrulanan ve düzeltilen kritik hata

Turan Kurtuluş, `SAT-1788268083358`: satışın `genelToplam` ve cari hareketin `tutar` alanı 8.829,8016 iken `bakiyeDegisimi` 20.312,28 kalmıştı. Ekstre eski bakiye değişimini kullanıyordu. İlk tutar karşılaştırması bu durumu kaçırdı; inceleme işaretli bakiye değişimini de kapsayacak şekilde genişletildi.

- Aynı hareketin tutarı ve bakiye değişimi satış toplamıyla eşitlendi. Yeni cari hareket oluşturulmadı, satış tutarı yeniden hesaplanmadı.
- Hareket `sourceType=SALE`, `sourceId=Satis._id` ile bağlandı; eski kaynak alanları korundu.
- Müşterinin kayıtlı 27.985 ara bakiye anlık görüntüsü ile önceki 185 + 27.800 hareketleri açılışı 0 olarak doğruladı. Güncel bakiye hareketlerden 26.564,80 olarak hesaplandı.
- Önce gerçek MongoDB transaction içinde denendi, abort sonrası müşteri ve tüm hareketler önceki kayıtlarla birebir karşılaştırıldı. Daha sonra yalnızca doğrulanan satış için onarım commit edildi; transaction içindeki önceki kayıtlar dosyaya yedeklendi, audit kaydı eklendi.
- Satış düzenleme ve uygun iptal için kalıcı kod düzeltmesi, müşteri değişimi ve iki cari bakiyenin yeniden hesaplanması eklendi. Eksik/mükerrer bağlantıda ve dayanağı olmayan açılışta işlem durur.
- ERP/paylaşılan ekstre iptal hareketlerini bakiyeye katmaz. Paylaşılan API durum ve işaretli bakiye alanlarını döndürür.

## Test ve tarama kanıtları

| Alan | Gerçekleştirilen kontrol | Sonuç / sınır |
|---|---|---|
| Otomatik regresyon | `node --test --test-concurrency=2 tests/*.test.js src/*-test.js` | 303 geçti, 0 başarısız; statik kontroller ve model mock testleri de içerir |
| Satış-cari | Aynı kayıt, tutar farkı, müşteri transferi, iptal, tekrar çalıştırma, eksik/mükerrer kaynak, açılış, oluşturma hook'u | Davranış testleri geçti |
| Gerçek MongoDB | Turan Kurtuluş kaydında transaction eşitleme + abort + önce/sonra karşılaştırma | Geçti; ayrı rapor ve kayıt yedeği mevcut |
| Canlı onarım | Tek doğrulanan satış, yedek, transaction, audit, sonradan okuma | 1 uygulandı, 0 engel; bakiye değişimi 8.829,8016 |
| Kaynak tekilliği | Tenant + sourceType + sourceId benzersiz kısmi indeks | Canlıda oluşturuldu; eski indeksler silinmedi |
| Muhasebe bağlantıları | 3 aktif alış, 12 aktif satış, 190 stok / 80 cari / 57 para hareketi; tarama limitine ulaşılmadı | 1 satış ürün–stok kaynak bağlantısı inceleme gerektiriyor; kopuk tenant referansı 0, yetim belge hareketi 0 |
| Stok defteri | 130 stok kartı, 190 hareket | Miktar farkı 0; 5 uyarı izin verilen negatif stoktan, hata sayılmadı. 11 hareketin maliyeti eksik; bunların 4'ü satış maliyeti |
| Geçmiş satışlar | Firma kapsamında 23 satış, kaynak ve açılış kontrolü | Onarım ön kontrolünde 20 uygun, 3 engelli: 2 iptal satışta hareket eksik, 1 satışın açılışı doğrulanamıyor. Uygun olmak tutarın yanlış olduğu anlamına gelmez; kaynak alanı eklenmesi de değişiklik sayılır. Toplu onarım uygulanmadı |
| Tenant / yetki / B2B oturumları | Mevcut otomatik regresyonlar | Geçti; tüm rollerle gerçek kullanıcı oturumlarından kapsamlı sızma testi yapılmadı |
| Rapor / belge hesapları | Mevcut rapor mutabakatı ve belge sunumu testleri, yeni paylaşılan ekstre davranış testi | Geçti; tüm raporların canlı veriyle bağımsız toplam kontrolü ve bütün PDF/Excel çıktılarının görsel kabulü tamamlanmadı |
| Mobil / tablet / masaüstü | Önceki sürümlerde belirli B2B ve müşteri formu akışları kontrol edilmişti | Bu denetimde tüm modüllerin ve cihazların tam görsel kabul testi yapılmadı |
| API / DB / entegrasyon / cron | DB erişimi ve muhasebe okumaları doğrulandı | IdeaSoft, e-belge, pazaryeri, mail/WhatsApp ve tüm cron işleri gerçek sağlayıcı sonuçlarıyla uçtan uca doğrulanmadı |
| Yedek / geri yükleme | Kaynak arşivleri ve bu onarımın kayıt yedeği mevcut | Tam DB yedeği + izole ortama geri yükleme tatbikatı yapılmadı. `backup --check` ve `restore --check` mevcut kodda erken başarı mesajı verir; gerçek yedek/kurtarma kanıtı kabul edilmedi |
| Performans / hata yönetimi | Mevcut otomatik testler | Üretim yük testi, uzun süreli izleme ve tüm hata senaryoları tamamlanmadı |

## Teslimi engelleyen kalan işler

1. `SAT-1788782163284` satışındaki ürün–stok kaynak bağlantısı eksikliği: eski düzenleme ve stok düzeltme geçmişiyle karşılaştırılmalı; otomatik stok eklenmedi.
2. Eksik satış maliyetleri: alış/devir maliyeti belgelerinden doğrulanmalı; kâr raporlarında tam doğruluk onayı verilmemeli. Fiyat veya maliyet uydurulmadı.
3. İki eski iptal satışın eksik cari bağlantısı ve bir satışın doğrulanamayan açılışı: gerçek işlem belgeleriyle mutabakat gerekli. Script bunları atlayıp engelli raporlar.
4. Ayrı test ortamında ödeme, iade, sipariş dönüşümü, eşzamanlı düzenleme ve retry akışlarının tümünün gerçek MongoDB ile kapsamlı uçtan uca testi; tüm roller/tenantlar için yatay-dikey erişim testleri.
5. Gerçek entegrasyon sağlayıcıları, cron çalışma kayıtları, hata/uyarı teslimi; tam yedek ve geri yükleme; tüm PDF/Excel ve cihaz görünümleri; yük testi. Bunlar doğrulanmadan genel teslim onayı verilmemeli.

## Onarım kullanımı

Varsayılan salt okunurdur; tenant zorunludur. İsteğe bağlı `--sale` tek kayda sınırlar. `--apply` transaction içi önceki kayıt yedeği ve audit ile uygular. Yeni eksik cari hareket üretmez. Engelli kayıtlar varsa çıkış kodu 2, çalışma hatasında 1 olur.

```powershell
node scripts/satis-cari-esitle.js --tenant <tenantId>
node scripts/satis-cari-esitle.js --tenant <tenantId> --sale <saleId> --apply
node scripts/satis-cari-kaynak-indeksi.js
node scripts/satis-cari-kaynak-indeksi.js --apply
```

Yerel kanıtlar `backups/delivery-audit/` ve `backups/release-1.4.8/` altındadır. Finansal kayıt yedekleri git'e veya web yayınına dahil edilmez. Yedek dosyaları kişisel ve finansal veri içerir; kaynak arşivi tam veritabanı yedeği değildir.

## Değişen alanlar

`src/models/CariHareket.js`, `src/models/Musteri.js`, `src/services/satisCariEsitlemeServisi.js`, satış ve cari controller'ları; ERP/paylaşılan ekstre görünümü; iki bakım scripti; satış-cari/ekstre testleri; sürüm ve bu rapor. Mevcut route ve auth altyapısı yeniden yazılmadı.

## Canlı yayın sonucu

v1.4.8, `dpl_xWNkyyZiYjaffMm1znh65s38yoSj` ile production ortamına yayımlandı. Canlı ERP/B2B sayfaları ve sağlık ucu 200; kontrol edilen korumalı B2B/tenant/platform API uçları oturumsuz erişimde 401 verdi. ERP/B2B statik dosyaları yerel kaynak hashleriyle eşleşti. Bu kontrol gerçek kullanıcıyla finansal işlem kabul testinin yerine geçmez. Sürüm kaynak arşivi, SHA-256 manifesti ve test logu `backups/release-1.4.8/` altında kaydedildi.
