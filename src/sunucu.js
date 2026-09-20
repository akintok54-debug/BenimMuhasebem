require("./modules/platform/services/runtimeIzleme");
﻿require("dotenv").config();

const uygulama = require("./uygulama");
const veritabaniBaglan = require("./database/veritabani");
const { productionGuvenlikDogrula } = require("./services/productionGuvenlikServisi");
const { ideasoftOtomatikSenkronizasyonBaslat } = require("./services/eticaretSyncServisi");

const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");

async function baslat() {
    try {
        productionGuvenlikDogrula();
        console.log("BenimMuhasebe İşletme Yönetimi başlatılıyor...");
        console.log("HOST:", HOST);
        console.log("PORT:", PORT);

        console.log("MongoDB bağlantısı yapılıyor...");
        await veritabaniBaglan();
        console.log("MongoDB bağlantısı başarılı.");
        ideasoftOtomatikSenkronizasyonBaslat();

        const server = uygulama.listen(PORT, HOST, () => {
            console.log("");
            console.log("====================================");
            console.log(" BenimMuhasebe İşletme Yönetimi");
            console.log("====================================");
            console.log(`Sunucu: http://${HOST}:${PORT}`);
            console.log(`Sağlık: http://${HOST}:${PORT}/api/saglik`);
            console.log("====================================");
        });

        server.on("error", (error) => {
            console.error("");
            console.error("SUNUCU HATASI:");
            console.error(error);
            process.exit(1);
        });

        let stopping = false;
        const stop = () => {
            if (stopping) return;
            stopping = true;
            const deadline = setTimeout(() => process.exit(1), 25000);
            deadline.unref();
            server.close(async () => {
                await require('mongoose').disconnect();
                clearTimeout(deadline);
                process.exit(0);
            });
        };
        process.once('SIGTERM', stop);
        process.once('SIGINT', stop);

    } catch (error) {
        console.error("");
        console.error("BENİMMUHASEBE BAŞLATILAMADI:");
        console.error(error);
        process.exit(1);
    }
}

process.on("uncaughtException", (error) => {
    console.error("BEKLENMEYEN HATA:");
    console.error(error);
    process.exit(1);
});

process.on("unhandledRejection", (error) => {
    console.error("PROMISE HATASI:");
    console.error(error);
    process.exit(1);
});

baslat();
