const keys = require('./keys.js');
const ci   = require('./index.js');
const fs=require('fs'), path=require('path'), os=require('os');

const root='/tmp/ci-keyrepo';
fs.rmSync(root,{recursive:true,force:true}); fs.mkdirSync(root,{recursive:true});
const keyFile='/tmp/ci-testkey'; fs.writeFileSync(keyFile,'not-a-real-key'); fs.chmodSync(keyFile,0o600);

(async()=>{
let host;
try { host = keys.hostFor(); } catch(e){ console.log('createHost failed:',e.message); process.exit(1); }
let comps = host.store.listCompartments?.() || [];
if(!comps.length){ const {createCompartment}=require('../cli/commands/create.js');
  createCompartment(host,{name:'ci-key-probe',purpose:'ci key management test',runtimeId:'node'});
  comps = host.store.listCompartments(); console.log('created a real compartment for the test'); }
console.log('real compartments on host:', comps.length, comps.map(c=>c.name||c.id).slice(0,3).join(','));
if(!comps.length){ console.log('SKIP: no compartment exists to scope keys to'); process.exit(0); }
const comp = comps[0]; const cname = comp.name || comp.id;
console.log('using compartment:', cname, '| id:', comp.id);

console.log('\n-- alias validation --');
console.log('bad alias refused:', !keys.validateAlias('Bad-Alias').ok);
console.log('good alias ok:', keys.validateAlias('deploy_prod').ok);

console.log('\n-- key MATERIAL refused --');
const mat = keys.registerSshKey({host, compartmentName:cname, alias:'oops',
  keyPath:'-----BEGIN OPENSSH PRIVATE KEY-----\nabc'});
console.log('refused:', !mat.ok, '|', mat.error.slice(0,70));

console.log('\n-- bad perms refused at registration --');
fs.chmodSync(keyFile,0o644);
const bad = keys.registerSshKey({host, compartmentName:cname, alias:'deploy', keyPath:keyFile});
console.log('refused:', !bad.ok, '|', (bad.error||'').slice(0,60));
fs.chmodSync(keyFile,0o600);

console.log('\n-- register + resolve --');
const reg = keys.registerSshKey({host, compartmentName:cname, alias:'deploy', keyPath:keyFile});
console.log('registered:', reg.ok, reg.ok?reg.alias:reg.error);
const res = keys.resolveSshKey({host, compartmentName:cname, alias:'deploy'});
console.log('resolved:', res.ok, '| path matches:', res.keyPath===path.resolve(keyFile));
console.log('unknown alias refused:', !keys.resolveSshKey({host,compartmentName:cname,alias:'nope'}).ok);

console.log('\n-- resolve re-checks perms at USE time --');
fs.chmodSync(keyFile,0o644);
const stale = keys.resolveSshKey({host, compartmentName:cname, alias:'deploy'});
console.log('now refused:', !stale.ok, '|', (stale.error||'').slice(0,72));
fs.chmodSync(keyFile,0o600);

console.log('\n-- listing shows alias, never material --');
const l = keys.listSshKeys({host, compartmentName:cname});
console.log('keys:', JSON.stringify(l.keys?.map(k=>k.alias)));

console.log('\n-- secrets: stored, listed WITHOUT value --');
keys.setSecret({host, compartmentName:cname, name:'deploy_token', value:'SUPERSECRET12345'});
const ls = keys.listSecrets({host, compartmentName:cname});
console.log('listed:', JSON.stringify(ls.secrets));
console.log('no value in listing:', !JSON.stringify(ls.secrets).includes('SUPERSECRET'));

console.log('\n-- secret reaches the process as env --');
let r = await ci.run({compartmentId:comp.id, rootDir:root, vaultHost:host, config:{version:1,stages:[
  {name:'env', kind:'command', run:'echo "token=$CI_SECRET_DEPLOY_TOKEN"'}
]}});
const out = r.run.stages[0].stdout;
console.log('stage status:', r.run.stages[0].status);
console.log('env var was present:', !out.includes('token=\n') && out.includes('token='));
console.log('captured output REDACTED:', out.includes('«redacted»'), '|', JSON.stringify(out.trim()));
console.log('raw secret absent from record:', !JSON.stringify(r.run).includes('SUPERSECRET12345'));

console.log('\n-- ssh stage via keyAlias --');
r = await ci.run({compartmentId:comp.id, rootDir:root, vaultHost:host, config:{version:1,stages:[
  {name:'deploy', kind:'ssh', host:'nobody@127.0.0.1', keyAlias:'deploy', run:'true', timeoutMs:4000}
]}});
console.log('ran (expected to fail connecting):', r.run.stages[0].status, '| exit', r.run.stages[0].exitCode);
console.log('resolved alias, did NOT complain about missing key:', !(r.run.stages[0].error||'').includes('no ssh key registered'));

console.log('\n-- validate: alias vs ref --');
console.log('both refused:', !ci.validate({stages:[{name:'d',kind:'ssh',host:'h',run:'x',keyAlias:'a',keyRef:'/k'}]}).ok);
console.log('neither refused:', !ci.validate({stages:[{name:'d',kind:'ssh',host:'h',run:'x'}]}).ok);
console.log('alias alone ok:', ci.validate({stages:[{name:'d',kind:'ssh',host:'h',run:'x',keyAlias:'deploy'}]}).ok);

keys.removeSshKey({host,compartmentName:cname,alias:'deploy'});
keys.removeSecret({host,compartmentName:cname,name:'deploy_token'});
console.log('\ncleaned up:', !keys.resolveSshKey({host,compartmentName:cname,alias:'deploy'}).ok);
})().catch(e=>{console.log('THREW:',e.message);console.log(e.stack.split('\n').slice(1,3).join('\n'));process.exit(1)});
