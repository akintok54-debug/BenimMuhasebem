const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {pipeline}=require('node:stream/promises');
require('dotenv').config({quiet:true});
async function main(){
 const safety=require('./backup-safety');safety.configuration(process.env);safety.toolAvailable('mongodump');
 if(process.argv.includes('--check')){console.log('Backup ön koşulları geçerli; gerçek yedek alınmadı veya doğrulanmadı.');return;}
 const dir=path.resolve(process.env.BACKUP_DIR||'backups');fs.mkdirSync(dir,{recursive:true});
 const work=fs.mkdtempSync(path.join(dir,'.backup-')),archive=path.join(work,'dump.archive'),config=path.join(work,'config.yml');
 const output=path.join(dir,'mongodb-'+Date.now()+'-'+crypto.randomBytes(4).toString('hex')+'.archive.enc');let success=false;
 try{
  fs.writeFileSync(config,'uri: '+JSON.stringify(process.env.MONGODB_URI)+'\n',{mode:0o600});
  await new Promise((resolve,reject)=>{const child=spawn('mongodump',['--config='+config,'--archive='+archive,'--gzip'],{stdio:'ignore',windowsHide:true});child.on('error',()=>reject(Error('mongodump başlatılamadı.')));child.on('close',code=>code===0?resolve():reject(Error('mongodump başarısız; yedek tamamlanmadı.')));});
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',crypto.createHash('sha256').update(process.env.BACKUP_ENCRYPTION_KEY).digest(),iv);
  fs.writeFileSync(output,Buffer.concat([Buffer.from('BMBK1'),iv]),{mode:0o600,flag:'wx'});
  await pipeline(fs.createReadStream(archive),cipher,fs.createWriteStream(output,{flags:'a'}));fs.appendFileSync(output,cipher.getAuthTag());success=true;
  await require('./platform-backup-telemetry').recordBackup(output).catch(()=>console.error('Yedek dosyası hazır; platform sağlık kaydı yazılamadı.'));
  console.log('Şifreli yedek oluşturuldu: '+output);
 }finally{for(const file of [config,archive])if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(work);if(!success&&fs.existsSync(output))fs.unlinkSync(output);}
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={main};
