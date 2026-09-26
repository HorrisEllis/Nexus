'use strict';
/**
 * copilot/lib/nexus-awareness.js — co-pilot's model OF nexus (§P4 completion)
 * UUID: nexus-copilot-awareness-v1-0000-2026-0807-001
 *
 * James: "I want to be able to ask co-pilot anything about cortex, models, the
 * system, diagnostic... a full system rundown, the model of nexus it uses for
 * nexus related questions. Make it way more nexus aware. Full system aware using
 * loom, diagnostic service, intelligence system."
 *
 * This is the mind's model of its own body — answered from REAL state, never
 * guessed (§1.1). It composes what P1-P3 + the loom scanners already built:
 *   - loom capability-map  → what NEXUS can do (255 declared, 239 served)
 *   - lib/version          → per-system versions
 *   - lib/ledger-fanin     → which systems are live/silent (coverage)
 *   - lib/diagnostic-causal→ what's wrong + the conditions behind it
 *   - loom spec-map        → what NEXUS is supposed to be
 *
 * §8.6 pure composition, no new data. Cached (60s) — these scans read the tree,
 * which must NOT block co-pilot's request thread (the "failed to fetch" lesson).
 */

let _cache = {}, _cacheAt = {};
const _TTL = 60_000;
function _memo(key, fn) {
  if (_cache[key] && (Date.now() - (_cacheAt[key] || 0)) < _TTL) return _cache[key];
  const v = fn(); _cache[key] = v; _cacheAt[key] = Date.now(); return v;
}

/**
 * systemRundown() — the full picture of NEXUS right now, from real state.
 */
function systemRundown(opts = {}) {
  return _memo('rundown', () => {
    const out = { versions: {}, capabilities: null, live: null, selfModel: null };

    // Per-system versions (real, from lib/version).
    try { const v = require('../../lib/version'); out.versions = { ...(v.services || {}), ...(v.modules || {}) }; if (v.system) out.versions.system = v.system; }
    catch (e) { out.versions = { error: e.message }; }

    // Capability count (real, from loom).
    try { const cap = require('./capabilities'); const w = cap.whatCanIDo(); out.capabilities = { total: w.total, systems: w.systemCount }; }
    catch (e) { out.capabilities = { error: e.message }; }

    // Live coverage — which systems are feeding the stream (P1 fan-in).
    try { const fan = require('../../lib/ledger-fanin'); out.live = fan.coverage(opts.expectedSystems || []); }
    catch (e) { out.live = { error: e.message }; }

    // Self-model — declared vs served (loom capability scanner).
    try {
      const cap = require('../../loom/scanners/capability-map');
      const decls = cap.loadAll(); const { unserved } = cap.verifyRoutes(decls);
      out.selfModel = { declared: decls.length, servedByNothing: unserved.length, staleDuplicates: (decls.duplicates || []).length };
    } catch (e) { out.selfModel = { error: e.message }; }

    const vsys = Object.keys(out.versions).filter(k => typeof out.versions[k] === 'string');
    out.text = `NEXUS rundown: ${out.capabilities?.total || '?'} capabilities across ${out.capabilities?.systems || '?'} systems` +
      (vsys.length ? `; ${vsys.length} versioned systems` : '') +
      (out.live?.feeding ? `; ${out.live.feeding.length} feeding the live stream` : '') +
      (out.selfModel?.servedByNothing ? `; ${out.selfModel.servedByNothing} capabilities served by nothing` : '') + '.';
    return out;
  });
}

/**
 * whatsWrong() — the diagnostic answer, with conditions, from the diagnostic
 * kernel's causal layer (P3). Real findings, not a canned response.
 */
async function whatsWrong(opts = {}) {
  try {
    const dc = require('../../lib/diagnostic-causal');
    const findings = opts.findings || [];   // caller passes current gaps; else context-only
    const deep = await dc.diagnoseDeep(findings, opts);
    return { text: deep.summary, ...deep };
  } catch (e) {
    return { text: `Diagnostic unavailable: ${e.message}`, error: e.message };
  }
}

/**
 * answerAbout(topic) — routes a NEXUS-state question to the right real source.
 * Cheap keyword routing; each branch reads real state.
 */
async function answerAbout(prompt, opts = {}) {
  const p = (prompt || '').toLowerCase();
  if (/\b(what('?s| is) wrong|what's broken|any (problems|issues|gaps)|diagnos)/.test(p)) return whatsWrong(opts);
  if (/\b(rundown|overview|system status|state of (the )?system|how is nexus|tell me about (the )?system)\b/.test(p)) return systemRundown(opts);
  if (/\bversions?\b/.test(p)) { const r = systemRundown(opts); return { text: `Versions: ${Object.entries(r.versions).filter(([, v]) => typeof v === 'string').map(([k, v]) => `${k} ${v}`).join(', ')}.`, versions: r.versions }; }
  return null;   // not a nexus-state question — let the normal path handle it
}

function _clearCache() { _cache = {}; _cacheAt = {}; }
module.exports = { systemRundown, whatsWrong, answerAbout, _clearCache, MODULE_ID: 'copilot-nexus-awareness', VERSION: '1.0.0' };
