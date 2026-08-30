function telefonNormalize(value) {
    let rakam = String(value || "").replace(/\D/g, "");
    if (rakam.startsWith("00")) rakam = rakam.slice(2);
    if (rakam.length === 10 && rakam.startsWith("5")) rakam = `90${rakam}`;
    if (rakam.length === 11 && rakam.startsWith("0")) rakam = `9${rakam}`;
    return rakam;
}

function dahiliTelefonEpostasi(telefon) {
    return `telefon-${telefon}@login.benimmuhasebe.local`;
}

function gercekEposta(email) {
    const deger = String(email || "");
    return deger.endsWith("@login.benimmuhasebe.local") ? "" : deger;
}

module.exports = { telefonNormalize, dahiliTelefonEpostasi, gercekEposta };
