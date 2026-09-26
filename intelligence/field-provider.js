'use strict';
/**
 * intelligence/field-provider.js — the CFR field the faculties read.
 * §BUILT 2026-09-19 — cortex->intelligence consolidation, decision D1.
 *
 * WHY THIS EXISTS. intuition/mastermind take getField(). Inside cortex that
 * was a mutable object (cortex/boot.js `_field`) fed by polling the
 * orchestrator. A faculty that lives in intelligence cannot read a field held
 * in cortex's process without making intelligence depend on cortex being up —
 * exactly what sovereignty (5.9) forbids. So intelligence polls the AUTHORITY
 * (the orchestrator's own /cfr/field) directly. Cortex is not in the path.
 *
 * ONE REGIME VOCABULARY (10.3). cortex's inline rule produced
 * chaotic/ordered/stable; intelligence/cfr/field.js's computeRegime produces
 * chaotic/turbulent/resonant/stable, and intelligence/adversarial.js matches
 * /regime:\s*(turbulent|resonant)/ — a vocabulary cortex's rule could never
 * emit. Reusing computeRegime (reuse before build, 8.6) means one definition
 * and makes that adversarial check reachable for the first time.
 *
 * HONEST DEGRADATION (1.2). If the orchestrator is unreachable the provider
 * keeps the last good value, but says so: `source` is 'default' until the
 * first successful poll, then 'orchestrator'; `stale` flips true once the
 * last good poll is older than 3 intervals. Nothing pretends to be live.
 */
const http = require('http');
const { computeRegime } = require('./cfr/field');

const MODULE_ID = 'intelligence.field-provider';
const DEFAULTS = Object.freeze({
  coherence: 0.6, friction: 0.2, resonance: 0.3, entropy: 0.2, // no `tension`: not a CFR dimension (2026-09-19)
});

function createFieldProvider({ url, intervalMs = 5000, httpGet = _httpGetJSON, now = Date.now } = {}) {
  let _field = { ...DEFAULTS, regime: computeRegime(DEFAULTS), source: 'default', updatedAt: now(), lastOkAt: null, stale: true };
  let _timer = null;

  function update(patch) {
    const merged = { ..._field };
    for (const k of Object.keys(DEFAULTS)) {
      if (typeof patch[k] === 'number' && Number.isFinite(patch[k])) merged[k] = patch[k];
    }
    merged.regime = computeRegime(merged);
    merged.updatedAt = now();
    _field = merged;
  }

  async function poll() {
    try {
      const data = await httpGet(`${url.replace(/\/$/, '')}/cfr/field`);
      if (data && typeof data.coherence === 'number') {
        update(data);
        _field = { ..._field, source: 'orchestrator', lastOkAt: now(), stale: false };
        return true;
      }
    } catch (_) { /* unreachable is a reported state (stale), not a crash */ }
    if (_field.lastOkAt && now() - _field.lastOkAt > intervalMs * 3) _field = { ..._field, stale: true };
    return false;
  }

  function start() {
    if (_timer) return;
    poll();
    _timer = setInterval(poll, intervalMs);
    if (_timer.unref) _timer.unref();
  }
  function stop() { if (_timer) { clearInterval(_timer); _timer = null; } }
  function get() { return _field; }

  return { start, stop, poll, get, update, MODULE_ID };
}

function _httpGetJSON(u) {
  return new Promise((resolve, reject) => {
    const req = http.get(u, { timeout: 3000 }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
  });
}

module.exports = { createFieldProvider, DEFAULTS, MODULE_ID };
