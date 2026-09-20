# Stok giriş kontrolü — 13 Eylül 2026

Kullanıcı stok girişi yaptıktan sonra hareket görünmediğini bildirdi; bütün giriş yollarının incelenmesini ve düzeltmenin canlıya alınmasını istedi.

## Bulgular

- Bağlı MongoDB üzerinde salt okunur inceleme: 130 stok kartı, 194 hareket. Kart miktarı ile hareket neti arasında fark bulunmadı. Audit aracının işaretlediği beş satır geçmişte negatif bakiye içeriyor; bunlar eksik hareket kanıtı değil. Dört aktif satış çıkışının maliyeti eksik.
- Son kayıtlı manuel giriş 4 Eylül 2026. Audit kayıtlarında 10 ve 11 Eylül tarihli sayım istekleri HTTP 400 ile reddedilmiş. Sonradan hata mesajını okumak için yapılan bağlantı başarısız oldu; bu isteklerin kesin hata nedeni doğrulanamadı.
- Sayım ekranı negatif mevcut miktarı sayılan miktara kopyalıyor; sunucu negatif sayımı reddediyor. Bu, koddan doğrulanan bir hata yolu, ancak yukarıdaki canlı isteklerle kesin eşleştirilmedi.
- Manuel giriş miktarı ve hareket kaydı ayrı yazılıyordu. Hareket yazma hatası miktarı değişmiş bırakabiliyordu.
- Alış girişi miktarı ve hareketi aynı transaction içinde oluşturuyor. Normal ürün kartı ekleme/düzenleme stok miktarı değiştirmiyor. Excel aktarımı ve sayım sadece miktar farkı için hareket oluşturuyor. Hızlı satış ürünü başlangıç stoğuna devir hareketi oluşturuyor. Transfer çift yönlü hareket oluşturuyor.
- Transfer, sayım, Excel aktarımı ve hızlı ürün oluşturmadaki transaction kapsamı manuel giriş düzeltmesinden ayrı; bu inceleme bunların bütün hata/eşzamanlılık senaryolarını giderdiği anlamına gelmez.

## Değişiklik

- Manuel stok giriş/çıkışında atomik miktar güncellemesi ve hareket oluşturma aynı transaction içine alındı. Hareket başarısızsa işlem commit edilmiyor. Her manuel harekete işlem anahtarı eklendi.
- Sayımda negatif mevcut miktar yerine gerçek sayım girişi isteniyor. Boş/negatif/geçersiz değerler ürün adıyla gösteriliyor, boş alan sıfıra çevrilmiyor.
- Manuel hareket kaydından sonra hareket geçmişi açılıyor.

## Test ve yayın

Çalışma klasörünün genel testinde 318/319 geçti; önceden mevcut, stok dışı login değişiklikleri bir testi bozuyordu. Yayın paketi b8bb2bb tabanından, yalnızca stok controller ve ERP stok arayüzü değişiklikleri ile hazırlandı. İzole paketin 318/318 testi geçti. Yeni testler controller/model test double'ları ve sayım alanı davranışını kapsar; gerçek MongoDB rollback testi değildir.

- Önceki yayın: dpl_HF281aKaHmYRGvNL6ZvGVswUBEkk.
- Yeni yayın: dpl_te5cgzd2LYVrS1SD9xsT5wrf74Zq, READY, production.
- Adres: https://www.benimmuhasebe.com
- Yayın kaynağı: backups/stock-entry-release-20260913/.
- 13 Eylül 2026 12:23:47 UTC kontrolü: ERP/B2B/sağlık HTTP 200; stok, hareket, sayım ve alış korumalı API'leri oturumsuz HTTP 401.
- Canlı ERP JavaScript SHA-256: 2cfb9c2caa3431144292132e48ff62c853969f81330e11b5b373e6bb2cd36928; paketle eşleşti.
- Yayın sonrası 10 dakikalık error log sorgusunda bir Node DEP0169 url.parse kullanım uyarısı görüldü; sorguda uygulama istisnası görünmedi. Sağlık yanıtı HTTP 200 idi. Bu, sürekli izleme veya tüm kullanıcı işlemlerinin doğrulandığı anlamına gelmez.

Canlı müşteri stoğunu değiştiren test girişi yapılmadı. Oturumlu tarayıcıda kullanıcının bildirdiği işlemin uçtan uca kabulü doğrulanmadı. Önceden bulunan stok dışı çalışma klasörü değişiklikleri yayına dahil edilmedi.
