# Bahadır ERP V2 production

Hedef: bahadir-erp-v2 (prj_gOMKeNykjj6ISEr46fR3z4PGSfzr), GitHub akintok54-debug/BenimMuhasebem, main.

## Yayın
- Mevcut api/index.js Express serverless girişidir; src/sunucu.js yerel/uzun süre çalışan sunucu olarak kalır.
- npm run check ve npm test çalıştırılır. Vercel npm ci ile kurar, npm run check ile kaynakları doğrular ve api/index.js fonksiyonunu paketler.
- Aynı repo eski moto-parca-erp projesine bağlıdır. git.deploymentEnabled=false otomatik Git yayınlarını engeller. Yalnız doğrulanan yeni proje bağlantısıyla vercel deploy --prod --scope bahadir2 kullanılır.
- Eski üretim deployment ve domain bağlantıları değiştirilmez. benimmuhasebe.com taşınmaz.
- Cron tanımları geçiş sırasında boştur: mevcut canlı projedeki görevlerle aynı veritabanında çift çalıştırma önlenir. Domain geçişi ayrıca onaylandıktan sonra eski/yeni görev sahipliği planlanır.
- /api/saglik: DB bağlantısı başarılıysa 200. /api/ready: Mongo ping kontrolü. /api/integrations/akn/health: tokensız 401.

## Environment
Secret değerleri repoya veya loglara yazılmaz. Sensitive Vercel secret değerleri geri okunamaz; mevcut değer kaynağından yeni projeye girilmelidir. Yeni MongoDB veya rastgele yeni JWT/encryption anahtarı oluşturulmaz.

Zorunlu:
- MONGODB_URI: mevcut canlı ERP veritabanı, TLS; veritabanı adı korunur.
- JWT_SECRET: mevcut canlı anahtar; en az 32 karakter.
- NODE_ENV=production
- PUBLIC_APP_URL=https://bahadir-erp-v2.vercel.app
- CANONICAL_HOST=bahadir-erp-v2.vercel.app
- CORS_ORIGINS=https://bahadir-erp-v2.vercel.app

Mevcut özellikler için:
- ENCRYPTION_KEY: mevcut şifreli entegrasyon/2FA kayıtlarını çözmek için aynı anahtar.
- BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME veya RESEND_API_KEY, PASSWORD_RESET_EMAIL_FROM: e-posta.
- CRON_SECRET: görevler etkinleştirildiğinde.
- JWT_ALLOW_LEGACY, JWT_ISSUER, JWT_AUDIENCE, JWT_EXPIRES_IN, SESSION_MAX_AGE_DAYS: mevcut oturum politikası korunur.
- REDIS_URL: paylaşımlı rate limit; SECURITY_ALERT_WEBHOOK, PLATFORM_ALERT_EMAIL, PLATFORM_ALERT_WHATSAPP: bildirimler.
- BACKUP_ENCRYPTION_KEY: yedekleme araçları için mevcut anahtar, runtime deployment için zorunlu değil.
- IDEASOFT_AUTO_SYNC=false: geçiş sırasında arka plan eşitlemesi başlatılmaz.
- MONGODB_SERVER_SELECTION_TIMEOUT_MS: varsayılan 10000.
- HOST/PORT Vercel için gerekli değildir. Kod MONGO_URI veya DB_NAME yerine MONGODB_URI kullanır.
- VERCEL_URL ve VERCEL_PROJECT_PRODUCTION_URL platform tarafından sağlanır. Bu tam hostlar yönlendirmeden ve aynı origin CORS kontrolünden geçer; genel *.vercel.app izni verilmez.
