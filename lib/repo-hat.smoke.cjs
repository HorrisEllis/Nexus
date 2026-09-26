const RH = require('./repo-hat.js');
const forge = require('./hat-forge.js');
const fs=require('fs'), path=require('path');

const repoDir='/tmp/scanrepo2';
const hasIndex = fs.existsSync(path.join(repoDir,'atlas.json'));
console.log('real indexed repo available:', hasIndex);

const uuid='11112222-3333-4444-5555-666677778888';
const repo={uuid, name:'probe-project', compartmentId:'cmp-probe-9'};

// clean slate
const prior = RH.getRepoHat(uuid); if (prior) forge.revoke(prior.uuid||prior.id);

console.log('\n-- refuses a repo with no compartment --');
const noComp = RH.ensureRepoHat({repo:{uuid:'x',name:'n'}, repoDir});
console.log('refused:', !noComp.ok);
console.log('reason:', noComp.errors[0].slice(0,80)+'…');

console.log('\n-- toolScope is real --');
const T=require('./agent-tools/index.js');
const missing = RH.REPO_TOOL_SCOPE.filter(n=>!T.TOOLS.has(n));
console.log('scoped tools:', RH.REPO_TOOL_SCOPE.length, '| not in registry:', missing.length?missing.join(','):'none');
console.log('host-wide tools excluded:', !RH.REPO_TOOL_SCOPE.includes('account_manage') && !RH.REPO_TOOL_SCOPE.includes('browser_action'));

console.log('\n-- forge against an UNINDEXED dir --');
let r = RH.ensureRepoHat({repo, repoDir:'/tmp/definitely-empty-dir'});
console.log('ok:', r.ok, '| created:', r.created, r.ok?'':JSON.stringify(r.errors));
if(!r.ok) process.exit(1);
console.log('name:', r.hat.name, '| seedKey:', r.hat.seedKey);
console.log('persona admits no index:', r.hat.personaPrompt.includes('has NOT been indexed'));
console.log('persona has NO fabricated counts:', !/files: 0\b/.test(r.hat.personaPrompt));

console.log('\n-- idempotent --');
const again = RH.ensureRepoHat({repo, repoDir:'/tmp/definitely-empty-dir'});
console.log('created again:', again.created, '(must be false)');
console.log('same uuid:', (again.hat.uuid||again.hat.id)===(r.hat.uuid||r.hat.id));

console.log('\n-- refresh persona against the REAL index --');
const ref = RH.refreshRepoHatPersona({repo, repoDir});
console.log('ok:', ref.ok, ref.ok?'':JSON.stringify(ref.errors));
if (ref.ok) {
  const p = ref.hat.personaPrompt;
  console.log('now claims indexed:', !p.includes('has NOT been indexed'));
  console.log('real file count present:', /files: \d+/.test(p), p.match(/files: \d+[^\n]*/)?.[0]);
  console.log('real chunk count present:', /chunks: \d+/.test(p), p.match(/chunks: \d+/)?.[0]);
  console.log('real languages:', p.match(/- languages: [^\n]+/)?.[0]);
  console.log('identity preserved:', (ref.hat.uuid||ref.hat.id)===(r.hat.uuid||r.hat.id), '| seedKey kept:', ref.hat.seedKey===r.hat.seedKey);
  console.log('toolScope untouched:', JSON.stringify(ref.hat.toolScope)===JSON.stringify(r.hat.toolScope));
}

console.log('\n-- update() refuses identity patches --');
const hid = r.hat.uuid||r.hat.id;
console.log('uuid patch refused:', !forge.update(hid,{uuid:'hacked'}).ok);
console.log('seedKey patch refused:', !forge.update(hid,{seedKey:'other'}).ok);
const nm = forge.update(hid,{name:'other_name'});
console.log('name patch refused:', !nm.ok, '|', nm.errors[0].slice(0,60)+'…');
console.log('unknown field refused:', !forge.update(hid,{nonsense:1}).ok);
const bad = forge.update(hid,{toolScope:['no_such_tool_xyz']});
console.log('fake tool refused:', !bad.ok, '|', (bad.errors||[])[0]);

console.log('\n-- revoke --');
console.log('revoked:', RH.revokeRepoHat(uuid).ok, '| gone:', RH.getRepoHat(uuid)===null);
