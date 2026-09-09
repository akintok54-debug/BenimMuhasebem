const {spawnSync}=require('node:child_process');
function database(uri){
 const match=String(uri||'').match(/^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/]+)\/([^?]+)(?:\?.*)?$/i);
 if(!match)throw Error('Açık veritabanı adı içeren MongoDB URI zorunludur.');
 const name=decodeURIComponent(match[2]);
 if(!/^[a-zA-Z0-9_-]+$/.test(name))throw Error('Veritabanı adı doğrulanamadı.');
 return name;
}
function configuration(env,restore=false){
 const source=database(env.MONGODB_URI);
 if(!env.BACKUP_ENCRYPTION_KEY||env.BACKUP_ENCRYPTION_KEY.length<32)throw Error('En az 32 karakter BACKUP_ENCRYPTION_KEY zorunludur.');
 if(!restore)return {source};
 const target=database(env.RESTORE_TEST_MONGODB_URI);
 if(env.NODE_ENV==='production'||!/^restore_test_[a-zA-Z0-9_-]+$/.test(target)||source.toLowerCase()===target.toLowerCase())throw Error('Restore hedefi kaynak veritabanından farklı, restore_test_ önekli bir test veritabanı olmalıdır; production çalışma modu reddedilir.');
 return {source,target};
}
function toolAvailable(name){
 const result=spawnSync(name,['--version'],{windowsHide:true,stdio:'pipe',timeout:10000});
 if(result.error||result.status!==0)throw Error(name+' kurulu değil veya çalıştırılamıyor.');
}
module.exports={database,configuration,toolAvailable};
