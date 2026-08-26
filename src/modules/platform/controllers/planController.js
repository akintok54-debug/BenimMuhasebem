const Plan = require("../models/Plan");
const { kaydet } = require("../services/auditServisi");

async function listele(req, res, next) {
    try {
        const plans = await Plan.find()
            .sort({ monthlyPrice: 1 })
            .lean();

        res.json({
            basarili: true,
            toplam: plans.length,
            plans
        });
    } catch (error) {
        next(error);
    }
}

async function olustur(req, res, next) {
    try {
        const plan = await Plan.create({
            name: req.body.name,
            code: req.body.code,
            description: req.body.description || "",
            monthlyPrice: req.body.monthlyPrice || 0,
            yearlyPrice: req.body.yearlyPrice || 0,
            modules: req.body.modules || [],
            limits: req.body.limits || {}
        });

        await kaydet({
            req,
            action: "PLAN_CREATE",
            resource: "plan",
            resourceId: plan._id.toString(),
            details: {
                name: plan.name,
                code: plan.code
            }
        });

        res.status(201).json({
            basarili: true,
            plan
        });
    } catch (error) {
        next(error);
    }
}

async function durumDegistir(req, res, next) {
    try {
        const plan = await Plan.findById(req.params.id);

        if (!plan) {
            return res.status(404).json({
                basarili: false,
                mesaj: "Plan bulunamad?."
            });
        }

        plan.aktif = Boolean(req.body.aktif);
        await plan.save();

        await kaydet({
            req,
            action: "PLAN_STATUS_CHANGE",
            resource: "plan",
            resourceId: plan._id.toString(),
            details: {
                aktif: plan.aktif
            }
        });

        res.json({
            basarili: true,
            plan
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    listele,
    olustur,
    durumDegistir
};
