const {readdirSync}=require('node:fs');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const files=[...readdirSync(path.join(root,'src')).filter(n=>n.endsWith('-test.js')).map(n=>'src/'+n),...readdirSync(path.join(root,'tests')).filter(n=>n.endsWith('.test.js')).map(n=>'tests/'+n)];
const result=spawnSync(process.execPath,['--test','--test-concurrency=4',...files],{cwd:root,stdio:'inherit',env:{...process.env,NODE_ENV:'test',JWT_SECRET:'isolated-erp-regression-test-key',MONGODB_URI:'mongodb://127.0.0.1:1/erp_test_no_production'}});
if(result.error)console.error(result.error.message);
process.exit(result.status??1);
