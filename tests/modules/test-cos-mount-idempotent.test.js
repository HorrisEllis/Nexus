'use strict';
/**
 * tests/modules/test-cos-mount-idempotent.test.js — 0.39.282 N28 (docs/2026-09-29-nex-node-store-phasemap.spec)
 *
 * James's live log: idearium OFFLINE every 10 minutes; the nexus-self sync's "compartments" step took 17–23 s. Cause:
 * idearium/repo/nexus-self.js ensureCompartments() re-mounts every system dir on every sync, and every
 * lib/cos-bridge.js mountPath() rewrote the WHOLE COS store (flushSync), the system map and the manifest — even
 * for a mount already recorded exactly so. Now an identical remount is a no-op; a real change still persists.
 */
require('../../lib/test-sandbox.js').ensure();
const path = require('path');
const ROOT = path.join(__dirname, '../..');
let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }

(async () => {
  console.log('\ntest-cos-mount-idempotent\n');
  const cb = require(path.join(ROOT, 'lib', 'cos-bridge.js'));
  const host = cb.getHost();
  check('MI-00 COS is available in the sandbox', !!host, cb.lastError && cb.lastError());
  if (!host) { process.exitCode = 1; return; }
  let flushes = 0;
  const realFlush = host.store.flushSync.bind(host.store);
  host.store.flushSync = () => { flushes++; return realFlush(); };
  const c = cb.createCompartment({ name: cb.uniqueName('mount-idem'), purpose: 'test', networkIsolated: true });
  const id = (c.compartment || c).id;
  const dir = path.join(ROOT, 'lib');
  flushes = 0;
  const first = cb.mountPath(id, { path: dir, role: 'nexus-live', writable: false });
  check('MI-01 a new mount persists (the store is flushed)', first.ok && !first.unchanged && flushes >= 1, JSON.stringify({ ok: first.ok, flushes }));
  flushes = 0;
  const again = [];
  for (let i = 0; i < 20; i++) again.push(cb.mountPath(id, { path: dir, role: 'nexus-live', writable: false }));
  check('MI-02 remounting it exactly so, twenty times (what every sync did): no flush at all, each says unchanged, same shape', flushes === 0 && again.every(r => r.ok && r.unchanged && r.compartmentId === id && Array.isArray(r.mounts)), JSON.stringify({ flushes }));
  flushes = 0;
  const changed = cb.mountPath(id, { path: dir, role: 'nexus-live', writable: true });
  const comp = cb.getCompartment(id);
  check('MI-03 a real change (read-only → writable) still persists and the lists follow', changed.ok && !changed.unchanged && flushes >= 1 && comp.fs.writable.includes(dir) && !comp.fs.readonly.includes(dir));
  flushes = 0;
  const NS = await import(path.join(ROOT, 'idearium', 'repo', 'nexus-self.js'));
  NS.ensureCompartments();                       // first time: creates the nexus compartments and mounts their dirs
  const firstFlushes = flushes; flushes = 0;
  const t0 = Date.now(); NS.ensureCompartments(); const ms = Date.now() - t0;
  check('MI-04 the nexus-self sync\'s compartments step, unchanged: zero store flushes (was one per system dir)', firstFlushes > 0 && flushes === 0, JSON.stringify({ firstFlushes, second: flushes, ms }));
  // the host itself: reused while its state file is unchanged; a write by anyone else means a fresh load
  const h1 = cb.getHost(), h2 = cb.getHost();
  check('MI-05 one COS host per process while its state file is unchanged (it used to reload the whole store on every call)', h1 === h2 && h1 === host);
  const fs = require('fs');
  const file = h1.store._file;
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  raw._touchedByAnotherProcess = Date.now();
  await new Promise(r => setTimeout(r, 20));
  fs.writeFileSync(file, JSON.stringify(raw, null, 2));
  const h3 = cb.getHost();
  check('MI-06 another process writing the state file → a fresh host that sees what it wrote', h3 !== h1 && !!h3.store.getCompartment(id));
  const beforeOwn = cb.getHost();
  cb.mountPath(id, { path: path.join(ROOT, 'cos'), role: 'nexus-live', writable: false });   // our own write
  check('MI-07 this process\'s own writes keep the cache valid (no reload after its own flush)', cb.getHost() === beforeOwn);

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 100);
})().catch(e => { console.log('  ! crashed', e.stack); process.exit(1); });
