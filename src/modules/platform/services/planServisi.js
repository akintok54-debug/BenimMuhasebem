const Plan = require("../models/Plan");

async function planlariGetir() {
    return Plan.find({
        aktif: true
    })
    .sort({
        monthlyPrice: 1
    })
    .lean();
}

async function planGetir(id) {
    return Plan.findById(id).lean();
}

module.exports = {
    planlariGetir,
    planGetir
};
