'use strict';
/**
 * lib/seam/adapters/warp-cascade.js — WARP as one possible CascadeGate backend
 * UUID: nexus-seam-adapter-warp-v1-0000-2026-0705-jamesbrooks-001
 * Version: 1.1.0  // +exactCacheOnFirstSuccess pass-through (warp-devkit-addendum-v1.4.1.spec)
 *
 * Not required by lib/seam/gates.js, lib/seam/stream.js, lib/seam/axioms.js,
 * or lib/seam/kg-seam-bridge.js — none of those import this file or WARP.
 * This is what a caller pulls in if it *wants* WARP's cache/population/
 * axiom-gate machinery specifically. A caller that wants a bare ollama
 * call with no caching writes its own five-line dispatch() function
 * instead and never touches this file.
 *
 * Usage:
 *   const { createWarpDispatch } = require('lib/seam/adapters/warp-cascade');
 *   const dispatch = createWarpDispatch({ generate, crystallizer, population, raid });
 *   stream.register(new CascadeGate({ dispatch }));
 */
const { unifiedDispatch }  = require('../../../warp/dispatch/index');
const { runCascade }       = require('../../../warp/dispatch/cascade');
const { Axiom }             = require('../../../warp/core/Axiom');

// §0.39.267 — was ['ollama','chatgpt','claude','gemini','deepseek']: perplexity and copilot could be assigned to a chunk
// and were dropped here, so those chunks cascaded through ollama first. The list is lib/agent-providers.js now.
const KNOWN_PROVIDERS = ['ollama', 'chatgpt', 'claude', 'gemini', 'deepseek'];   // fallback if agent-providers can't load
function _known() { try { return require('../../agent-providers.js').all(); } catch (_) { return KNOWN_PROVIDERS; } }
function _norm(p) { try { return require('../../agent-providers.js').normalize(p); } catch (_) { return p; } }

function _learnedOrder(base) {
  try {
    const policy = require('../../economy/store.js').load();
    const L = require('../../economy/ledger.js');
    const rows = L.records({ since: Date.now() - 30 * 86400000 }).filter(r => (r.jobType || 'chat') === 'build');
    const min = (policy.router && Number.isFinite(policy.router.minRecords)) ? policy.router.minRecords : 20;
    if (rows.length < min || !rows.length) return null;
    const G = require('../../economy/gate.js');
    const cands = [...new Set([...base, ...Object.keys(policy.providers || {})])].filter(p => _known().includes(p));
    const c = require('../../economy/router.js').choose('build', cands, { policy, records: rows,
      allowed: (p) => G.decide({ provider: p, jobType: 'build' }, { policy, usage: L.usage(p) }).verdict === 'allow' });
    return c && c.order && c.order.length ? { order: c.order, why: `economy router: ${c.why} (${rows.length} build records)` } : null;
  } catch (_) { return null; }
}

function providersFor(seamRecord, raid) {
  // §FIX 2026-09-11 — James, from a live manifest: chunks explicitly
  // assigned to claude/deepseek/gemini (idearium/api/index.js:1744's
  // real, correct preferAgent computation — chunk.agent, confirmed
  // there) all still cascaded through ollama first and died on its
  // timeout, because THIS function never had any way to know what
  // agent a caller actually wanted. It only ever returned RAID's own
  // pick (if raid was wired in) or the hardcoded LAW_I default —
  // 'ollama' first, unconditionally, every time. The per-chunk agent
  // was computed correctly two layers up and then never reached this
  // function at all.
  //
  // seamRecord.preferredProvider is the fix: warp-build-dispatch.js's
  // dispatch() now sets it from the real opts.preferAgent it already
  // receives. When present it goes first — ahead of RAID's own pick
  // and ahead of LAW_I — because an explicit per-chunk request is a
  // stronger, more specific signal than either default. Falls through
  // to the previous real behavior when absent (a caller with no
  // per-chunk agent concept, e.g. a bare seam-gate build).
  //
  // Also widened the known universe to include gemini/deepseek — both
  // real, dispatchable guardian providers (agent-suite/index.js's own
  // REAL_GUARDIAN_PROVIDERS, checked directly) that this file's base
  // lists never mentioned, so a chunk explicitly assigned to either
  // could never have been reached through this path even by accident.
  const preferred = seamRecord && _norm(seamRecord.preferredProvider);
  let base;
  if (!raid) {
    base = ['ollama', 'chatgpt', 'claude']; // spec default: LAW_I then LAW_III
  } else {
    const { agent: first } = raid._decide(
      { intent: 'build', prompt: seamRecord.description || seamRecord.seam_id },
      raid._health,
    );
    base = [first, ...['ollama', 'chatgpt', 'claude'].filter(p => p !== first)];
  }
  // §0.39.280 BS13 — James: "why claude? set to chatgpt. it hasn't build one line yet." A chosen provider (the chunk's,
  // the repo's, or a code repo's original's) is the ONLY provider tried: the old chain went on to ollama → chatgpt →
  // claude when it failed, so a repo set to chatgpt ended up building on claude (or a 3B local model). A failure is
  // now reported as that provider's failure; nobody's choice is overridden. No preference → the chain as before.
  if (preferred && _known().includes(preferred)) return [preferred];
  // §0.39.281 EC7 — nobody chose: once the economy's ledger holds enough build outcomes (policy.router.minRecords),
  // the learning router (lib/economy/router.js) orders the providers the economy allows now, from what has actually
  // worked; below that, the chain above as before. The record says which (routedBy).
  const learned = _learnedOrder(base);
  if (learned) { if (seamRecord) seamRecord.routedBy = learned.why; return learned.order; }
  return base;
}

/**
 * createWarpDispatch — returns a dispatch(record, plainAxioms) function
 * matching CascadeGate's expected interface. `generate(provider, record,
 * lastFailure)` is the caller's actual network call — this adapter never
 * touches a network itself, same separation warp/dispatch/index.js keeps.
 */
// §COMPOUNDING 2026-07-09 — exactCacheOnFirstSuccess is forwarded to
// unifiedDispatch. Without this pass-through the option exists in WARP but
// no caller can reach it: an opt-in nobody can opt into.
function createWarpDispatch({ generate, crystallizer, population, raid = null, scorer = null, log = null, maxAttempts = 3, exactCacheOnFirstSuccess = false }) {
  if (typeof generate !== 'function') {
    throw new Error('[seam/adapters/warp-cascade] generate(provider, record, lastFailure) is required');
  }
  return async function dispatch(record, plainAxioms) {
    // wrap plain {id, severity, check} into warp's Axiom class — the only
    // place that class is required, so a non-WARP caller never needs it.
    const axioms = plainAxioms.map(a => new Axiom(a.id, { severity: a.severity, check: a.check }));
    const providers = providersFor(record, raid);

    const cascade = ({ event }) => runCascade({
      providers, maxAttempts,
      generate: (provider, lastFailure) => generate(provider, record, lastFailure),
      validate: (output) => {
        const failed = axioms.filter(a => a.severity === 'hard' && !a.check({ data: { output } }));
        return { ok: failed.length === 0, failures: failed.map(a => a.id) };
      },
    }).then(result => ({ ok: result.ok, output: result.output, attempts: result.attempts }));

    return unifiedDispatch({
      gateSignature: record.seam_uuid,
      gateClass:     record.seam_id,
      event:         { data: { seam: record.seam_id } },
      axioms, crystallizer, population, cascade,
      scorer: scorer || (({ axiomFailures }) => 1 - axiomFailures.length * 0.1),
      expectedShapeKeys: record.contract.exports,
      log,
      exactCacheOnFirstSuccess,
    });
  };
}

module.exports = { createWarpDispatch, providersFor };
