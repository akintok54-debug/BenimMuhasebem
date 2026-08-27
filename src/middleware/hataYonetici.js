function hataYonetici(err, req, res, next) {
    console.error("API_HATASI", { requestId: req.id, method: req.method, path: req.originalUrl?.split("?")[0], name: err.name, message: err.message });

    let status = err.status || 500;
    let mesaj = status >= 500 ? "İşlem sırasında beklenmeyen bir hata oluştu." : (err.message || "İstek işlenemedi.");

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
        mesaj,
        requestId: req.id
    });
}

module.exports = hataYonetici;
