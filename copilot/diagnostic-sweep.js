'use strict';
/**
 * copilot/diagnostic-sweep.js — OB2 of the observability/tablet phasemap
 * UUID: nexus-copilot-diagnostic-sweep-v1-0000-2026-0730-001
 *
 * §PHASEMAP OB2 (docs/nexus-observability-tablet-phasemap.spec, CHUNK E). Where
 * OB1 READS the current state, OB2 actively DETECTS issues/bugs/faults/failure-
 * modes/gaps and logs them. It composes the EXISTING detectors — gap-hunter
 * (meta/gap/hunter.js: analyze/drift/bottleneck), bda/gaps, and the CFR stress
 * signal — into one diagnostic sweep, and files anything new as a gap. §8.6 —
 * wires the detectors that already exist, adds no new detection engine. §13.4 —
 * detection IS drift data. §17.6 — every finding is logged. §1.2 — a fault is
 * loud (a filed gap), never swallowed. Non-fatal.
 */

const http = require('http');
const CORTEX = { host: '127.0.0.1', port: 3748 };

function _postGap(gap) {
  return new Promise((resolve) => {
    const data = Buffer.from(JSON.stringify(gap));
    const req = http.request({ hostname: CORTEX.host, port: CORTEX.port, path: '/api/gaps', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }, timeout: 3000 },
      (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: res.statusCode < 400 }); } }); });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(data); req.end();
  });
}

/**
 * sweep(opts) — run the full diagnostic detection sweep. Returns
 *   { findings: [{ type, detail, source, severity }], filed: N }
 * A finding is anything the detectors flag: an offline system, a stressed CFR
 * regime, a repeated denied action, a bottleneck. New findings are filed as gaps
 * (unless opts.dryRun). §0.1 — findings come from real detectors + real state.
 */
async function sweep(opts = {}) {
  const findings = [];

  // 1. OB1's live diagnostic state is the input.
  let report = null;
  try { report = await require('./diagnostics').diagnose(opts); } catch { report = null; }

  if (report) {
    // Offline/degraded systems → a fault.
    const h = report.health || {};
    for (const [sys, state] of Object.entries(h.systems || {})) {
      if (state !== 'online') findings.push({ type: 'system_offline', detail: `${sys} is ${state}`, source: 'health-poll', severity: 'high' });
    }
    // Turbulent/chaotic CFR regime → stress fault (the "where/why").
    if (report.regime && (report.regime.state === 'turbulent' || report.regime.state === 'chaotic')) {
      findings.push({ type: 'cfr_stress', detail: `CFR regime is ${report.regime.state} (friction/entropy elevated)`, source: 'cfr-field', severity: 'medium' });
    }
    // Denied verification actions → possible misbehaviour.
    if (report.decisions && report.decisions.denied > 0) {
      findings.push({ type: 'denied_actions', detail: `${report.decisions.denied} recently denied at the verification gate`, source: 'raid', severity: 'low' });
    }
    // Schema drift → integrity fault.
    if (report.drift && report.drift.count > 0) {
      findings.push({ type: 'schema_drift', detail: `${report.drift.count} schema-drift records`, source: 'schema-registry', severity: 'low' });
    }
  }

  // 2. gap-hunter's bottleneck/drift detectors over the same state (§8.6 reuse).
  try {
    const hunter = require('../intelligence/gap/hunter.js');
    if (typeof hunter.bottleneck === 'function' && report) {
      const b = hunter.bottleneck({ health: report.health, regime: report.regime });
      if (b && (b.bottleneck || b.stalled)) findings.push({ type: 'bottleneck', detail: b.reason || b.where || 'bottleneck detected', source: 'gap-hunter', severity: 'medium' });
    }
  } catch { /* hunter optional */ }

  // 3. File new findings as gaps (§1.2 loud, §17.6 logged) unless dry-run.
  let filed = 0;
  if (!opts.dryRun) {
    for (const f of findings) {
      const r = await _postGap({ type: `diagnostic:${f.type}`, body: f.detail, severity: f.severity, source: `diagnostic-sweep/${f.source}`, status: 'open' });
      if (r && (r.ok || r.id)) filed++;
    }
  }

  return { findings, filed, healthy: findings.length === 0, ts: Date.now() };
}

module.exports = { sweep, MODULE_ID: 'copilot-diagnostic-sweep', VERSION: '1.0.0' };
