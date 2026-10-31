'use strict';
/**
 * cos/manager/autopilot-door.js — every route autopilot serves on :7799, answered by COS's manager in the same shape (MG-003).
 * Spec: cos/spec/cos-manager.spec MOD-MG-AUTOPILOT-DOOR · Map: docs/2026-10-24-cos-manager-phasemap.spec MG16_the_autopilot_door
 *
 * James, 2026-10-31: "go" (MG16, after "okay we need the orchastration completed"). No caller of :7799 changes.
 * Supervision routes (/status, /spawn/:name, /control/:name/:op, /touch/:name) answer from COS's supervisor, in autopilot's shapes.
 * The data routes (/idle, /ledger, /graph, /contract-map/:name, /tables, /files/:system, /run-tests/:name, /warp) are autopilot's own
 * handlers, extracted from lib/nexus/autopilot.js by script (lines 936-957, 1127-1426, 1487-1609, unchanged but their two lib requires),
 * given what they read from autopilot as arguments. Until the handover (MG17) archives autopilot's body, the same handlers exist in both
 * (said in MG_D14; MG17 ends it). /tables and /files read other systems' stores directly (Cortex's JAA, Intelligence's CFR field): legacy
 * crossings §5.15 forbids, kept answering for old callers, each reply marked legacy with its replacement, each call counted with its caller.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const LEGACY = { '/tables': 'the compartment Data tab through each system\'s own routes (MG_D3)', '/files': 'the compartment Data tab through each system\'s own routes (MG_D3)' };
const STATUS_OF = { up: 'online', degraded: 'online', starting: 'starting', down: 'down', 'circuit-open': 'circuit_open', stopped: 'stopped', stopping: 'stopping',
  restarting: 'restarting', idle: 'dormant', idling: 'dormant', 'waiting-memory': 'down', external: 'external', declared: 'stopped' };

/** createDoorHandlers({ ROOT, sup, log, warp }) — autopilot's data handlers over what COS knows */
function createDoorHandlers({ ROOT, sup, log = () => {}, warp = null }) {
  const _log = log, _warpEmit = () => {};
  const ALL_KERNELS = sup.declarations(), KERNELS = ALL_KERNELS;
  const _state = new Proxy({}, { get: (_, n) => { try { const v = sup.get(String(n)); return { status: STATUS_OF[v.state] || v.state, restarts: v.restarts.count, proc: v.pid ? { pid: v.pid } : null, lastActivity: v.lastActivity || null }; } catch (_) { return undefined; } },
    ownKeys: () => sup.list().map(v => v.name), getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });
  const _warp = warp || { eventCount: 0, seq: 0, tail: () => [] };
  function _httpJson(url, timeoutMs = 1500) {
    return new Promise((resolve, reject) => {
      const req = http.get(url, { timeout: timeoutMs }, (res) => { let b = ''; res.on('data', d => { b += d; }); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(new Error('not JSON')); } }); });
      req.on('timeout', () => req.destroy(new Error('timed out'))); req.on('error', reject);
    });
  }
  async function _idleReport({ fetchJobs = null } = {}) {
    const reasons = []; const unsettled = Object.entries(_state).filter(([, s]) => UNSETTLED.has(s.status)).map(([n, s]) => `${n} is ${s.status}`);
    if (unsettled.length) reasons.push(...unsettled);
    const g = _state.guardian; const guardianUp = !!(g && g.proc && g.proc.exitCode === null && !g.proc.killed);
    let jobs = null;
    if (guardianUp) {
      try {
        const k = ALL_KERNELS.find(x => x.name === 'guardian'); const base = k && k.healthUrl ? new URL(k.healthUrl).origin : 'http://127.0.0.1:7820';
        const r = await (fetchJobs ? fetchJobs() : _httpJson(`${base}/jobs?limit=500`));
        const list = (r && r.jobs) || []; const active = list.filter(j => ACTIVE_JOB.has(String(j.status || '').toLowerCase()));
        jobs = { active: active.length, total: list.length }; if (active.length) reasons.push(`${active.length} Guardian job${active.length > 1 ? 's' : ''} in progress (${[...new Set(active.map(j => j.status))].join(', ')})`);
      } catch (e) { reasons.push(`cannot tell: Guardian is running but did not answer /jobs (${e.message})`); }
    }
    return { ok: true, idle: reasons.length === 0, reasons, guardian: guardianUp ? (jobs || { error: true }) : { running: false }, ts: Date.now() };
  }

  function _handleGraphRead(req, res) {
    try {
      const { jaaDB } = require('../../cortex/memory/jaa-db');
      const busSubs   = require('../../lib/bus-subscriptions');

      const subs  = busSubs.all(jaaDB);
      const edgeR = busSubs.edges(jaaDB);

      // Producers from the real event log. Bounded — this is a live UI read,
      // not an analytics job.
      const limitRaw = new URL(req.url, 'http://x').searchParams.get('events');
      const evLimit  = Math.min(Math.max(parseInt(limitRaw || '300', 10) || 300, 1), 2000);
      let events = [];
      try { events = jaaDB.tail('event_log', evLimit) || []; } catch (_) { events = []; }

      const producerTypes = new Map(); // "source→type" edge weights
      const sources = new Set();
      for (const e of events) {
        const src = e.source || e.system;
        const type = e.type || e.action;
        if (!src || !type) continue;
        sources.add(src);
        const k = `${src}\u0000${type}`;
        producerTypes.set(k, (producerTypes.get(k) || 0) + 1);
      }

      // Nodes = union of subscription publishers and event_log sources.
      const nodeMap = new Map();
      for (const s of (subs.systems || [])) {
        nodeMap.set(s.systemId, {
          id: s.systemId, publishes: true, stale: s.stale,
          subscriptionTypes: s.types, listeners: s.totalListeners, emitted: 0,
        });
      }
      for (const src of sources) {
        if (!nodeMap.has(src)) {
          nodeMap.set(src, { id: src, publishes: false, stale: null, subscriptionTypes: 0, listeners: 0, emitted: 0 });
        }
      }
      for (const [k, n] of producerTypes) {
        const src = k.split('\u0000')[0];
        const node = nodeMap.get(src);
        if (node) node.emitted += n;
      }

      // Producer edges: source → event type, with the consuming systems attached
      // from B1's cross-process map. THIS is the join that makes an edge real —
      // a producer and a consumer of the same type, observed independently.
      const consumersByType = new Map((edgeR.edges || []).map(e => [e.type, e]));
      // A readable-but-empty subscription table is NOT the same fact as
      // "no system consumes anything." Distinguish them explicitly.
      const anyPublisher = !!(subs.observed && (subs.systems || []).length > 0);
      const flowEdges = [];
      for (const [k, weight] of producerTypes) {
        const [source, type] = k.split('\u0000');
        const c = consumersByType.get(type);
        flowEdges.push({
          source, type, weight,
          consumers: c ? c.systems.filter(s => !s.stale).map(s => s.systemId) : [],
          liveConsumerCount: anyPublisher ? (c ? c.live : 0) : null,
          // "Emitted into the void" is only a claim we can make when at least
          // one process has actually published its subscriptions. With no
          // publishers reporting, EVERY edge would otherwise read
          // unconsumed:true — which is not "nothing consumes this", it is "we
          // cannot see yet", and conflating those two is precisely the
          // confident-and-wrong failure B1 and this whole spec exist to
          // prevent. null means unknown; it is never coerced to a number.
          unconsumed: anyPublisher ? (!c || c.live === 0) : null,
        });
      }
      flowEdges.sort((a, b) => b.weight - a.weight);

      // §T4 REAL TRAILS 2026-07-24 — now persisted by cortex/core/raid/router.js
      // (they were in-memory only until this session, which is why the first cut
      // of this endpoint honestly refused to animate them). Read from the same
      // shared store, so they survive the process that produced them.
      let trails = [], trailsObserved = false;
      try {
        const t = jaaDB.tail('raid_trails', 60) || [];
        trails = t.map(r => ({
          envelopeId: r.envelopeId, intent: r.intent, from: r.from, target: r.target,
          status: r.status, terminal: r.terminal, hops: r.hops,
          elapsedMs: r.elapsedMs, lastTs: r.lastTs,
          // the hop sequence is what an animation walks
          path: (r.trail || []).map(h => ({ system: h.system, status: h.status, ts: h.ts })),
        }));
        trailsObserved = true;
      } catch (_) { trails = []; trailsObserved = false; }

      // §MOVEMENT 2026-07-24 (James: "No mock. Only real data, the
      // artifact/contract moving through the system, events, chunks").
      // Every array below is REAL rows from the live store — nothing
      // synthesised, nothing placeholder. Where a store is empty that is
      // reported as empty, never padded: an empty movement list means "none
      // observed", and the renderer must show stillness rather than invent
      // motion. Bounded because this is a live UI read.
      const movement = { artifacts: [], chunks: [], contracts: [], trailCount: 0 };
      try {
        movement.artifacts = (jaaDB.tail('guardian_artifacts', 40) || []).map(a => ({
          id: a.uuid || a.id, system: 'guardian', kind: a.type || a.kind || 'artifact',
          label: String(a.name || a.title || a.path || a.uuid || '').slice(0, 60),
          ts: a.ts || a.createdAt || null,
        }));
      } catch (_) {}
      try {
        movement.chunks = (jaaDB.tail('idearium_spec_chunks', 40) || []).map(c => ({
          id: c.uuid || c.id, system: 'idearium', kind: 'spec-chunk',
          label: String(c.specName || c.name || c.chunkId || c.uuid || '').slice(0, 60),
          ts: c.ts || c.createdAt || null,
        }));
      } catch (_) {}
      // Contracts genuinely in flight, read from the real input/output folders
      // rather than a table — that IS where a contract lives. Their addenda are
      // the journey the artifact accumulated (lib/contract-queue.js).
      try {
        const seen = new Set();
        for (const sysDir of fs.readdirSync(ROOT, { withFileTypes: true })) {
          if (!sysDir.isDirectory() || sysDir.name.startsWith('.') || sysDir.name === 'node_modules') continue;
          for (const box of ['input', 'output']) {
            const d = path.join(ROOT, sysDir.name, box);
            if (!fs.existsSync(d)) continue;
            for (const f of fs.readdirSync(d)) {
              if (!f.endsWith('.json') || movement.contracts.length >= 40) continue;
              try {
                const c = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
                if (!c || !c.uuid || seen.has(c.uuid)) continue;
                seen.add(c.uuid);
                movement.contracts.push({
                  id: c.uuid, kind: 'contract', label: String(c.intent || '').slice(0, 60),
                  from: c.fromSystem, to: c.toSystem, status: c.status,
                  hops: Array.isArray(c.addenda) ? c.addenda.length : 0,
                  // the real path this artifact travelled, system by system
                  path: (c.addenda || []).map(a => ({ system: a.system, action: a.action, ts: a.ts })),
                  ts: c.updatedAt || c.createdAt || null,
                });
              } catch (_) {}
            }
          }
        }
      } catch (_) {}
      movement.trailCount = trails.length;

      // CFR for colouring — read from disk so it survives a wedged cortex.
      let cfr = null;
      try {
        const p = path.join(process.env.NEXUS_DATA_ROOT || path.join(ROOT, 'data'), 'guardian', 'ledger', 'cfr', 'cfr_state.json');
        if (fs.existsSync(p)) {
          cfr = JSON.parse(fs.readFileSync(p, 'utf8'));
          // cfr_state.json persists the four axes only — `regime` is DERIVED,
          // not stored (verified by reading the real file, after the first draft
          // assumed a regime field and got undefined). Derive it with the same
          // function the rest of NEXUS uses rather than reimplementing the
          // thresholds here, which would be a second truth (§10.3).
          if (cfr && cfr.regime === undefined) {
            try { cfr.regime = require('../../intelligence/cfr/field').computeRegime(cfr); }
            catch (_) { cfr.regime = null; }
          }
        }
      } catch (_) { cfr = null; }

      return _ledgerJson(res, 200, {
        ok: true,
        nodes: [...nodeMap.values()].sort((a, b) => (a.id < b.id ? -1 : 1)),
        edges: flowEdges.slice(0, 400),
        consumerEdges: (edgeR.edges || []).slice(0, 200),
        trails,
        trailsObserved,
        movement,
        cfr,
        subscriptionsObserved: !!subs.observed,
        staleAfterMs: busSubs.STALE_MS,
        eventsSampled: events.length,
        // §1.2 — the map states its own limits inline, so a reader of the raw
        // API (not just the UI) cannot mistake absence for emptiness.
        notes: {
          raidTrails: trailsObserved
            ? (trails.length
                ? 'real persisted RAID envelope trails from raid_trails — every hop with real timestamps; nothing synthesised'
                : 'trail store readable but EMPTY — no route has been persisted yet (router.js writes on every stamp). Empty is not "routing does not happen"; it is "none observed yet".')
            : 'trail store UNREADABLE — trails absent, not zero',
          consumers: !subs.observed
            ? `UNREADABLE — ${subs.reason || 'store unavailable'}; consumer counts are absent, not zero`
            : anyPublisher
              ? 'cross-process, from lib/bus-subscriptions (§B1)'
              : 'store readable but NO system has published subscriptions yet (cortex/orchestrator publish on boot) — consumer counts are UNKNOWN (null), not zero',
        },
      });
    } catch (e) {
      return _ledgerJson(res, 500, { ok: false, error: `${e.code || ''} ${e.message}` });
    }
  }

  // ── §TABLET T2 — container shell handlers ──────────────────────────────────

  // Contract proxy: GET /contract-map/:system → that system's own GET /contract.
  // The port comes from the kernel's OWN healthUrl — no second topology map to
  // drift (§5.14: depend on the contract, not a hardcoded address).
  function _handleContractProxy(req, res) {
    const name = req.url.split('?')[0].split('/')[2] || '';
    const kernel = (ALL_KERNELS || KERNELS).find(k => k.name === name && k.healthUrl);
    if (!kernel) return _ledgerJson(res, 404, { ok: false, error: `no kernel '${name}' with a health surface` });
    const u = new URL(kernel.healthUrl);
    const pr = http.get({ hostname: u.hostname, port: u.port, path: '/contract', timeout: 3000 }, (up) => {
      let d = '';
      up.on('data', c => d += c);
      up.on('end', () => {
        try { _ledgerJson(res, up.statusCode || 200, JSON.parse(d)); }
        catch { _ledgerJson(res, 502, { ok: false, error: `'${name}' /contract returned non-JSON`, raw: d.slice(0, 200) }); }
      });
    });
    pr.on('error', e => _ledgerJson(res, 503, { ok: false, error: `'${name}' unreachable: ${e.message}` }));
    pr.setTimeout(3000, () => { pr.destroy(); _ledgerJson(res, 504, { ok: false, error: `'${name}' /contract timeout` }); });
  }

  // JAA tables: GET /tables → every table + row count; GET /tables/:name →
  // rows (?limit=N, default 100, max 1000). DISK-BACKED (observation law):
  // reads the store's real .json files directly — answers even when every
  // system holding the store in memory is wedged. Read-only by construction.
  const JAA_STORE_DIR = path.join(ROOT, 'data', 'cortex', 'memory');
  function _handleTablesRead(req, res) {
    const parts = req.url.split('?')[0].split('/').filter(Boolean).slice(1);
    if (parts.length > 1) return _ledgerJson(res, 400, { ok: false, error: 'at most /tables/:name' });
    if (parts.length === 1 && !_segSafe(parts[0])) return _ledgerJson(res, 400, { ok: false, error: 'invalid table name' });
    try {
      if (parts.length === 0) {
        const tables = fs.readdirSync(JAA_STORE_DIR)
          .filter(f => f.endsWith('.json'))
          .map(f => {
            const st = fs.statSync(path.join(JAA_STORE_DIR, f));
            let rows = null;
            try { const parsed = JSON.parse(fs.readFileSync(path.join(JAA_STORE_DIR, f), 'utf8')); rows = Array.isArray(parsed) ? parsed.length : null; }
            catch (_) { rows = -1; } // corrupt reported, not hidden (§1.2)
            return { name: f.replace(/\.json$/, ''), bytes: st.size, rows };
          })
          .sort((a, b) => a.name < b.name ? -1 : 1);
        return _ledgerJson(res, 200, { ok: true, dir: 'data/cortex/memory', tables });
      }
      const file = path.join(JAA_STORE_DIR, parts[0] + '.json');
      if (!path.resolve(file).startsWith(path.resolve(JAA_STORE_DIR))) return _ledgerJson(res, 400, { ok: false, error: 'path escapes store' });
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(parsed)) return _ledgerJson(res, 200, { ok: true, table: parts[0], rows: 1, shape: 'single-object', data: parsed });
      const limitRaw = new URL(req.url, 'http://x').searchParams.get('limit');
      const limit = Math.min(Math.max(parseInt(limitRaw || '100', 10) || 100, 1), 1000);
      return _ledgerJson(res, 200, { ok: true, table: parts[0], total: parsed.length, returned: Math.min(limit, parsed.length), rows: parsed.slice(-limit) });
    } catch (e) {
      if (e.code === 'ENOENT') return _ledgerJson(res, 404, { ok: false, error: `no such table: ${parts[0] || '(root)'}` });
      return _ledgerJson(res, 500, { ok: false, error: `${e.code || ''} ${e.message}` });
    }
  }

  // File tree: GET /files/:system[/*] → data/<system> subtree listing (dirs +
  // file names/sizes/mtimes, no contents — the ledger routes read contents
  // where reading is the point). Same segment allowlist + containment as T1.
  function _handleFilesRead(req, res) {
    const parts = req.url.split('?')[0].split('/').filter(Boolean).slice(1);
    if (!parts.length || parts.length > 6) return _ledgerJson(res, 400, { ok: false, error: '/files/:system[/subpath], max depth 6' });
    if (!parts.every(_segSafe)) return _ledgerJson(res, 400, { ok: false, error: 'invalid path segment' });
    const base = path.join(ROOT, 'data');
    const fsPath = path.join(base, ...parts);
    if (!path.resolve(fsPath).startsWith(path.resolve(base))) return _ledgerJson(res, 400, { ok: false, error: 'path escapes data root' });
    try {
      const entries = fs.readdirSync(fsPath, { withFileTypes: true });
      const dirs  = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
      const files = entries.filter(e => e.isFile()).map(e => {
        const st = fs.statSync(path.join(fsPath, e.name));
        return { name: e.name, bytes: st.size, mtime: st.mtimeMs };
      }).sort((a, b) => a.name < b.name ? -1 : 1);
      return _ledgerJson(res, 200, { ok: true, path: parts.join('/'), dirs, files });
    } catch (e) {
      if (e.code === 'ENOENT') return _ledgerJson(res, 404, { ok: false, error: `not found: ${parts.join('/')}` });
      if (e.code === 'ENOTDIR') return _ledgerJson(res, 400, { ok: false, error: 'not a directory — this route lists, the ledger routes read' });
      return _ledgerJson(res, 500, { ok: false, error: `${e.code || ''} ${e.message}` });
    }
  }

  // Real test invocation: POST /run-tests/:system spawns THE REAL runner with
  // --filter=<system>. Returns the tail of output + pass/fail on completion.
  // One run at a time (overlapping runs corrupt each other's timing-sensitive
  // suites on one machine).
  let _testRunActive = false;
  // §BUILT 2026-09-06 — James: "i feel system should have tests each boot
  // to make sure the vitals parts function." Real, existing infrastructure
  // reused, not duplicated: _handleRunTests below already spawns a real
  // test process on demand (HTTP-triggered, tests/modules/run-all.js).
  // This is that same real spawn-and-parse discipline, applied
  // automatically once boot genuinely completes (wired into the one real
  // place that already knows: _bootPhases()'s own .then(), only when boot
  // did NOT halt) — never blocks or fails the boot itself if a vital
  // regresses; it surfaces it loudly instead, which is the actual point
  // (a silent regression is what caused every "keeps getting broken"
  // complaint this session traced back to a merge). Runs
  // tests/verify-ncp-agents.js specifically — the already-curated,
  // already-fast set of 8 real NCP/agent fixes (not the full test suite,
  // which would meaningfully delay every single boot for tests unrelated
  // to whether the system can actually dispatch to an agent).
  const VITALS_TIMEOUT_MS = 180000;
  // §UP7 0.60.254 — James, 2026-10-26: "should be automatic". Nexus keeps itself current from GitHub (lib/nexus-update.js): 2 min after
  // boot, then every policy.everyHours; with policy auto (the default) it applies when /idle says so, runs npm install off this thread
  // when the lockfile changed, and restarts the changed systems through controlKernel — never Clear Glass, which waits for him.
  // NEXUS_AUTO_UPDATE=0 turns the timer off for this run (tests, a pinned install).
  function _handleRunTests(req, res) {
    const name = req.url.split('?')[0].split('/')[2] || '';
    if (!_segSafe(name)) return _ledgerJson(res, 400, { ok: false, error: 'invalid system name' });
    // §RECURSION GUARD 2026-07-24 — refuse to spawn a test runner from
    // inside a test runner. Found the hard way: a suite that POSTs here
    // with a filter matching ITSELF makes the spawned runner re-run that
    // suite, which spawns another runner, forever. _testRunActive can't
    // catch it (each nested run is a fresh process with its own state), so
    // the guard has to ride in the environment. Depth is bounded at 1: the
    // tablet's own invocation is depth 0, anything it spawns is depth 1 and
    // may not spawn further.
    if (process.env.NEXUS_TEST_RUN_DEPTH) {
      return _ledgerJson(res, 409, { ok: false, error: 'refusing to spawn a test run from inside a test run (recursion guard)' });
    }
    if (_testRunActive) return _ledgerJson(res, 409, { ok: false, error: 'a test run is already active — one at a time' });
    _testRunActive = true;
    const { spawn } = require('child_process');
    // §SANDBOX 2026-09-25 — run-all gives each suite its own root; this marks
    // the runner itself as a test process too.
    const sb = require('../../lib/test-sandbox.js').childEnv({ ...process.env, NEXUS_TEST_RUN_DEPTH: '1' });
    const proc = spawn(process.execPath, [path.join(ROOT, 'tests', 'modules', 'run-all.js'), `--filter=${name}`], {
      cwd: ROOT,
      env: sb.env,
    });
    proc.on('close', sb.cleanup);
    let out = '';
    const cap = (c) => { out += c.toString(); if (out.length > 60000) out = out.slice(-60000); };
    proc.stdout.on('data', cap); proc.stderr.on('data', cap);
    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch (_) {} }, 180000);
    proc.on('exit', (code) => {
      clearTimeout(timer);
      _testRunActive = false;
      const totalMatch = out.match(/TOTAL:\s+(\d+) passed\s+(\d+) failed/);
      _warpEmit('autopilot.container.tests.done', { system: name, code, passed: totalMatch ? +totalMatch[1] : null, failed: totalMatch ? +totalMatch[2] : null });
      _ledgerJson(res, 200, {
        ok: code === 0, exitCode: code,
        passed: totalMatch ? +totalMatch[1] : null,
        failed: totalMatch ? +totalMatch[2] : null,
        tail: out.split('\n').slice(-40).join('\n'),
      });
    });
  }

  // ── §TABLET T1 — ledger explorer read handlers ─────────────────────────────
  const LEDGER_ROOT = path.join(ROOT, 'data', 'ledger');
  // One segment: letters, digits, dot, dash, underscore. A single leading dot
  // or any '..' is rejected outright — '.' only ever appears INSIDE hook names
  // (cortex.gaps.list) and day names (2026-07-24.jsonl), never leading.
  const SEG_OK = /^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/;
  const _segSafe = (s) => typeof s === 'string' && s.length <= 128 && SEG_OK.test(s) && !s.includes('..');

  function _ledgerJson(res, code, obj) {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(obj));
  }

  function _handleLedgerRead(req, res) {
    const parts = req.url.split('?')[0].split('/').filter(Boolean).slice(1); // drop 'ledger'
    if (parts.length > 3) return _ledgerJson(res, 400, { ok: false, error: 'at most /ledger/:system/:hook/:day' });
    if (!parts.every(_segSafe)) return _ledgerJson(res, 400, { ok: false, error: 'invalid path segment' });

    const fsPath = path.join(LEDGER_ROOT, ...parts);
    // Belt-and-braces on top of segment validation: the resolved path must
    // still be inside the ledger root. Never trust one check alone (§4.3).
    if (!path.resolve(fsPath).startsWith(path.resolve(LEDGER_ROOT))) {
      return _ledgerJson(res, 400, { ok: false, error: 'path escapes ledger root' });
    }

    try {
      if (parts.length === 3 || (parts.length >= 1 && fsPath.endsWith('.jsonl'))) {
        // Leaf: a day file (or a loose top-level .jsonl like orchestrator.jsonl).
        // Parse per-line; corrupt lines are REPORTED, not silently dropped (§1.2).
        const raw = fs.readFileSync(fsPath.endsWith('.jsonl') ? fsPath : fsPath + '.jsonl', 'utf8');
        const events = []; let corrupt = 0;
        for (const line of raw.split('\n')) {
          if (!line.trim()) continue;
          try { events.push(JSON.parse(line)); } catch (_) { corrupt++; }
        }
        // Bounded response: ?limit=N (default 500, max 5000), newest last.
        const limitRaw = new URL(req.url, 'http://x').searchParams.get('limit');
        const limit = Math.min(Math.max(parseInt(limitRaw || '500', 10) || 500, 1), 5000);
        const slice = events.length > limit ? events.slice(-limit) : events;
        return _ledgerJson(res, 200, {
          ok: true, path: parts.join('/'), total: events.length,
          returned: slice.length, corruptLines: corrupt, events: slice,
        });
      }

      // Directory listing: systems, hooks, or day files.
      const entries = fs.readdirSync(fsPath, { withFileTypes: true });
      const dirs  = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
      const files = entries.filter(e => e.isFile() && e.name.endsWith('.jsonl'))
        .map(e => { const st = fs.statSync(path.join(fsPath, e.name)); return { name: e.name, bytes: st.size, mtime: st.mtimeMs }; })
        .sort((a, b) => a.name < b.name ? -1 : 1);
      return _ledgerJson(res, 200, { ok: true, path: parts.join('/') || '(root)', dirs, files });
    } catch (e) {
      if (e.code === 'ENOENT') return _ledgerJson(res, 404, { ok: false, error: `not found: ${parts.join('/')}` });
      return _ledgerJson(res, 500, { ok: false, error: `${e.code || ''} ${e.message}` });
    }
  }

  // ── On-demand: spawn-request, health-gate, idle-despawn ────────────────────
  // §BUILT 2026-07-15 — "cos as a kind of PID service, only running what's
  // needed." Reuses _spawnKernel exactly as-is (same memory-safety checks,
  // same Windows path quoting, same heap limits — no second, divergent
  // spawn implementation) and adds the one real thing that was missing:
  // gating readiness on an actual health check instead of a fixed timer,
  // and tearing a process down again once nothing needs it.

  let _jaaDB = null;
  function _getJaaDB() {
    if (_jaaDB) return _jaaDB;
    try { ({ jaaDB: _jaaDB } = require('../../cortex/memory/jaa-db.js')); }
    catch (e) { console.warn(`[autopilot] jaaDB unavailable — on-demand events will log to console only: ${e.message}`); _jaaDB = false; }
    return _jaaDB;
  }

  // §THE EVENT-TRACKING PIECE — "all the events are supposed to be tracked,
  // using the meta system." Every real spawn/gate/despawn transition below
  // writes a real event_log row with a causedBy chain (request -> spawn ->
  // gate result), the same shape intelligence/cfr/graph.js's CausalGraph already
  // ingests everywhere else in this codebase — not a new, parallel logging
  // path, the same one.

  return { _idleReport, _handleGraphRead, _handleContractProxy, _handleTablesRead, _handleFilesRead, _handleRunTests, _handleLedgerRead, _warp };
}

/** mount(sup, { ROOT }) → (req, res) → true when it answered: autopilot's routes, in autopilot's shapes */
function mount(sup, { ROOT, log } = {}) {
  const H = createDoorHandlers({ ROOT, sup, log });
  const callers = new Map();   // GATE-MG16-002: each legacy call counted with its caller
  const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(body)); };
  const status = () => {
    const kernels = {};
    for (const v of sup.list()) kernels[v.name] = { status: STATUS_OF[v.state] || v.state, restarts: v.restarts.count, crashesInWindow: v.crashesInWindow,
      lastExit: v.lastExit, downSince: v.downSince, pid: v.pid, healthUrl: v.healthUrl, port: v.port };
    let ledger = null;
    try { ledger = { ...require('../../lib/ledger-sse').health(), errorLog: require('../../lib/error-log').health(), recentEvents: [] }; } catch (e) { ledger = { ok: false, error: e.message }; }
    return { ok: true, kernels, boot: sup.lastBoot || null, ledger, ts: Date.now(), by: 'cos' };
  };
  function legacy(req, route) {
    const who = req.headers['x-nexus-caller'] || req.headers['user-agent'] || 'unknown';
    const k = `${route} ${who}`; const c = callers.get(k) || { route, caller: who, count: 0, lastAt: null }; c.count++; c.lastAt = Date.now(); callers.set(k, c);
  }
  const handler = (req, res) => {
    const url = req.url, m = req.method;
    if (m === 'GET' && url === '/idle') { H._idleReport().then(r => send(res, 200, r), e => send(res, 500, { ok: false, error: e.message })); return true; }
    if (url === '/status') { send(res, 200, status()); return true; }
    let x;
    if (m === 'POST' && (x = /^\/spawn\/([a-zA-Z0-9-]+)$/.exec(url))) {
      let v; try { v = sup.get(x[1]); } catch (_) { send(res, 503, { ok: false, error: `no such kernel: ${x[1]}` }); return true; }
      if (!v.onDemand) { send(res, 503, { ok: false, error: `${x[1]} is not an on-demand kernel — it's already always-on` }); return true; }
      if (v.pid) { send(res, 200, { ok: true, alreadyRunning: true, state: STATUS_OF[v.state] || v.state }); return true; }
      sup.touch(x[1]);
      (async () => { const until = Date.now() + 30000; while (Date.now() < until) { const n = sup.get(x[1]); if (n.state === 'up') return send(res, 200, { ok: true, verified: true }); if (!n.pid && n.state !== 'starting') break; await new Promise(r => setTimeout(r, 250)); }
        const n = sup.get(x[1]); send(res, n.pid ? 200 : 503, n.pid ? { ok: true, verified: false } : { ok: false, error: `${x[1]} spawned but never became healthy at ${n.healthUrl}` }); })();
      return true;
    }
    if (m === 'POST' && (x = /^\/control\/([a-zA-Z0-9-]+)\/(restart|stop|start)$/.exec(url))) {
      let v; try { v = sup.get(x[1]); } catch (_) { send(res, 404, { ok: false, code: 404, error: `no such system: ${x[1]}` }); return true; }
      if (x[2] === 'stop' && !v.pid) { send(res, 200, { ok: true, status: 'held', note: 'it was not running — held' }); return true; }
      if (x[2] === 'start' && v.pid) { send(res, 200, { ok: true, status: STATUS_OF[v.state] || v.state, alreadyRunning: true }); return true; }
      const r = sup[x[2]](x[1], { by: 'rule:autopilot-door' });
      send(res, 200, { ok: true, status: STATUS_OF[r.state] || r.state, ...(x[2] === 'start' && !v.pid && v.state !== 'up' ? { note: 'it was not running — started' } : {}) }); return true;
    }
    if (m === 'POST' && (x = /^\/touch\/([a-zA-Z0-9-]+)$/.exec(url))) { try { sup.touch(x[1]); } catch (_) {} send(res, 200, { ok: true }); return true; }
    if (m === 'GET' && url.startsWith('/ledger')) { H._handleLedgerRead(req, res); return true; }
    if (m === 'GET' && url.startsWith('/graph')) { H._handleGraphRead(req, res); return true; }
    if (m === 'GET' && url.startsWith('/contract-map/')) { H._handleContractProxy(req, res); return true; }
    if (m === 'GET' && url.startsWith('/tables')) { legacy(req, '/tables'); res.setHeader('X-Nexus-Legacy', LEGACY['/tables']); H._handleTablesRead(req, res); return true; }
    if (m === 'GET' && url.startsWith('/files/')) { legacy(req, '/files'); res.setHeader('X-Nexus-Legacy', LEGACY['/files']); H._handleFilesRead(req, res); return true; }
    if (m === 'POST' && url.startsWith('/run-tests/')) { H._handleRunTests(req, res); return true; }
    if (m === 'GET' && url.startsWith('/warp')) { send(res, 200, { ok: true, events: H._warp.eventCount, seq: H._warp.seq, tail: H._warp.tail(100), ts: Date.now() }); return true; }
    return false;
  };
  handler.legacyCallers = () => [...callers.values()];
  return handler;
}

module.exports = { mount, createDoorHandlers, STATUS_OF, LEGACY };
