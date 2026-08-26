require("dotenv").config();

const uygulama = require("./uygulama");

const PORT = Number(process.env.PORT) || 5000;
const HOST = "127.0.0.1";

console.log("BAHADIR ERP V2 uygulama testi başlıyor...");

const server = uygulama.listen(PORT, HOST, () => {
    console.log("");
    console.log("====================================");
    console.log(" BAHADIR ERP V2");
    console.log("====================================");
    console.log(`Sunucu: http://${HOST}:${PORT}`);
    console.log(`Sağlık: http://${HOST}:${PORT}/api/saglik`);
    console.log("====================================");
});

server.on("error", (error) => {
    console.error("SUNUCU ERROR:");
    console.error(error);
});
