const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {pipeline}=require('node:stream/promises');
require('dotenv').config({quiet:true});
async function main(){
 const safety=require('./backup-safety'),ns=safety.configuration(process.env,true);safety.toolAvailable('mongorestore');
 const file=process.argv.slice(2).find(x=>!x.startsWith('--'));if(!file)throw Error('Şifreli yedek dosyası zorunludur.');
 const input=path.resolve(file),stat=fs.statSync(input);if(!stat.isFile()||stat.size<33)throw Error('Geçersiz yedek dosyası.');
 const fd=fs.openSync(input,'r'),header=Buffer.alloc(17),tag=Buffer.alloc(16);try{fs.readSync(fd,header,0,17,0);fs.readSync(fd,tag,0,16,stat.size-16);}finally{fs.closeSync(fd);}
 if(header.subarray(0,5).toString()!=='BMBK1')throw Error('Geçersiz yedek formatı.');
 const work=fs.mkdtempSync(path.join(path.dirname(input),'.restore-')),temp=path.join(work,'dump.archive'),config=path.join(work,'config.yml');
 try{
  const decipher=crypto.createDecipheriv('aes-256-gcm',crypto.createHash('sha256').update(process.env.BACKUP_ENCRYPTION_KEY).digest(),header.subarray(5));decipher.setAuthTag(tag);
  await pipeline(fs.createReadStream(input,{start:17,end:stat.size-17}),decipher,fs.createWriteStream(temp,{mode:0o600}));
  if(process.argv.includes('--check')){console.log('Yedek şifre bütünlüğü ve ön koşullar doğrulandı; geri yükleme yapılmadı.');return;}
  fs.writeFileSync(config,'uri: '+JSON.stringify(process.env.RESTORE_TEST_MONGODB_URI)+'\n',{mode:0o600});
  await new Promise((resolve,reject)=>{const child=spawn('mongorestore',['--config='+config,'--archive='+temp,'--gzip','--nsInclude='+ns.source+'.*','--nsFrom='+ns.source+'.*','--nsTo='+ns.target+'.*','--stopOnError'],{stdio:'ignore',windowsHide:true});child.on('error',()=>reject(Error('mongorestore başlatılamadı.')));child.on('close',code=>code===0?resolve():reject(Error('Geri yükleme başarısız; teslim onayı verilmedi.')));});
  console.log('Test veritabanına geri yükleme tamamlandı; veri mutabakatı ayrıca yapılmalıdır.');
 }finally{for(const file of [temp,config])if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(work);}
}
if(require.main===module)main().catch(()=>{console.error('Geri yükleme ön koşulları veya şifre bütünlüğü doğrulanamadı; işlem başarısız.');process.exitCode=1;});
module.exports={main};
