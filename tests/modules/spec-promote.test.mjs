// spec-promote — the idea→repo link. UUID: idearium-spec-promote-test-v1-2026-0710
// "Idearium isn't importing ideas into the repository library." This is the fix:
// a built spec becomes a repo artifact, two modes (emerge auto / manual builder).
// §SANDBOX 2026-09-25 — this test starts real NEXUS processes; they inherit a throwaway data root from here (lib/test-sandbox.js).
import { createRequire as __sandboxRequire } from 'module';
__sandboxRequire(import.meta.url)('../../lib/test-sandbox.js').ensure();
import assert from 'assert';
import { spawn } from 'child_process';
import http from 'http';

const post = (p, b0) => new Promise(r => { const b = JSON.stringify(b0 || {}); const rq = http.request({ hostname:'127.0.0.1', port:4800, path:p, method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)} }, s => { let d=''; s.on('data',c=>d+=c); s.on('end',()=>r({ code:s.statusCode, body:JSON.parse(d||'{}') })); }); rq.on('error',()=>r({code:0,body:{}})); rq.write(b); rq.end(); });
const get = (p) => new Promise(r => http.get({ hostname:'127.0.0.1', port:4800, path:p }, s => { let d=''; s.on('data',c=>d+=c); s.on('end',()=>r(JSON.parse(d||'{}'))); }).on('error',()=>r({})));

const srv = spawn('node', ['idearium/api/index.js'], { cwd: process.cwd(), stdio: 'ignore' });
let passed = 0, failed = 0;
const t = (id, name, cond) => { if (cond) { passed++; console.log(`  ✓ ${id} ${name}`); } else { failed++; console.log(`  ✗ ${id} ${name}`); } };

await new Promise(r => setTimeout(r, 4500));
try {
  const c = await post('/api/spec-engine/specs', { name: 'promote-test-' + Date.now(), templateId: 'genesis' });
  const uuid = c.body.manifest.uuid;

  const auto = await post(`/api/spec-engine/specs/${uuid}/promote`, { mode: 'emerge' });
  t('T-001', 'auto-promote of unfinished spec refuses (409)', auto.code === 409);

  const man = await post(`/api/spec-engine/specs/${uuid}/promote`, { mode: 'manual' });
  t('T-002', 'manual-promote succeeds', man.code === 200);
  t('T-003', 'promote returns a real repo uuid', typeof man.body.repoUuid === 'string' && man.body.repoUuid.length > 0);

  const repos = await get('/api/repos');
  const list = repos.repos || repos.list || [];
  t('T-004', 'the promoted repo is in the library', list.some(r => r.uuid === man.body.repoUuid));

  const bad = await post(`/api/spec-engine/specs/${uuid}/promote`, { mode: 'wat' });
  t('T-005', 'unknown mode is rejected (400)', bad.code === 400);
} catch (e) { console.log('  ERROR', e.message); failed++; }

console.log(`\n  spec-promote: ${passed} passed, ${failed} failed`);
srv.kill();
process.exit(failed ? 1 : 0);
