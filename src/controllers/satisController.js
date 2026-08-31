const mongoose = require("mongoose");

const Satis = require("../models/Satis");
const Urun = require("../models/Urun");
const Depo = require("../models/Depo");
const Stok = require("../models/Stok");
const StokHareket = require("../models/StokHareket");
const Musteri = require("../models/Musteri");
const Kasa = require("../models/Kasa");
const Banka = require("../models/Banka");
const ParaHareket = require("../models/ParaHareket");
const CariHareket = require("../models/CariHareket");
const SatisIade = require("../models/SatisIade");
const Siparis = require("../models/Siparis");
const Teklif = require("../models/Teklif");
const SahaGun = require("../models/SahaGun");
const CekSenetPortfoy = require("../models/CekSenetPortfoy");
const Tedarikci = require("../models/Tedarikci");
const { etkinYetkiler } = require("../middleware/yetkiKontrol");
const { tarihAraligi } = require("../services/profesyonelRaporServisi");

function tenantObjectId(req) {
    return new mongoose.Types.ObjectId(String(req.tenantId));
}

function islemKullaniciId(req) {
    return req.kullanici?._id || req.kullanici?.kullaniciId || req.user?._id || req.user?.kullaniciId || null;
}

function yonetici(req) {
    return ["OWNER", "ADMIN"].includes(String(req.currentUser?.rol || req.kullanici?.rol || req.user?.rol || "").toUpperCase());
}

function sahiplik(req) {
    return yonetici(req) ? {} : { kullaniciId: islemKullaniciId(req) };
}

function hesaplaKalem(kalem) {
    const miktar = Number(kalem.miktar || 0);
    const birimFiyat = Number(kalem.birimFiyat || 0);
    const kdv = Number(kalem.kdv ?? 20);
    const iskonto = Number(kalem.iskonto || 0);

    const brut = miktar * birimFiyat;
    const iskontoTutari = brut * (iskonto / 100);
    const araToplam = brut - iskontoTutari;
    const kdvTutari = araToplam * (kdv / 100);
    const toplam = araToplam + kdvTutari;

    return {
        ...kalem,
        miktar,
        birimFiyat,
        kdv,
        iskonto,
        araToplam,
        kdvTutari,
        toplam
    };
}

function kalemGecerliMi(kalem) {
    return Number.isFinite(kalem.miktar) && kalem.miktar > 0 &&
        Number.isFinite(kalem.birimFiyat) && kalem.birimFiyat >= 0 &&
        Number.isFinite(kalem.kdv) && kalem.kdv >= 0 && kalem.kdv <= 100 &&
        Number.isFinite(kalem.iskonto) && kalem.iskonto >= 0 && kalem.iskonto <= 100;
}

function istanbulDonemSinirlari(simdi = new Date()) {
    const parcalar = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(simdi).filter(x => x.type !== "literal").map(x => [x.type, x.value]));
    const gun = `${parcalar.year}-${parcalar.month}-${parcalar.day}`;
    const bugun = new Date(`${gun}T00:00:00+03:00`);
    const ay = Number(parcalar.month), yil = Number(parcalar.year);
    const sonrakiAy = ay === 12 ? `${yil + 1}-01` : `${yil}-${String(ay + 1).padStart(2, "0")}`;
    return {
        gun,
        bugun,
        yarin: new Date(bugun.getTime() + 86400000),
        ayBasi: new Date(`${parcalar.year}-${parcalar.month}-01T00:00:00+03:00`),
        sonrakiAyBasi: new Date(`${sonrakiAy}-01T00:00:00+03:00`)
    };
}

async function listele(req, res, next) {
    try {
        const satislar = await Satis.find({
            tenantId: tenantObjectId(req), ...sahiplik(req)
        })
            .populate("musteriId", "kod unvan adSoyad")
            .populate("depoId", "kod ad")
            .populate("kalemler.urunId", "kod ad birim")
            .populate("kullaniciId", "adSoyad email")
            .sort({ tarih: -1, createdAt: -1 })
            .lean();

        res.json({
            basarili: true,
            toplam: satislar.length,
            satislar
        });
    } catch (error) {
        next(error);
    }
}

async function panel(req, res, next) {
    try {
        const tenantId = tenantObjectId(req);
        const { bugun, yarin } = istanbulDonemSinirlari();
        const seciliDonem = tarihAraligi(req.query || {});
        const sorguBaslangic = new Date(Math.min(seciliDonem.baslangic.getTime(), bugun.getTime()));
        const sorguBitis = new Date(Math.max(seciliDonem.bitis.getTime(), yarin.getTime() - 1));
        const izinler = new Set(etkinYetkiler(req.currentUser || {}));
        const tedarikciOdemesiGorur = izinler.has("supplier.read");
        const finansKosullari = [{ tarafTipi: "MUSTERI", tip: "TAHSILAT" }];
        if (tedarikciOdemesiGorur) finansKosullari.push({ tarafTipi: "TEDARIKCI", tip: "ODEME" });
        const [tumSatislar, acikSiparis, aktifTeklif, iadeler, tumFinansHareketleri] = await Promise.all([
            Satis.find({ tenantId, tarih: { $gte: sorguBaslangic, $lte: sorguBitis }, ...sahiplik(req) })
                .populate("musteriId", "kod unvan adSoyad bakiye")
                .populate("kalemler.urunId", "kod ad birim alisFiyati")
                .populate("kullaniciId", "adSoyad email")
                .sort({ tarih: -1, createdAt: -1 }).lean(),
            Siparis.countDocuments({ tenantId, durum: { $nin: ["TAMAMLANDI", "IPTAL"] }, ...sahiplik(req) }),
            Teklif.countDocuments({ tenantId, durum: { $nin: ["ONAYLANDI", "REDDEDILDI", "IPTAL", "SURESI_DOLDU", "SIPARISE_DONUSTU"] }, ...sahiplik(req) }),
            SatisIade.find({ tenantId, tarih: { $gte: seciliDonem.baslangic, $lte: seciliDonem.bitis }, ...sahiplik(req) }).select("genelToplam tarih").lean(),
            CariHareket.find({ tenantId, tarih: { $gte: sorguBaslangic, $lte: sorguBitis }, durum: { $ne: "IPTAL" }, $or: finansKosullari, ...sahiplik(req) })
                .select("tarafTipi tarafId tip tutar odemeYontemi aciklama belgeNo kaynak tarih kullaniciId")
                .populate("kullaniciId", "adSoyad email").sort({ tarih: -1, createdAt: -1 }).lean()
        ]);
        const satislar = tumSatislar.filter(x => new Date(x.tarih) >= seciliDonem.baslangic && new Date(x.tarih) <= seciliDonem.bitis);
        const bugunSatis = tumSatislar.filter(x => new Date(x.tarih) >= bugun && new Date(x.tarih) < yarin);
        const toplam = liste => liste.reduce((n, x) => n + Number(x.genelToplam || 0), 0);
        const hareketToplami = liste => liste.reduce((n, x) => n + Number(x.tutar || 0), 0);
        const seciliFinans = tumFinansHareketleri.filter(x => new Date(x.tarih) >= seciliDonem.baslangic && new Date(x.tarih) <= seciliDonem.bitis);
        const ayTahsilatlar = seciliFinans.filter(x => x.tarafTipi === "MUSTERI" && x.tip === "TAHSILAT");
        const ayOdemeler = seciliFinans.filter(x => x.tarafTipi === "TEDARIKCI" && x.tip === "ODEME");
        const bugunFinans = tumFinansHareketleri.filter(x => new Date(x.tarih) >= bugun && new Date(x.tarih) < yarin);
        const acikBakiye = satislar.reduce((n, x) => n + Number(x.kalanTutar || 0), 0);
        const iadeToplam = toplam(iadeler);
        const urunMap = new Map(), temsilciMap = new Map();
        for (const satis of satislar) {
            const temsilci = satis.kullaniciId?.adSoyad || satis.kullaniciId?.email || "Atanmamış";
            const t = temsilciMap.get(temsilci) || { temsilci, belge: 0, ciro: 0, tahsilat: 0 };
            t.belge++; t.ciro += Number(satis.genelToplam || 0); temsilciMap.set(temsilci, t);
            for (const k of satis.kalemler || []) {
                const id = String(k.urunId?._id || k.urunId || "");
                const u = urunMap.get(id) || { urunId: id, kod: k.urunId?.kod || "-", ad: k.urunId?.ad || "Ürün", miktar: 0, ciro: 0, kar: 0 };
                u.miktar += Number(k.miktar || 0); u.ciro += Number(k.toplam || 0);
                u.kar += (Number(k.birimFiyat || 0) - Number(k.urunId?.alisFiyati || 0)) * Number(k.miktar || 0);
                urunMap.set(id, u);
            }
        }
        for (const hareket of ayTahsilatlar) {
            const temsilci = hareket.kullaniciId?.adSoyad || hareket.kullaniciId?.email || "Atanmamış";
            const t = temsilciMap.get(temsilci) || { temsilci, belge: 0, ciro: 0, tahsilat: 0 };
            t.tahsilat += Number(hareket.tutar || 0); temsilciMap.set(temsilci, t);
        }
        const musteriIds = [...new Set(tumFinansHareketleri.filter(x => x.tarafTipi === "MUSTERI").map(x => String(x.tarafId)))];
        const tedarikciIds = [...new Set(tumFinansHareketleri.filter(x => x.tarafTipi === "TEDARIKCI").map(x => String(x.tarafId)))];
        const [musteriler, tedarikciler] = await Promise.all([
            musteriIds.length ? Musteri.find({ _id: { $in: musteriIds }, tenantId }).select("kod unvan adSoyad").lean() : [],
            tedarikciIds.length ? Tedarikci.find({ _id: { $in: tedarikciIds }, tenantId }).select("kod unvan adSoyad").lean() : []
        ]);
        const tarafMap = new Map([...musteriler, ...tedarikciler].map(x => [String(x._id), x]));
        const finansSatirinaCevir = x => ({
            _id: x._id, tur: x.tip, tarafTipi: x.tarafTipi, taraf: tarafMap.get(String(x.tarafId)) || null,
            tutar: Number(x.tutar || 0), odemeYontemi: x.odemeYontemi, aciklama: x.aciklama,
            belgeNo: x.belgeNo, kaynak: x.kaynak, tarih: x.tarih, kullanici: x.kullaniciId || null
        });
        const bugunFinansSatirlari = bugunFinans.map(finansSatirinaCevir);
        const seciliFinansSatirlari = seciliFinans.map(finansSatirinaCevir);
        const seciliOzet = { donem: { kod: seciliDonem.kod, baslangic: seciliDonem.baslangicYazi, bitis: seciliDonem.bitisYazi }, ciro: toplam(satislar), tahsilat: hareketToplami(ayTahsilatlar), odeme: hareketToplami(ayOdemeler), belge: satislar.length, iade: iadeToplam, netCiro: toplam(satislar) - iadeToplam, finansHareketleri: seciliFinansSatirlari };
        res.json({ basarili: true, panel: {
            bugun: { ciro: toplam(bugunSatis), tahsilat: hareketToplami(bugunFinans.filter(x => x.tarafTipi === "MUSTERI")), odeme: hareketToplami(bugunFinans.filter(x => x.tarafTipi === "TEDARIKCI")), belge: bugunSatis.length, finansHareketleri: bugunFinansSatirlari },
            secili: seciliOzet, ay: seciliOzet,
            acikBakiye, acikSiparis, aktifTeklif,
            sonSatislar: satislar.slice(0, 12),
            enCokSatanlar: [...urunMap.values()].sort((a, b) => b.ciro - a.ciro).slice(0, 8),
            temsilciler: [...temsilciMap.values()].sort((a, b) => b.ciro - a.ciro)
        }});
    } catch (error) { next(error); }
}

async function iadeleriListele(req, res, next) {
    try {
        const iadeler = await SatisIade.find({ tenantId: tenantObjectId(req), ...sahiplik(req) })
            .populate("musteriId", "kod unvan adSoyad email telefon whatsapp")
            .populate("depoId", "kod ad")
            .populate("kalemler.urunId", "kod ad birim")
            .sort({ tarih: -1, createdAt: -1 }).lean();
        res.json({ basarili: true, toplam: iadeler.length, iadeler });
    } catch (error) { next(error); }
}

async function detay(req, res, next) {
    try {
        const satis = await Satis.findOne({
            _id: req.params.id,
            tenantId: tenantObjectId(req), ...sahiplik(req)
        })
            .populate("musteriId")
            .populate("depoId")
            .populate("kalemler.urunId")
            .lean();

        if (!satis) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Satış kaydı bulunamadı."
            });
        }

        res.json({
            basarili: true,
            satis
        });
    } catch (error) {
        next(error);
    }
}

async function olustur(req, res, next) {
    const rollback = { tenantId: null, satisId: null, stoklar: [], musteriId: null, musteriBakiyeArtisi: 0, finansModeli: null, finansHesapId: null, finansArtisi: 0 };
    try {
        const tenantId = tenantObjectId(req);
        rollback.tenantId = tenantId;
        const body = req.body || {};
        const perakende = body.perakende === true || String(body.satisKanali || "").toUpperCase() === "PERAKENDE";
        const sahaSatisi = String(body.satisKanali || "").toUpperCase() === "SAHA";
        let sahaGun = null;
        if (sahaSatisi) {
            const gun = /^\d{4}-\d{2}-\d{2}$/.test(String(body.sahaGun || "")) ? String(body.sahaGun) : new Date().toISOString().slice(0, 10);
            sahaGun = await SahaGun.findOne({ tenantId, kullaniciId: islemKullaniciId(req), gun, durum: "AKTIF" });
            if (!sahaGun) return res.status(409).json({ basarili: false, mesaj: "Saha satışı için personele ait aktif saha günü bulunmalıdır." });
        }

        if (!body.belgeNo) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Belge numarası zorunludur."
            });
        }

        if ((!body.musteriId && !perakende) || !body.depoId) {
            return res.status(400).json({
                basarili: false,
                mesaj: perakende ? "Depo zorunludur." : "Müşteri ve depo zorunludur."
            });
        }

        if (perakende && !["NAKIT", "KART", "BANKA"].includes(String(body.odemeTipi || "").toUpperCase())) {
            return res.status(400).json({ basarili: false, mesaj: "Perakende satış nakit, kredi kartı veya banka ödemesiyle tamamlanmalıdır." });
        }

        if (!Array.isArray(body.kalemler) || body.kalemler.length === 0) {
            return res.status(400).json({
                basarili: false,
                mesaj: "En az bir satış kalemi bulunmalıdır."
            });
        }

        let musteri = null;
        if (perakende) {
            musteri = await Musteri.findOne({ tenantId, kod: "PERAKENDE" });
            if (!musteri) {
                try {
                    musteri = await Musteri.create({ tenantId, kod: "PERAKENDE", unvan: "Perakende Müşteri", grup: "Perakende", bakiye: 0, aktif: true, notlar: "Perakende satışlarda sistem tarafından kullanılan kasa müşterisi.", olusturanKullaniciId: islemKullaniciId(req) });
                } catch (error) {
                    if (error?.code !== 11000) throw error;
                    musteri = await Musteri.findOne({ tenantId, kod: "PERAKENDE" });
                }
            }
        } else {
            musteri = await Musteri.findOne({ _id: body.musteriId, tenantId, ...(yonetici(req) ? {} : { $or: [{ temsilciId: islemKullaniciId(req) }, { olusturanKullaniciId: islemKullaniciId(req) }] }) });
        }

        if (!musteri) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Müşteri bulunamadı."
            });
        }

        const depo = await Depo.findOne({
            _id: body.depoId,
            tenantId
        });

        if (!depo) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Depo bulunamadı."
            });
        }

        const belgeNo = String(body.belgeNo)
            .trim()
            .toUpperCase();

        const mevcut = await Satis.findOne({
            tenantId,
            belgeNo
        });

        if (mevcut) {
            return res.status(409).json({
                basarili: false,
                mesaj: "Bu belge numarası zaten kullanılıyor."
            });
        }

        const kalemler = [];
        let araToplam = 0;
        let toplamKdv = 0;
        let genelToplam = 0;

        // Önce bütün stokları doğrula.
        const stokKontrolleri = new Map();

        for (const item of body.kalemler) {

            const urun = await Urun.findOne({
                _id: item.urunId,
                tenantId
            });

            if (!urun) {
                return res.status(404).json({
                    basarili: false,
                    mesaj: `Ürün bulunamadı: ${item.urunId}`
                });
            }

            const miktar = Number(item.miktar || 0);
            const kalem = hesaplaKalem({
                urunId: urun._id,
                miktar,
                birimFiyat:
                    item.birimFiyat ??
                    urun.satisFiyati ??
                    0,
                kdv: item.kdv ?? urun.kdv ?? 20,
                iskonto: item.iskonto ?? urun.iskonto ?? 0
            });

            if (!kalemGecerliMi(kalem)) {
                return res.status(400).json({ basarili: false, mesaj: `Geçersiz satış kalemi: ${urun.kod}` });
            }

            const stokAnahtari = String(urun._id);
            const mevcutKontrol = stokKontrolleri.get(stokAnahtari);
            const stok = mevcutKontrol?.stok || await Stok.findOne({ tenantId, urunId: urun._id, depoId: depo._id });
            const toplamIhtiyac = Number(mevcutKontrol?.miktar || 0) + miktar;
            if (!stok || Number(stok.miktar || 0) < toplamIhtiyac) {
                return res.status(409).json({ basarili: false, mesaj: `Yetersiz stok: ${urun.kod}` });
            }

            kalemler.push(kalem);
            stokKontrolleri.set(stokAnahtari, { stok, miktar: toplamIhtiyac });

            araToplam += kalem.araToplam;
            toplamKdv += kalem.kdvTutari;
            genelToplam += kalem.toplam;
        }

        const odemeTipi = String(body.odemeTipi || "ACIK_HESAP").toUpperCase();
        if (!["ACIK_HESAP", "NAKIT", "KART", "BANKA", "CEK", "SENET"].includes(odemeTipi)) {
            return res.status(400).json({ basarili: false, mesaj: "Ödeme yöntemi açık hesap, nakit, kredi kartı, IBAN, çek veya senet olmalıdır." });
        }
        const odemeDurumu = odemeTipi === "ACIK_HESAP" ? "ACIK" : "ODENDI";
        const odenenTutar = odemeTipi === "ACIK_HESAP" ? 0 : genelToplam;

        if (
            odenenTutar < 0 ||
            odenenTutar > genelToplam
        ) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Ödenen tutar satış toplamını aşamaz."
            });
        }

        if (
            odemeDurumu === "ODENDI" &&
            odenenTutar !== genelToplam
        ) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Ödenmiş satışta ödeme tutarı toplamla aynı olmalıdır."
            });
        }

        const kalanTutar =
            genelToplam - odenenTutar;

        let hesapTipi =
            body.hesapTipi || null;

        let hesapId =
            body.hesapId || null;

        const finansOdemeTipleri = [
            "NAKIT",
            "KART",
            "BANKA"
        ];

        if (
            odenenTutar > 0 &&
            finansOdemeTipleri.includes(odemeTipi) &&
            !hesapId
        ) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Ödeme hesabı seçilmelidir."
            });
        }

        if (
            odemeTipi === "NAKIT" &&
            hesapTipi !== "KASA"
        ) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Nakit satış için kasa hesabı seçilmelidir."
            });
        }

        if (sahaSatisi && odemeTipi === "NAKIT" && String(hesapId || "") !== String(sahaGun.sahaKasaId || "")) {
            return res.status(403).json({ basarili: false, mesaj: "Saha nakit satışı yalnızca personelin saha kasasına işlenebilir." });
        }

        if (
            ["KART", "BANKA"].includes(odemeTipi) &&
            hesapTipi !== "BANKA"
        ) {
            return res.status(400).json({
                basarili: false,
                mesaj: "Kart veya banka ödemesi için banka hesabı seçilmelidir."
            });
        }

        let finansHesabi = null;

        if (
            odenenTutar > 0 &&
            hesapId &&
            hesapTipi
        ) {

            if (hesapTipi === "KASA") {

                finansHesabi =
                    await Kasa.findOne({
                        _id: hesapId,
                        tenantId,
                        aktif: { $ne: false }
                    });

            } else {

                finansHesabi =
                    await Banka.findOne({
                        _id: hesapId,
                        tenantId,
                        aktif: { $ne: false }
                    });
            }

            if (!finansHesabi) {
                return res.status(404).json({
                    basarili: false,
                    mesaj: "Ödeme hesabı bulunamadı."
                });
            }
        }

        const satis = await Satis.create({
            tenantId,
            belgeNo,
            tarih: body.tarih || new Date(),
            musteriId: musteri._id,
            depoId: depo._id,
            kalemler,
            araToplam,
            toplamKdv,
            genelToplam,
            odemeDurumu,
            odemeTipi,
            odenenTutar,
            kalanTutar,
            hesapTipi,
            hesapId,
            satisKanali: perakende ? "PERAKENDE" : (sahaSatisi ? "SAHA" : "NORMAL"),
            notlar: body.notlar || "",
            kullaniciId: islemKullaniciId(req)
        });
        rollback.satisId = satis._id;

        // SATIŞ -> STOK ÇIKIŞI
        for (const item of stokKontrolleri.values()) {
            const stok = await Stok.findOneAndUpdate(
                { _id: item.stok._id, tenantId, miktar: { $gte: item.miktar } },
                { $inc: { miktar: -item.miktar }, $set: { sonHareketTarihi: new Date() } },
                { new: true }
            );
            if (!stok) throw Object.assign(new Error("Satış sırasında stok başka bir işlem tarafından kullanıldı."), { status: 409 });
            rollback.stoklar.push({ stokId: stok._id, miktar: item.miktar });

            await StokHareket.create({
                tenantId,
                urunId: stok.urunId,
                depoId: depo._id,
                tip: "CIKIS",
                miktar: item.miktar,
                tarih: satis.tarih,
                birimMaliyet: stok.maliyet || 0,
                maliyetDogrulandi: Number(stok.maliyet || 0) > 0,
                maliyetKaynagi: "STOK_KARTI",
                kaynak: "SATIS",
                kaynakId: satis._id,
                islemAnahtari: `SATIS:${satis._id}:STOK:${stok.urunId}:${depo._id}`,
                aciklama: `Satış ${belgeNo}`,
                kullaniciId: islemKullaniciId(req)
            });
        }

        // ==================================================
        // SATIŞ ÖDEME BALANTISI
        // ==================================================

        const oncekiBakiye = Number(musteri.bakiye || 0);
        musteri.bakiye += kalanTutar;
        await musteri.save();
        rollback.musteriId = musteri._id;
        rollback.musteriBakiyeArtisi = kalanTutar;

        await CariHareket.create({
                tenantId,
                tarafTipi: "MUSTERI",
                tarafId: musteri._id,
                tip: "BORC",
                tutar: genelToplam,
                aciklama: `Satış ${belgeNo}`,
                kaynak: "SATIS",
                kaynakId: satis._id,
                islemAnahtari: `SATIS:${satis._id}:BORC`,
                bakiyeDegisimi: genelToplam,
                oncekiBakiye,
                sonrakiBakiye: oncekiBakiye + genelToplam,
                tarih: body.tarih || new Date(),
                kullaniciId: islemKullaniciId(req)
            });

        if (odenenTutar > 0) await CariHareket.create({
            tenantId, tarafTipi: "MUSTERI", tarafId: musteri._id, tip: "TAHSILAT", tutar: odenenTutar,
            aciklama: `Satış tahsilatı ${belgeNo}`, kaynak: "SATIS_TAHSILAT", kaynakId: satis._id,
            islemAnahtari: `SATIS:${satis._id}:TAHSILAT`,
            odemeYontemi: odemeTipi === "KART" ? "KREDI_KARTI" : odemeTipi === "BANKA" ? "IBAN" : odemeTipi,
            bakiyeDegisimi: -odenenTutar, oncekiBakiye: oncekiBakiye + genelToplam, sonrakiBakiye: oncekiBakiye + kalanTutar,
            tarih: body.tarih || new Date(), belgeNo, kullaniciId: islemKullaniciId(req)
        });

        if (
            odenenTutar > 0 &&
            finansHesabi
        ) {

            finansHesabi.bakiye +=
                odenenTutar;

            await finansHesabi.save();
            rollback.finansModeli = hesapTipi === "KASA" ? Kasa : Banka;
            rollback.finansHesapId = finansHesabi._id;
            rollback.finansArtisi = odenenTutar;

            await ParaHareket.create({

                tenantId,

                hesapTipi,

                hesapId:
                    finansHesabi._id,

                tip:
                    "GIRIS",

                tutar:
                    odenenTutar,

                paraBirimi:
                    finansHesabi.paraBirimi || "TRY",

                aciklama:
                    `Satış ${belgeNo}`,

                kaynak:
                    "SATIS",

                kaynakId:
                    satis._id,

                tarih:
                    body.tarih || new Date(),

                kullaniciId: islemKullaniciId(req)
            });
        }

        if (["CEK", "SENET"].includes(odemeTipi)) await CekSenetPortfoy.create({
            tenantId, tur: odemeTipi, hareketTipi: "GIRIS", musteriId: musteri._id, tutar: odenenTutar,
            belgeNo: String(body.evrakNo || belgeNo).trim(), vadeTarihi: body.vadeTarihi || null,
            banka: String(body.banka || "").trim(), kesideci: String(body.kesideci || "").trim(),
            kaynak: "SATIS", kaynakId: satis._id, aciklama: `Saha/satış tahsilatı ${belgeNo}`, kullaniciId: islemKullaniciId(req)
        });

        res.status(201).json({
            basarili: true,
            mesaj: "Satış kaydedildi. Stok güncellendi.",
            satis,
            musteriBakiye: musteri.bakiye
        });
    } catch (error) {
        if (rollback.satisId && rollback.tenantId) {
            await CekSenetPortfoy.deleteMany({ tenantId: rollback.tenantId, kaynak: "SATIS", kaynakId: rollback.satisId }).catch(() => {});
            await ParaHareket.deleteMany({ tenantId: rollback.tenantId, kaynak: "SATIS", kaynakId: rollback.satisId }).catch(() => {});
            await CariHareket.deleteMany({ tenantId: rollback.tenantId, kaynakId: rollback.satisId, kaynak: { $in: ["SATIS", "SATIS_TAHSILAT"] } }).catch(() => {});
            await StokHareket.deleteMany({ tenantId: rollback.tenantId, kaynak: "SATIS", kaynakId: rollback.satisId }).catch(() => {});
            if (rollback.finansModeli && rollback.finansHesapId && rollback.finansArtisi) await rollback.finansModeli.updateOne({ _id: rollback.finansHesapId, tenantId: rollback.tenantId }, { $inc: { bakiye: -rollback.finansArtisi } }).catch(() => {});
            if (rollback.musteriId && rollback.musteriBakiyeArtisi) await Musteri.updateOne({ _id: rollback.musteriId, tenantId: rollback.tenantId }, { $inc: { bakiye: -rollback.musteriBakiyeArtisi } }).catch(() => {});
            for (const stok of rollback.stoklar) await Stok.updateOne({ _id: stok.stokId, tenantId: rollback.tenantId }, { $inc: { miktar: stok.miktar } }).catch(() => {});
            await Satis.deleteOne({ _id: rollback.satisId, tenantId: rollback.tenantId }).catch(() => {});
        }
        next(error);
    }
}

async function iadeAl(req, res, next) {
    const rollback = { tenantId: null, iadeId: null, stoklar: [], musteriId: null, musteriDegisimi: 0, finansModeli: null, finansHesapId: null, finansAzalisi: 0 };
    try {
        const tenantId = tenantObjectId(req);
        rollback.tenantId = tenantId;
        const body = req.body || {};
        if (!body.belgeNo || !body.musteriId || !body.depoId) return res.status(400).json({ basarili: false, mesaj: "İade belge no, müşteri ve depo zorunludur." });
        if (!Array.isArray(body.kalemler) || !body.kalemler.length) return res.status(400).json({ basarili: false, mesaj: "En az bir iade kalemi gerekir." });
        const [musteri, depo] = await Promise.all([Musteri.findOne({ _id: body.musteriId, tenantId, ...(yonetici(req) ? {} : { $or: [{ temsilciId: islemKullaniciId(req) }, { olusturanKullaniciId: islemKullaniciId(req) }] }) }), Depo.findOne({ _id: body.depoId, tenantId })]);
        if (!musteri || !depo) return res.status(404).json({ basarili: false, mesaj: "Müşteri veya depo bulunamadı." });
        const orijinalSatis = mongoose.Types.ObjectId.isValid(String(body.orijinalSatisId || ""))
            ? await Satis.findOne({ _id: body.orijinalSatisId, tenantId, musteriId: musteri._id, depoId: depo._id, ...sahiplik(req) })
            : null;
        if (body.orijinalSatisId && !orijinalSatis) return res.status(404).json({ basarili: false, mesaj: "İade edilecek satış bulunamadı veya bu satışa erişiminiz yok." });
        const kalemler = []; let genelToplam = 0; const iadeUrunleri = new Set();
        for (const item of body.kalemler) {
            const urun = await Urun.findOne({ _id: item.urunId, tenantId });
            const miktar = Number(item.miktar || 0), birimFiyat = Number(item.birimFiyat ?? urun?.satisFiyati ?? 0), kdv = Number(item.kdv ?? urun?.kdv ?? 20), iskonto = Number(item.iskonto ?? urun?.iskonto ?? 0);
            const kontrolKalemi = { miktar, birimFiyat, kdv, iskonto };
            if (!urun || !kalemGecerliMi(kontrolKalemi)) return res.status(400).json({ basarili: false, mesaj: "İade kalemi geçersiz." });
            const urunAnahtari = String(urun._id);
            if (iadeUrunleri.has(urunAnahtari)) return res.status(400).json({ basarili: false, mesaj: "Aynı ürün iade belgesinde yalnızca bir satırda yer almalıdır." });
            iadeUrunleri.add(urunAnahtari);
            const ara = miktar * birimFiyat * (1 - iskonto / 100); const toplam = ara * (1 + kdv / 100);
            kalemler.push({ urunId: urun._id, miktar, birimFiyat, kdv, iskonto, toplam }); genelToplam += toplam;
        }
        if (orijinalSatis) {
            const oncekiIadeler = await SatisIade.find({ tenantId, orijinalSatisId: orijinalSatis._id }).select("kalemler").lean();
            for (const kalem of kalemler) {
                const satilan = orijinalSatis.kalemler.filter(x => String(x.urunId) === String(kalem.urunId)).reduce((n, x) => n + Number(x.miktar || 0), 0);
                const iadeEdilen = oncekiIadeler.flatMap(x => x.kalemler || []).filter(x => String(x.urunId) === String(kalem.urunId)).reduce((n, x) => n + Number(x.miktar || 0), 0);
                if (iadeEdilen + kalem.miktar > satilan) return res.status(409).json({ basarili: false, mesaj: "İade miktarı satıştaki kalan miktarı aşamaz." });
            }
        }
        const odemeTipi = String(orijinalSatis?.odemeTipi || body.odemeTipi || "ACIK_HESAP").toUpperCase();
        if (!["ACIK_HESAP", "NAKIT", "KART", "BANKA", "CEK", "SENET", "DIGER"].includes(odemeTipi)) return res.status(400).json({ basarili: false, mesaj: "İade ödeme yöntemi geçersiz." });
        const hesapTipi = orijinalSatis?.hesapTipi || body.hesapTipi || null;
        const hesapId = orijinalSatis?.hesapId || body.hesapId || null;
        let finansHesabi = null;
        if (["NAKIT", "KART", "BANKA"].includes(odemeTipi)) {
            const Model = hesapTipi === "KASA" ? Kasa : hesapTipi === "BANKA" ? Banka : null;
            finansHesabi = Model && await Model.findOne({ _id: hesapId, tenantId, aktif: { $ne: false }, bakiye: { $gte: genelToplam } });
            if (!finansHesabi) return res.status(409).json({ basarili: false, mesaj: "İade ödemesi için satış hesabı bulunamadı veya bakiyesi yetersiz." });
        }
        const satisKanali = orijinalSatis?.satisKanali === "SAHA" || String(body.satisKanali || "").toUpperCase() === "SAHA" ? "SAHA" : "NORMAL";
        const orijinalMaliyetHareketleri = orijinalSatis ? await StokHareket.find({ tenantId, kaynak: "SATIS", kaynakId: orijinalSatis._id, depoId: depo._id }).select("urunId miktar birimMaliyet").lean() : [];
        const iade = await SatisIade.create({ tenantId, belgeNo: String(body.belgeNo).trim().toUpperCase(), tarih: body.tarih || new Date(), musteriId: musteri._id, depoId: depo._id, orijinalSatisId: orijinalSatis?._id || null, kalemler, genelToplam, odemeTipi, hesapTipi, hesapId, satisKanali, aciklama: body.notlar || "Müşteri satış iadesi", kullaniciId: islemKullaniciId(req) });
        rollback.iadeId = iade._id;
        for (const kalem of kalemler) {
            let stok = await Stok.findOne({ tenantId, urunId: kalem.urunId, depoId: depo._id });
            if (!stok) stok = new Stok({ tenantId, urunId: kalem.urunId, depoId: depo._id, miktar: 0, maliyet: 0 });
            const maliyetHareketleri = orijinalMaliyetHareketleri.filter(x => String(x.urunId) === String(kalem.urunId) && Number(x.miktar || 0) > 0 && Number(x.birimMaliyet || 0) > 0);
            const maliyetMiktari = maliyetHareketleri.reduce((n, x) => n + Number(x.miktar || 0), 0);
            const iadeBirimMaliyeti = maliyetMiktari > 0 ? maliyetHareketleri.reduce((n, x) => n + Number(x.miktar) * Number(x.birimMaliyet), 0) / maliyetMiktari : Number(stok.maliyet || 0);
            stok.miktar += kalem.miktar; stok.sonHareketTarihi = new Date(); await stok.save();
            rollback.stoklar.push({ stokId: stok._id, miktar: kalem.miktar });
            await StokHareket.create({ tenantId, urunId: kalem.urunId, depoId: depo._id, tip: "IADE_GIRIS", miktar: kalem.miktar, tarih: iade.tarih, birimMaliyet: iadeBirimMaliyeti, maliyetDogrulandi: maliyetMiktari > 0, maliyetKaynagi: maliyetMiktari > 0 ? "ORIJINAL_SATIS" : "MEVCUT_STOK", kaynak: "SATIS_IADE", kaynakId: iade._id, islemAnahtari: `SATIS_IADE:${iade._id}:STOK:${kalem.urunId}:${depo._id}`, aciklama: `Satış iadesi ${iade.belgeNo}`, kullaniciId: islemKullaniciId(req) });
        }
        const oncekiBakiye = Number(musteri.bakiye || 0);
        const nakdenIade = odemeTipi !== "ACIK_HESAP" && odemeTipi !== "DIGER";
        musteri.bakiye += nakdenIade ? 0 : -genelToplam; await musteri.save();
        rollback.musteriId = musteri._id; rollback.musteriDegisimi = nakdenIade ? 0 : -genelToplam;
        const cariHareket = await CariHareket.create({ tenantId, tarafTipi: "MUSTERI", tarafId: musteri._id, tip: "IADE", tutar: genelToplam, bakiyeDegisimi: -genelToplam, oncekiBakiye, sonrakiBakiye: oncekiBakiye - genelToplam, aciklama: `Satış iadesi ${iade.belgeNo}`, kaynak: "SATIS_IADE", kaynakId: iade._id, islemAnahtari: `SATIS_IADE:${iade._id}:CARI:IADE`, tarih: body.tarih || new Date(), kullaniciId: islemKullaniciId(req) });
        if (nakdenIade) await CariHareket.create({ tenantId, tarafTipi: "MUSTERI", tarafId: musteri._id, tip: "ODEME", tutar: genelToplam, bakiyeDegisimi: genelToplam, oncekiBakiye: oncekiBakiye - genelToplam, sonrakiBakiye: oncekiBakiye, odemeYontemi: odemeTipi === "KART" ? "KREDI_KARTI" : odemeTipi === "BANKA" ? "IBAN" : odemeTipi, aciklama: `Satış iade ödemesi ${iade.belgeNo}`, kaynak: "SATIS_IADE_ODEME", kaynakId: iade._id, islemAnahtari: `SATIS_IADE:${iade._id}:CARI:ODEME`, tarih: body.tarih || new Date(), kullaniciId: islemKullaniciId(req) });
        let paraHareket = null;
        if (finansHesabi) {
            finansHesabi.bakiye -= genelToplam; await finansHesabi.save();
            rollback.finansModeli = hesapTipi === "KASA" ? Kasa : Banka; rollback.finansHesapId = finansHesabi._id; rollback.finansAzalisi = genelToplam;
            paraHareket = await ParaHareket.create({ tenantId, hesapTipi, hesapId: finansHesabi._id, tip: "CIKIS", tutar: genelToplam, paraBirimi: finansHesabi.paraBirimi || "TRY", aciklama: `Satış iadesi ${iade.belgeNo}`, kaynak: "SATIS_IADE", kaynakId: iade._id, belgeNo: iade.belgeNo, tarih: body.tarih || new Date(), kullaniciId: islemKullaniciId(req) });
        }
        if (["CEK", "SENET"].includes(odemeTipi)) await CekSenetPortfoy.create({ tenantId, tur: odemeTipi, hareketTipi: "IADE", musteriId: musteri._id, tutar: genelToplam, belgeNo: iade.belgeNo, durum: "IADE", kaynak: "SATIS_IADE", kaynakId: iade._id, aciklama: `İade edilen ${odemeTipi.toLowerCase()} evrakı`, kullaniciId: islemKullaniciId(req) });
        res.status(201).json({ basarili: true, iade, cariHareket, paraHareket, musteriBakiye: musteri.bakiye });
    } catch (error) {
        if (rollback.iadeId && rollback.tenantId) {
            await CekSenetPortfoy.deleteMany({ tenantId: rollback.tenantId, kaynak: "SATIS_IADE", kaynakId: rollback.iadeId }).catch(() => {});
            await ParaHareket.deleteMany({ tenantId: rollback.tenantId, kaynak: "SATIS_IADE", kaynakId: rollback.iadeId }).catch(() => {});
            await CariHareket.deleteMany({ tenantId: rollback.tenantId, kaynakId: rollback.iadeId, kaynak: { $in: ["SATIS_IADE", "SATIS_IADE_ODEME"] } }).catch(() => {});
            await StokHareket.deleteMany({ tenantId: rollback.tenantId, kaynak: "SATIS_IADE", kaynakId: rollback.iadeId }).catch(() => {});
            if (rollback.finansModeli && rollback.finansHesapId && rollback.finansAzalisi) await rollback.finansModeli.updateOne({ _id: rollback.finansHesapId, tenantId: rollback.tenantId }, { $inc: { bakiye: rollback.finansAzalisi } }).catch(() => {});
            if (rollback.musteriId && rollback.musteriDegisimi) await Musteri.updateOne({ _id: rollback.musteriId, tenantId: rollback.tenantId }, { $inc: { bakiye: -rollback.musteriDegisimi } }).catch(() => {});
            for (const stok of rollback.stoklar) await Stok.updateOne({ _id: stok.stokId, tenantId: rollback.tenantId }, { $inc: { miktar: -stok.miktar } }).catch(() => {});
            await SatisIade.deleteOne({ _id: rollback.iadeId, tenantId: rollback.tenantId }).catch(() => {});
        }
        next(error);
    }
}

async function guncelle(req, res, next) {
    try {
        const tenantId=tenantObjectId(req), body=req.body||{}; const satis=await Satis.findOne({_id:req.params.id,tenantId,...sahiplik(req)});
        if(!satis)return res.status(404).json({basarili:false,mesaj:"Satış bulunamadı."});
        if(Number(satis.odenenTutar||0)>0)return res.status(409).json({basarili:false,mesaj:"Ödeme alınmış satış doğrudan değiştirilemez; iade/düzeltme belgesi kullanın."});
        if(!Array.isArray(body.kalemler)||!body.kalemler.length)return res.status(400).json({basarili:false,mesaj:"En az bir satış kalemi gerekir."});
        const depoId=body.depoId||satis.depoId; if(String(depoId)!==String(satis.depoId))return res.status(409).json({basarili:false,mesaj:"Kayıtlı satışın deposu değiştirilemez."});
        const yeniKalemler=[];let araToplam=0,toplamKdv=0,genelToplam=0;const ihtiyac=new Map();
        for(const item of body.kalemler){const urun=await Urun.findOne({_id:item.urunId,tenantId});if(!urun)return res.status(404).json({basarili:false,mesaj:"Ürün bulunamadı."});const k=hesaplaKalem({urunId:urun._id,miktar:item.miktar,birimFiyat:item.birimFiyat??urun.satisFiyati,kdv:item.kdv??urun.kdv,iskonto:item.iskonto??urun.iskonto??0});if(!kalemGecerliMi(k))return res.status(400).json({basarili:false,mesaj:"Satış kalemi geçersiz."});yeniKalemler.push(k);araToplam+=k.araToplam;toplamKdv+=k.kdvTutari;genelToplam+=k.toplam;ihtiyac.set(String(urun._id),(ihtiyac.get(String(urun._id))||0)+k.miktar);}
        const eski=new Map();for(const k of satis.kalemler)eski.set(String(k.urunId),(eski.get(String(k.urunId))||0)+Number(k.miktar||0));
        for(const [urunId,miktar] of ihtiyac){const stok=await Stok.findOne({tenantId,urunId,depoId});const kullanilabilir=Number(stok?.miktar||0)+Number(eski.get(urunId)||0);if(kullanilabilir<miktar)return res.status(409).json({basarili:false,mesaj:`Düzeltme için yetersiz stok: ${urunId}`});}
        for(const [urunId,miktar] of eski){let stok=await Stok.findOne({tenantId,urunId,depoId});if(!stok)stok=new Stok({tenantId,urunId,depoId,miktar:0,maliyet:0});stok.miktar+=miktar;await stok.save();}
        for(const [urunId,miktar] of ihtiyac){const stok=await Stok.findOne({tenantId,urunId,depoId});stok.miktar-=miktar;stok.sonHareketTarihi=new Date();await stok.save();}
        const musteri=await Musteri.findOne({_id:satis.musteriId,tenantId});musteri.bakiye-=Number(satis.kalanTutar||satis.genelToplam||0);musteri.bakiye+=genelToplam;await musteri.save();
        await CariHareket.findOneAndUpdate({tenantId,kaynak:"SATIS",kaynakId:satis._id,tarafTipi:"MUSTERI"},{tutar:genelToplam,aciklama:`Satış düzeltmesi ${body.belgeNo||satis.belgeNo}`,tarih:body.tarih||satis.tarih},{new:true});
        const degisenUrunler=new Set([...eski.keys(),...ihtiyac.keys()]);
        for(const urunId of degisenUrunler){const fark=Number(eski.get(urunId)||0)-Number(ihtiyac.get(urunId)||0);if(Math.abs(fark)<0.000001)continue;const stok=await Stok.findOne({tenantId,urunId,depoId}).select("maliyet").lean();const maliyet=Number(stok?.maliyet||0);await StokHareket.create({tenantId,urunId,depoId,tip:fark>0?"SAYIM_ARTI":"SAYIM_EKSI",miktar:Math.abs(fark),tarih:body.tarih||satis.tarih,birimMaliyet:maliyet,maliyetDogrulandi:maliyet>0,maliyetKaynagi:"STOK_KARTI",kaynak:"SATIS_DUZELTME",kaynakId:satis._id,aciklama:`Satış ${satis.belgeNo} kalem düzeltmesi`,kullaniciId:req.kullanici?._id||req.user?._id||null});}
        satis.belgeNo=String(body.belgeNo||satis.belgeNo).trim().toUpperCase();satis.tarih=body.tarih||satis.tarih;satis.kalemler=yeniKalemler;satis.araToplam=araToplam;satis.toplamKdv=toplamKdv;satis.genelToplam=genelToplam;satis.kalanTutar=genelToplam;satis.notlar=body.notlar??satis.notlar;await satis.save();res.json({basarili:true,satis,musteriBakiye:musteri.bakiye});
    }catch(error){next(error);}
}

async function sil(req, res, next) {
    try {
        const tenantId = tenantObjectId(req);
        const satis = await Satis.findOne({ _id: req.params.id, tenantId, ...sahiplik(req) });
        if (!satis) return res.status(404).json({ basarili: false, mesaj: "Satış bulunamadı." });
        if (Number(satis.odenenTutar || 0) > 0) {
            return res.status(409).json({
                basarili: false,
                mesaj: "Ödemesi alınmış satış silinemez. Önce iade işlemi oluşturun."
            });
        }

        const musteri = await Musteri.findOne({ _id: satis.musteriId, tenantId });
        if (!musteri) return res.status(409).json({ basarili: false, mesaj: "Satışın müşteri kaydı bulunamadı." });

        for (const kalem of satis.kalemler) {
            let stok = await Stok.findOne({ tenantId, urunId: kalem.urunId, depoId: satis.depoId });
            if (!stok) stok = new Stok({ tenantId, urunId: kalem.urunId, depoId: satis.depoId, miktar: 0, maliyet: 0 });
            stok.miktar += Number(kalem.miktar || 0);
            stok.sonHareketTarihi = new Date();
            await stok.save();
        }

        musteri.bakiye -= Number(satis.kalanTutar || satis.genelToplam || 0);
        await musteri.save();
        await CariHareket.deleteMany({ tenantId, kaynak: "SATIS", kaynakId: satis._id });
        await StokHareket.deleteMany({ tenantId, kaynak: { $in: ["SATIS", "SATIS_DUZELTME"] }, kaynakId: satis._id });
        await Satis.deleteOne({ _id: satis._id, tenantId });

        return res.json({ basarili: true, mesaj: "Satış silindi; stok ve cari bakiye geri alındı." });
    } catch (error) { next(error); }
}

module.exports = {
    listele,
    panel,
    detay,
    olustur,
    iadeAl,
    iadeleriListele,
    guncelle,
    sil,
    istanbulDonemSinirlari,
    hesaplaKalem,
    kalemGecerliMi
};

