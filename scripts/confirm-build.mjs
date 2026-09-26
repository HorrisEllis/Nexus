#!/usr/bin/env node
// scripts/confirm-build.mjs — one command that proves the idearium loop works
// end to end against a freshly-spawned service. Run: node scripts/confirm-build.mjs
// If this passes, the backend is good and any remaining problem is browser/UI.
import { spawn } from 'child_process';
import http from 'http';

const PORT = 4800;
const post = (p, b0) => new Promise(r => { const b = JSON.stringify(b0||{}); const rq = http.request({ hostname:'127.0.0.1', port:PORT, path:p, method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)} }, s => { let d=''; s.on('data',c=>d+=c); s.on('end',()=>r({ code:s.statusCode, body:JSON.parse(d||'{}') })); }); rq.on('error',e=>r({code:0,body:{error:e.message}})); rq.write(b); rq.end(); });
const get = (p) => new Promise(r => http.get({ hostname:'127.0.0.1', port:PORT, path:p }, s => { let d=''; s.on('data',c=>d+=c); s.on('end',()=>r({ code:s.statusCode, body:(()=>{try{return JSON.parse(d)}catch{return d}})() })); }).on('error',e=>r({code:0,body:e.message})));

const srv = spawn('node', ['idearium/api/index.js'], { cwd: process.cwd(), stdio: 'ignore' });
let pass = 0, fail = 0;
const check = (name, cond, detail='') => { if (cond) { pass++; console.log(`  \u2713 ${name}`); } else { fail++; console.log(`  \u2717 ${name}  ${detail}`); } };

await new Promise(r => setTimeout(r, 5000));
try {
  console.log('\n── connectivity ──');
  const health = await get('/health');
  check('service responds on :4800', health.code === 200);

  console.log('\n── the bugs you reported ──');
  const idea = await post('/api/ideas', { text: 'confirm-build test idea', tags: ['test'] });
  check('ADD IDEA works', idea.code === 200 && idea.body.idea?.uuid, `(got ${idea.code})`);

  const ideas = await get('/api/ideas');
  check('idea appears in the list', (ideas.body.ideas||[]).some(i => i.uuid === idea.body.idea?.uuid));

  const specs = await get('/api/specs');
  check('SPEC LIBRARY is populated', (specs.body.specs||[]).length > 0, `(${(specs.body.specs||[]).length} specs)`);
  check('specs carry sections for the UI chips', (specs.body.specs||[]).some(s => (s.sections||[]).length > 0));

  console.log('\n── the loop: idea → spec → repo ──');
  const created = await post('/api/spec-engine/specs', { name: 'confirm-'+Date.now(), templateId: 'genesis' });
  const specUuid = created.body.manifest?.uuid;
  check('create spec from template', !!specUuid);

  const promoted = await post(`/api/spec-engine/specs/${specUuid}/promote`, { mode: 'manual' });
  check('PROMOTE spec → repository', promoted.code === 200 && promoted.body.repoUuid, `(got ${promoted.code})`);

  const repos = await get('/api/repos');
  const repo = (repos.body.repos||[]).find(r => r.uuid === promoted.body.repoUuid);
  check('repo appears in library', !!repo);
  check('CLICK-SPEC finds repo (promotedFromSpec)', repo?.promotedFromSpec === specUuid);
  check('repo lists FILES AS COMPONENTS', (repo?.files||[]).length > 1 && repo.files.some(f => f.comp_id));

  console.log('\n── .spec import ──');
  const imp = await post('/api/spec-engine/import', { name: 'imp-test', specText: 'spec:\n  # BLOCK 1 — META\n  meta:\n    name: x\n  # BLOCK 2 — INTENT\n  intent:\n    purpose: y' });
  check('IMPORT .spec parses blocks', imp.code === 200 && imp.body.blocksFound === 2, `(got ${imp.code})`);

  console.log('\n── contract projection (what the UI reads) ──');
  const contract = await get('/api/contract/live');
  check('live contract projects real routes', (contract.body.endpoints||[]).length > 30, `(${(contract.body.endpoints||[]).length} endpoints)`);
} catch (e) { console.log('  FATAL', e.message); fail++; }

console.log(`\n${'─'.repeat(40)}\n  RESULT: ${pass} passed, ${fail} failed`);
console.log(fail === 0 ? '  ✓ BACKEND CONFIRMED — any remaining issue is browser/UI\n' : '  ✗ real backend bug found above\n');
srv.kill();
process.exit(fail ? 1 : 0);
