'use strict';
/**
 * lib/warp-rung.js — WB1/WB2: WARP around an agent call whose agent was already chosen.
 * comp_id: nexus.lib.warp-rung
 *
 * James, 2026-10-15: "make sure all builds use warp."
 * James, 2026-10-16, choosing between the two options put to him: "Option 1 (my recommendation): wrap each of those agent
 * calls in WARP (its cache, then the axiom gate, then keeping the result), while the build ladder and RAID still choose
 * which agent runs."
 *
 * The build ladder (PRt.climb), RAID (decideForContract) and the officiator pick the agent, as before (§9.1). This file
 * only runs WARP's unifiedDispatch around the call they already make: (1) the exact cache, (2) the axiom gate, (3) score
 * and retain into the population, promoted to the cache after 3 passing results for the same input. One provider is
 * tried (the chosen one), once: the ladder owns retries and fallbacks, WARP does not add a second chain.
 *
 * Two modes, because the calls are not alike (read in source, 2026-10-16):
 *   cache  the reply IS the result (the planner's plan, the officiator's contract JSON, a RAID worker's text). A cache hit
 *          returns the text with no agent call.
 *   gate   the work is the side effects: a repo-agent build writes files through its tools and lands injects inside
 *          RA.dispatch. Replaying the reply text would write nothing, so a hit would be a lie. Gate mode never serves
 *          from the cache; it runs the axiom gate and retains the result (WARP learns the gate class), and says so.
 * A retry is `fresh`: it never reads the cache (a retried input already failed downstream). reject(digest) drops a
 * cached reply that a later check found bad.
 *
 * wrap(call, { kind, provider, key, mode, axioms, fresh }) → the call's own result, plus `warp: { mode, source, digest }`
 *   call()   the existing agent call, unchanged; must resolve to { ok, text, ... } (or throw)
 *   key      the input that makes two calls identical (the prompt, plus anything that changes the answer)
 * WARP not loadable → the call runs directly and `warp.source` is 'direct' with the reason (§1.2: said, never silent).
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const VERSION = '1.0.0';
const MODES = Object.freeze(['cache', 'gate']);

let _store = null, _loadError = null;
function _dataDir() {
  try { require('./test-sandbox.js').ensure(); } catch (_) { /* no sandbox: production */ }
  return path.join(process.env.NEXUS_DATA_ROOT || path.resolve(__dirname, '..', 'data'), 'warp');
}
function _load() {
  if (_store || _loadError) return _store;
  try {
    const { createWarpDispatch } = require('./seam/adapters/warp-cascade.js');
    const { FlatFileCrystallizer } = require('../warp/plugins/crystallizer-flatfile.js');
    const { PopulationStore } = require('../warp/dispatch/population.js');
    const dir = _dataDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    _store = { createWarpDispatch, crystallizer: new FlatFileCrystallizer({ path: path.join(dir, 'rung-crystals.json') }), population: new PopulationStore({ maxPerClass: 8 }) };
  } catch (e) { _loadError = e.message; }
  return _store;
}

const NO_CACHE = Object.freeze({ get: () => null, set: () => {}, invalidate: () => {}, size: () => 0 });

/** digestOf(kind, provider, key) — the gate signature: identical input to the same agent for the same kind of work */
function signatureOf(kind, provider, key) {
  return `rung:${kind}:${provider || 'auto'}:sha256:${crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 32)}`;
}

async function wrap(call, { kind = 'build', provider = null, key = '', mode = 'gate', axioms = [], fresh = false } = {}) {
  if (typeof call !== 'function') throw new Error('[warp-rung] wrap(call, opts): call is required');
  if (!MODES.includes(mode)) throw new Error(`[warp-rung] mode must be one of ${MODES.join(', ')}`);
  const W = _load();
  if (!W) {
    const r = await call();
    return _with(r, { mode, source: 'direct', why: `WARP could not load: ${_loadError}` });
  }
  let last = null, threw = null;
  const crystallizer = mode === 'cache' && !fresh ? W.crystallizer : (mode === 'cache' ? { ...NO_CACHE, set: (d, v) => W.crystallizer.set(d, v) } : NO_CACHE);
  const dispatch = W.createWarpDispatch({
    crystallizer, population: W.population, maxAttempts: 1,
    generate: async () => {
      try { last = await call(); } catch (e) { threw = e; throw e; }
      if (!last || !last.ok) throw new Error(String((last && last.error) || 'the agent did not answer'));
      return String(last.text == null ? '' : last.text);
    },
  });
  const record = { seam_uuid: signatureOf(kind, provider, key), seam_id: `rung:${kind}`, description: kind, preferredProvider: provider, contract: { exports: [] } };
  let res;
  try { res = await dispatch(record, axioms); }
  catch (e) {
    if (threw) throw threw;   // the call's own throw: the caller's catch handles it, as before
    if (last) return _with(last, { mode, source: 'direct', why: `WARP failed around the call: ${e.message}` });
    return { ok: false, error: `[warp-rung] ${e.message}`, warp: { mode, source: 'error' } };
  }
  if (threw) throw threw;
  if (res.source === 'crystal') return { ok: true, text: res.output, agent: provider, cacheHit: true, warp: { mode, source: 'crystal', digest: res.digest, cost: 0 } };
  if (last && !last.ok) return _with(last, { mode, source: 'generated', digest: res.digest });   // the call's own failure, unchanged
  if (!res.ok) {
    const failed = (res.attemptLog || []).flatMap(a => a.failures || []);
    // gate mode: the call already ran (files may be written) — the result stands, refused, so the caller does not count it
    return _with({ ...(last || {}), ok: false, error: `WARP's axiom gate refused the reply${failed.length ? `: ${failed.join(', ')}` : ''}` },
      { mode, source: 'rejected', digest: res.digest, failures: failed });
  }
  return _with(last, { mode, source: res.source, digest: res.digest, fitness: res.fitness });
}

function _with(r, warp) { return r && typeof r === 'object' ? { ...r, warp } : { ok: false, error: 'no result', warp }; }

/** reject(digest) — a cached reply a later check found bad is dropped (never served again) */
function reject(digest) { const W = _load(); if (!W || !digest) return false; try { W.crystallizer.invalidate(digest); return true; } catch (_) { return false; } }

function status() { const W = _load(); return { version: VERSION, loaded: !!W, error: _loadError, crystals: W ? W.crystallizer.size() : 0 }; }

/** _reset() — tests only: drop the loaded store so a new NEXUS_DATA_ROOT takes effect */
function _reset() { _store = null; _loadError = null; }

module.exports = { VERSION, MODES, wrap, reject, status, signatureOf, _reset };
