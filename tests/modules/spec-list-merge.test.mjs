// spec-list-merge — "the idearium ui has no specs." The Spec Library read
// /api/specs (legacy os.db.specs, empty) while real specs lived in the
// spec-engine. This proves /api/specs now merges both and shapes them for the UI.
import assert from 'assert';
import { spawn } from 'child_process';
import http from 'http';
import net from 'net';

// §SANDBOX 2026-09-25 — this test spawned idearium on the REAL port 4800 and
// posted a "list-test-*" spec to it. With James's idearium already running,
// the spawned server could not bind and every request here went to the LIVE
// instance, writing into his real store. Now: a free scratch port, and the
// child inherits lib/test-sandbox.js's data root via the env set below.
const _free = await new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const PORT = _free;
const { createRequire } = await import('module');
createRequire(import.meta.url)('../../lib/test-sandbox.js').ensure();

const get = (p) => new Promise(r => http.get({ hostname:'127.0.0.1', port:PORT, path:p }, s => { let d=''; s.on('data',c=>d+=c); s.on('end',()=>r(JSON.parse(d||'{}'))); }).on('error',()=>r({})));
const post = (p, b0) => new Promise(r => { const b = JSON.stringify(b0||{}); const rq = http.request({ hostname:'127.0.0.1', port:PORT, path:p, method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)} }, s => { let d=''; s.on('data',c=>d+=c); s.on('end',()=>r(JSON.parse(d||'{}'))); }); rq.on('error',()=>r({})); rq.write(b); rq.end(); });

const srv = spawn('node', ['idearium/api/index.js'], { cwd: process.cwd(), stdio: 'ignore', env: { ...process.env, IDEARIUM_PORT: String(PORT) } });
let passed = 0, failed = 0;
const t = (id, name, cond) => { if (cond) { passed++; console.log(`  ✓ ${id} ${name}`); } else { failed++; console.log(`  ✗ ${id} ${name}`); } };

await new Promise(r => setTimeout(r, 4500));
try {
  // ensure at least one spec-engine spec exists
  await post('/api/spec-engine/specs', { name: 'list-test-' + Date.now(), templateId: 'genesis' });

  const r = await get('/api/specs');
  t('T-001', '/api/specs returns spec-engine specs (not just empty legacy)', (r.specs || []).length > 0);
  t('T-002', 'response reports both sources', r.sources && typeof r.sources.engine === 'number');

  const s = (r.specs || []).find(x => x.sections);
  t('T-003', 'specs carry .phase for the UI status badge', typeof s?.phase === 'string');
  t('T-004', 'specs carry .sections for the UI chips', Array.isArray(s?.sections) && s.sections.length > 0);
  t('T-005', 'a complete section is marked done (content truthy)', (s?.sections || []).some(x => x.content));
} catch (e) { console.log('  ERROR', e.message); failed++; }

console.log(`\n  spec-list-merge: ${passed} passed, ${failed} failed`);
srv.kill();
process.exit(failed ? 1 : 0);
