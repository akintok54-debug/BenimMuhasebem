const mongoose = require('mongoose');
const {version} = require('../../package.json');
async function hazirlik(req,res) {
    res.set('Cache-Control','no-store');
    if(mongoose.connection.readyState!==1)return res.status(503).json({ready:false,version});
    try {await mongoose.connection.db.admin().command({ping:1},{timeoutMS:2000});res.json({ready:true,version});}
    catch {res.status(503).json({ready:false,version});}
}
module.exports=hazirlik;
