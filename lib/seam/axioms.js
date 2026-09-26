'use strict';
/**
 * lib/seam/axioms.js — Seam contract → Axiom[]
 * UUID: nexus-seam-axioms-v1-0000-2026-0705-jamesbrooks-002
 * Version: 1.0.1
 *
 * §RELOCATED 2026-07-05: this lived at warp/dispatch/seamAxioms.js and
 * imported warp/core/Axiom directly — which meant "check a seam's
 * contract" had a hard dependency on WARP specifically, the exact
 * baked-in coupling this pass is removing. This version returns plain
 * {id, severity, check} objects — that shape happens to satisfy warp's
 * Axiom class duck-typed (severity/weight/check), but nothing here
 * imports warp, RAID, or Cortex. A caller using WARP wraps these in
 * `new Axiom(...)` at the call site (see lib/seam/adapters/warp-cascade.js);
 * a caller not using WARP uses the plain objects directly.
 *
 * Still a keyword-presence floor, not semantic verification — same
 * honesty note as before: a real static-analysis or test-execution check
 * is a named, unbuilt dependency, not something faked here.
 */

function _keyOf(line) {
  return String(line)
    .split(/[.:()]/)[0]
    .replace(/[^a-zA-Z0-9_ ]/g, '')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 3)
    .slice(0, 3);
}

function _textOf(output) {
  const raw = typeof output === 'string' ? output
    : (output && typeof output.text === 'string') ? output.text
    : (() => { try { return JSON.stringify(output); } catch (_) { return String(output); } })();
  // normalize the haystack the same way _keyOf normalizes the key —
  // hyphenated/punctuated words (e.g. "ring-buffer") must match on both
  // sides or neither. See dispatchSeam bug history for why this matters.
  return raw.replace(/[^a-zA-Z0-9_ ]/g, '');
}

function _axiom(id, severity, check) {
  return { id, severity, weight: severity === 'hard' ? 1.0 : 0.3, check };
}

/**
 * buildAxiomsForSeam — seamRecord (from kg-seam-bridge.js) → plain
 * Axiom-shaped array. `check(event)` reads `event.data.output` (or
 * `event.data` itself) — same event shape as lib/seam/stream.js's Event,
 * and the same shape warp/dispatch/index.js already expects, so no
 * adapter is needed on that side either.
 */
function buildAxiomsForSeam(seamRecord) {
  if (!seamRecord?.contract) {
    throw new Error('[seam/axioms] seamRecord.contract is required');
  }

  const axioms = [];

  for (const [i, line] of (seamRecord.contract.behavioral_contracts || []).entries()) {
    const keys = _keyOf(line);
    axioms.push(_axiom(`${seamRecord.seam_id}.behavioral.${i}`, 'hard', (event) => {
      if (!keys.length) return true;
      const text = _textOf(event?.data?.output ?? event?.data).toLowerCase();
      return keys.every(k => text.includes(k.toLowerCase()));
    }));
  }

  for (const [i, line] of (seamRecord.contract.error_paths || []).entries()) {
    const keys = _keyOf(line);
    axioms.push(_axiom(`${seamRecord.seam_id}.errorpath.${i}`, 'soft', (event) => {
      if (!keys.length) return true;
      const text = _textOf(event?.data?.output ?? event?.data).toLowerCase();
      return keys.every(k => text.includes(k.toLowerCase()));
    }));
  }

  const gateIds = (seamRecord.contract.gate_pipeline || [])
    .map(g => String(g).split(':')[0].trim().replace(/[^a-zA-Z0-9_ ]/g, ''))
    .filter(Boolean);
  if (gateIds.length) {
    axioms.push(_axiom(`${seamRecord.seam_id}.gate_coverage`, 'hard', (event) => {
      const text = _textOf(event?.data?.output ?? event?.data);
      return gateIds.every(g => text.includes(g));
    }));
  }

  return axioms;
}

module.exports = { buildAxiomsForSeam, _keyOf, _textOf };
