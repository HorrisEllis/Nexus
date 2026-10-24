'use strict';
/**
 * tests/modules/test-prevention.test.js — 0.60.123 MP — a failure mode that has happened becomes a prevention.
 * James (2026-10-13): "can we fix the memory issue. all of the resource optimization as possible. also failure modes are
 * to prevent problems not solutionsn".
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '../..');
let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }
const quiet = async (fn) => { const l = console.log, w = console.warn, e = console.error, out = []; console.log = console.warn = console.error = (...a) => out.push(a.join(' ')); try { await fn(); } finally { console.log = l; console.warn = w; console.error = e; } return out; };
const S = (free) => ({ system: { freeMemPct: free, usedMemPct: 1 - free } });

(async () => {
  console.log('\ntest-prevention\n');
  const P = require(path.join(ROOT, 'lib/prevention.js'));
  check('PV-00 the prevention file is in the test sandbox, never the real data/', P.fileOf().startsWith(process.env.NEXUS_TEST_SANDBOX), P.fileOf());

  const now = Date.now();
  const r1 = P.record('memory_pressure', { level: 'critical', why: 'free 0.1%', by: 'test', now });
  const r2 = P.record('memory_pressure', { level: 'critical', by: 'test', now: now + 1000 });
  check('PV-01 a critical reading is recorded for a day; a second one counts, keeps when it started', r2.count === 2 && r2.since === r1.since && r2.until === now + 1000 + P.TTL_MS && P.active('memory_pressure', now + 5000) && !P.active('memory_pressure', now + P.TTL_MS + 2000));

  const a = P.heavyAllowed({ sample: S(0.15), level: 'pressure' });
  const b = P.heavyAllowed({ sample: S(0.22), level: 'ok' });
  const c = P.heavyAllowed({ sample: S(0.45), level: 'ok' });
  check('PV-02 prevention, not reaction: under pressure heavy work waits; after a crisis "ok" (22% free) is not enough — it waits for 30%; with headroom it runs',
    !a.ok && /pressure/.test(a.why) && !b.ok && /waits for 30% free, now 22%/.test(b.why) && c.ok, JSON.stringify({ a, b, c }));
  P.clear('memory_pressure');
  check('PV-03 with no recent crisis, an ok machine runs heavy work at 22% free', P.heavyAllowed({ sample: S(0.22), level: 'ok' }).ok);

  // the resource monitor writes the record on a critical transition
  const { ResourceMonitor } = require(path.join(ROOT, 'lib/resource-monitor.js'));
  let free = 0.5; const mon = new ResourceMonitor({ name: 'pv-test', sampler: () => ({ ts: Date.now(), system: { freeMemPct: free, usedMemPct: 1 - free, freeMemMB: free * 16000, totalMemMB: 16000, loadavg1: 0, cpus: 4 }, process: { rssMB: 50, heapUsedMB: 20 } }) });
  await quiet(async () => { mon.tick(); free = 0.001; mon.tick(); mon.tick(); });
  const rec = P.active('memory_pressure');
  check('PV-04 any process\'s monitor that sees memory go critical writes the prevention record (who saw it, why)', mon.lastLevel === 'critical' && rec && rec.by === 'pv-test' && /halt|free/i.test(rec.why || ''), JSON.stringify({ level: mon.lastLevel, rec }));

  // Ollama: an idle model is unloaded under pressure, never mid-job
  const { createIdleUnload } = require(path.join(ROOT, 'ollama/lib/idle-unload.js'));
  let allowed = { ok: false, why: 'memory is at pressure' }, busy = false, last = Date.now() - 120000; const unloaded = [];
  const u = createIdleUnload({ loaded: async () => [{ name: 'qwen2.5-coder:7b', size: 4.7e9 }], unload: async (m) => { unloaded.push(m); return { ok: true }; }, busy: () => busy, lastActivity: () => last, allowed: () => allowed, log: () => {} });
  busy = true; const t1 = await u.tick(); busy = false; last = Date.now() - 5000; const t2 = await u.tick(); last = Date.now() - 120000; const t3 = await u.tick();
  allowed = { ok: true, why: 'memory ok' }; const t4 = await u.tick();
  check('PV-05 Ollama: under pressure an idle loaded model is unloaded (keep_alive 0) — never while a job runs or just ended, never when memory is ok',
    !t1.unloaded.length && /running/.test(t1.why) && !t2.unloaded.length && t3.unloaded.join() === 'qwen2.5-coder:7b' && !t4.unloaded.length && unloaded.length === 1, JSON.stringify({ t1, t2, t3, t4 }));

  // the wiring: every heavy job asks first
  const AP = fs.readFileSync(path.join(ROOT, 'lib', 'nexus', 'autopilot.js'), 'utf8'), CG = fs.readFileSync(path.join(ROOT, 'clear-glass/src/main/index.js'), 'utf8');
  const ID = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8'), OF = fs.readFileSync(path.join(ROOT, 'cortex/core/raid/officiator.js'), 'utf8');
  const ES = fs.readFileSync(path.join(ROOT, 'cortex/self-heal/escalation.js'), 'utf8'), OS = fs.readFileSync(path.join(ROOT, 'ollama/server.js'), 'utf8');
  check('PV-06 the heavy jobs ask before they start: the loom refresh (and skips a fresh registry), the self-sync, the officiator, Eros and the hidden pre-warm; Ollama unloads idle; FAILURE_MODE writes a prevention',
    /_refreshLoomRegistryWhenAllowed/.test(AP) && /LOOM_REFRESH_MAX_AGE_MS/.test(AP) && !/function start\(\) \{\n  _refreshLoomRegistry\(\);/.test(AP)
    && /heavyAllowedHere\('idearium'\)/.test(ID) && /heavyAllowedHere\('officiator'\)/.test(OF)
    && /_erosHold = lean\.on \? 'lean mode is on'/.test(CG) && /NCP auto-boot: held/.test(CG)
    && /startIdleUnload/.test(OS) && /prevention\.js'\)\.record\(faultClass/.test(ES));

  // the route, command and Settings line
  try {
    P.record('memory_pressure', { level: 'critical', why: 'route test', by: 'test' });
    const api = await import(path.join(ROOT, 'idearium/api/index.js'));
    let g; await quiet(async () => { g = await api._route('GET', '/api/system/lean'); });
    const d = g.json.data || g.json;
    let c; await quiet(async () => { c = await api._route('POST', '/api/system/prevention/clear', { cls: 'memory_pressure' }); });
    const UI = fs.readFileSync(path.join(ROOT, 'idearium/ui/settings.html'), 'utf8'), CMD = fs.readFileSync(path.join(ROOT, 'idearium/cli/route-commands.js'), 'utf8');
    check('PV-07 Idearium shows what is being prevented and whether heavy work may run; a person can clear it (route, command, Settings → Lean mode)',
      g.status === 200 && (d.prevention || []).some(x => x.cls === 'memory_pressure' && x.why === 'route test') && d.heavy && typeof d.heavy.ok === 'boolean'
      && c.status === 200 && !P.active('memory_pressure') && /data-prev-clear/.test(UI) && CMD.includes("key: 'system.prevention'"), JSON.stringify({ s: g.status, d: d.prevention, c: c.status }));
  } catch (e) { fail++; console.log(`  ✗ route threw: ${e.stack}`); }

  console.log(`\n${pass} passed, ${fail} failed`);
  setTimeout(() => process.exit(fail ? 1 : 0), 200);
})();
