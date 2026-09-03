const mongoose = require("mongoose");
const Urun = require("../models/Urun");
const UrunKategori = require("../models/UrunKategori");
const OzelFiyat = require("../models/OzelFiyat");
const Depo = require("../models/Depo");
const Stok = require("../models/Stok");
const StokHareket = require("../models/StokHareket");
const MarketplaceProductMapping = require("../models/MarketplaceProductMapping");
const IntegrationConnection = require("../models/IntegrationConnection");
const { marketplaceAdapter } = require("../integrations/marketplace/adapterFactory");

// Ürün pasife alındığında eşleştirilmiş pazaryeri kaydına stok=0 gönderir; başarısızlık ürün güncellemesini engellemez.
async function pazaryeriUrunPasifBildir(tId, urunId) {
    try {
        const mappings = await MarketplaceProductMapping.find({ tenantId: tId, productId: urunId }).lean();
        for (const mapping of mappings) {
            const connection = await IntegrationConnection.findOne({ _id: mapping.storeConnectionId, tenantId: tId, active: true }).select("+encryptedCredentials");
            if (!connection) continue;
            const adapter = marketplaceAdapter(connection);
            if (connection.provider === "IDEASOFT" && mapping.externalProductId) await adapter.updateStock([{ externalProductId: mapping.externalProductId, quantity: 0 }]);
            else if (mapping.externalBarcode) await adapter.updateStock([{ barcode: mapping.externalBarcode, quantity: 0 }]);
        }
    } catch (error) { console.error("PAZARYERI_URUN_PASIF_BILDIRIM_HATASI", { name: error.name, message: error.message }); }
}

const SAYISAL_ALANLAR = ["kdv", "alisFiyati", "satisFiyati", "bayiFiyati", "perakendeFiyati", "iskonto", "minimumStok", "kritikStok"];
const TOPLU_ALANLAR = ["kod", "barkod", "ad", "kategori", "marka", "model", "uyumluluk", "birim", "kdv", "alisFiyati", "satisFiyati", "bayiFiyati", "perakendeFiyati", "iskonto", "paraBirimi", "gorsel", "ekGorseller", "minimumStok", "kritikStok", "aktif", "notlar"];

function metin(value) {
    return String(value ?? "").trim();
}

function gorselDogrula(value) {
    if (!value) return "";
    if (typeof value !== "string" || !(/^(https?:\/\/)/i.test(value) || /^data:image\/(jpeg|png|webp);base64,/i.test(value))) {
        const error = new Error("Ürün görseli geçerli bir HTTPS adresi veya JPG, PNG, WebP görseli olmalıdır.");
        error.status = 400;
        throw error;
    }
    if (value.length > 2_800_000) {
        const error = new Error("Ürün görseli en fazla 2 MB olabilir.");
        error.status = 400;
        throw error;
    }
    return value;
}

async function kategorileriListele(req, res, next) {
    try {
        const tId = tenantId(req);
        const [kayitli, urunKategorileri] = await Promise.all([
            UrunKategori.find({ tenantId: tId, aktif: true }).sort({ ad: 1 }).lean(),
            Urun.distinct("kategori", { tenantId: tId, kategori: { $ne: "" } })
        ]);
        const adlar = [...new Set([...kayitli.map(x => x.ad), ...urunKategorileri].filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, "tr"));
        const kullanimlar = await Urun.aggregate([
            { $match: { tenantId: tId, kategori: { $ne: "" } } },
            { $group: { _id: "$kategori", toplam: { $sum: 1 } } }
        ]);
        const kullanimMap = Object.fromEntries(kullanimlar.map(x => [x._id, x.toplam]));
        const kayitMap = Object.fromEntries(kayitli.map(x => [x.ad, x]));
        res.json({
            basarili: true,
            kategoriler: adlar,
            kategoriKayitlari: adlar.map(ad => ({
                _id: kayitMap[ad]?._id || null,
                ad,
                kullanim: kullanimMap[ad] || 0
            }))
        });
    } catch (error) { next(error); }
}

async function kategoriOlustur(req, res, next) {
    try {
        const ad = metin(req.body?.ad);
        if (!ad) return res.status(400).json({ basarili: false, mesaj: "Kategori adı zorunludur." });
        const mevcut = await UrunKategori.findOne({ tenantId: tenantId(req), ad });
        if (mevcut) return res.status(409).json({ basarili: false, mesaj: "Bu kategori zaten kayıtlı." });
        const kategori = await UrunKategori.create({ tenantId: tenantId(req), ad });
        res.status(201).json({ basarili: true, kategori });
    } catch (error) { next(error); }
}

async function kategoriSil(req, res, next) {
    try {
        const tId = tenantId(req);
        const ad = metin(req.query.ad);
        const id = metin(req.params.id);
        if (!ad && !id) {
            return res.status(400).json({ basarili: false, mesaj: "Silinecek kategori seçilmelidir." });
        }
        if (id && !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ basarili: false, mesaj: "Geçersiz kategori kimliği." });
        }
        const kategori = ad
            ? await UrunKategori.findOne({ tenantId: tId, ad })
            : await UrunKategori.findOne({ _id: id, tenantId: tId });
        const kategoriAdi = kategori?.ad || ad;
        if (!kategoriAdi) return res.status(404).json({ basarili: false, mesaj: "Kategori bulunamadı." });
        const kullanim = await Urun.countDocuments({ tenantId: tId, kategori: kategoriAdi });
        if (kullanim > 0) {
            return res.status(409).json({
                basarili: false,
                mesaj: `Bu kategori ${kullanim} üründe kullanılıyor. Önce ürünlerin kategorisini değiştirin.`
            });
        }
        if (kategori) await UrunKategori.deleteOne({ _id: kategori._id, tenantId: tId });
        res.json({ basarili: true, mesaj: "Kategori silindi." });
    } catch (error) { next(error); }
}

async function benzersizAlanlariDogrula(tId, body, haricId = null) {
    const kosullar = [];
    const kod = metin(body.kod).toUpperCase();
    const barkod = metin(body.barkod);
    if (kod) kosullar.push({ kod });
    if (barkod) kosullar.push({ barkod });
    if (!kosullar.length) return;
    const filter = { tenantId: tId, $or: kosullar };
    if (haricId) filter._id = { $ne: haricId };
    const mevcut = await Urun.findOne(filter).select("kod barkod").lean();
    if (!mevcut) return;
    const error = new Error(mevcut.kod === kod ? "Bu ürün kodu zaten kullanılıyor." : "Bu barkod zaten kullanılıyor.");
    error.status = 409;
    throw error;
}

function sayilariDogrula(body) {
    for (const alan of SAYISAL_ALANLAR) {
        if (body[alan] === undefined) continue;
        const deger = Number(body[alan]);
        if (!Number.isFinite(deger) || deger < 0) {
            const error = new Error(`${alan} sıfır veya daha büyük bir sayı olmalıdır.`);
            error.status = 400;
            throw error;
        }
    }
    if (body.iskonto !== undefined && Number(body.iskonto) > 100) {
        const error = new Error("İskonto oranı 0 ile 100 arasında olmalıdır.");
        error.status = 400;
        throw error;
    }
}

function paraBirimiDogrula(value) {
    const paraBirimi = metin(value || "TRY").toUpperCase();
    if (!["TRY", "USD", "EUR"].includes(paraBirimi)) {
        const error = new Error("Para birimi TRY, USD veya EUR olmalıdır.");
        error.status = 400;
        throw error;
    }
    return paraBirimi;
}

function tenantId(req) {
    return new mongoose.Types.ObjectId(String(req.tenantId));
}

function fiyatDogrula(value) {
    const fiyat = Number(value);
    if (!Number.isFinite(fiyat) || fiyat < 0) {
        const error = new Error("Özel fiyat sıfır veya daha büyük bir sayı olmalıdır.");
        error.status = 400;
        throw error;
    }
    return fiyat;
}

function urunOlusturmaVerisi(tId, body) {
    return {
        tenantId: tId,
        kod: metin(body.kod).toUpperCase(),
        barkod: metin(body.barkod),
        ad: metin(body.ad),
        kategori: metin(body.kategori),
        marka: metin(body.marka),
        model: metin(body.model),
        uyumluluk: Array.isArray(body.uyumluluk) ? body.uyumluluk.map(metin).filter(Boolean) : [],
        birim: metin(body.birim || "ADET").toUpperCase(),
        kdv: Number(body.kdv ?? 20),
        alisFiyati: Number(body.alisFiyati || 0),
        satisFiyati: Number(body.satisFiyati || 0),
        bayiFiyati: Number(body.bayiFiyati || 0),
        perakendeFiyati: Number(body.perakendeFiyati ?? body.satisFiyati ?? 0),
        iskonto: Number(body.iskonto || 0),
        paraBirimi: paraBirimiDogrula(body.paraBirimi),
        gorsel: gorselDogrula(body.gorsel),
        ekGorseller: (Array.isArray(body.ekGorseller) ? body.ekGorseller : []).filter(Boolean).map(gorselDogrula).slice(0, 2),
        minimumStok: Number(body.minimumStok || 0),
        kritikStok: Number(body.kritikStok || 0),
        aktif: body.aktif !== false,
        notlar: metin(body.notlar)
    };
}

async function ozelFiyatlariListele(req, res, next) {
    try {
        const fiyatlar = await OzelFiyat.find({ tenantId: tenantId(req) })
            .populate("urunId", "kod barkod ad kategori birim satisFiyati aktif")
            .sort({ updatedAt: -1 }).lean();
        res.json({ basarili: true, toplam: fiyatlar.length, fiyatlar: fiyatlar.filter(x => x.urunId) });
    } catch (error) { next(error); }
}

async function ozelFiyatOlustur(req, res, next) {
    try {
        const tId = tenantId(req);
        const urunId = metin(req.body?.urunId);
        if (!mongoose.Types.ObjectId.isValid(urunId)) return res.status(400).json({ basarili: false, mesaj: "Geçerli bir ürün seçilmelidir." });
        const urun = await Urun.findOne({ _id: urunId, tenantId: tId }).select("_id").lean();
        if (!urun) return res.status(404).json({ basarili: false, mesaj: "Ürün bulunamadı." });
        const fiyat = fiyatDogrula(req.body?.fiyat);
        if (await OzelFiyat.exists({ tenantId: tId, urunId })) return res.status(409).json({ basarili: false, mesaj: "Bu ürün özel fiyat listesinde zaten var. Fiyatı Güncelle düğmesini kullanın." });
        const ozelFiyat = await OzelFiyat.create({ tenantId: tId, urunId, fiyat, aciklama: metin(req.body?.aciklama) });
        await ozelFiyat.populate("urunId", "kod barkod ad kategori birim satisFiyati aktif");
        res.status(201).json({ basarili: true, ozelFiyat });
    } catch (error) { next(error); }
}

async function ozelFiyatGuncelle(req, res, next) {
    try {
        const ozelFiyat = await OzelFiyat.findOne({ _id: req.params.id, tenantId: tenantId(req) });
        if (!ozelFiyat) return res.status(404).json({ basarili: false, mesaj: "Özel fiyat kaydı bulunamadı." });
        ozelFiyat.fiyat = fiyatDogrula(req.body?.fiyat);
        if (req.body?.aciklama !== undefined) ozelFiyat.aciklama = metin(req.body.aciklama);
        await ozelFiyat.save();
        await ozelFiyat.populate("urunId", "kod barkod ad kategori birim satisFiyati aktif");
        res.json({ basarili: true, ozelFiyat });
    } catch (error) { next(error); }
}

async function ozelFiyatSil(req, res, next) {
    try {
        const sonuc = await OzelFiyat.deleteOne({ _id: req.params.id, tenantId: tenantId(req) });
        if (!sonuc.deletedCount) return res.status(404).json({ basarili: false, mesaj: "Özel fiyat kaydı bulunamadı." });
        res.json({ basarili: true, mesaj: "Ürün yalnızca özel fiyat listesinden kaldırıldı." });
    } catch (error) { next(error); }
}

async function listele(req, res, next) {
    try {
        const filter = {
            tenantId: tenantId(req)
        };

        const arama = String(req.query.arama || "").trim();

        if (req.query.aktif === "true") filter.aktif = true;
        if (req.query.aktif === "false") filter.aktif = false;
        if (req.query.kategori) filter.kategori = String(req.query.kategori).trim();

        if (arama) {
            filter.$or = [
                { kod: { $regex: arama, $options: "i" } },
                { barkod: { $regex: arama, $options: "i" } },
                { ad: { $regex: arama, $options: "i" } },
                { marka: { $regex: arama, $options: "i" } },
                { model: { $regex: arama, $options: "i" } }
            ];
        }

        const urunler = await Urun.find(filter)
            .sort({ createdAt: -1 })
            .lean();

        res.json({
            basarili: true,
            toplam: urunler.length,
            urunler
        });
    } catch (error) {
        next(error);
    }
}

async function detay(req, res, next) {
    try {
        const urun = await Urun.findOne({
            _id: req.params.id,
            tenantId: tenantId(req)
        }).lean();

        if (!urun) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Ürün bulunamadı."
            });
        }

        res.json({
            basarili: true,
            urun
        });
    } catch (error) {
        next(error);
    }
}

async function olustur(req, res, next) {
    try {
        const body = req.body || {};
        const tId = tenantId(req);

        if (!body.kod || !body.ad) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Ürün kodu ve ürün adı zorunludur."
            });
        }

        sayilariDogrula(body);
        await benzersizAlanlariDogrula(tId, body);

        const urun = await Urun.create(urunOlusturmaVerisi(tId, body));

        res.status(201).json({
            basarili: true,
            urun
        });
    } catch (error) {
        next(error);
    }
}

async function hizliSatisUrunuOlustur(req, res, next) {
    let urun = null, stok = null;
    try {
        const body = req.body || {}, tId = tenantId(req);
        const stokMiktari = Number(body.stokMiktari || 0), alisFiyati = Number(body.alisFiyati || 0);
        if (!metin(body.kod) || !metin(body.ad) || !mongoose.Types.ObjectId.isValid(metin(body.depoId))) {
            return res.status(400).json({ basarili: false, mesaj: "Ürün kodu, ürün adı ve depo zorunludur." });
        }
        if (!Number.isFinite(stokMiktari) || stokMiktari <= 0) {
            return res.status(400).json({ basarili: false, mesaj: "Ürünü hemen satabilmek için başlangıç stoğu sıfırdan büyük olmalıdır." });
        }
        if (!Number.isFinite(alisFiyati) || alisFiyati <= 0) {
            return res.status(400).json({ basarili: false, mesaj: "Gerçek stok maliyeti için alış maliyeti sıfırdan büyük olmalıdır." });
        }
        sayilariDogrula(body);
        await benzersizAlanlariDogrula(tId, body);
        const depo = await Depo.findOne({ _id: body.depoId, tenantId: tId, aktif: { $ne: false } });
        if (!depo) return res.status(404).json({ basarili: false, mesaj: "Aktif depo bulunamadı." });

        urun = await Urun.create(urunOlusturmaVerisi(tId, { ...body, aktif: true }));
        stok = await Stok.create({ tenantId: tId, urunId: urun._id, depoId: depo._id, miktar: stokMiktari, maliyet: alisFiyati, sonHareketTarihi: new Date() });
        const hareket = await StokHareket.create({
            tenantId: tId, urunId: urun._id, depoId: depo._id, tip: "DEVIR_GIRIS", miktar: stokMiktari,
            tarih: body.tarih || new Date(), birimMaliyet: alisFiyati, maliyetDogrulandi: true,
            maliyetKaynagi: "HIZLI_SATIS_URUNU", kaynak: "HIZLI_SATIS_URUNU",
            islemAnahtari: `HIZLI_SATIS_URUNU:${urun._id}:${depo._id}`,
            aciklama: metin(body.aciklama || "Satış ekranından hızlı ürün ve açılış stoğu"),
            kullaniciId: req.currentUser?._id || req.kullanici?.kullaniciId || req.user?.kullaniciId || null
        });
        return res.status(201).json({ basarili: true, mesaj: "Ürün kartı ve başlangıç stoğu oluşturuldu; satışa hazır.", urun, stok, hareket, depo: { _id: depo._id, kod: depo.kod, ad: depo.ad } });
    } catch (error) {
        if (stok?._id) await Stok.deleteOne({ _id: stok._id, tenantId: tenantId(req) }).catch(() => {});
        if (urun?._id) await Urun.deleteOne({ _id: urun._id, tenantId: tenantId(req) }).catch(() => {});
        next(error);
    }
}

async function guncelle(req, res, next) {
    try {
        const urun = await Urun.findOne({
            _id: req.params.id,
            tenantId: tenantId(req)
        });

        if (!urun) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Ürün bulunamadı."
            });
        }

        const alanlar = [
            "kod",
            "barkod",
            "ad",
            "kategori",
            "marka",
            "model",
            "uyumluluk",
            "birim",
            "kdv",
            "alisFiyati",
            "satisFiyati",
            "bayiFiyati",
            "perakendeFiyati",
            "iskonto",
            "paraBirimi",
            "gorsel",
            "minimumStok",
            "kritikStok",
            "aktif",
            "notlar",
            "ekGorseller"
        ];

        sayilariDogrula(req.body || {});
        await benzersizAlanlariDogrula(tenantId(req), req.body || {}, urun._id);

        const oncekiAktif = urun.aktif;
        for (const alan of alanlar) {
            if (req.body[alan] !== undefined) {
                if (alan === "kod") urun[alan] = metin(req.body[alan]).toUpperCase();
                else if (alan === "gorsel") urun[alan] = gorselDogrula(req.body[alan]);
                else if (alan === "ekGorseller") urun[alan] = (Array.isArray(req.body[alan]) ? req.body[alan] : []).filter(Boolean).map(gorselDogrula).slice(0, 2);
                else if (alan === "paraBirimi") urun[alan] = paraBirimiDogrula(req.body[alan]);
                else if (SAYISAL_ALANLAR.includes(alan)) urun[alan] = Number(req.body[alan]);
                else urun[alan] = req.body[alan];
            }
        }

        if (!metin(urun.kod) || !metin(urun.ad)) {
            return res.status(400).json({ basarili: false, mesaj: "Ürün kodu ve ürün adı zorunludur." });
        }

        await urun.save();
        if (oncekiAktif !== false && urun.aktif === false) await pazaryeriUrunPasifBildir(tenantId(req), urun._id);

        res.json({
            basarili: true,
            urun
        });
    } catch (error) {
        next(error);
    }
}

async function topluAktar(req, res, next) {
    try {
        const satirlar = Array.isArray(req.body?.urunler) ? req.body.urunler : [];
        if (!satirlar.length) return res.status(400).json({ basarili: false, mesaj: "Aktarılacak ürün satırı bulunamadı." });
        if (satirlar.length > 2000) return res.status(400).json({ basarili: false, mesaj: "Tek seferde en fazla 2000 ürün aktarılabilir." });

        const tId = tenantId(req);
        const mevcutlar = await Urun.find({ tenantId: tId });
        const stokAktarilacak = satirlar.some(x => x?.stokMiktari !== undefined && x?.stokMiktari !== "");
        let depolar = await Depo.find({ tenantId: tId }).sort({ aktif: -1, createdAt: 1 });
        if (stokAktarilacak && !depolar.some(x => x.aktif !== false)) {
            let anaDepo = depolar.find(x => metin(x.kod).toUpperCase() === "ANA");
            if (anaDepo) { anaDepo.aktif = true; await anaDepo.save(); }
            else anaDepo = await Depo.create({ tenantId: tId, kod: "ANA", ad: "Ana Depo", aktif: true });
            depolar = [anaDepo, ...depolar.filter(x => String(x._id) !== String(anaDepo._id))];
        }
        const aktifDepolar = depolar.filter(x => x.aktif !== false);
        const depoMap = new Map(aktifDepolar.map(x => [metin(x.kod).toUpperCase(), x]));
        const varsayilanDepo = aktifDepolar[0] || null;
        const kodMap = new Map(mevcutlar.map(x => [metin(x.kod).toUpperCase(), x]));
        const barkodMap = new Map(mevcutlar.filter(x => metin(x.barkod)).map(x => [metin(x.barkod), x]));
        const sonuc = { eklenen: 0, guncellenen: 0, stokGuncellenen: 0, atlanan: 0, hatalar: [] };

        for (let index = 0; index < satirlar.length; index++) {
            try {
                const kaynak = satirlar[index] || {};
                const kod = metin(kaynak.kod).toUpperCase();
                const barkod = metin(kaynak.barkod);
                const ad = metin(kaynak.ad);
                if (!kod || !ad) throw Object.assign(new Error("Ürün kodu ve ürün adı zorunludur."), { status: 400 });
                const stokVar = kaynak.stokMiktari !== undefined && kaynak.stokMiktari !== "";
                const stokMiktari = stokVar ? Number(kaynak.stokMiktari) : null;
                if (stokVar && (!Number.isFinite(stokMiktari) || stokMiktari < 0)) throw Object.assign(new Error("Stok miktarı sıfır veya daha büyük olmalıdır."), { status: 400 });
                const depoKodu = metin(kaynak.depoKodu).toUpperCase();
                const depo = stokVar ? (depoKodu ? depoMap.get(depoKodu) : varsayilanDepo) : null;
                if (stokVar && !depo) throw Object.assign(new Error(depoKodu ? `Depo bulunamadı: ${depoKodu}` : "Stok aktarımı için aktif depo bulunamadı."), { status: 400 });

                const kodEslesmesi = kodMap.get(kod);
                const barkodEslesmesi = barkod ? barkodMap.get(barkod) : null;
                if (kodEslesmesi && barkodEslesmesi && String(kodEslesmesi._id) !== String(barkodEslesmesi._id)) {
                    throw Object.assign(new Error("Ürün kodu ve barkod farklı ürünlerle eşleşiyor."), { status: 409 });
                }

                const urun = kodEslesmesi || barkodEslesmesi || new Urun({ tenantId: tId });
                const yeni = urun.isNew;
                const veri = Object.fromEntries(TOPLU_ALANLAR.filter(alan => kaynak[alan] !== undefined && kaynak[alan] !== "").map(alan => [alan, kaynak[alan]]));
                veri.kod = kod;
                veri.ad = ad;
                if (barkod) veri.barkod = barkod;
                sayilariDogrula(veri);

                for (const [alan, value] of Object.entries(veri)) {
                    if (alan === "gorsel") urun[alan] = gorselDogrula(value);
                    else if (alan === "ekGorseller") urun[alan] = (Array.isArray(value) ? value : []).filter(Boolean).map(gorselDogrula).slice(0, 2);
                    else if (alan === "paraBirimi") urun[alan] = paraBirimiDogrula(value);
                    else if (SAYISAL_ALANLAR.includes(alan)) urun[alan] = Number(value);
                    else if (alan === "uyumluluk") urun[alan] = Array.isArray(value) ? value.map(metin).filter(Boolean) : metin(value).split(",").map(metin).filter(Boolean);
                    else urun[alan] = value;
                }

                await urun.save();
                if (stokVar) {
                    const mevcutStok = await Stok.findOne({ tenantId: tId, urunId: urun._id, depoId: depo._id });
                    const oncekiMiktar = Number(mevcutStok?.miktar || 0), fark = stokMiktari - oncekiMiktar;
                    await Stok.findOneAndUpdate(
                        { tenantId: tId, urunId: urun._id, depoId: depo._id },
                        { $set: { miktar: stokMiktari, maliyet: Number(urun.alisFiyati || 0), sonHareketTarihi: new Date() } },
                        { new: true, upsert: true, setDefaultsOnInsert: true }
                    );
                    if (fark) await StokHareket.create({
                        tenantId: tId, urunId: urun._id, depoId: depo._id,
                        tip: fark > 0 ? "SAYIM_ARTI" : "SAYIM_EKSI", miktar: Math.abs(fark),
                        tarih: new Date(), birimMaliyet: Number(urun.alisFiyati || 0), maliyetDogrulandi: Number(urun.alisFiyati || 0) > 0, maliyetKaynagi: "URUN_EXCEL", kaynak: "URUN_EXCEL",
                        aciklama: "Excel ürün aktarımı stok güncellemesi",
                        kullaniciId: req.kullanici?._id || req.user?._id || null
                    });
                    sonuc.stokGuncellenen++;
                }
                kodMap.set(metin(urun.kod).toUpperCase(), urun);
                if (metin(urun.barkod)) barkodMap.set(metin(urun.barkod), urun);
                if (yeni) sonuc.eklenen++; else sonuc.guncellenen++;
            } catch (error) {
                sonuc.atlanan++;
                sonuc.hatalar.push({ satir: index + 2, mesaj: error.code === 11000 ? "Ürün kodu veya barkod zaten kullanılıyor." : error.message });
            }
        }

        res.json({ basarili: true, mesaj: `${sonuc.eklenen} ürün eklendi, ${sonuc.guncellenen} ürün güncellendi, ${sonuc.stokGuncellenen} stok kaydı işlendi, ${sonuc.atlanan} satır atlandı.`, varsayilanDepo: varsayilanDepo ? { kod: varsayilanDepo.kod, ad: varsayilanDepo.ad } : null, ...sonuc });
    } catch (error) { next(error); }
}

module.exports = {
    kategorileriListele,
    kategoriOlustur,
    kategoriSil,
    listele,
    detay,
    olustur,
    hizliSatisUrunuOlustur,
    guncelle,
    topluAktar,
    ozelFiyatlariListele,
    ozelFiyatOlustur,
    ozelFiyatGuncelle,
    ozelFiyatSil
};
