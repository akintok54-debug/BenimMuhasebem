const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const safety=require('../scripts/backup-safety');
const env={MONGODB_URI:'mongodb://localhost/live_erp',BACKUP_ENCRYPTION_KEY:'test-only-key-with-at-least-32-characters',RESTORE_TEST_MONGODB_URI:'mongodb://localhost/restore_test_audit'};
test('backup requires an explicit source database and encryption key',()=>{
 assert.throws(()=>safety.configuration({}),/URI/);assert.throws(()=>safety.configuration({...env,BACKUP_ENCRYPTION_KEY:''}),/32/);assert.equal(safety.configuration(env).source,'live_erp');
});
test('restore rejects production mode, source database and unrestricted destinations',()=>{
 for(const change of [{NODE_ENV:'production'},{RESTORE_TEST_MONGODB_URI:env.MONGODB_URI},{RESTORE_TEST_MONGODB_URI:'mongodb://localhost/another_live_database'}])assert.throws(()=>safety.configuration({...env,...change},true));
 assert.deepEqual(safety.configuration(env,true),{source:'live_erp',target:'restore_test_audit'});
});
test('restore check authenticates encrypted contents and cleans plaintext on success and tampering',async t=>{
 const directory=fs.mkdtempSync(path.resolve('.tmp-backup-safety-')),input=path.join(directory,'sample.enc');
 const old={...process.env},argv=process.argv;Object.assign(process.env,env,{NODE_ENV:'test'});process.argv=['node','restore',input,'--check'];
 t.after(()=>{process.argv=argv;for(const key of Object.keys(env).concat('NODE_ENV'))if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];fs.unlinkSync(input);fs.rmdirSync(directory);});
 t.mock.method(safety,'toolAvailable',()=>{});
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',crypto.createHash('sha256').update(env.BACKUP_ENCRYPTION_KEY).digest(),iv);
 const encrypted=Buffer.concat([Buffer.from('BMBK1'),iv,cipher.update('local backup integrity fixture'),cipher.final(),cipher.getAuthTag()]);fs.writeFileSync(input,encrypted);
 const {main}=require('../scripts/mongodb-restore-check');await main();assert.deepEqual(fs.readdirSync(directory),['sample.enc']);
 encrypted[20]^=1;fs.writeFileSync(input,encrypted);await assert.rejects(main());assert.deepEqual(fs.readdirSync(directory),['sample.enc']);
});
