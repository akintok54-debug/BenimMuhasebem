# BenimMuhasebe Güvenlik Operasyonları

## Production geçiş sırası

1. MongoDB Atlas'ta yeni, yalnız uygulama veritabanında `readWrite` yetkili kullanıcı oluşturun.
2. Yeni URI'yi secret yöneticisine yazın, uygulamayı yeniden başlatın ve sağlık/giriş/ERP testlerini çalıştırın.
3. Eski MongoDB kullanıcısını ancak doğrulamadan sonra iptal edin.
4. Atlas IP allowlist'i uygulama çıkış IP'leriyle sınırlandırın veya private endpoint kullanın; TLS zorunlu kalsın.
5. En az 32 bayt rastgele ve birbirinden bağımsız `JWT_SECRET`, `ENCRYPTION_KEY` ve `BACKUP_ENCRYPTION_KEY` tanımlayın.
6. Kalıcı Redis sağlayıcısının TLS adresini `REDIS_URL` olarak tanımlayın.
7. Alarm alıcısının adresini `SECURITY_ALERT_WEBHOOK` olarak tanımlayıp test olayı gönderin.
8. Kullanıcıların yeniden giriş yapmasını sağlayın; eski istemci kalmadığı doğrulandıktan sonra `JWT_ALLOW_LEGACY=false` yapın.

Gerçek `.env` dosyaları kaynak kontrolüne alınmaz ve bu geçiş sırasında repodan değiştirilmez.

## Oturum ve 2FA

- Production oturumu `HttpOnly`, `Secure`, `SameSite=Strict` cookie kullanır. Cookie ile yapılan değiştirici isteklerde CSRF başlığı zorunludur.
- TOTP kurulumu kullanıcı tarafından başlatılır, ilk kodla onaylanır ve kurtarma kodları yalnız bir kez gösterilir.
- Kurtarma kodları hash olarak; TOTP sırrı `ENCRYPTION_KEY` ile AES-256-GCM şifreli saklanır.
- 2FA kapatma için parola ve güncel TOTP/kurtarma kodu istenir.

## MongoDB

- Production URI'si `mongodb+srv://` kullanmalı veya `tls=true` içermelidir.
- Uygulama, yedekleme ve yönetim kullanıcıları ayrıdır; uygulama hesabına Atlas yönetim yetkisi verilmez.
- Production'da otomatik index üretimi kapalıdır; index değişiklikleri kontrollü migration ile yapılır.
- Credential rotasyonu iki kullanıcıyla kesintisiz yapılır: yeni kullanıcıyı aç, doğrula, sonra eskisini iptal et.

## Merkezi rate limiting ve alarm

- Production başlangıç kontrolü yalnızca çekirdek `MONGODB_URI` TLS ve en az 32 karakterlik `JWT_SECRET` gereksinimlerinde uygulamayı durdurur.
- `REDIS_URL` yoksa rate limit süreç içi bellek deposuna; `SECURITY_ALERT_WEBHOOK` yoksa alarm servisi gönderimsiz moda düşer.
- `ENCRYPTION_KEY` yalnızca 2FA sırrı şifreleme/çözme işlemlerinde, `BACKUP_ENCRYPTION_KEY` yalnızca yedekleme ve geri yükleme araçlarında zorunludur; eksiklikleri normal ERP başlangıcını veya login'i durdurmaz.
- Redis yoksa yalnız development ortamında bellek içi sınırlayıcı kullanılır; bu yatay ölçekli production için uygun değildir.
- Kritik/şüpheli audit olayları webhook'a gönderilir. Parola, JWT, TOTP sırrı ve banka tokenı alarm içeriğine eklenmez.
- Alarm kanalında teslimat takibi, nöbetçi rota ve webhook anahtarı rotasyonu altyapı tarafında yapılandırılmalıdır.

## Şifreli yedekleme ve izole restore

- MongoDB Database Tools (`mongodump`, `mongorestore`) sunucuda kurulu olmalıdır.
- `npm run backup:check` yapılandırmayı doğrular. Gerçek yedek `node scripts/mongodb-backup.js` ile oluşturulur.
- Arşiv AES-256-GCM ile şifrelenir; düz metin dump geçici dosyası işlem sonunda kaldırılır.
- `npm run restore:check` izole hedef ayarını doğrular. Gerçek tatbikat `node scripts/mongodb-restore-check.js` ile ve yalnız açıkça verilmiş test URI'sinde yapılır.
- Production URI'sine restore reddedilir. Günlük otomatik görev, değiştirilemez uzak depolama ve aylık restore tatbikatı ayrıca kurulmalıdır.
- Önerilen saklama: günlük 30 gün, haftalık 12 hafta, aylık 12 ay; süre KVKK ve işletme kararlarıyla kesinleştirilir.

## Olay müdahalesi ve KVKK

- Güvenlik Merkezi başarısız giriş, yetkisiz erişim, kritik API/banka ve sistem olayları için izlenir.
- Kullanıcı veri paketi `/api/auth/verilerim` üzerinden dışa aktarılabilir; anonimleştirme ve hesap kapatma audit üretir.
- Saklama sürelerinin uygulanması için zamanlanmış anonimleştirme/silme işi production operasyonuna eklenmelidir.

## Bilinen bağımlılık riski

- Mevcut `xlsx` paketinde upstream düzeltmesi olmayan yüksek önem dereceli prototype-pollution ve ReDoS uyarıları vardır.
- Güvenilmeyen çalışma kitabı yüklemeleri production'da sınırlandırılmalı; dosya boyutu/süre limitleri uygulanmalı ve paket kontrollü biçimde güvenli bir alternatife taşınmalıdır.
