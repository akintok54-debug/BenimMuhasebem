const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Module=require('node:module');
const root=path.resolve(__dirname,'..');let checked=0;
function check(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())check(file);else if(item.name.endsWith('.js')&&!item.name.endsWith('-test.js')){new vm.Script(Module.wrap(fs.readFileSync(file,'utf8')),{filename:path.relative(root,file)});checked++;}}}
for(const dir of ['src','api','public'])check(path.join(root,dir));
for(const file of ['public/erp/fiyat.js','public/erp/urun-toplu.js','public/erp/bayi-icerik.js','public/erp/urun-toplu.css'])if(!fs.existsSync(path.join(root,file)))throw Error('Missing release asset: '+file);
console.log(checked+' JavaScript files parsed; required release assets present.');
