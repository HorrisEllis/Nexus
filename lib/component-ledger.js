'use strict';
// ── lib/component-ledger.js — Per-Component, Per-System Ledger ──────────────
// UUID: nexus-component-ledger-v1-0000-4000-0000-000000000001
// Version: 1.0.0
// Phase: 23.9 — explicit ledgers, per direct request 2026-06-24
// Component: lib.component-ledger
//
// James's spec, in his own words: "a ledger per component, per system, per
// day or session, but always connected with the pattern engine, event
// ledger." Three things that has to be true at once:
//
//   1. PHYSICALLY PARTITIONED — a real file per component, per system,
//      rolling per calendar day by default or per explicit session id when
//      one is supplied. Not a filter on one shared table. A literal file
//      you can open: data/ledger/{system}/{component}/{day-or-session}.jsonl
//
//   2. CENTRALLY QUERYABLE — every partition also mirrors into one JAA
//      table (component_ledger) so "show me everything RAID decided today"
//      doesn't mean globbing the filesystem by hand.
//
//   3. CONNECTED TO THE PATTERN ENGINE + EVENT LEDGER — cortex/intelligence/
//      index.js's _scanPatterns() reads jaaDB.query('event_log'), full stop,
//      that is its only intake. A ledger entry that never reaches event_log
//      is invisible to crystallization no matter how faithfully it's
//      written to disk. Every write here lands in BOTH places, always,
//      same call, not a separate step a caller can forget.
//
// This supersedes lib/engine-ledger.js from the previous pass (RAID +
// reflection only, single shared table, no physical partitioning, no
// pattern-engine connection). engine-ledger.js now re-exports from here so
// nothing that already required it breaks.
//
// §1.1: a write with no system/component/action is refused, not guessed at.
// §1.2: a failure on either the physical write or the JAA mirror is loud —
//       logged to stderr and to the failures table, never swallowed.
// §2.1: physical file first, then JAA mirror, then event_log breadcrumb —
//       disk before anything queryable, same ordering law as everywhere else.
// §5.1: every row carries a causedBy chain back to whatever it traces to.

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const MODULE_ID = 'component-ledger';
const VERSION   = '1.0.0';
const COMP_ID   = 'lib.component-ledger';
const HOOK_ID   = 'lib.component-ledger:v1:p0001';

const LEDGER_ROOT = path.join(__dirname, '..', 'data', 'ledger');

// ── Lazy deps — same pattern as gap-predicate.js / engine-ledger.js ──────────
let _jaa, _uid, _bus;
let _fanin;   // §P1 — lazy fan-in handle (undefined = not yet tried)
function _getJAA() { if (!_jaa) try { ({ jaaDB: _jaa, uid: _uid } = require('../cortex/memory/jaa-db')); } catch (_) {} return _jaa; }
function _getBus()  { if (!_bus) try { _bus = require('../nexus/nexus-bus'); } catch (_) {} return _bus; }
// §PER-SYSTEM LEDGER 2026-09-19 — see write() step 2.
let _ledgerStore;
function _getLedgerStore() { if (!_ledgerStore) _ledgerStore = require('./ledger-store'); return _ledgerStore; }
function _getFanin(){ if (_fanin === undefined) { try { _fanin = require('./ledger-fanin'); } catch (_) { _fanin = null; } } return _fanin; }
function uid()      { return _uid?.() ?? crypto.randomUUID(); }

function _today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, UTC — matches versionium_calendar's convention
}

function _safe(s) {
  return String(s || 'unknown').replace(/[^a-z0-9._-]/gi, '_');
}

// Resolves the physical partition for a (system, component, session?) triple.
// session present  → data/ledger/{system}/{component}/session-{session}.jsonl
// session absent   → data/ledger/{system}/{component}/{YYYY-MM-DD}.jsonl
function _partitionPath(system, component, session) {
  const partition = session ? `session-${_safe(session)}` : _today();
  const dir  = path.join(LEDGER_ROOT, _safe(system), _safe(component));
  const file = path.join(dir, `${partition}.jsonl`);
  return { dir, file, partition };
}

/**
 * write() — the one entry point. Every component in NEXUS calls this the
 * same way, regardless of which system or component it is.
 *
 * @param {string}   system       - e.g. 'guardian','raid','reflection','gap-lifecycle','autopilot','cortex'
 * @param {string}   component    - the component_id, e.g. 'guardian.copilot'
 * @param {string}   action       - what happened, e.g. 'route_decided','job_dispatched'
 * @param {string}   [status]     - outcome/state, e.g. 'dispatched','failed','escalated'
 * @param {string[]} [tags]       - explicit free-form tags
 * @param {string}   [detail]     - one-line human-readable why
 * @param {string}   [causedBy]   - uuid this traces back to (call/gap/contract/job)
 * @param {string}   [contractUuid]
 * @param {string}   [session]    - explicit session id; if omitted, partitions by calendar day
 */
// ── §UNIVERSAL LEDGER SCHEMA 2026-07-24 ─────────────────────────────────────
// James: "They all need event ledgers, with consistent schema… hook, wire,
// intent, contract uuid, beginning end point, component, fault."
//
// 9 of the 13 fields he listed already existed here, so this is EXTEND AND
// ENFORCE, not a new schema — a second schema would be the competing truth
// that produced six ledger destinations in the first place.
//
// ADDED: hook, wire (the begin/end point — the strongest item on the list and
// recorded nowhere before), sourceRef, faultId, intent.
// REJECTED, with reasons recorded in docs/nexus-sentinel.spec: `next event`
// (an append-only ledger cannot know the future; derivable as a causedBy
// reverse index), ledger file/dir as fields (already derived by
// _partitionPath, and self-referential), embedded `context` (rows are ~300
// bytes and the tree is 9.6MB — references, not cargo), and `relation`
// (dropped from v1 entirely: causedBy already carries causal relation and no
// caller has needed a non-causal one. Blocking the schema on it was backwards.)
//
// WHY NOT REFUSE ON MISSING hook/wire YET: 14 live call sites exist. Making
// them required today would make write() return null across the system —
// silently disabling the ledger to enforce a schema about observability. So
// the gap is made VISIBLE AND MEASURABLE instead: unknown is recorded as
// null (never invented), warned once per component, and counted by
// schemaCoverage() below. Enforcement flips when coverage reaches 100%, and
// the coverage number is what says when.
const _hookWarned = new Set();
const HOOK_WARN_SAMPLE = 5;          // name this many individually, then summarise
const HOOK_SUMMARY_MS  = 60000;      // then at most one summary a minute
let _hookMissing   = 0;
let _hookSummaryAt = 0;

// sourceRef is DERIVED, not asked for — the real file:line that called
// write(), read off a stack trace. This is the useful form of James's
// "file names / file directory" request: WHERE IT WAS EMITTED FROM, as
// opposed to the row's own path, which is already implied by its location.
function _callerRef() {
  const st = new Error().stack || '';
  const lines = st.split('\n').slice(2);
  for (const l of lines) {
    if (l.includes('component-ledger.js')) continue;
    const m = l.match(/\(?([^()\s]+\.js):(\d+):\d+\)?/);
    if (m) return `${m[1].replace(/^.*[\\/](?=[^\\/]*[\\/][^\\/]*$)/, '')}:${m[2]}`;
  }
  return null;
}

function write({ system, component, action, status = 'info', tags = [], detail = null, causedBy = null, contractUuid = null, session = null,
                 hook = null, wire = null, intent = null, faultId = null, sourceRef = null }) {
  if (!system || !component || !action) {
    console.warn(`[${MODULE_ID}] §1.1 write() refused — missing system/component/action`, { system, component, action });
    return null;
  }

  // §1.2 — an unsupplied hook/wire is a REAL gap in traceability. Say so once
  // per component so it is measurable, without flooding the log.
  // §FLOOD FIX 2026-07-30 — found in James's real boot log. Warn-once-PER-
  // COMPONENT was reasonable in the abstract and wrong in practice: component
  // -registry registers 217 components, so a single boot emitted ~100 of these
  // lines and drowned everything else in the log — including, in that very
  // boot, the BOOT HALTED message that actually mattered.
  //
  // A warning that hides the thing you need to read is not §1.2 transparency,
  // it is noise wearing transparency's clothes. Now: the first few are named
  // individually (so the shape of the problem is visible), then it degrades to
  // a single periodic SUMMARY carrying the real count. Nothing is hidden —
  // schemaCoverage() still reports the full per-component picture on demand.
  if (!hook || !wire) {
    if (!_hookWarned.has(component)) {
      _hookWarned.add(component);
      if (_hookWarned.size <= HOOK_WARN_SAMPLE) {
        console.warn(`[${MODULE_ID}] §schema — '${component}' writes without ${!hook ? 'hook' : ''}${!hook && !wire ? '/' : ''}${!wire ? 'wire' : ''}; movement is recorded but not locatable in the architecture`);
        if (_hookWarned.size === HOOK_WARN_SAMPLE) {
          console.warn(`[${MODULE_ID}] §schema — further per-component warnings suppressed; a periodic summary follows. Run schemaCoverage() for the full list.`);
        }
      }
    }
    _hookMissing++;
    const now = Date.now();
    if (now - _hookSummaryAt > HOOK_SUMMARY_MS) {
      _hookSummaryAt = now;
      if (_hookWarned.size > HOOK_WARN_SAMPLE) {
        console.warn(`[${MODULE_ID}] §schema — ${_hookMissing} writes from ${_hookWarned.size} components still lack hook/wire`);
      }
    }
  }

  // §CAP 2026-07-27 — found by adversarial simulation (UC4.3): a 2MB detail
  // payload was accepted with no limit. Rows are normally ~300 bytes and the
  // whole tree is ~10MB, so a single runaway caller can bloat the ledger past
  // usefulness — and every reader (the tablet, the pattern engine, the CLI)
  // pays for it on every read. Capped, with the truncation VISIBLE in the
  // value: silent truncation would be data loss nobody could detect, which is
  // worse than a large row.
  const DETAIL_MAX = parseInt(process.env.LEDGER_DETAIL_MAX || '16384', 10);
  if (detail != null) {
    let enc;
    try { enc = typeof detail === 'string' ? detail : JSON.stringify(detail); }
    catch (_) { enc = String(detail); }   // circular etc — never throw on telemetry
    if (enc && enc.length > DETAIL_MAX) {
      console.warn(`[${MODULE_ID}] detail for ${component}.${action} was ${enc.length}B, capped at ${DETAIL_MAX}B — the full payload belongs in an artifact, not a ledger row`);
      detail = { _truncated: true, originalBytes: enc.length, cappedAt: DETAIL_MAX, preview: enc.slice(0, DETAIL_MAX) };
    }
  }

  const row = {
    uuid: uid(), system, component, action, status,
    tags: Array.isArray(tags) ? tags : [tags].filter(Boolean),
    detail, causedBy, contractUuid, session: session || null,
    // Unknown stays NULL. Never derived from something adjacent, never
    // defaulted to a plausible value — a fabricated hook would be worse than
    // an absent one, because it would look like evidence.
    hook, wire, faultId,
    // intent ships UNCONSTRAINED on purpose. The existing `action` field
    // carries only two distinct verbs across 3,400 rows ('updated',
    // 'registered'), so there is no real vocabulary to constrain intent to
    // yet. Inventing one before the evidence exists is authoring, not
    // observing. It gets constrained once real usage shows what needs saying.
    intent,
    sourceRef: sourceRef || _callerRef(),
    ts: Date.now(),
  };

  // 1) Physical file — the literal ledger. §2.1 disk first.
  try {
    const { dir, file } = _partitionPath(system, component, session);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(file, JSON.stringify(row) + '\n');
  } catch (e) {
    console.error(`[${MODULE_ID}] §1.2 PHYSICAL LEDGER WRITE FAILED — ${system}/${component}: ${e.message}`, row);
    _recordFailure(e, row);
  }

  // 2) JAA mirror — now PER SYSTEM (§2026-09-19, James: "the ledgers in
  // cortex need to be per system"). This row goes to the store owned by
  // the system that produced it (lib/ledger-store.js), not to cortex's
  // shared component_ledger table. The physical write above was already
  // partitioned by system; this closes the half that wasn't.
  //
  // §EVENT_LOG IS DELIBERATELY NOT MOVED (step 3 below). It stays in
  // cortex's shared jaaDB because it is genuinely shared, cross-system
  // causal state written by cortex, guardian, orchestrator and others
  // from their own processes — the exact exception versionium/lib/
  // store.js already documents for the same table ("§HONEST EXCEPTION —
  // event_log is NOT versionium's own data"). Moving a ledger row to its
  // owner and moving the shared causal log are different questions, and
  // only the first one was asked.
  try { _getLedgerStore().insert(row); }
  catch (e) { console.error(`[${MODULE_ID}] §1.2 per-system ledger write failed (${row.system}): ${e.message}`); _recordFailure(e, row); }

  const jaa = _getJAA();
  if (jaa) {    // 3) event_log breadcrumb — cortex/intelligence/index.js's _scanPatterns()
    // reads jaaDB.query('event_log') and nothing else. This is the wire that
    // makes "always connected with the pattern engine" literally true.
    try {
      jaa.insert('event_log', {
        uuid: uid(), type: `ledger.${system}.${action}`, source: component,
        payload: { status, tags: row.tags, detail, causedBy, session: row.session },
        causedBy, ts: row.ts,
      });
    } catch (e) {
      // §1.2 FIXED 2026-07-24 — this was `catch (_) {}`. Silent.
      //
      // This is the ONE wire that makes "always connected with the pattern
      // engine" literally true: _scanPatterns() reads jaaDB.query('event_log')
      // and NOTHING else. If this insert fails, the intelligence core simply
      // stops being fed — and, being silent, it starves while every other
      // signal says the ledger is healthy. The mirror write immediately above
      // logs AND calls _recordFailure(); this one did neither, so the more
      // important failure was the quieter one.
      //
      // That matters more as of today specifically: the intelligence core was
      // switched on this session after never having run. A silently broken
      // intake would make it look like the core is running and finding
      // nothing, which is indistinguishable from a healthy system with no
      // patterns — the exact confident-and-wrong shape this codebase keeps
      // producing.
      console.error(`[${MODULE_ID}] §1.2 event_log breadcrumb FAILED for ${system}.${action}: ${e.message} — the pattern engine will not see this entry`);
      _recordFailure(e, row);
    }
  }

  // 4) Bus — live listeners (cockpit, UI) see it immediately, not just on
  // the pattern engine's next scheduled scan.
  const bus = _getBus();
  try { if (bus?.emit) bus.emit('ledger.write', row); } catch (_) {}

  // 5) §P1 nexus-live-mind 2026-08-07 — fan-in. write() is the universal ledger
  // entry point every component calls, so emitting here makes EVERY system's
  // events flow into lib/ledger-fanin with one wire — where intelligence,
  // autopilot, and co-pilot's continuous stream all subscribe. This is what
  // makes "every system and the intelligence system reads the SSE + event
  // ledger, all pointed at autopilot" literally true, rather than 13 per-system
  // bridges. §1.2 — a fan-in failure never breaks the ledger write (telemetry
  // must never take down the thing it observes).
  try {
    const fanin = _getFanin();
    if (fanin?.emit) fanin.emit({ type: `${system}.${action}`, source: system, component, _system: system, payload: { status, hook: row.hook, wire: row.wire, intent: row.intent, faultId: row.faultId, detail }, causedBy, ts: row.ts });
  } catch (_) { /* fan-in is observation; it never breaks the write */ }

  return row;
}

function _recordFailure(e, row) {
  const jaa = _getJAA();
  if (!jaa) return;
  try {
    jaa.insert('failures', {
      uuid: uid(), source: MODULE_ID, error: e.message, stack: e.stack?.slice(0, 500),
      causedBy: row?.causedBy || null, ts: Date.now(),
    });
  } catch (_) {}
}

// ── Query surface ─────────────────────────────────────────────────────────────
// All three read from the JAA mirror (fast, central). readPartition() reads
// the literal physical file instead — use it to confirm the physical ledger
// and the JAA mirror agree, or when JAA itself is the thing under suspicion.

// §PER-SYSTEM READS 2026-09-19 — these used to hit one central table in
// cortex. They now read across every system's own store and merge in ts
// order (lib/ledger-store.js's queryAll). The signatures and return
// shapes are unchanged, so all 14 existing call sites keep working
// without edits — the split is in WHERE the rows live, not in what a
// caller gets back.
//
// bySystem() is the one that genuinely got better: it now opens exactly
// ONE store instead of scanning every row of a shared table and
// filtering, which is the whole point of partitioning by owner.

function tail(limit = 50) {
  try { return _getLedgerStore().queryAll(null, limit); } catch (_) { return []; }
}

function bySystem(system, limit = 50) {
  try {
    const rows = _getLedgerStore().storeFor(system).all('component_ledger', {}) || [];
    return limit ? rows.slice(-limit) : rows;
  } catch (_) { return []; }
}

function byComponent(component, limit = 50) {
  try { return _getLedgerStore().queryAll(r => r.component === component, limit); } catch (_) { return []; }
}

function bySession(session, limit = 200) {
  try { return _getLedgerStore().queryAll(r => r.session === session, limit); } catch (_) { return []; }
}

/**
 * errorsByComponent({system, since, limit}) — component_ledger rows with
 * status 'error'/'fail', grouped by component, cross-referenced against
 * loom's live registry (lib/loom-map.js) so a caller can tell "a real,
 * registered component is erroring" apart from "something is writing
 * error rows under a component id loom has never heard of" — the second
 * case is itself a finding (drift between what's registered and what's
 * actually running), not just noise to filter out.
 *
 * §GRANULARITY 2026-08-13 — component_ledger already carries system +
 * component on every row (that's its whole design, see this file's own
 * header), but nothing aggregated its ERROR rows specifically, and
 * nothing cross-referenced the result against the registry that actually
 * defines what a component IS. This is that aggregation.
 */
function errorsByComponent({ system = null, since = 0, limit = 5000 } = {}) {
  const ERROR_STATUSES = new Set(['error', 'fail', 'failed']);
  let rows;
  // §PER-SYSTEM 2026-09-19 — reads the owning system's store when a
  // system is named (one store, not a full scan), else across all.
  try {
    const ls = _getLedgerStore();
    rows = system
      ? (ls.storeFor(system).all('component_ledger', {}) || [])
          .filter(r => ERROR_STATUSES.has(r.status) && (r.ts || 0) >= since).slice(-limit)
      : ls.queryAll(r => ERROR_STATUSES.has(r.status) && (r.ts || 0) >= since, limit);
  } catch (_) { return { available: false, components: [] }; }

  let loomMap;
  try { loomMap = require('./loom-map'); } catch (_) { loomMap = null; }

  const byComp = new Map(); // component -> { system, count, actions:Set, examples:[], registered }
  for (const r of (rows || [])) {
    const key = `${r.system}::${r.component}`;
    if (!byComp.has(key)) {
      const resolved = loomMap ? loomMap.resolveComponent(r.component) : { found: false };
      byComp.set(key, {
        system: r.system, component: r.component, count: 0,
        actions: new Set(), examples: [],
        registeredInLoom: resolved.found, // false = component is producing errors under an identity loom doesn't know about
      });
    }
    const e = byComp.get(key);
    e.count++;
    e.actions.add(r.action);
    if (e.examples.length < 3) e.examples.push({ action: r.action, detail: r.detail, ts: r.ts, hook: r.hook, wire: r.wire });
  }

  const components = [...byComp.values()]
    .map(e => ({ ...e, actions: [...e.actions] }))
    .sort((a, b) => b.count - a.count);

  return {
    available: true, scanned: rows.length,
    unregisteredCount: components.filter(c => !c.registeredInLoom).length,
    components,
  };
}

function readPartition(system, component, sessionOrDay) {
  const isDay = /^\d{4}-\d{2}-\d{2}$/.test(sessionOrDay || '');
  const { file } = isDay
    ? { file: path.join(LEDGER_ROOT, _safe(system), _safe(component), `${sessionOrDay}.jsonl`) }
    : _partitionPath(system, component, sessionOrDay);
  try {
    return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
  } catch (_) { return []; }
}

function listPartitions(system, component) {
  try {
    const dir = path.join(LEDGER_ROOT, _safe(system), _safe(component));
    return fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
  } catch (_) { return []; }
}

// ── Component registration ────────────────────────────────────────────────────
function registerComponent() {
  try {
    const reg = require('./component-registry');
    reg.register({
      id: COMP_ID, namespace: 'lib', name: 'Component Ledger', version: VERSION,
      description: 'Per-component, per-system ledger, physically partitioned by day or session, mirrored to JAA and event_log so the pattern engine sees every entry.',
      grammar: ['ledger write', 'ledger tail', 'component ledger'],
      route: null, comp_type: 'engine',
      events: { emits: ['ledger.write'], listensTo: [] },
      registeredBy: MODULE_ID,
    });
  } catch (_) {}
}

// How far the schema migration actually is — the number that decides when
// hook/wire become enforced rather than warned. Reports per-component so the
// remaining work is a list, not a percentage nobody can act on.
function schemaCoverage(limit = 4000) {
  const rows = tail(limit) || [];
  const byComponent = new Map();
  for (const r of rows) {
    const c = r.component || '(none)';
    if (!byComponent.has(c)) byComponent.set(c, { component: c, total: 0, withHook: 0, withWire: 0, withSource: 0 });
    const e = byComponent.get(c);
    e.total++;
    if (r.hook) e.withHook++;
    if (r.wire) e.withWire++;
    if (r.sourceRef) e.withSource++;
  }
  const comps = [...byComponent.values()].sort((a, b) => b.total - a.total);
  const total = rows.length || 1;
  return {
    rows: rows.length,
    hookPct:   +(comps.reduce((a, c) => a + c.withHook, 0)   / total * 100).toFixed(1),
    wirePct:   +(comps.reduce((a, c) => a + c.withWire, 0)   / total * 100).toFixed(1),
    sourcePct: +(comps.reduce((a, c) => a + c.withSource, 0) / total * 100).toFixed(1),
    components: comps.slice(0, 30),
  };
}

// Is the pattern engine actually being fed? _scanPatterns() reads event_log
// and nothing else, so a breadcrumb gap IS intelligence starvation. Compares
// canonical ledger writes against the breadcrumbs they should have produced.
// Only counts rows written since `since`, because breadcrumbs began on
// 2026-07-20 and everything before that is legitimately absent rather than
// lost — conflating the two would manufacture a false alarm.
const BREADCRUMB_EPOCH = Date.parse('2026-07-20T15:28:05Z');
function intakeCoverage(since = BREADCRUMB_EPOCH) {
  // _getJAA(), not _jaa() — _jaa is the cached VARIABLE, the accessor is
  // _getJAA(). Caught by running it rather than by reading it back.
  const jaa = _getJAA();
  if (!jaa) return { observed: false, reason: 'no store' };
  // §PER-SYSTEM 2026-09-19 — the ledger half of this comparison now comes
  // from the per-system stores; the event_log half still comes from
  // cortex, because event_log deliberately did not move (see write()).
  let mirror = [];
  try { mirror = _getLedgerStore().queryAll(null, 0) || []; } catch (_) { mirror = []; }
  const events = (jaa.tail ? jaa.tail('event_log', 99999) : []) || [];
  const m = mirror.filter(r => (r.ts || 0) >= since).length;
  const b = events.filter(r => (r.ts || 0) >= since && String(r.type || '').startsWith('ledger.')).length;
  return {
    observed: true, since: new Date(since).toISOString(),
    canonicalWrites: m, breadcrumbs: b,
    coveragePct: m ? +((b / m) * 100).toFixed(1) : null,
    starving: m > 0 && b < m,
    note: 'rows before `since` predate the breadcrumb wire and are legitimately absent, not lost',
  };
}

module.exports = {
  write, schemaCoverage, intakeCoverage,
  tail, bySystem, byComponent, bySession, errorsByComponent,
  readPartition, listPartitions,
  registerComponent,
  // §WIRED 2026-08-22 — James: "component registry is supposed to be the
  // system that detects when something isn't wired." _hookWarned/_hookMissing
  // were already tracking this live, correctly, every boot — just never
  // exported. unwiredComponents() exposes the real, current set so
  // loom/scanners/wiring-gaps.js can feed it into gapField.report() instead
  // of it only ever reaching a console.warn line.
  unwiredComponents: () => [..._hookWarned],
  MODULE_ID, VERSION, COMP_ID, HOOK_ID,
};
