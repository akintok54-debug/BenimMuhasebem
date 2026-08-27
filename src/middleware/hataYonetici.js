function hataYonetici(err, req, res, next) {
    console.error("API HATASI:", err);

    let status = err.status || 500;
    let mesaj = err.message || "Sunucu hatası.";

    if (err.name === "CastError") {
        status = 400;
        mesaj = "Geçersiz kayıt kimliği.";
    }

    if (err.code === 11000) {
        status = 409;
        mesaj = "Aynı benzersiz bilgiyle kayıt zaten mevcut.";
    }

    res.status(status).json({
        basarili: false,
        mesaj
    });
}

module.exports = hataYonetici;
