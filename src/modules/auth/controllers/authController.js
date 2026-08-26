const bcrypt = require("bcryptjs");
const Kullanici = require("../../../models/Kullanici");
const { tokenOlustur } = require("../../../services/tokenServisi");

async function login(req, res) {
    try {
        const { email, sifre } = req.body || {};

        console.log("[LOGIN] email:", email);

        if (!email || !sifre) {
            return res.status(400).json({
                basarili: false,
                mesaj: "E-posta ve şifre zorunludur."
            });
        }

        const kullanici = await Kullanici.findOne({
            email: String(email).trim().toLowerCase()
        });

        console.log("[LOGIN] kullanici bulundu:", !!kullanici);

        if (!kullanici || !kullanici.aktif) {
            return res.status(401).json({
                basarili: false,
                mesaj: "E-posta veya şifre hatalı."
            });
        }

        console.log("[LOGIN] rol:", kullanici.rol);

        const sifreDogru = await bcrypt.compare(
            String(sifre),
            String(kullanici.sifre)
        );

        console.log("[LOGIN] sifre dogru:", sifreDogru);

        if (!sifreDogru) {
            return res.status(401).json({
                basarili: false,
                mesaj: "E-posta veya şifre hatalı."
            });
        }

        console.log("[LOGIN] JWT oluşturuluyor...");

        const token = tokenOlustur({
            kullaniciId: kullanici._id.toString(),
            email: kullanici.email,
            rol: kullanici.rol,
            tenantId: kullanici.tenantId ? kullanici.tenantId.toString() : null
        });

        console.log("[LOGIN] JWT oluşturuldu.");

        return res.json({
            basarili: true,
            mesaj: "Giriş başarılı.",
            token,
            kullanici: {
                id: kullanici._id,
                adSoyad: kullanici.adSoyad,
                email: kullanici.email,
                rol: kullanici.rol,
                tenantId: kullanici.tenantId || null,
                aktif: kullanici.aktif
            }
        });

    } catch (hata) {
        console.error("");
        console.error("========== LOGIN HATASI ==========");
        console.error(hata);
        console.error("==================================");

        return res.status(500).json({
            basarili: false,
            mesaj: "Giriş işlemi sırasında sunucu hatası."
        });
    }
}

module.exports = {
    login
};

