function saglikRotasi(req, res) {
    res.json({
        basarili: true,
        sistem: "BenimMuhasebe İşletme Yönetimi",
        durum: "CALISIYOR",
        zaman: new Date().toISOString()
    });
}

module.exports = saglikRotasi;
