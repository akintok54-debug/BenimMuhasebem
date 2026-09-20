# Mağaza geliştirmesi — devam kaydı

Son güncelleme: 13 Eylül 2026. Kullanıcı bağlantı kesilince kaldığımız yerden devam edilmesini istedi.

## İstenen sonuç

- Dışarıdan müşteri kaydı; başlangıçta yalnızca perakende fiyat ve alışveriş.
- Ticari başvuru, yönetici doğrulamasından sonra bayi yapılabilsin.
- Havale/EFT, kapıda ödeme, kredi/banka kartı; yöntemler sonradan yönetici tarafından değiştirilebilsin.
- Ürün görsellerinin görüntülenmesi ve yeni yükleme kalitesi düzelsin.
- Testlerden sonra canlıya yayın (önceki kullanıcı talimatıyla yetkili).

## Tamamlanan kod

`src/modules/b2b/magazaServisi.js`, `magazaOdemeServisi.js`, `models/MagazaAyar.js`, `models/MagazaOdeme.js`; ilgili routes/servis/guvenlik, Musteri/Siparis modelleri ve siparisController; public/b2b ekranları; ERP görsel yüklemesi; PayTR iframe CSP.

Temiz yayın paketinde 332/332 test geçti. Son eklenen PayTR dönüş adresi/satıcı anlık görüntüsü kontrolüyle mağaza testleri 15/15 geçti (`tests/retailStore.test.js`). Önceki B2B testleri 18/18 geçti. Yerel tarayıcıda misafir sepeti → kayıt/giriş → perakende sepeti → kapıda ödemeli sipariş doğrulandı; gerçek müşteri/veritabanı/ödeme kullanılmadı. 390×844 ekran görüntüsü `.tmp-retail-mobile.png`; tarayıcı hata listesi boş.

Yayın klasörü `backups/retail-release-20260913`; `.tmp-retail-stage.cjs` temiz stok sürümünü temel alıp yalnızca ilgili 20 dosyayı ve CSP değişikliğini taşır. Tam test komutu bu klasörde, yalnızca yerel test JWT_SECRET değeriyle `node --test`; anahtarsız çalıştırma platform testlerinde takılır. Tam test günlüğü aynı klasörde `.tmp-retail-full-tests.log`, son hedefli test günlüğü kökte `.tmp-retail-final-targeted.log`.

14 Eylül son durum: CANLIDA. Deployment `dpl_5QophsiC6uUsyXa7vTdmc94NbQYc`, URL `https://moto-parca-i4100abfn-bahadir2.vercel.app`, canlı mağaza `https://www.benimmuhasebe.com/b2b/?firma=bahadir-test`. Promote başarılı. Canlı store/katalog 200, 136 ürün, kayıt formu mevcut, bayi/maliyet/stok alanları perakende çıktısında yok, örnek JPEG 200. Kapıda ödeme etkin. Son hedefli testler 16/16; önceki genel testler 332/332.

Eski firma kaydında trialEndsAt yok; mağaza erişimi ERP'nin mevcut abonelikDurumuHesapla kuralına bağlandı. Abonelik değiştirilmedi; süresi dolan/askıya alınan hesap hâlâ reddedilir. `.tmp-retail-activate.cjs` yalnızca olmayan mağaza ayarını oluşturdu, mevcut ayarları değiştirmez. Gerçek sipariş/tahsilat oluşturulmadı. `.tmp-retail-store-check.cjs` canlı doğrulamasının tamamı geçti. Önceki canlı kontrolün tek yanlış alarmı: Vercel statik HTML'de CSP başlığı yok; Express API başlığında PayTR izni var, statik sayfada iframe engeli yok.

## Kalan doğrulama ve yayın

1. Yayın, promote ve canlı kontrol tamamlandı; stok düzeltmesi korundu.
2. Kullanıcı 14 Eylül'de mevcut işe devam/canlıda çalıştır talimatını yeniledi. Mevcut ERP firmasında devam varsayımı açıkça bildirildi: tenant `6a8dc53a3ff8c8a32ff9545b`, “Bahadır Test Firması”, slug `bahadir-test`; mağaza artık aktif.
3. Merkez Depo (`6a8dca663eb0eb874aef9386`) ve Merkez Kasa (`6a8dcf269bedf562e99fc830`) mağazaya tanımlandı. Aktif TRY banka hesabı yok. Havale IBAN hesabı ve PayTR bilgileri kullanıcı tarafından Mağaza / ödeme ayarlarından girilmeli. Vercel production ENCRYPTION_KEY mevcut (değeri okunmadı).
4. Üç yöntemin anahtarı yönetilebilir; eksik bağlantıyla kart/havale kullanılabilir gibi gösterilmez. PayTR test modu müşteri kart seçeneğini gizler. Gerçek ödeme sağlayıcısı denemesi yapılmadı.

## Önceki canlı stok sürümü

`https://www.benimmuhasebe.com`, Vercel proje `moto-parca-erp`, scope `bahadir2`.
Stok sürümü deployment: `dpl_te5cgzd2LYVrS1SD9xsT5wrf74Zq`, URL `https://moto-parca-r8ym1y9eo-bahadir2.vercel.app`.
Temiz stok yayın klasörü `backups/stock-entry-release-20260913`, git temel `b8bb2bb`; 318/318 test geçti. Ayrıntı `docs/stok-kontrol-2026-09-13.md`.

## Korunacak mevcut çalışmalar

Önceden kirli dosyalar: ERP login, platform UI, auth controller/routes, kimlikKontrol, oturumGuvenligi, guvenlikAltyapisi-test, releases/v1.4.12. `src/uygulama.js` içinde yalnızca yeni PayTR frame-src satırını temiz yayın kaynağına uygula; dosyanın tamamını kopyalama. `.local-agent*`, `.agent-logs` ve platformSessionIsolation.test de önceki çalışmalara ait.

## Görsel tespiti

Salt okunur canlı inceleme: 136 aktif ürün, 122 resimli, 114 resim 400 pikselden küçük. Mevcut düşük çözünürlükten gerçek ayrıntı üretilemez. Yeni yüklemeler 2000px/.94 kalite, küçük orijinaller korunur; katalog/detay küçük görseli zorla büyütmez. Tam netlik için orijinal yüksek çözünürlüklü ürün fotoğrafları gerekir.

Bu notta parola veya ödeme anahtarı yoktur. Test/deploy sonucu doğrulanmadan tamamlandı denmemelidir.
