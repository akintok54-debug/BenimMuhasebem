# ERP denetimi — 20 Eylül 2026

Çalışma dizini: `C:\Users\Win10\OneDrive\Desktop\bahadır\BAHADIR-ERP-V2`.
Git: `https://github.com/akintok54-debug/BenimMuhasebem.git`, `main`, başlangıç HEAD `b8bb2bb`. Kaynak ve test değişiklikleri yerel main dalında commit edilmiştir. GitHub gönderimi yazma yetkisi 403 nedeniyle yapılamadı.

## Tamamlanan değişiklikler

- Satış, alış, teklif, sipariş ve B2B için ortak fiyat/KDV hesaplayıcısı; tarih, müşteri, ürün ve fiyat türü sınırlarıyla kampanya fiyatlandırması.
- Ürün merkezinde filtreli satış/bayi/perakende fiyat ve KDV toplu güncelleme; imzalı önizleme, süre ve değişmiş veri kontrolü, transaction ve audit.
- Gerçek ürün Excel dışa aktarımı, SKU/barkod ile eşleştirme, boş hücreleri koruma, hata varsa tamamını reddetme; görselleri içe alma desteği korunur.
- Kampanya/yeni ürün/indirim ve tedarikçi reklam yönetimi; B2B etiketler, eski/yeni fiyat, miktar seçimi ve küçük dönen duyuru alanı.
- B2B ayrıntılı cari ekstre, tarih aralığı, Excel/PDF yazdırma, satış belgeleri; 30/90/180/365 günlük satın alma analizi ve tekrar sepete ekleme. Analiz iadeler düşülmeden brüt satışları gösterdiğini açıklar.
- Geçersiz IBAN veya demo olarak işaretli banka hesapları müşteriye gösterilmez. Banka kartında hesap sahibi alanı.
- Stok/fiyat senkronizasyonunda yalnız gönderilen alanın başarı bilgisi güncellenir; pasif ürünün stok gönderimi sıfırdır. Trendyol stok ve fiyat istekleri ayrılır. Resmî kaynak: https://developers.trendyol.com/docs/stok-ve-fiyat-g%C3%BCncelleme-updatepriceandinventory . Gerçek sağlayıcıya test gönderimi yapılmamıştır.
- Test keşfi yalnız proje testleriyle sınırlandı; yedekler ve yerel ajan dosyaları test/deploy kapsamına alınmaz. Eski BOZUK dosyaları yayın paketinden çıkarıldı. Üretim sunucusu HOST tanımlı değilse `0.0.0.0` dinler.

## Doğrulama kanıtları

Kanıtlar, Git/deploy dışında tutulan `backups/erp-audit-20260919/` dizinindedir.

- Başlangıç kaynağı: 332 dosyalık kopya ve SHA256 manifesti.
- Nihai tam test turu: **349/349 geçti** (`release14-tests.log`).
- `npm run check`: 203 JavaScript dosyası ayrıştırıldı, yeni yayın dosyaları bulundu. Bu işlem bundler veya kapsamlı lint değildir.
- `npm audit --omit=dev`: bilinen açık 0. Bu sonuç tüm uygulamanın güvenli olduğunun garantisi değildir.
- Ayrı mevcut veri kopyası `restore_test_delivery_20260910_01` üzerinde toplu işlem önizleme, oynanmış onayın reddi ve transaction uygulama doğrulandı. Canlı veritabanına test kaydı yazılmadı.
- Aynı kopyada B2B katalog, içerik, ekstre, analiz, ödeme uçları 200 döndü. İlk HTTP taramasındaki `/stoklar`, `/satislar`, `/alislar` 404 sonuçları yanlış test adresleridir; uygulamanın yolları `/stok`, `/satis`, `/alis` şeklindedir.
- 20 ERP menüsü tarayıcıda açıldı; bu bir ekran açılış taramasıdır, her modülün tüm yazma/iptal akışlarını ispatlamaz.
- Yeni toplu önizleme, kampanya formu, B2B katalog ve analiz 390px görünümde yatay taşma göstermedi. Ekran görüntüleri kaydedildi.

## Canlı durum ve kalan sınırlar

- Kontrol edilen Vercel projesi `moto-parca-erp`, scope `bahadir2`, project ID `prj_njKNh6vMGUTDVR3NWGD2uXnUAz94`.
- Önceki production: `dpl_5QophsiC6uUsyXa7vTdmc94NbQYc`, 14 Eylül sürümü. Yeni **1.4.13** production: `dpl_4LNBaLgfjYigZBFzqs6L6pyzPz1M`, `https://moto-parca-3g3tzjp8f-bahadir2.vercel.app`, `https://www.benimmuhasebe.com`.
- Railway projesi bulundu ve yerel CLI bağlandı: `moto-parca-erp-backend`, proje `4bfaacb9-c8b5-47df-ac9e-403758123575`. Son deploy FAILED. Sağlık kontrolü `/api/ready`, ALWAYS restart ve uyumama ayarı hazırlandı. GitHub kaynak bağlantısı Railway tarafından "Your trial has expired. Please select a plan" hatasıyla reddedildi. Vercel API trafiği Railway’e taşınmadı; mevcut çalışan backend Vercel `api/index` içindedir. Hassas üretim anahtarları Vercel env pull içinde maskelidir; Railway’de yerel JWT/Mongo ayarı kullanıldı, entegrasyon anahtarlarının eşliği doğrulanmadı.
- Önceki denetimdeki iki eksik bağlantı bulgusu yanlış pozitifti. Alış para hareketi cari ödeme kaydına bağlıdır; satışta SATIS_DUZELTME/SAYIM_EKSI miktarı sorgu projeksiyonundan çıkarılmıştı. Denetim düzeltildikten sonra canlı tarama: eksik bağlantı 0, kopuk referans 0, yetim hareket 0. İkinci para/stok hareketi oluşturulmadı.
- Gerçek PayTR tahsilatı, dış sağlayıcı stok/fiyat/sipariş gönderimi, tüm rollerle tüm modüllerin yazma/iptal senaryoları ve 24/7 yük/izleme garantisi doğrulanmadı.
- AKN e-Ticaret ayrı projesinin dosyalarına dokunulmadı. Mevcut canlı fiyatlar toplu olarak değiştirilmedi; gerçek veriler silinmedi.

Önceki yayın durumu: **1.4.13 canlıya yayınlandı ve Vercel build başarılı**. Canlıda ERP, B2B, sağlık ve mağaza kataloğu 200; kimliksiz ürün/ekstre erişimi 401; eski BOZUK kaynak 404. Beş değişen frontend dosyasının SHA256 değeri yerel kaynakla birebir eşleşti. Mağaza 169 aktif ürün bildiriyor. Kaynak manifesti `release-manifest.json`, canlı doğrulama `live-verification.json` dosyasındadır. Yayın çalışan yerel kaynaktan yapıldı; Git commit/push yapılmadı.

Bu kanıtlar tüm finansal geçmişin doğru olduğunu veya tüm modüllerin bütün senaryolarının 7/24 doğrulandığını göstermez. Muhasebe bağlantı bulguları aşağıdaki 1.4.15 incelemesiyle kapatılmıştır. Gerçek ödeme testi kullanıcının isteğiyle ertelenmiştir.

## Son güncelleme: 1.4.14

- Canlı deployment: `dpl_496SCSToSAuRxsrUPhWQPPmJTArq`, `https://moto-parca-pxf9pnk3j-bahadir2.vercel.app`; üretim adresi `https://www.benimmuhasebe.com`.
- Teklifler/Kataloglar: seçilen kategori için ürün iskontosu ve satış/bayi/perakende toplu fiyat güncelleme. İskontolu fiyat PDF, Excel ve paylaşılan katalogda görünür.
- Excel: gömülü data URI görsellerinin 32767 karakter hücre sınırını aşması giderildi; firma profili çağrısı Excel indirmesinden ayrıldı.
- Ürünler: her ürünün kendi KDV oranıyla KDV ekle/çıkar ve bağımsız KDV oranı değişikliği. Kayıtlı fiyatların net olduğu arayüzde açıklanır.
- B2B Bayi Yönetimi → Mağaza ayarları: bayi/perakende KDV dahil gösterimi ayrı seçilir; varsayılan bayi hariç, perakende dahil. Gösterim sipariş toplamını değiştirmez.
- Tarayıcıda kategori filtresiyle iki ürün için %10 iskonto önizlemesi, gerçek XLSX üretimi/düğme çağrısı ve 2 satırlı dosyanın yeniden okunması doğrulandı. İndirme otomasyonunun ilk denemesi zaman aşımına uğradı; sonraki kontrolde gerçek XLSX.writeFile çağrısı çalıştırılıp üretilen aynı dosya ayrıca yakalandı.
- Perakende 250 → 208,33 KDV çıkarma önizlemesi; 390px mobilde scrollWidth=390. Üretimde fiyat değiştirilmedi. Kanıtlar: `price14-browser.log`, `catalog-release14.xlsx`, `catalog-release14.png`.
- Canlı ERP/B2B/sağlık/katalog 200; kimliksiz ürün/ekstre 401; BOZUK kaynak404; beş JS kaynağı SHA256 eşleşti (`live-verification.json`).
- GitHub: `aknmotorsiklet-blip` hesabının `akintok54-debug/BenimMuhasebem` reposuna yazması 403 ile reddedildi. Railway planı ve repo yazma erişimi olmadan Git tabanlı 7/24 backend tamamlandı denilemez.

## 1.4.15 — muhasebe bağlantıları ve dış kanal fiyat denetimi

- AL-1789037823429: 3.300 TL kasa çıkışı `6aa28d3ed53f5ab8467e9ea7` → cari ödeme `6aa28d3dd53f5ab8467e9ea6` → alış belgesi; tutar/hesap/tenant doğrulandı.
- SAT-1788782163284: eklenen ürün için `6a9ea9eb7c05a55b477600dc` miktar=1 satış düzeltme çıkışı vardır. Projeksiyona miktar eklendi.
- Kanıt: `reconcile-before.json`, `reconciliation-provider.json`. Düzeltme sonrasında üç denetim sayacı sıfır; canlı para/stok miktarına yazılmadı.
- IdeaSoft canlı bağlantı testi 200, connected=true, sampleCount=1 (`provider-live-test.json`). Yerel anahtarla çözülemeyen kimlik bilgileri üretim sunucusunda başarıyla kullanıldı.
- Dış fiyat servisi: IdeaSoft dahil/hariç bayrağını korur; dahil fiyatı nete indirerek içeri alır, dışarı gönderirken kaynak KDV ile dönüştürür. Bilinmeyen bayrakta gönderimi durdurur. Trendyol fiyatları KDV dahil üretilir. Fiyat imzası KDV/liste fiyatı değişikliklerini de kapsar.
- Dış sipariş net birim fiyatı ve toplamları ortak hesaplayıcıdan gelir. Kargo/indirim dahil toplam uzlaşmıyorsa ERP siparişi oluşturulmaz, bekleyen eşleşme kaydı korunur.
- Trendyol batchRequestId kabulü tamamlanmış gönderim sayılmaz; sağlayıcı sonucu gelene kadar PARTIAL/PENDING kalır.
- Tenant kapsamlı `/api/tenant/eticaret/connections/:id/price-check` salt okunur, 10 eşleşmelik sayfalarla dış ürün kartı net fiyat/KDV farklarını döndürür. Kanal kampanyaları bu baz fiyat karşılaştırmasından ayrıdır.
- Testler: 353/353 tam tur + son iki regresyonu içeren 7/7 odaklı tur (toplam 355 ayrı test), kaynak kontrolü205JS.
- Kullanıcı gerçek kart ödeme testine şimdilik gerek olmadığını bildirdi; PayTR bağlantısı/test ayarı değiştirilmedi.
- VS Code: kaydedilmemiş denetim raporu yalnız başlık içeriyordu; `vscode-unsaved-report.txt` olarak yedeklendi. Diskteki tam rapora uygulanmadı. Masaüstü aracının native pipe bağlantısı bulunamadığından açık sekme durumu değiştirilmedi.
- Kaynak denetiminde 112 eski ajan/geçici dosya, dosyalar silinmeden ignore edildi; gerçek kaynak değişiklikleri test edildi. Yerel IDE ayarları ve Copilot teşhis çıktısı yayın kaydına dahil edilmez.
- Resmi kaynaklar: https://www.ideasoft.com.tr/yardim/urun-fiyat-yonetimi/ ; https://apidoc.ideasoft.dev/ ; https://developers.trendyol.com/docs/stok-ve-fiyat-g%C3%BCncelleme-updatepriceandinventory .

## Nihai canlı doğrulama — 1.4.16

- Canlı deployment `dpl_D4CSNP2DePPuZLjmqToRottVidND`, `https://moto-parca-nx2pjqtpu-bahadir2.vercel.app`, üretim `https://www.benimmuhasebe.com`. `/api/ready`200 ve version1.4.16; ERP/B2B/sağlık200; kimliksiz fiyat denetimi401.
- Kullanıcı fiyat farkları gösterildikten sonra açıkça “ERP fiyatlarını esas al, IdeaSoft fiyatlarını güncelle” dedi. Beş eşleşmenin ERP kaydı ve önceki dış fiyatları yedeklendi. ERP fiyatları/stokları değiştirilmedi.
- Fiyat gönderim işi `6aafc3d0ca54eafcddaf3224`: SUCCESS, processed5/success5/errors0. Kaynak KDV ve IdeaSoft dahil/hariç modu korunarak yalnız dış fiyat güncellendi.
- Sonraki bağımsız GET kontrolü: bağlı mağazadaki 5/5 eşleşmenin tamamı UYUMLU; tarama nextOffset=null. KT4795 net100, KT47568 net569,33, KT47567 net2.314,40, KT48087 net2.655,40, KT48039 net2.017,40; KDV%20. KDV dahil sağlayıcı fiyatından geri bölmede kuruş altı fark beklenir; karşılaştırma toleransı0,011TL.
- Kanıtlar: `price-reconciliation-before.json`, `live-price-check-before.json`, `price-push-result.json`, `live-price-check.json`. Bu sonuç yalnız bağlı/eşleştirilmiş 5 ürün içindir; bağlantısı olmayan pazaryerleri için canlı doğrulama iddia edilmez.
- Kayıtlı IdeaSoft pilotunun ham PARTIAL değeri eski boolean/sayaç karışıklığından gelir; tüm gerekli aşamalar kayıtlı olduğundan mevcut pilotDurumu hesabı SUCCESS döner. Kontrol atlanmadı veya sonuç uydurularak değiştirilmedi.
- Vercel senkronizasyonu isteği yanıtlamadan işi tamamlamayı bekler. Net fiyatın ara aşamada iki haneye yuvarlanıp bir kuruş fark oluşturması önlendi; para toplamında ortak yuvarlama kullanılır. Son fiyat/entegrasyon odaklı testler40/40, toplam355 farklı test doğrulandı; kaynak205JS.
- Mevcut iki IdeaSoft ERP siparişi IPTAL durumundadır; kayıtlı toplam ile ortak hesaplama uyumludur. Yeni sipariş, tahsilat veya stok hareketi oluşturulmadı.
- VS Code kaydedilmemiş rapor sekmesi native pipe erişimi olmadığından açık kaldı; yalnız başlık içeren tampon yedeklendi, diskteki tam rapor korunmuştur. Kaynak denetimi geçici dosyalar silinmeden düzenlenip gerçek kaynak ve testler yerel Git geçmişine alınmıştır.
