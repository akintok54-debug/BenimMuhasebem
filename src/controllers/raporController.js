const mongoose = require("mongoose");

const Satis = require("../models/Satis");
const Alis = require("../models/Alis");
const Stok = require("../models/Stok");
const CariHareket = require("../models/CariHareket");
const Personel = require("../models/Personel");
const { etkinYetkiler } = require("../middleware/yetkiKontrol");
const profesyonelRaporServisi = require("../services/profesyonelRaporServisi");

function tenantId(req) {
    return new mongoose.Types.ObjectId(String(req.tenantId));
}

function tarihFiltresi(req) {
    const filter = {};

    if (req.query.baslangic) {
        const baslangic = new Date(req.query.baslangic);

        if (!Number.isNaN(baslangic.getTime())) {
            filter.$gte = baslangic;
        }
    }

    if (req.query.bitis) {
        const bitis = new Date(req.query.bitis);

        if (!Number.isNaN(bitis.getTime())) {
            bitis.setHours(23, 59, 59, 999);
            filter.$lte = bitis;
        }
    }

    return Object.keys(filter).length
        ? filter
        : null;
}

async function genel(req, res, next) {
    try {
        const tId = tenantId(req);
        const tarih = tarihFiltresi(req);
        const izinler = new Set(etkinYetkiler(req.currentUser || {}));
        const musteriGorebilir = izinler.has("customer.read");
        const tedarikciGorebilir = izinler.has("supplier.read");

        const satisFilter = { tenantId: tId, durum: { $ne: "IPTAL" } };
        const alisFilter = { tenantId: tId, durum: { $ne: "IPTAL" } };
        const cariFilter = { tenantId: tId, durum: { $ne: "IPTAL" } };

        if (tarih) {
            satisFilter.tarih = tarih;
            alisFilter.tarih = tarih;
            cariFilter.tarih = tarih;
        }
        if (musteriGorebilir !== tedarikciGorebilir) {
            cariFilter.tarafTipi = musteriGorebilir ? "MUSTERI" : "TEDARIKCI";
        } else if (!musteriGorebilir && !tedarikciGorebilir) {
            cariFilter.tarafTipi = "ERISIM_YOK";
        }

        const [
            satislar,
            alislar,
            stoklar,
            cariHareketler,
            personelSayisi
        ] = await Promise.all([
            Satis.find(satisFilter).select("araToplam toplamKdv genelToplam").lean(),
            tedarikciGorebilir ? Alis.find(alisFilter).select("araToplam toplamKdv genelToplam").lean() : [],
            Stok.find({ tenantId: tId }).select("miktar maliyet urunId depoId").lean(),
            CariHareket.find(cariFilter).select("tarafTipi tip tutar").lean(),
            Personel.countDocuments({ tenantId: tId, aktif: true })
        ]);

        const satisToplam = satislar.reduce(
            (toplam, item) => toplam + Number(item.genelToplam || 0),
            0
        );

        const alisToplam = alislar.reduce(
            (toplam, item) => toplam + Number(item.genelToplam || 0),
            0
        );

        const stokAdedi = stoklar.reduce(
            (toplam, item) => toplam + Number(item.miktar || 0),
            0
        );

        const stokMaliyeti = stoklar.reduce(
            (toplam, item) =>
                toplam +
                Number(item.miktar || 0) *
                Number(item.maliyet || 0),
            0
        );

        const tahsilat = cariHareketler
            .filter(x => x.tip === "TAHSILAT")
            .reduce(
                (toplam, item) => toplam + Number(item.tutar || 0),
                0
            );

        const odeme = cariHareketler
            .filter(x => x.tip === "ODEME")
            .reduce(
                (toplam, item) => toplam + Number(item.tutar || 0),
                0
            );

        res.json({
            basarili: true,
            rapor: {
                satis: {
                    belgeSayisi: satislar.length,
                    toplam: satisToplam
                },

                ...(tedarikciGorebilir ? { alis: {
                    belgeSayisi: alislar.length,
                    toplam: alisToplam
                } } : {}),

                stok: {
                    satirSayisi: stoklar.length,
                    toplamAdet: stokAdedi,
                    toplamMaliyet: stokMaliyeti
                },

                ...((musteriGorebilir || tedarikciGorebilir) ? { cari: {
                    tahsilat,
                    odeme,
                    netNakitHareketi: tahsilat - odeme
                } } : {}),

                personel: {
                    aktif: personelSayisi
                }
            }
        });
    } catch (error) {
        next(error);
    }
}

async function satis(req, res, next) {
    try {
        const tId = tenantId(req);

        const filtre = { tenantId: tId, durum: { $ne: "IPTAL" } };
        const tarih = tarihFiltresi(req);

        if (tarih) {
            filtre.tarih = tarih;
        }

        const satislar = await Satis.find(filtre)
            .populate("musteriId", "kod unvan adSoyad")
            .sort({ tarih: -1 })
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

async function alis(req, res, next) {
    try {
        const tId = tenantId(req);

        const filtre = { tenantId: tId, durum: { $ne: "IPTAL" } };
        const tarih = tarihFiltresi(req);

        if (tarih) {
            filtre.tarih = tarih;
        }

        const alislar = await Alis.find(filtre)
            .populate("tedarikciId", "kod unvan adSoyad")
            .sort({ tarih: -1 })
            .lean();

        res.json({
            basarili: true,
            toplam: alislar.length,
            alislar
        });
    } catch (error) {
        next(error);
    }
}

async function stok(req, res, next) {
    try {
        const stoklar = await Stok.find({
            tenantId: tenantId(req)
        })
            .populate("urunId", "kod ad minimumStok kritikStok")
            .populate("depoId", "kod ad")
            .sort({ updatedAt: -1 })
            .lean();

        const kritik = stoklar.filter(item => {
            const miktar = Number(item.miktar || 0);
            const kritikStok =
                Number(item.urunId?.kritikStok || 0);

            return miktar <= kritikStok;
        });

        res.json({
            basarili: true,
            toplam: stoklar.length,
            kritikStokSayisi: kritik.length,
            stoklar,
            kritikStoklar: kritik
        });
    } catch (error) {
        next(error);
    }
}

async function cari(req, res, next) {
    try {
        const izinler = new Set(etkinYetkiler(req.currentUser || {}));
        const musteriGorebilir = izinler.has("customer.read");
        const tedarikciGorebilir = izinler.has("supplier.read");
        const filtre = {
            tenantId: tenantId(req)
        };

        if (req.query.tarafTipi) {
            const tarafTipi = String(req.query.tarafTipi).toUpperCase();
            if ((tarafTipi === "MUSTERI" && !musteriGorebilir) || (tarafTipi === "TEDARIKCI" && !tedarikciGorebilir)) {
                return res.status(403).json({ basarili: false, mesaj: "Bu cari türünü raporlama yetkiniz bulunmuyor." });
            }
            if (!["MUSTERI", "TEDARIKCI"].includes(tarafTipi)) return res.status(400).json({ basarili: false, mesaj: "Geçersiz cari türü." });
            filtre.tarafTipi = tarafTipi;
        } else if (musteriGorebilir !== tedarikciGorebilir) {
            filtre.tarafTipi = musteriGorebilir ? "MUSTERI" : "TEDARIKCI";
        } else if (!musteriGorebilir && !tedarikciGorebilir) {
            return res.status(403).json({ basarili: false, mesaj: "Cari raporu yetkiniz bulunmuyor." });
        }

        if (req.query.tarafId) {
            filtre.tarafId = req.query.tarafId;
        }

        const hareketler = await CariHareket.find(filtre)
            .sort({ tarih: -1, createdAt: -1 })
            .lean();

        res.json({
            basarili: true,
            toplam: hareketler.length,
            hareketler
        });
    } catch (error) {
        next(error);
    }
}

async function personel(req, res, next) {
    try {
        const personeller = await Personel.find({
            tenantId: tenantId(req)
        })
            .sort({ adSoyad: 1 })
            .lean();

        const toplamMaas = personeller
            .filter(x => x.aktif)
            .reduce(
                (toplam, item) => toplam + Number(item.maas || 0),
                0
            );

        res.json({
            basarili: true,
            toplam: personeller.length,
            aktif: personeller.filter(x => x.aktif).length,
            toplamAylikMaas: toplamMaas,
            personeller
        });
    } catch (error) {
        next(error);
    }
}

async function profesyonel(req, res, next) {
    try {
        const rapor = await profesyonelRaporServisi.profesyonelRapor(tenantId(req), req.query || {});
        res.set("Cache-Control", "private, no-store");
        return res.json({ basarili: true, ...rapor });
    } catch (error) { next(error); }
}

async function filtreler(req, res, next) {
    try {
        const secenekler = await profesyonelRaporServisi.filtreSecenekleri(tenantId(req));
        res.set("Cache-Control", "private, no-store");
        return res.json({ basarili: true, secenekler, raporlar: profesyonelRaporServisi.RAPORLAR.map(([kod, ad]) => ({ kod, ad })) });
    } catch (error) { next(error); }
}

async function detay(req, res, next) {
    try {
        const kod = String(req.params.kod || ""), tanimli = profesyonelRaporServisi.RAPORLAR.some(([x]) => x === kod);
        if (!tanimli) return res.status(404).json({ basarili: false, mesaj: "Rapor türü bulunamadı." });
        const sonuc = await profesyonelRaporServisi.profesyonelRapor(tenantId(req), req.query || {});
        res.set("Cache-Control", "private, no-store");
        return res.json({ basarili: true, meta: sonuc.meta, rapor: sonuc.raporlar[kod], karsilastirma: sonuc.karsilastirma });
    } catch (error) { next(error); }
}

module.exports = {
    genel,
    satis,
    alis,
    stok,
    cari,
    personel,
    profesyonel,
    filtreler,
    detay
};
