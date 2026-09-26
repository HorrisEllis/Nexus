const ci = require('./index.js');
const fs = require('fs'), path = require('path');
const root = '/tmp/ci-repo';
fs.rmSync(root,{recursive:true,force:true}); fs.mkdirSync(root,{recursive:true});
fs.writeFileSync(path.join(root,'hello.txt'),'real file\n');

(async () => {
  // 1. validation refuses what it cannot run
  console.log('-- validation --');
  console.log('unknown kind rejected:', !ci.validate({stages:[{name:'a',kind:'magic',run:'x'}]}).ok);
  console.log('ssh w/o keyRef rejected:', !ci.validate({stages:[{name:'d',kind:'ssh',host:'h',run:'x'}]}).ok);
  const keyMat = ci.validate({stages:[{name:'d',kind:'ssh',host:'h',run:'x',keyRef:'-----BEGIN OPENSSH PRIVATE KEY-----'}]});
  console.log('key MATERIAL rejected:', !keyMat.ok, '|', keyMat.errors[0].slice(0,60));
  console.log('dup name rejected:', !ci.validate({stages:[{name:'a',run:'x'},{name:'a',run:'y'}]}).ok);

  // 2. a real passing pipeline
  console.log('\n-- real run: pass --');
  const cfg = { version:1, stages:[
    { name:'list',  kind:'command', run:'ls -1 && echo STAGE_OK' },
    { name:'check', kind:'command', run:'test -f hello.txt && echo FOUND' },
  ]};
  const w = ci.writeConfig(root, cfg);
  console.log('config written:', w.ok, path.basename(w.path||''));
  let r = await ci.run({ compartmentId:'cmp-test', rootDir:root });
  console.log('status:', r.run.status);
  for (const s of r.run.stages) console.log(`  ${s.name.padEnd(6)} ${s.status} exit=${s.exitCode} ${s.durationMs}ms out=${JSON.stringify(s.stdout.trim().split('\n').slice(-1)[0])}`);
  console.log('cwd was the repo (saw hello.txt):', r.run.stages[0].stdout.includes('hello.txt'));

  // 3. real failure halts the pipeline
  console.log('\n-- real run: fail halts --');
  r = await ci.run({ compartmentId:'cmp-test', rootDir:root, config:{version:1,stages:[
    { name:'boom', kind:'command', run:'exit 3' },
    { name:'never', kind:'command', run:'echo SHOULD_NOT_RUN' },
  ]}});
  console.log('status:', r.run.status, '| stages executed:', r.run.stages.length);
  console.log('exit code captured:', r.run.stages[0].exitCode);
  console.log('second stage did NOT run:', !r.run.stages.some(s=>s.name==='never'));

  // 4. continueOnError -> unstable, never "passed"
  console.log('\n-- continueOnError --');
  r = await ci.run({ compartmentId:'cmp-test', rootDir:root, config:{version:1,stages:[
    { name:'soft', kind:'command', run:'exit 1', continueOnError:true },
    { name:'after', kind:'command', run:'echo RAN' },
  ]}});
  console.log('status:', r.run.status, '(must be unstable, not passed)');
  console.log('later stage ran:', r.run.stages.find(s=>s.name==='after')?.status);

  // 5. ssh preflight refuses a bad key, without spawning
  console.log('\n-- ssh preflight --');
  const badKey = '/tmp/ci-badkey'; fs.writeFileSync(badKey,'x'); fs.chmodSync(badKey, 0o644);
  r = await ci.run({ compartmentId:'cmp-test', rootDir:root, config:{version:1,stages:[
    { name:'deploy', kind:'ssh', host:'nobody@127.0.0.1', keyRef:badKey, run:'true' },
  ]}});
  console.log('status:', r.run.status);
  console.log('reason:', r.run.stages[0].error);
  console.log('missing key refused:', !ci.checkKeyRef('/tmp/definitely-not-here').ok);
  fs.chmodSync(badKey,0o600);
  console.log('chmod 600 accepted:', ci.checkKeyRef(badKey).ok);
  console.log('argv has BatchMode:', ci.sshArgv({keyRef:badKey,host:'h',run:'x'}).includes('BatchMode=yes'));

  // 6. history
  console.log('\n-- history --');
  const runs = ci.listRuns(root);
  console.log('runs recorded:', runs.length, '| statuses:', runs.map(x=>x.status).join(','));
  console.log('getRun round-trips:', !!ci.getRun(root, runs[0].runId));

  // 7. timeout watchdog is real
  console.log('\n-- timeout --');
  r = await ci.run({ compartmentId:'cmp-test', rootDir:root, config:{version:1,stages:[
    { name:'hang', kind:'command', run:'sleep 10', timeoutMs:800 },
  ]}});
  console.log('status:', r.run.status, '| killedByTimeout:', r.run.stages[0].killedByTimeout, '| ms:', r.run.stages[0].durationMs);
})().catch(e=>{console.log('THREW:',e.message, e.stack.split('\n')[1]);process.exit(1)});
