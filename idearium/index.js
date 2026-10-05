/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  IdeaOS — idearium/core/index.js                                       ║
 * ║  UUID:    idearium-core-v1-0000-4000-0000-000000000001                 ║
 * ║  Version: pre-release                                                        ║
 * ║  Layer:   idearium.core                                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * The Idea OS. Not a notes app. Not a todo list.
 * Every idea is a JAA node with causal ancestry, tension score, and a spec.
 * All state lives here. CLI and API are projections. UI is a projection of API.
 *
 * §8.3  SISO is a load-order prerequisite.
 * §3.1  Foundation before modules. Modules before UI.
 * §1.2  Nothing silently fails.
 * §2.1  Persistence is the golden rule.
 * §5.1  Everything has a UUID.
 * §7.1  Dual ledger — Upgrade Ledger (truth) + Idea Ledger (cognition).
 */

import { Event, Gate, Stream, StreamLog } from '../siso/core/index.js';
import { registerCortexListeners } from './lib/cortex-listeners.js';
import { createRequire } from 'module';
import { randomUUID }    from 'crypto';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadTable, syncTable, migrateOnce } from './lib/db.js';
import { STATE_KIND as REPO_SNAPSHOT_KIND } from './repo/snapshot.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
// §SNAPSHOTGATE MERGE 2026-09-01 — sovereign transport to reach cortex's
// canonical versionium, same pattern lib/agent-tools/tools/governance/
// versionium-commit.js already uses. lib/nexus-client.js is CommonJS
// (module.exports = { ... }); this file is loaded as ESM, hence _require.
const nx = _require('../lib/nexus-client.js');
// §0.39.300 VX1 — versionium's calls as the contract the five snapshot methods below were written against: a failure
// comes back as { error, status }, never a throw. lib/nexus-client throws on an unreachable system and on every non-2xx,
// so with versionium down GET /api/snapshots was an unhandled 500 on every page load and a missing commit a 500, not a 404.
const _vxErr = (e) => { const m = /-> HTTP (\d{3})/.exec(e.message); return { error: e.message, status: m ? +m[1] : 502 }; };
const vx = {
  get: (p, o) => nx.get('versionium', p, o).catch(_vxErr),
  post: (p, b, o) => nx.post('versionium', p, b, o).catch(_vxErr),
};

// §WIRED 2026-07-18 — "resonance-weighted idea/spec/gap graph" (meta/spatial/
// lattice.js's own header) existed, fully built, and was never called from
// anywhere — api/index.js declared _latticeAdd/_latticeLink twice (once at
// module scope, once as dead code accidentally pasted inside the boot
// callback where it was unreachable) and neither copy had a single real
// caller anywhere in the codebase. Moved here deliberately, not left in
// api/index.js: idearium's own header above says "CLI and API are
// projections... All state lives here" — wiring this into API route
// handlers instead of the actual Gates would mean CLI-driven idea/spec/gap
// creation silently skipped lattice tracking while API-driven creation
// didn't, an inconsistency between two entry points to the same state
// change. Wired into the Gates themselves so it applies uniformly
// regardless of entry point.
// §KNOWN LIMITATION, NOT SILENTLY HIDDEN — LatticeGraph itself is pure
// in-memory (a JS Map, no jaaDB/cortex-write call anywhere in that file) —
// this graph does not survive a process restart. Wiring it in is still a
// real improvement (empty and unreachable -> populated and queryable for
// the life of the process) but persistence is separate, larger work,
// flagged here rather than assumed.
let _latticeEng = null;
function _getLattice() {
  if (_latticeEng) return _latticeEng;
  try {
    const { LatticeEngine } = _require('../intelligence/spatial/lattice.js');
    _latticeEng = new LatticeEngine({ threshold: 0.3 });
  } catch (e) {
    console.error(`[idearium] lattice init failed (non-fatal, tracking disabled this process): ${e.message}`);
  }
  return _latticeEng;
}
// Lattice tracking is enrichment, not core state — a failure here must
// never block or corrupt the actual idea/spec/gap mutation it is
// observing (§1.2 applies to the mutation, not to this side channel).
function _latticeAdd(id, label, tags = []) {
  try { const l = _getLattice(); if (l) l.add({ id, label: String(label || id).slice(0, 80), tags }); } catch (_) {}
}
function _latticeLink(a, b, w = 0.7, t = 'associated') {
  try {
    const l = _getLattice();
    if (!l) return;
    // §BUG FOUND AND FIXED 2026-07-18 — this used to call _latticeAdd(a,a)
    // unconditionally as a defensive "make sure the node exists" step
    // before connecting. LatticeGraph.addNode() has no existence check —
    // it always overwrites — so linking two nodes that already had real
    // labels (an idea's own text, a spec's own name) silently replaced
    // both labels with their bare UUIDs. Caught by testing: linked two
    // real ideas, read the neighbor list back, the label was a UUID
    // instead of the idea's actual text. Only add-if-missing now.
    const g = l.graph();
    if (!g.getNode(a)) _latticeAdd(a, a);
    if (!g.getNode(b)) _latticeAdd(b, b);
    l.connect(a, b, w, t);
  } catch (_) {}
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const VERSION   = '4.28.0';   // 0.39.308 synced (the hat is created with the repo) · 0.39.307 synced (spec sections judged as sections; the guardian click picks a guardian agent) · 0.39.306 synced (his sections are never reused across specs) · 0.39.305 synced (templates frame every spec, his words seed it) · 0.39.304 synced (phases proven from their files) · 0.39.303 synced (phase runs end in proof) · 0.39.302 synced (the delivery checker) · 0.39.300 synced (versionium stated, one bar, the workshop's bar) · 0.39.299 synced (the architect on one canvas) · 0.39.298 synced (the architect) · 0.39.297 synced (the workshop's own page) · 0.39.296 synced (the void hardened) · 0.39.295 synced (the spatial void) · 0.39.294 synced (the spec workshop) · 0.39.293 synced (desktop image + login) · 0.39.292 synced (library spec → pipeline) · 0.39.291 synced (verify + prove) · 0.39.290 synced (the spec library) · 0.39.288 synced (in-place nexus-self spec update) · 0.39.287 synced (learned routing) · 0.39.286 synced (routing, registry block) · 0.39.285 synced (file versions, chunk reassign) · 0.39.284 synced (work surface, plan fallbacks, archive import, ui.* config). 0.39.283 synced (draft review, shadow, Manage workbench). 0.39.282 synced (default_provider, desktop login, blocked jobs). §0.39.281 synced — had stayed at 4.7.0 while package.json moved to 4.11.0.   // §5.4 fix 2026-08-08 — was 3.0.0, drifted from canonical lib/version.js's services.idearium (3.2.0)
                                     // §2026-09-22 — real bump: eravos mods in the New Spec picker + Brainstorm AI assistance. See idearium.spec's meta.version comment.
                                     // §5.4 fix 2026-09-13 — same drift recurred: idearium/package.json had moved
                                     // on to 4.1.0 through the 2026-09-03 "idearium 3.3.0" session and beyond,
                                     // while this constant, lib/version.js's services.idearium, and
                                     // idearium/spec/idearium.spec's meta.version all stayed at 3.2.0. All four
                                     // now read 4.1.0 together.
export const NAMESPACE = 'idearium';
export const PORT      = 4800;

export const IDEA_PHASES   = ['seed','expanding','tensioned','specced','building','complete','archived'];
export const GAP_STATUSES  = ['open','resolved','ignored','archived'];
export const GAP_SEVERITIES= ['fatal','high','medium','low'];
export const LINK_TYPES    = ['resonance','tension','causal','temporal','semantic'];

// SNR translation table — from interaction-contract spec
export const SNR_WEIGHTS = {
  'idea.created':   0.9,
  'spec.created':   0.95,
  'spec.built':     1.0,
  'gap.resolved':   0.85,
  'ci.run':         0.9,
  'push.complete':  0.95,
  'idea.tensioned': 0.7,
  'spec.updated':   0.6,
  'idea.updated':   0.5,
  'idea.linked':    0.65,
  'snr.update':     0.1,
  'guardian.health':0.15,
  'idea.archived':  0.2,
  'gap.ignored':    0.3,
};
const SNR_WINDOW = 50;

// ─── Storage ──────────────────────────────────────────────────────────────────

// §DB-MIGRATION 2026-07-14 — "idearium needs to use a database, in cortex."
// idearium was the last subsystem in NEXUS still on hand-rolled flat-file
// JSON (idearium.json rewritten WHOLE on every single mutation — every idea
// edit re-serialized every idea, every gap, every event, every snapshot's
// full deep-cloned state). Everything else already shares cortex's real
// store (guardian/jaa-store.js, tables-as-Maps, per-table debounced disk
// flush) via cortex/memory/jaa-db.js. idearium/lib/db.js plugs into that
// exact seam — see its header for the full rationale. This file no longer
// owns any storage mechanics of its own, only table names and which keys
// each gate touches.
//
// Was '../../data' — idearium/ -> .. -> nexus/ -> .. -> OUTSIDE the repo
// entirely. Every "ideas 0 / specs 0" all session was this: loadDB() found
// no file at the (wrong) resolved path and silently returned freshDB() —
// never touching the real data at nexus/data/idearium.json. Same off-by-one
// as the event ledger path, same root cause, fixed together. The flat file
// this bug describes is now only read ONCE, as a migration source (below) —
// left on disk afterward, untouched, as an archive (§7.4).
// §FIXED 2026-09-06 — same real fix as idearium/api/index.js's
// IDEARIUM_DATA_DIR (see that file's own comment for the full finding).
// §SANDBOX 2026-09-25 — idearium/lib/data-dir.cjs decides (test processes get a temp root).
const DATA_DIR = _require('./lib/data-dir.cjs').ideariumDataDir();
const DB_FILE  = join(DATA_DIR, 'idearium.json');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

// idearium_<key> — kept out of cortex's own table namespace (artifacts,
// gaps, ledger_entries, settings, ...); cortex's own 'gaps' are a different
// thing (system-wide gap detection) from idearium's idea-gaps.
// §SNAPSHOTGATE MERGE 2026-09-01 — 'snapshots' removed. idearium no longer
// loads or writes idearium_snapshots; that table's real, pre-merge rows are
// left on disk as-is (not deleted, not migrated automatically — deciding
// whether to backfill them into cortex/versionium as system:'idearium'
// commits is a real, separate call that isn't made here).
const TABLES = {
  ideas:     'idearium_ideas',
  specs:     'idearium_specs',
  gaps:      'idearium_gaps',
  links:     'idearium_links',
  events:    'idearium_events',
  snr:       'idearium_snr',
  tensions:  'idearium_tensions',
};

function readLegacyFlatFile() {
  if (!existsSync(DB_FILE)) return null;
  try { return JSON.parse(readFileSync(DB_FILE, 'utf8')); }
  catch (err) { console.error(`[IdeaOS] legacy flat-file unreadable, skipping migration: ${err.message}`); return null; }
}

function loadDB() {
  ensureDataDir();
  const db = freshDB();
  const legacy = readLegacyFlatFile();
  for (const [key, table] of Object.entries(TABLES)) {
    const mig = migrateOnce(table, legacy ? (legacy[key] || []) : [], 'uuid');
    if (mig.migrated) console.log(`[IdeaOS] migrated ${mig.count} legacy '${key}' rows -> cortex table '${table}'`);
    db[key] = loadTable(table);
  }
  return db;
}

// `keys`: which of db's arrays actually changed — only those tables get
// diffed/written. Omit (or pass nothing) to sync everything, which stays
// correct but loses the point of a per-table store; every call site below
// names its keys explicitly.
//
// §CROSS-PROCESS FIX 2026-07-18 — syncTable() itself no longer deletes on
// absence by default (see lib/db.js's own header for the full account: a
// concurrent CLI invocation and the API server are two real separate
// processes, proven to silently destroy each other's writes under the old
// mirror-delete behavior). 'events' is the one table here that is
// genuinely a bounded window (this.db.events = this.db.events.slice(-5000)
// below) rather than archived-in-place state, so it alone opts back into
// delete-on-absence — everything else (ideas/specs/gaps/links/snapshots/
// tensions/snr) gets the safe default.
function saveDB(db, keys) {
  const list = (keys && keys.length) ? keys : Object.keys(TABLES);
  for (const key of list) {
    if (!TABLES[key]) { console.error(`[IdeaOS][ERROR] saveDB: unknown table key '${key}'`); continue; }
    syncTable(TABLES[key], db[key] || [], 'uuid', { allowDelete: key === 'events' });
  }
}

function freshDB() {
  return {
    _version:  VERSION,
    _savedAt:  null,
    ideas:     [],
    specs:     [],
    gaps:      [],
    links:     [],
    events:    [],
    snr:       [],
    tensions:  [],
  };
}

// ─── IdeaOS ───────────────────────────────────────────────────────────────────

export class IdeaOS {
  constructor() {
    this.log    = new StreamLog('DATA');
    this.stream = new Stream({ log: this.log });
    this.db     = loadDB();
    this._sseClients = new Set(); // HTTP SSE subscribers
    // §LAW II — event ledger: every emit written before routing
    try {
      const _require = createRequire(import.meta.url);
      // §CFR-WIRE-04: this used to require('../../lib/event-ledger') — one
      // '..' too many (idearium/ -> .. -> nexus/ -> .. -> outside the repo),
      // so _evLedger was permanently null. Fixed path AND upgraded straight
      // to the CFR-Ω ledger (sigma/delta/field annotation + /cfr/* routes),
      // same drop-in surface as cortex/guardian/bridge/orchestrator.
      const { createCFRLedger } = _require('../intelligence/cfr/ledger');
      this._evLedger = createCFRLedger({
        // §SANDBOX 2026-09-25 — same data/idearium as before in production;
        // a test's own sandbox otherwise (it wrote the real one on every run).
        ledgerDir: _require('./lib/data-dir.cjs').ideariumLedgerDir(),
        systemId: 'idearium',
      });
      this._evLedger.open();
      this._evLedger.startAutoSave(60000);
    } catch(e) { this._evLedger = null; console.error(`[idearium][ERROR] cfr ledger init failed: ${e.message}`); }

    this._registerGates();
    // Side-channel observer, not a gate — persists chunk completions and
    // build artifacts into cortex as they happen. See lib/cortex-listeners.js.
    try { registerCortexListeners(this); }
    catch (e) { console.error(`[IdeaOS] cortex listener registration failed: ${e.message}`); }
    this._recalcSNR();
    console.log(`[IdeaOS] v${VERSION} — ${this.db.ideas.length} ideas, ${this.db.gaps.filter(g=>g.status==='open').length} open gaps, SNR ${this.snr.toFixed(3)}`);
  }

  // ─── Gate Registration ──────────────────────────────────────────────────────

  _registerGates() {
    const S = this.stream;
    // Every mutation is a gate. No state change outside the stream. (§5.1, §5.7)
    S.register(new IdeaCreateGate(this));
    S.register(new IdeaUpdateGate(this));
    S.register(new IdeaPhaseGate(this));
    S.register(new IdeaLinkGate(this));
    S.register(new IdeaTensionGate(this));
    S.register(new IdeaArchiveGate(this));
    S.register(new SpecArchiveGate(this));
    S.register(new SpecCreateGate(this));
    S.register(new SpecUpdateGate(this));
    S.register(new SpecCheckGate(this));
    S.register(new GapOpenGate(this));
    S.register(new GapResolveGate(this));
    S.register(new GapIgnoreGate(this));
    // §SNAPSHOTGATE MERGE 2026-09-01 — SnapshotGate/SnapshotRestoreGate
    // removed from the SISO pipeline entirely (James: "idearium loses its
    // own copy"). Not replaced with async gates — checked directly first:
    // siso/core/index.js's Stream.emit() calls gate.transform() with no
    // await and no Promise handling, so an async transform's returned
    // promise would be silently dropped, and nothing else in this codebase
    // listens for idearium.snapshot.committed/.restored on the bus (only
    // this file did). Commit/restore are now direct async methods below
    // (commitSnapshot/restoreSnapshot) that CLI/API await directly,
    // reaching cortex/versionium over HTTP via lib/nexus-client.js —
    // sovereign transport, same pattern the agent tool already uses.
    S.register(new SNRSampleGate(this));
    S.register(new ErrorGate(this));
  }

  // ─── Public emit (all mutations go through here) ────────────────────────────

  emit(type, data = {}, causedBy = null) {
    // §LAW II — write to ledger before any subscriber sees this event
    if (this._evLedger) {
      this._evLedger.record(type, data, { causedBy, source: 'idearium' });
    }
    const ev = {
      uuid:     randomUUID(),
      type,
      payload:  data,
      causedBy,
      source:   'idearium.core',
      ts:       Date.now(),
    };
    // Append-only event log (§7.6)
    this.db.events.push(ev);
    if (this.db.events.length > 5000) this.db.events = this.db.events.slice(-5000);

    // Route through SISO stream
    this.stream.emit(new Event(type, { ...data, _ev: ev }));

    // SNR sample
    if (SNR_WEIGHTS[type] !== undefined) {
      this.stream.emit(new Event('idearium.snr.sample', { eventType: type, weight: SNR_WEIGHTS[type] }));
    }

    // Broadcast to SSE clients
    this._broadcast(ev);
    return ev;
  }

  // ─── SSE broadcast ──────────────────────────────────────────────────────────

  /**
   * broadcast(type, payload) — §FEED 0.39.244. SSE clients only: not ledgered, not on the
   * SISO stream. For live observation (the Agent tab's guardian feed arrives several times
   * a second); anything that is state goes through emit().
   */
  broadcast(type, payload = {}) {
    const ev = { uuid: randomUUID(), type, payload, source: 'idearium.core', ephemeral: true, ts: Date.now() };
    this._broadcast(ev);
    return ev;
  }

  addSSEClient(res) {
    this._sseClients.add(res);
    res.on('close', () => this._sseClients.delete(res));
  }

  _broadcast(ev) {
    const data = `data: ${JSON.stringify(ev)}\n\n`;
    for (const client of this._sseClients) {
      try { client.write(data); } catch {}
    }
  }

  // ─── Query API (read-only, no gates needed) ──────────────────────────────────

  ideas(filter = {}) {
    let rows = this.db.ideas;
    if (filter.phase)     rows = rows.filter(i => i.phase === filter.phase);
    if (filter.tag)       rows = rows.filter(i => (i.tags||[]).includes(filter.tag));
    if (filter.search)    { const q = filter.search.toLowerCase(); rows = rows.filter(i => i.text?.toLowerCase().includes(q) || (i.tags||[]).some(t=>t.includes(q))); }
    if (filter.sort === 'tension') rows = [...rows].sort((a,b)=>(b.tension||0)-(a.tension||0));
    else if (filter.sort === 'updated') rows = [...rows].sort((a,b)=>b.updatedAt-a.updatedAt);
    if (filter.limit)     rows = rows.slice(0, parseInt(filter.limit));
    return rows;
  }

  idea(uuid)     { return this.db.ideas.find(i=>i.uuid===uuid) || null; }
  spec(uuid)     { return this.db.specs.find(s=>s.uuid===uuid) || null; }
  specs(filter={}) {
    let rows = this.db.specs;
    if (filter.phase) rows = rows.filter(s=>s.phase===filter.phase);
    return rows;
  }
  gap(uuid)      { return this.db.gaps.find(g=>g.uuid===uuid)  || null; }
  gaps(filter={}) {
    let rows = this.db.gaps;
    if (filter.status)   rows = rows.filter(g=>g.status===filter.status);
    if (filter.severity) rows = rows.filter(g=>g.severity===filter.severity);
    if (filter.type)     rows = rows.filter(g=>g.type===filter.type);
    return rows;
  }
  // §SNAPSHOTGATE MERGE 2026-09-01 — snapshots()/snapshot() are async now
  // (real network calls to cortex/versionium) — every call site (CLI, API)
  // must await these. No local fallback on failure: a failed read is
  // reported as an error, not silently returned as an empty list.
  async snapshots(n = 20) {
    // §FIX 2026-09-03 — real production log: this call hit cortex's OLD
    // embedded versionium proxy, which now returns a real HTTP 410 ("moved
    // to its own sovereign system... call :3754 instead") on every single
    // call — confirmed firing repeatedly in James's actual boot log.
    // versionium has been its own sovereign system with its own registered
    // port (orchestrator.config.json's ports.versionium: 3754) since the
    // versionium-sovereignty work landed; this callsite was never updated
    // to match. Real fix: call the system directly, per the 410's own
    // stated instruction, not a guessed port — nx.get() already resolves
    // 'versionium' via that same real config.
    // §0.39.271 V1 — ?n= returns the NEWEST n (without it: the first 200 in store order).
    const rows = await vx.get(`/api/versionium/history?system=idearium&n=${Math.max(1, Math.min(1000, n || 20))}`);
    if (rows?.error) return { error: rows.error, status: rows.status || 502 };
    // Same enrichment as commitSnapshot() above, derived from each row's
    // stored `state` instead of live db — historical commits, not "now".
    // A commit made without state (pre-merge, or a non-idearium commit
    // filtered in some other way) has none — real fields, not fabricated.
    return (rows.commits || []).slice(0, n).map(c => {
      if (!c.state) return { ...c, ts: c.wall };
      return {
        ...c, ts: c.wall,
        ideasCount: c.state.ideas?.length || 0,
        gapCount:   c.state.gaps?.filter(g=>g.status==='open').length || 0,
        specCount:  c.state.specs?.length || 0,
        snr:        c.state.snr ?? 0,
        phaseMap:   c.state.phaseMap || null,
        // §KNOWN GAP — snrDelta (branch-relative, vs the prior commit on
        // the same branch) is not reconstructed here. idearium's old
        // SnapshotGate computed it once at commit time using its local
        // snapshots[] scan; that scan is gone with the local table. Real,
        // separate follow-up: derive it from two adjacent same-branch
        // commits' state.snr via the history list, not invented here.
        snrDelta:   0,
      };
    });
  }
  async snapshot(commitId) {
    // §FIX 2026-09-03 — same real 410 as snapshots() above; see that
    // method's comment for the full finding.
    const rows = await vx.get(`/api/versionium/history?system=idearium&n=1000`);
    if (rows?.error) return { error: rows.error, status: rows.status || 502 };   // §0.39.300 VX1 — versionium down is not "not found"
    return (rows.commits || []).find(s => s.commitId === commitId || s.uuid === commitId) || null;
  }
  eventLog(n=100){ return this.db.events.slice(-n); }
  snrHistory(n=50){ return this.db.snr.slice(-n); }

  // ─── SNR ────────────────────────────────────────────────────────────────────

  _recalcSNR() {
    const window = this.db.snr.slice(-SNR_WINDOW);
    if (!window.length) { this.snr = 0.5; return; }
    const avg = window.reduce((s,r) => s + r.snrValue, 0) / window.length;
    this.snr = Math.round(avg * 1000) / 1000;
  }

  // ─── Tension ────────────────────────────────────────────────────────────────

  computeTension(idea) {
    const openGaps = this.db.gaps.filter(g => g.status==='open' && (g.ideaUuid===idea.uuid || (g.between||[]).includes(idea.uuid)));
    const gapDensity = Math.min(openGaps.length * 0.15, 0.30);

    const active = new Set(this.db.ideas.filter(i=>i.phase!=='archived').map(i=>i.uuid));
    const contra = (idea.tensionWith||[]).filter(u=>active.has(u));
    const contradiction = Math.min(contra.length * 0.10, 0.25);

    const staleDays = (Date.now() - idea.updatedAt) / 86400000;
    let novelty = 0;
    if (staleDays > 7  && idea.phase === 'seed')      novelty += 0.10;
    if (staleDays > 21 && idea.phase === 'seed')      novelty += 0.10;
    if (staleDays > 7  && idea.phase === 'expanding') novelty += 0.05;

    const depLinks = this.db.links.filter(l => l.fromUuid===idea.uuid || l.toUuid===idea.uuid);
    const resourceCost = Math.min(depLinks.length * 0.03, 0.15);

    const score = Math.round(Math.min(gapDensity + contradiction + novelty + resourceCost, 1.0) * 1000) / 1000;
    return {
      score,
      components: { gap_density: gapDensity, contradiction, novelty, resource_cost: resourceCost, dependency_depth: 0 },
    };
  }

  // ─── Snapshot diff ──────────────────────────────────────────────────────────
  // §SNAPSHOTGATE MERGE 2026-09-01 — async now, same reason as snapshots()
  // above. gapCount/ideasCount/snr are read from each commit's stored
  // `state` (cortex/versionium's getState()), not from a local aggregate —
  // that's the one real thing idearium's version had that a bare commit
  // row doesn't carry, so this now requires the full state fetch, not just
  // history metadata.
  async diffSnapshots(commitIdA, commitIdB) {
    const [ra, rb] = await Promise.all([
      vx.get(`/api/versionium/state/${encodeURIComponent(commitIdA)}`),
      vx.get(`/api/versionium/state/${encodeURIComponent(commitIdB)}`),
    ]);
    if (ra?.error || rb?.error) return { error: ra?.error || rb?.error, status: (ra?.error ? ra.status : rb.status) || 502 };
    const a = ra.state, b = rb.state;
    return {
      a: commitIdA, b: commitIdB,
      gapDelta:  (b.gaps?.filter(g=>g.status==='open').length || 0) - (a.gaps?.filter(g=>g.status==='open').length || 0),
      ideaDelta: (b.ideas?.length || 0) - (a.ideas?.length || 0),
    };
  }

  // ─── Snapshot commit / restore ─────────────────────────────────────────────
  // §SNAPSHOTGATE MERGE 2026-09-01 — real replacement for SnapshotGate/
  // SnapshotRestoreGate. Deliberately NOT SISO gates (see the registration-
  // block comment above) — direct async methods, awaited by CLI/API.
  async commitSnapshot({ message = 'snapshot', branch = 'main', author = 'cli', causedBy = null } = {}) {
    const tensionMap = {};
    for (const idea of this.db.ideas) {
      const r = this.computeTension(idea);
      idea.tension = r.score; idea.tensionUpdatedAt = Date.now();
      tensionMap[idea.uuid] = r.score;
    }
    const phaseMapForState = {};
    for (const p of IDEA_PHASES) phaseMapForState[p] = this.db.ideas.filter(i=>i.phase===p).length;
    const state = {
      ideas: this.db.ideas, specs: this.db.specs,
      gaps:  this.db.gaps,  links: this.db.links,
      tensionMap, phaseMap: phaseMapForState, snr: this.snr,
    };
    // §FIXED 2026-09-20 (MCO3) — this posted to 'cortex', which answers every
    // /api/versionium/* with 410 since versionium became sovereign (:3754);
    // snapshots() and snapshot() below were repointed at 'versionium'
    // (§FIX 2026-09-03), the commit half never was. Found while wiring repo
    // snapshots onto the same commit path.
    const result = await vx.post('/api/versionium/commit', {
      message, branch, causedBy, system: 'idearium', state,
    });
    if (result?.error) return { error: result.error, status: result.status || 502 };
    // Enrich cortex's raw commit row with the display aggregates idearium's
    // CLI/UI already expect (ideasCount/gapCount/specCount/snr/phaseMap) —
    // computed locally at commit time, cheap, no extra round trip. cortex's
    // commit row itself only carries generic {message, branch, state, ...};
    // it has no idearium-specific notion of "gap count" and shouldn't.
    const phaseMap = {};
    for (const p of IDEA_PHASES) phaseMap[p] = this.db.ideas.filter(i=>i.phase===p).length;
    const enriched = {
      ...result.commit,
      ts:         result.commit.wall,
      ideasCount: this.db.ideas.length,
      gapCount:   this.db.gaps.filter(g=>g.status==='open').length,
      specCount:  this.db.specs.length,
      snr:        this.snr,
      phaseMap,
    };
    this._broadcast({ uuid: randomUUID(), type: 'push.complete', payload: enriched, ts: Date.now() });
    return enriched;
  }

  // Restore-with-auto-stash: commits current state first (the safety
  // snapshot — same "stash before checkout" behavior SnapshotRestoreGate
  // had), then overwrites live state from the target commit's stored state.
  async restoreSnapshot(commitId, { author = 'cli' } = {}) {
    // §FIXED 2026-09-20 (MCO3) — same 410 as commitSnapshot() above: this
    // read went to 'cortex', so restore could never fetch a state at all.
    const stateResult = await vx.get(`/api/versionium/state/${encodeURIComponent(commitId)}`);
    if (stateResult?.error) return { error: stateResult.error, status: stateResult.status || 502 };

    // §GUARD 2026-09-20 (MCO3) — a repo snapshot (idearium/repo/snapshot.js)
    // carries no ideas/specs/gaps/links. Restoring one here would set all
    // four to [] via the `|| []` fallbacks below. It commits under its own
    // system so it should not reach here from the idea snapshot list, but a
    // commit id can be passed directly. Refused BEFORE the pre-restore
    // stash and before any mutation.
    if (stateResult?.state && stateResult.state.kind === REPO_SNAPSHOT_KIND) {
      return { error: `commit ${commitId} is a repository snapshot, not an idea snapshot — it records repo state and cannot be restored into ideas/specs/gaps` };
    }

    const stash = await this.commitSnapshot({
      message: `pre-restore snapshot (before pulling ${commitId})`, branch: 'main', author,
    });
    if (stash?.error) return { error: `pre-restore stash failed, restore aborted: ${stash.error}` };

    const { state } = stateResult;
    this.db.ideas = state.ideas || [];
    this.db.specs = state.specs || [];
    this.db.gaps  = state.gaps  || [];
    this.db.links = state.links || [];
    saveDB(this.db, ['ideas','specs','gaps','links']);
    this._broadcast({ uuid: randomUUID(), type: 'pull.complete', payload: { commitId }, ts: Date.now() });
    // §API COMPAT — the old SnapshotRestoreGate-backed handler returned
    // ideas/specs/gaps counts in its response; preserved here so existing
    // API consumers of POST /api/snapshots/:uuid/restore don't silently
    // get a different response shape as a side effect of this merge.
    return {
      ok: true, commitId, stashCommitId: stash.commitId,
      ideas: this.db.ideas.length, specs: this.db.specs.length, gaps: this.db.gaps.length,
    };
  }

  // ─── Contract ───────────────────────────────────────────────────────────────

  contract() {
    const contractPath = join(__dir, 'schemas/interaction-contract.json');
    if (!existsSync(contractPath)) throw new Error('interaction-contract.json not found');
    return JSON.parse(readFileSync(contractPath, 'utf8'));
  }

  // ─── Stats ──────────────────────────────────────────────────────────────────

  stats() {
    const ideas = this.db.ideas;
    const phaseMap = {};
    for (const p of IDEA_PHASES) phaseMap[p] = ideas.filter(i=>i.phase===p).length;
    return {
      version:      VERSION,
      ideasTotal:   ideas.length,
      phaseMap,
      openGaps:     this.db.gaps.filter(g=>g.status==='open').length,
      totalGaps:    this.db.gaps.length,
      // §SNAPSHOTGATE MERGE 2026-09-01 — snapshot count removed; it's a
      // live cortex/versionium read now (snapshots()), not a local
      // aggregate this synchronous stats() call can answer.
      specs:        this.db.specs.length,
      links:        this.db.links.length,
      events:       this.db.events.length,
      snr:          this.snr,
      savedAt:      this.db._savedAt,
      lattice:      _getLattice() ? _getLattice().size() : { nodes: 0, edges: 0 },
    };
  }

  // Real query surface for the lattice wired above — a graph nobody can
  // read is exactly as useless as one nobody writes to.
  latticeNeighbors(id) {
    const l = _getLattice();
    if (!l) return [];
    return l.neighbors(id).map(n => ({ id: n.node.id, label: n.node.label, tags: n.node.tags, weight: n.weight }));
  }
}

// ─── Gates ────────────────────────────────────────────────────────────────────

class IdeaCreateGate extends Gate {
  constructor(os) { super('idearium.idea.create'); this.os = os; }
  transform(event, stream) {
    const { text, tags = [], compartment = null, source = 'cli', causedBy = null, void: voidState = null } = event.data;
    if (!text || text.trim().length < 3) {
      stream.emit(new Event('idearium.error', { op: 'idea.create', reason: 'text must be ≥3 chars' }));
      return;
    }
    const uuid = randomUUID();
    const slug = text.toLowerCase().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').slice(0,50);
    const idea = {
      uuid, slug, text: text.trim(), tags, phase: 'seed',
      tension: 0, tensionUpdatedAt: null,
      parentIdea: null, linkedSpec: null,
      resonanceWith: [], tensionWith: [], openGaps: [],
      stability: { execution:1.0, runtime:1.0, effectiveness:1.0, rigidity:1.0, persistence:1.0 },
      compartment, archiveReason: null, archivedAt: null,
      causedBy, source, createdAt: Date.now(), updatedAt: Date.now(),
    };
    // §0.39.295 V3 — an idea born in the spatial void keeps the dials it was born at (idearium/lib/void.js shapes it)
    if (voidState && typeof voidState === 'object') idea.void = voidState;
    this.os.db.ideas.push(idea);
    saveDB(this.os.db, ['ideas']);
    _latticeAdd(uuid, text, tags);
    stream.emit(new Event('idearium.idea.created', { idea }));
    this.os._broadcast({ uuid: randomUUID(), type: 'idea.created', payload: idea, ts: Date.now() });
  }
}

class IdeaUpdateGate extends Gate {
  constructor(os) { super('idearium.idea.update'); this.os = os; }
  transform(event, stream) {
    const { uuid, fields, causedBy = null } = event.data;
    const idea = this.os.db.ideas.find(i=>i.uuid===uuid);
    if (!idea) { stream.emit(new Event('idearium.error', { op:'idea.update', reason:`uuid not found: ${uuid}` })); return; }
    const allowed = ['text','tags','compartment','resonanceWith','tensionWith','stability','linkedSpec','void'];   // §0.39.295 V3 void: the spatial void's dials + place
    for (const k of allowed) { if (fields[k] !== undefined) idea[k] = fields[k]; }
    idea.updatedAt = Date.now();
    idea.causedBy  = causedBy;
    saveDB(this.os.db, ['ideas']);
    stream.emit(new Event('idearium.idea.updated', { idea }));
    this.os._broadcast({ uuid: randomUUID(), type: 'idea.updated', payload: idea, ts: Date.now() });
  }
}

class IdeaPhaseGate extends Gate {
  constructor(os) { super('idearium.idea.phase'); this.os = os; }
  transform(event, stream) {
    const { uuid, phase, causedBy = null } = event.data;
    if (!IDEA_PHASES.includes(phase)) { stream.emit(new Event('idearium.error', { op:'idea.phase', reason:`invalid phase: ${phase}` })); return; }
    const idea = this.os.db.ideas.find(i=>i.uuid===uuid);
    if (!idea) { stream.emit(new Event('idearium.error', { op:'idea.phase', reason:`uuid not found: ${uuid}` })); return; }
    const prev = idea.phase;
    idea.phase = phase; idea.updatedAt = Date.now(); idea.causedBy = causedBy;
    saveDB(this.os.db, ['ideas']);
    stream.emit(new Event('idearium.idea.phase.changed', { uuid, from: prev, to: phase }));
    this.os._broadcast({ uuid: randomUUID(), type: 'idea.updated', payload: idea, ts: Date.now() });
  }
}

class IdeaLinkGate extends Gate {
  constructor(os) { super('idearium.idea.link'); this.os = os; }
  transform(event, stream) {
    const { fromUuid, toUuid, linkType = 'resonance', causedBy = null } = event.data;
    if (!LINK_TYPES.includes(linkType)) { stream.emit(new Event('idearium.error', { op:'idea.link', reason:`invalid linkType: ${linkType}` })); return; }
    const a = this.os.db.ideas.find(i=>i.uuid===fromUuid);
    const b = this.os.db.ideas.find(i=>i.uuid===toUuid);
    if (!a||!b) { stream.emit(new Event('idearium.error', { op:'idea.link', reason:'one or both uuids not found' })); return; }
    // Deduplicate
    const existing = this.os.db.links.find(l=>((l.fromUuid===fromUuid&&l.toUuid===toUuid)||(l.fromUuid===toUuid&&l.toUuid===fromUuid))&&l.linkType===linkType);
    if (existing) { stream.emit(new Event('idearium.error', { op:'idea.link', reason:'link already exists' })); return; }
    const link = { uuid: randomUUID(), fromUuid, toUuid, linkType, causedBy, ts: Date.now() };
    this.os.db.links.push(link);
    // Maintain resonanceWith / tensionWith arrays for quick lookup
    if (linkType==='resonance') { if(!a.resonanceWith.includes(toUuid)) a.resonanceWith.push(toUuid); if(!b.resonanceWith.includes(fromUuid)) b.resonanceWith.push(fromUuid); }
    if (linkType==='tension')   { if(!a.tensionWith.includes(toUuid)) a.tensionWith.push(toUuid); if(!b.tensionWith.includes(fromUuid)) b.tensionWith.push(fromUuid); }
    a.updatedAt = b.updatedAt = Date.now();
    saveDB(this.os.db, ['ideas','links']);
    // linkType ('resonance'/'tension') maps directly onto the lattice's own
    // edge type field — real semantic match already present in the data,
    // not a mapping invented for this wiring.
    _latticeLink(fromUuid, toUuid, linkType === 'tension' ? 0.5 : 0.7, linkType);
    stream.emit(new Event('idearium.idea.linked', { link }));
    this.os._broadcast({ uuid: randomUUID(), type: 'idea.linked', payload: link, ts: Date.now() });
  }
}

class IdeaTensionGate extends Gate {
  constructor(os) { super('idearium.idea.tension'); this.os = os; }
  transform(event, stream) {
    const { uuid } = event.data;
    const idea = this.os.db.ideas.find(i=>i.uuid===uuid);
    if (!idea) { stream.emit(new Event('idearium.error', { op:'idea.tension', reason:`uuid not found: ${uuid}` })); return; }
    const result = this.os.computeTension(idea);
    idea.tension = result.score;
    idea.tensionUpdatedAt = Date.now();
    const record = { uuid: randomUUID(), ideaUuid: uuid, score: result.score, components: result.components, ts: Date.now() };
    this.os.db.tensions.push(record);
    saveDB(this.os.db, ['ideas','tensions']);
    stream.emit(new Event('idearium.idea.tensioned', { uuid, tension: result }));
    this.os._broadcast({ uuid: randomUUID(), type: 'idea.tensioned', payload: { uuid, tension: result }, ts: Date.now() });
  }
}

class IdeaArchiveGate extends Gate {
  constructor(os) { super('idearium.idea.archive'); this.os = os; }
  transform(event, stream) {
    const { uuid, reason, causedBy = null } = event.data;
    if (!reason) { stream.emit(new Event('idearium.error', { op:'idea.archive', reason:'archiveReason required (§M1 — nothing deleted)' })); return; }
    const idea = this.os.db.ideas.find(i=>i.uuid===uuid);
    if (!idea) { stream.emit(new Event('idearium.error', { op:'idea.archive', reason:`uuid not found: ${uuid}` })); return; }
    idea.phase = 'archived'; idea.archiveReason = reason; idea.archivedAt = Date.now(); idea.causedBy = causedBy;
    saveDB(this.os.db, ['ideas']);
    stream.emit(new Event('idearium.idea.archived', { uuid, reason }));
    this.os._broadcast({ uuid: randomUUID(), type: 'idea.archived', payload: { uuid, reason }, ts: Date.now() });
  }
}

class SpecCreateGate extends Gate {
  constructor(os) { super('idearium.spec.create'); this.os = os; }
  transform(event, stream) {
    const { name, ideaUuid = null, source = 'cli', causedBy = null } = event.data;
    if (!name) { stream.emit(new Event('idearium.error', { op:'spec.create', reason:'name required' })); return; }
    const SECTION_IDS = ['intent','api_callto','module_hooks','cli_spec','schemas','gap_contract','failure_modes','tests','phase_map'];
    const spec = {
      uuid: randomUUID(), name, version: '1.0.0', ideaUuid, phase: 'seed',
      sections: SECTION_IDS.map(id => ({ id, title: id.replace(/_/g,' '), complete: false, required: true, content: '', checklist: [] })),
      modules: [], wired: { eventBus:false, cli:false, jaa:false, toast:false, schemaValidated:false },
      buildOrder: [], agentAssignments: {},
      causedBy, source, createdAt: Date.now(), updatedAt: Date.now(),
    };
    this.os.db.specs.push(spec);
    if (ideaUuid) {
      const idea = this.os.db.ideas.find(i=>i.uuid===ideaUuid);
      if (idea) { idea.linkedSpec = spec.uuid; idea.updatedAt = Date.now(); }
    }
    saveDB(this.os.db, ['specs','ideas']);
    _latticeAdd(spec.uuid, name, ['spec']);
    if (ideaUuid) _latticeLink(ideaUuid, spec.uuid, 0.9, 'spec-of');
    stream.emit(new Event('idearium.spec.created', { spec }));
    this.os._broadcast({ uuid: randomUUID(), type: 'spec.created', payload: spec, ts: Date.now() });
  }
}

// §NEW 2026-07-16 — legacy specs (this.os.db.specs, the pre-spec-engine
// 9-section format) had create/update/check/build gates but no way to get
// one OUT of the list short of editing the JSON file by hand. Mirrors
// IdeaArchiveGate above exactly — same §M1 requirement (reason required,
// nothing deleted), same phase-flag mechanism, same event/broadcast shape.
class SpecArchiveGate extends Gate {
  constructor(os) { super('idearium.spec.archive'); this.os = os; }
  transform(event, stream) {
    const { uuid, reason, causedBy = null } = event.data;
    if (!reason) { stream.emit(new Event('idearium.error', { op:'spec.archive', reason:'archiveReason required (§M1 — nothing deleted)' })); return; }
    const spec = this.os.db.specs.find(s=>s.uuid===uuid);
    if (!spec) { stream.emit(new Event('idearium.error', { op:'spec.archive', reason:`uuid not found: ${uuid}` })); return; }
    spec.phase = 'archived'; spec.archiveReason = reason; spec.archivedAt = Date.now(); spec.causedBy = causedBy;
    saveDB(this.os.db, ['specs']);
    stream.emit(new Event('idearium.spec.archived', { uuid, reason }));
    this.os._broadcast({ uuid: randomUUID(), type: 'spec.archived', payload: { uuid, reason }, ts: Date.now() });
  }
}

class SpecUpdateGate extends Gate {
  constructor(os) { super('idearium.spec.update'); this.os = os; }
  transform(event, stream) {
    const { uuid, fields } = event.data;
    const spec = this.os.db.specs.find(s=>s.uuid===uuid);
    if (!spec) { stream.emit(new Event('idearium.error', { op:'spec.update', reason:`spec not found: ${uuid}` })); return; }
    const allowed = ['name','phase','sections','modules','wired','buildOrder','agentAssignments'];
    for (const k of allowed) { if (fields[k] !== undefined) spec[k] = fields[k]; }
    spec.updatedAt = Date.now();
    saveDB(this.os.db, ['specs']);
    stream.emit(new Event('idearium.spec.updated', { spec }));
    this.os._broadcast({ uuid: randomUUID(), type: 'spec.updated', payload: spec, ts: Date.now() });
  }
}

class SpecCheckGate extends Gate {
  constructor(os) { super('idearium.spec.check'); this.os = os; }
  transform(event, stream) {
    const { uuid } = event.data;
    const spec = this.os.db.specs.find(s=>s.uuid===uuid);
    if (!spec) { stream.emit(new Event('idearium.error', { op:'spec.check', reason:`spec not found: ${uuid}` })); return; }
    const checks = spec.sections.map(s => ({ id: s.id, required: s.required, complete: s.complete, hasContent: s.content.length > 0 }));
    const passCount = checks.filter(c=>!c.required || c.complete).length;
    const failCount = checks.length - passCount;
    const passed = failCount === 0;
    if (passed) spec.phase = 'specced';
    spec.updatedAt = Date.now();
    const ciRun = { uuid: randomUUID(), specUuid: uuid, status: passed?'passed':'failed', checks, passCount, failCount, durationMs: 0, causedBy: null, ts: Date.now() };
    saveDB(this.os.db, ['specs']);
    stream.emit(new Event('idearium.spec.checked', { spec, ciRun }));
    this.os._broadcast({ uuid: randomUUID(), type: 'spec.checked', payload: { spec, ciRun }, ts: Date.now() });
  }
}

class GapOpenGate extends Gate {
  constructor(os) { super('idearium.gap.open'); this.os = os; }
  transform(event, stream) {
    const { type, description, severity = 'medium', ideaUuid = null, specUuid = null, causedBy = null, source = 'idearium.core' } = event.data;
    if (!description || description.length < 5) { stream.emit(new Event('idearium.error', { op:'gap.open', reason:'description must be ≥5 chars' })); return; }
    const gap = {
      uuid: randomUUID(), type: type||'unresolved', description,
      ideaUuid, specUuid, between: event.data.between || (ideaUuid?[ideaUuid]:[]),
      status: 'open', severity,
      resolution: null, resolvedAt: null, ignoreReason: null,
      causedBy, source, ts: Date.now(), createdAt: Date.now(),
    };
    this.os.db.gaps.push(gap);
    // Tag openGaps on linked idea
    if (ideaUuid) {
      const idea = this.os.db.ideas.find(i=>i.uuid===ideaUuid);
      if (idea && !idea.openGaps.includes(gap.uuid)) idea.openGaps.push(gap.uuid);
    }
    saveDB(this.os.db, ['gaps','ideas']);
    _latticeAdd(gap.uuid, description, ['gap', type||'unresolved']);
    if (ideaUuid) _latticeLink(ideaUuid, gap.uuid, 0.6, 'gap-in');
    if (specUuid) _latticeLink(specUuid, gap.uuid, 0.6, 'gap-in');
    stream.emit(new Event('idearium.gap.opened', { gap }));
    this.os._broadcast({ uuid: randomUUID(), type: 'gap.created', payload: gap, ts: Date.now() });
  }
}

class GapResolveGate extends Gate {
  constructor(os) { super('idearium.gap.resolve'); this.os = os; }
  transform(event, stream) {
    const { uuid, resolution = '' } = event.data;
    const gap = this.os.db.gaps.find(g=>g.uuid===uuid);
    if (!gap) { stream.emit(new Event('idearium.error', { op:'gap.resolve', reason:`gap not found: ${uuid}` })); return; }
    if (gap.status !== 'open') { stream.emit(new Event('idearium.error', { op:'gap.resolve', reason:`gap ${uuid} is already ${gap.status}` })); return; }
    gap.status = 'resolved'; gap.resolution = resolution; gap.resolvedAt = Date.now();
    // Remove from idea.openGaps
    for (const uuid_ of (gap.between||[])) {
      const idea = this.os.db.ideas.find(i=>i.uuid===uuid_);
      if (idea) idea.openGaps = idea.openGaps.filter(g=>g!==uuid);
    }
    saveDB(this.os.db, ['gaps','ideas']);
    stream.emit(new Event('idearium.gap.resolved', { gap }));
    this.os._broadcast({ uuid: randomUUID(), type: 'gap.resolved', payload: gap, ts: Date.now() });
  }
}

class GapIgnoreGate extends Gate {
  constructor(os) { super('idearium.gap.ignore'); this.os = os; }
  transform(event, stream) {
    const { uuid, reason = '' } = event.data;
    const gap = this.os.db.gaps.find(g=>g.uuid===uuid);
    if (!gap) { stream.emit(new Event('idearium.error', { op:'gap.ignore', reason:`gap not found: ${uuid}` })); return; }
    gap.status = 'ignored'; gap.ignoreReason = reason;
    saveDB(this.os.db, ['gaps']);
    stream.emit(new Event('idearium.gap.ignored', { gap }));
    this.os._broadcast({ uuid: randomUUID(), type: 'gap.ignored', payload: gap, ts: Date.now() });
  }
}

// §SNAPSHOTGATE MERGE 2026-09-01 — SnapshotGate and SnapshotRestoreGate
// removed from here. Real capabilities (branch-scoped commit, full-state
// capture, restore-with-auto-stash) now live in cortex/versionium/index.js
// (commit()'s `state` param, getState()) — reached below via
// commitSnapshot()/restoreSnapshot(), not via the SISO bus (see the
// registration-block comment above for why: Stream.emit() is synchronous,
// nothing else listened for these two event types). idearium keeps no
// local copy — this.db.snapshots is gone; every snapshot read/write goes
// through cortex/versionium now.

class SNRSampleGate extends Gate {
  constructor(os) { super('idearium.snr.sample'); this.os = os; }
  transform(event, stream) {
    const { eventType, weight } = event.data;
    const sample = { uuid: randomUUID(), eventType, snrValue: weight, ts: Date.now() };
    this.os.db.snr.push(sample);
    if (this.os.db.snr.length > 200) this.os.db.snr = this.os.db.snr.slice(-200);
    // §GAP FIXED 2026-07-14 — this never called saveDB under the old model
    // either; it survived only because saveDB(db) rewrote the WHOLE file on
    // every unrelated mutation, so some later gate's save would catch this
    // table by accident. The new per-table saveDB(db, keys) has no such
    // accidental coverage — without this, snr history would still recalc
    // live but stop surviving a restart.
    saveDB(this.os.db, ['snr']);
    this.os._recalcSNR();
    this.os._broadcast({ uuid: randomUUID(), type: 'snr.update', payload: { snr: this.os.snr }, ts: Date.now() });
  }
}

class ErrorGate extends Gate {
  constructor(os) { super('idearium.error'); this.os = os; }
  transform(event, stream) {
    // §1.2 — never silent
    const { op, reason } = event.data;
    console.error(`[IdeaOS][ERROR] op=${op} reason=${reason}`);
    this.os._broadcast({ uuid: randomUUID(), type: 'idearium.error', payload: { op, reason }, ts: Date.now() });
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _instance = null;
export function getIdeaOS() {
  if (!_instance) _instance = new IdeaOS();
  return _instance;
}
