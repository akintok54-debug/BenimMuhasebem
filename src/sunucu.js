require("dotenv").config();

const uygulama = require("./uygulama");
const veritabaniBaglan = require("./database/veritabani");
const { productionGuvenlikDogrula } = require("./services/productionGuvenlikServisi");

const PORT = Number(process.env.PORT) || 5000;
const HOST = "127.0.0.1";

async function baslat() {
    try {
        productionGuvenlikDogrula();
        console.log("BAHADIR ERP V2 başlatılıyor...");
        console.log("HOST:", HOST);
        console.log("PORT:", PORT);

        console.log("MongoDB bağlantısı yapılıyor...");
        await veritabaniBaglan();
        console.log("MongoDB bağlantısı başarılı.");

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
            console.error("");
            console.error("SUNUCU HATASI:");
            console.error(error);
        });

    } catch (error) {
        console.error("");
        console.error("BAHADIR ERP BASLATILAMADI:");
        console.error(error);
        process.exit(1);
    }
}

process.on("uncaughtException", (error) => {
    console.error("BEKLENMEYEN HATA:");
    console.error(error);
});

process.on("unhandledRejection", (error) => {
    console.error("PROMISE HATASI:");
    console.error(error);
});

baslat();
