function hataYonetici(err, req, res, next) {
    console.error("API HATASI:", err);

    const status = err.status || 500;

    res.status(status).json({
        basarili: false,
        mesaj: err.message || "Sunucu hatası."
    });
}

module.exports = hataYonetici;
