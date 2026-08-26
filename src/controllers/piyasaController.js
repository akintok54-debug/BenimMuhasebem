const https = require("https");

function tcmbGet() {
    return new Promise((resolve, reject) => {

        const request = https.get(
            "https://www.tcmb.gov.tr/kurlar/today.xml",
            {
                headers: {
                    "User-Agent": "BenimMuhasebe-ERP"
                },
                timeout: 10000
            },
            response => {

                let data = "";

                response.setEncoding("utf8");

                response.on("data", chunk => {
                    data += chunk;
                });

                response.on("end", () => {

                    if (response.statusCode !== 200) {
                        return reject(
                            new Error(
                                `TCMB HTTP ${response.statusCode}`
                            )
                        );
                    }

                    resolve(data);
                });
            }
        );

        request.on("timeout", () => {
            request.destroy();
            reject(new Error("TCMB bağlantısı zaman aşımına uğradı."));
        });

        request.on("error", reject);
    });
}

function kurOku(xml, kod, alan) {

    const regex = new RegExp(
        `<Currency[^>]*CurrencyCode="${kod}"[\\s\\S]*?<${alan}>([\\s\\S]*?)</${alan}>`,
        "i"
    );

    const match = xml.match(regex);

    if (!match) {
        return null;
    }

    const value = match[1]
        .replace(",", ".")
        .trim();

    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : null;
}

async function piyasa(req, res, next) {

    try {

        const xml = await tcmbGet();

        const usdAlis =
            kurOku(xml, "USD", "ForexBuying");

        const usdSatis =
            kurOku(xml, "USD", "ForexSelling");

        const eurAlis =
            kurOku(xml, "EUR", "ForexBuying");

        const eurSatis =
            kurOku(xml, "EUR", "ForexSelling");

        const gbpAlis =
            kurOku(xml, "GBP", "ForexBuying");

        const gbpSatis =
            kurOku(xml, "GBP", "ForexSelling");

        const simdi = new Date();

        res.json({
            basarili: true,

            tarih: simdi.toISOString(),

            yerelTarih:
                simdi.toLocaleDateString(
                    "tr-TR",
                    {
                        timeZone: "Europe/Istanbul"
                    }
                ),

            yerelSaat:
                simdi.toLocaleTimeString(
                    "tr-TR",
                    {
                        timeZone: "Europe/Istanbul"
                    }
                ),

            kaynak: "TCMB",

            kurlar: {
                USD: {
                    alis: usdAlis,
                    satis: usdSatis
                },

                EUR: {
                    alis: eurAlis,
                    satis: eurSatis
                },

                GBP: {
                    alis: gbpAlis,
                    satis: gbpSatis
                }
            }
        });

    } catch (error) {
        next(error);
    }
}

module.exports = {
    piyasa
};
