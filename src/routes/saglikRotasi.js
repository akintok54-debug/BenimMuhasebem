function saglikRotasi(req, res) {
    res.json({
        basarili: true,
        sistem: "BAHADIR ERP V2",
        durum: "CALISIYOR",
        zaman: new Date().toISOString()
    });
}

module.exports = saglikRotasi;
