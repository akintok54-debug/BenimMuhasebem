const mongoose = require("mongoose");

const KonumSchema = new mongoose.Schema({
    enlem: { type: Number, min: -90, max: 90, required: true },
    boylam: { type: Number, min: -180, max: 180, required: true },
    hassasiyet: { type: Number, min: 0, default: 0 },
    adres: { type: String, trim: true, maxlength: 500, default: "" }
}, { _id: false });

const ZiyaretSchema = new mongoose.Schema({
    musteriId: { type: mongoose.Schema.Types.ObjectId, ref: "Musteri", required: true },
    durum: { type: String, enum: ["AKTIF", "TAMAMLANDI"], default: "AKTIF" },
    baslangicTarihi: { type: Date, required: true },
    baslangicKonumu: { type: KonumSchema, required: true },
    bitisTarihi: { type: Date, default: null },
    bitisKonumu: { type: KonumSchema, default: null },
    sureDakika: { type: Number, min: 0, default: 0 },
    sonuc: { type: String, enum: ["GORUSULDU", "SATIS", "SIPARIS", "TAHSILAT", "ULASILAMADI", "DIGER"], default: "GORUSULDU" },
    notlar: { type: String, trim: true, maxlength: 1500, default: "" }
}, { timestamps: true });

const MolaSchema = new mongoose.Schema({
    tur: { type: String, enum: ["YEMEK", "DINLENME", "DIGER"], default: "DINLENME" },
    baslangicTarihi: { type: Date, required: true },
    bitisTarihi: { type: Date, default: null },
    sureDakika: { type: Number, min: 0, default: 0 },
    konum: { type: KonumSchema, required: true },
    notlar: { type: String, trim: true, maxlength: 500, default: "" }
}, { timestamps: true });

const SahaGunSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    kullaniciId: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", required: true, index: true },
    gun: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
    durum: { type: String, enum: ["AKTIF", "TAMAMLANDI"], default: "AKTIF", index: true },
    aracPlaka: { type: String, trim: true, uppercase: true, maxlength: 20, default: "" },
    cikisKm: { type: Number, min: 0, required: true },
    donusKm: { type: Number, min: 0, default: null },
    toplamKm: { type: Number, min: 0, default: 0 },
    baslangicTarihi: { type: Date, required: true },
    bitisTarihi: { type: Date, default: null },
    baslangicKonumu: { type: KonumSchema, required: true },
    bitisKonumu: { type: KonumSchema, default: null },
    gunlukZiyaretHedefi: { type: Number, min: 0, default: 10 },
    rota: [{
        musteriId: { type: mongoose.Schema.Types.ObjectId, ref: "Musteri", required: true },
        sira: { type: Number, min: 1, required: true },
        notlar: { type: String, trim: true, maxlength: 500, default: "" }
    }],
    ziyaretler: { type: [ZiyaretSchema], default: [] },
    molalar: { type: [MolaSchema], default: [] },
    primOrani: { type: Number, min: 0, max: 100, default: 0 },
    satisBasiPrim: { type: Number, min: 0, default: 0 },
    ciroHedefi: { type: Number, min: 0, default: 0 },
    hesaplananPrim: { type: Number, min: 0, default: 0 },
    kasaTeslimi: {
        kaynakKasaId: { type: mongoose.Schema.Types.ObjectId, ref: "Kasa", default: null },
        hedefKasaId: { type: mongoose.Schema.Types.ObjectId, ref: "Kasa", default: null },
        teslimEdilmesiGereken: { type: Number, min: 0, default: 0 },
        teslimEdilen: { type: Number, min: 0, default: 0 },
        fark: { type: Number, default: 0 },
        durum: { type: String, enum: ["BEKLIYOR", "TAM", "EKSIK", "FAZLA"], default: "BEKLIYOR" },
        teslimTarihi: { type: Date, default: null },
        transferGrupId: { type: mongoose.Schema.Types.ObjectId, default: null }
    }
}, { timestamps: true });

SahaGunSchema.index({ tenantId: 1, kullaniciId: 1, gun: 1 }, { unique: true });
SahaGunSchema.index({ tenantId: 1, gun: -1, durum: 1 });

module.exports = mongoose.model("SahaGun", SahaGunSchema);
