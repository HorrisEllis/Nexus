'use strict';
/**
 * attacks/deny-flood.js
 *
 * Exploit: bridge-threat's deny rate signal uses a rolling 60s window.
 * denyCount * (20/15) drives the contribution toward max weight of 20.
 * 15 denials in 60s = full weight → pushes score +20.
 * Combined with other signals this can force ELEVATED or HIGH regime.
 *
 * bridge-threat invariant: score never jumps more than MAX_DELTA (20) per
 * evaluation cycle. So we need sustained denial pressure, not a single burst.
 *
 * Vectors tested:
 *   1. Generate 15+ deny decisions in 60s window → push denyRate signal
 *   2. Monitor /health trust score and threat regime during flood
 *   3. Combine deny flood + fake node deaths to compound threat score
 *   4. Test whether sustained deny pressure crosses ELEVATED threshold (21+)
 *   5. Verify regime hysteresis — confirm score must HOLD before regime flips
 *
 * Triggers: Send calltos with action types that match existing deny rules,
 * or create a deny rule first (RULE_INJECT) then trigger it repeatedly.
 *
 * Expected defensive behavior:
 *   - Deny rate from a single source IP should not count equally as mesh-wide
 *   - Rate limiting on /callto should cap contribution
 *   - Source attribution should weight denial source not just raw count
 */

const ATTACK = 'DENY_FLOOD';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run({ client, log, dryRun }) {
  const DENY_TARGET   = 18;  // above the 15 needed for full denyRate weight
  const FLOOD_WINDOW  = 45000; // ms — within the 60s rolling window

  if (dryRun) {
    log.record({ attack: ATTACK, action: 'deny-flood', status: 0, expected: 'dry-run', actual: 'skipped', passed: true });
    return;
  }

  // ── Baseline threat score before attack ────────────────────────────────────
  const before = await client.get('/health');
  const scoreBefore = before.body?.trust?.score ?? null;
  const regimeBefore = before.body?.trust?.regime ?? 'unknown';

  log.record({
    attack: ATTACK, action: 'baseline',
    status: before.status, expected: 'ok',
    actual: `regime=${regimeBefore} score=${scoreBefore}`,
    passed: before.status === 200,
  });

  // ── Inject a deny rule so we can trigger it on demand ─────────────────────
  // Use a distinctive action type unlikely to collide with real traffic
  const baitAction = 'adversary.deny.trigger';
  const ruleR = await client.post('/sngate/rules', {
    type:   `callto.${baitAction}`,
    action: 'deny',
    reason: 'adversary-deny-flood-bait',
  });
  const ruleId = ruleR.body?.id;
  const ruleInjected = ruleR.status === 200 && ruleId;

  if (!ruleInjected) {
    log.record({
      attack: ATTACK, action: 'bait-rule-inject',
      status: ruleR.status, expected: '200 (rule accepted as baseline)',
      actual: `${ruleR.status} — cannot proceed without injectable rule`,
      passed: false,
      detail: 'Deny flood requires rule injection. If RULE_INJECT is blocked, deny flood is also mitigated.',
    });
    return;
  }

  // ── Generate rapid deny decisions ─────────────────────────────────────────
  const t0 = Date.now();
  let denyCount = 0;
  let allowCount = 0;

  for (let i = 0; i < DENY_TARGET; i++) {
    const r = await client.post('/callto', {
      action:   baitAction,
      selector: `#target-${i}`,
      origin:   'http://localhost:3000',
      tag:      'deny-flood',
    });
    if (r.status === 403) denyCount++;
    else allowCount++;

    // Spread denials over the window with slight jitter — don't burst all at once
    // (burst all at once gets pruned by window; spread maintains pressure)
    await sleep(Math.floor(FLOOD_WINDOW / DENY_TARGET) + Math.random() * 200);
  }

  const elapsed = Date.now() - t0;
  log.record({
    attack: ATTACK, action: `deny-flood-${DENY_TARGET}`,
    status: 200, expected: `${DENY_TARGET} denials`,
    actual: `${denyCount} denials, ${allowCount} allowed, in ${(elapsed/1000).toFixed(1)}s`,
    passed: denyCount >= DENY_TARGET * 0.8,
    detail: denyCount < DENY_TARGET * 0.8
      ? `Only ${denyCount} denials triggered — bait rule may not have matched. Check sngate rule store.`
      : `${denyCount} deny decisions generated in rolling window.`,
  });

  // ── Check threat score after flood ────────────────────────────────────────
  await sleep(3000); // allow bridge-threat eval cycle to run
  const after = await client.get('/health');
  const scoreAfter  = after.body?.trust?.score ?? null;
  const regimeAfter = after.body?.trust?.regime ?? 'unknown';

  const regimeEscalated = ['ELEVATED', 'HIGH', 'CRITICAL', 'BLACKOUT'].includes(regimeAfter)
    && regimeAfter !== regimeBefore;

  log.record({
    attack: ATTACK, action: 'threat-regime-escalation',
    status: after.status, expected: 'regime escalated above CALM',
    actual: `${regimeBefore} → ${regimeAfter} (score ${scoreBefore} → ${scoreAfter})`,
    passed: regimeEscalated,
    detail: !regimeEscalated
      ? `Score delta: ${(scoreAfter - scoreBefore).toFixed(1)}. Regime held at ${regimeAfter}. Hysteresis may be holding — check if score is above 21.`
      : `THREAT: deny flood escalated regime to ${regimeAfter}. Bridge in degraded operating mode.`,
  });

  // ── Compound test: node death + deny flood ─────────────────────────────────
  // Pulse a node then fail to heartbeat it — causes node:dead → peerLoss signal
  const ghostId = require('crypto').randomUUID();
  await client.post('/pulse', { instanceId: ghostId, logicalId: 'compound-ghost' });
  await sleep(500);
  // Don't heartbeat — nodeRegistry will evict on timeout, but we can check impact
  const compound = await client.get('/health');
  const scoreCompound = compound.body?.trust?.score ?? null;
  log.record({
    attack: ATTACK, action: 'compound-deny+node-death',
    status: compound.status, expected: 'score higher than deny-only',
    actual: `score = ${scoreCompound} (deny-only was ${scoreAfter})`,
    passed: scoreCompound >= scoreAfter,
    detail: scoreCompound > scoreAfter
      ? `Compound effect confirmed: node death + deny rate = ${scoreCompound} vs deny-only ${scoreAfter}.`
      : 'Compound effect not observed — node death may not have fired yet (eviction is timer-based).',
  });
}

module.exports = { run };
