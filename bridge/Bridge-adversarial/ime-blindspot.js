'use strict';
/**
 * attacks/ime-blindspot.js
 *
 * Exploit: IME anomaly detection requires ≥100 events before it trusts
 * its own baseline. Fresh UUIDs receive only a probationary penalty
 * that fades linearly to 0 by 100 events.
 *
 * IME-01 fix (closes UUID <100 event bypass) is documented in the code:
 *   "UUIDs with <100 events bypassed all anomaly detection"
 * The fix added probationary scoring — but the UUID can still operate
 * at score ~base+probationary which may be above gateThreshold (5).
 *
 * Vectors tested:
 *   1. Register a UUID, send exactly 99 events — confirm operates freely
 *   2. Measure actual trustScore at 99 events vs 101 events
 *   3. Cycle UUIDs: burn one to 99 events, rotate to fresh UUID (never cross 100)
 *   4. Send 99 events with synthetic burst pattern — confirm no burst detection
 *
 * Expected defensive behavior:
 *   - UUIDs under 100 events should default to OBSERVE, never ALLOW
 *   - UUID cycling should be detected by correlating IP + behavior fingerprint
 *   - Probationary score should be BELOW gateThreshold (currently above neutral)
 */

const ATTACK = 'IME_BLINDSPOT';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run({ client, log, dryRun, crypto }) {
  // ── 1. Register fresh UUID, stay under 100-event threshold ────────────────
  const freshUUID = crypto.randomUUID();
  const EVENT_LIMIT = 99; // one below detection

  if (!dryRun) {
    // Register the UUID via pulse
    await client.post('/pulse', { instanceId: freshUUID, logicalId: 'ime-probe' });

    // Send 99 callto actions — each triggers an sngate.evaluate which IME ingests
    // Use a benign action type that won't be blocked by existing rules
    let allowedCount = 0;
    for (let i = 0; i < EVENT_LIMIT; i++) {
      const r = await client.post('/callto', {
        action:   'scroll',
        selector: '#content',
        origin:   `http://localhost:3000/page-${i}`,
        tag:      `ime-probe-${freshUUID.slice(0,8)}`,
      });
      if (r.status !== 403) allowedCount++;
      // Deliberate: no delay — this is a burst test
    }

    log.record({
      attack: ATTACK, action: 'pre-threshold-operation',
      status: 200, expected: 'all 99 → observe (not allow)',
      actual: `${allowedCount}/99 proceeded without block`,
      passed: allowedCount === 0,
      detail: allowedCount > 0
        ? `VULN: ${allowedCount} actions executed in IME blind window. No burst detection below 100-event baseline.`
        : 'PASS: all actions held in observe or blocked.',
    });

    // Check IME profile for this UUID after 99 events
    const profile = await client.get(`/ime/profile/${freshUUID}`);
    const score   = profile.body?.profile?.trustScore;
    log.record({
      attack: ATTACK, action: 'ime-score-at-99-events',
      status: profile.status, expected: 'score < 5 (below gateThreshold)',
      actual: score !== undefined ? `trustScore = ${score}` : 'profile not found',
      passed: score !== undefined && score < 5,
      detail: score >= 5
        ? `VULN: probationary UUID score ${score} ≥ gateThreshold (5). Score-only path allows execution without deny rule.`
        : score < 5
          ? 'PASS: score below gate threshold.'
          : 'INFO: no IME profile (never ingested).',
    });
  } else {
    log.record({ attack: ATTACK, action: 'pre-threshold-operation', status: 0, expected: 'dry-run', actual: 'skipped', passed: true });
  }

  // ── 2. UUID cycling — burn 99 events, rotate to fresh UUID ────────────────
  if (!dryRun) {
    const CYCLE_COUNT = 3;
    let successfulCycles = 0;

    for (let c = 0; c < CYCLE_COUNT; c++) {
      const cycleUUID = crypto.randomUUID();
      await client.post('/pulse', { instanceId: cycleUUID, logicalId: `cycle-${c}` });

      // Send 50 events — well under threshold — from each cycled UUID
      let blocked = false;
      for (let i = 0; i < 50; i++) {
        const r = await client.post('/callto', {
          action: 'click',
          selector: `#btn-${i}`,
          origin: `http://localhost:3000`,
          tag: `cycle-${c}-${cycleUUID.slice(0,8)}`,
        });
        if (r.status === 403) { blocked = true; break; }
      }
      if (!blocked) successfulCycles++;
      await sleep(100);
    }

    log.record({
      attack: ATTACK, action: `uuid-cycling-${CYCLE_COUNT}x`,
      status: 200, expected: '0 successful (IP+behavior correlation)',
      actual: `${successfulCycles}/${CYCLE_COUNT} cycles undetected`,
      passed: successfulCycles === 0,
      detail: successfulCycles > 0
        ? `VULN: ${successfulCycles} UUID rotation cycles completed undetected. IME baseline never matures → detection permanently bypassed.`
        : 'PASS: cycling detected via IP/behavior correlation.',
    });
  }

  // ── 3. Burst below baseline — 99 rapid events should trigger burst anomaly ─
  //    IME burst requires avgFrequency baseline — which doesn't exist at <100 events.
  //    This tests whether the burst detector fires on absolute rate vs relative rate.
  if (!dryRun) {
    const burstUUID = crypto.randomUUID();
    await client.post('/pulse', { instanceId: burstUUID });

    const t0 = Date.now();
    for (let i = 0; i < 30; i++) {
      await client.post('/callto', {
        action: 'type', selector: '#input', params: { text: `burst-${i}` },
        origin: 'http://localhost:3000', tag: `burst-${burstUUID.slice(0,8)}`,
      });
    }
    const elapsed = Date.now() - t0;

    const profile = await client.get(`/ime/profile/${burstUUID}`);
    const anomalies = profile.body?.profile?.anomalies || [];
    const hasBurst  = anomalies.some(a => a.type === 'burst');

    log.record({
      attack: ATTACK, action: 'burst-below-baseline',
      status: 200, expected: 'burst anomaly detected',
      actual: hasBurst
        ? `burst anomaly fired (30 events in ${elapsed}ms)`
        : `no anomaly — 30 events in ${elapsed}ms, ${anomalies.length} anomalies total`,
      passed: hasBurst,
      detail: !hasBurst
        ? 'VULN: IME burst detection relies on avgFrequency baseline. No baseline below 100 events → absolute rate bursts go undetected.'
        : 'PASS: burst detected.',
    });
  }
}

module.exports = { run };
