'use strict';
/**
 * attacks/rule-inject.js
 *
 * Exploit: POST /sngate/rules requires only a valid API key.
 * No secondary authorization, no ownership verification, no quota.
 * Injected rules persist to disk and survive Bridge restarts.
 *
 * Vectors tested:
 *   1. Inject a wildcard deny rule → all calltos blocked
 *   2. Inject an allow rule for a known-hostile surface → bypass observe gate
 *   3. Inject a deny rule targeting a specific UUID → identity assassination
 *   4. Verify rules survive a /sngate/rules GET (confirming disk write)
 *   5. Inject rule with conflicting precedence (deny + allow same type)
 *
 * Expected defensive behavior:
 *   - Rules should require a signed challenge (not just API key)
 *   - Write quota per session should exist
 *   - Wildcard deny rules should require elevated confirmation
 */

const ATTACK = 'RULE_INJECT';

async function run({ client, log, dryRun, crypto }) {
  // ── 1. Wildcard deny — blocks all callto.* actions ─────────────────────────
  const wildcardRule = {
    type:    'callto.*',
    action:  'deny',
    surface: 'dev',
    reason:  'adversary-test-wildcard',
    ttl:     60000, // 60s — clean up after test
  };

  if (!dryRun) {
    const r = await client.post('/sngate/rules', wildcardRule);
    const injected = r.status === 200 && r.body?.id;
    log.record({
      attack: ATTACK, action: 'wildcard-deny-inject',
      status: r.status, expected: '403 or 200 w/ confirmation',
      actual: injected ? `200 — rule id ${r.body.id} written to disk` : `${r.status}`,
      passed: r.status === 403,
      detail: injected
        ? 'VULN: wildcard deny accepted with no confirmation step. Survives restart.'
        : 'PASS: wildcard deny rejected.',
    });

    // ── 2. Verify persistence — GET rules, confirm ours is listed ─────────────
    if (injected) {
      const listR  = await client.get('/sngate/rules');
      const listed = listR.body?.rules?.some(r => r.id === r.body?.id || r.reason === 'adversary-test-wildcard');
      log.record({
        attack: ATTACK, action: 'wildcard-deny-persisted',
        status: listR.status, expected: 'rule NOT in list (rejected upstream)',
        actual: listed ? 'rule confirmed in live rule store' : 'rule absent',
        passed: !listed,
        detail: listed ? 'VULN: injected rule active in runtime.' : 'PASS: rule not active.',
      });
    }
  } else {
    log.record({ attack: ATTACK, action: 'wildcard-deny-inject', status: 0, expected: 'dry-run', actual: 'skipped', passed: true });
  }

  // ── 3. Surface bypass — allow rule on 'agent' surface ──────────────────────
  const surfaceBypass = {
    type:    'callto.navigate',
    action:  'allow',
    surface: 'agent',
    reason:  'adversary-test-surface-bypass',
  };

  if (!dryRun) {
    const r = await client.post('/sngate/rules', surfaceBypass);
    log.record({
      attack: ATTACK, action: 'agent-surface-allow-inject',
      status: r.status, expected: '403',
      actual: r.status === 200 ? `200 — allow rule injected on agent surface` : `${r.status}`,
      passed: r.status === 403,
      detail: r.status === 200
        ? 'VULN: allow rule injected for agent surface — any callto.navigate now bypasses observe gate on agent.'
        : 'PASS: rejected.',
    });
  }

  // ── 4. UUID assassination — deny rule targeting a real node UUID ───────────
  //    First, enumerate a real node UUID from /nodes
  if (!dryRun) {
    const nodes = await client.get('/nodes');
    const target = nodes.body?.nodes?.[0]?.uuid;
    if (target) {
      const assassin = {
        type:   'mesh.peer.connect',
        value:  target,
        action: 'deny',
        reason: 'adversary-test-uuid-assassin',
      };
      const r = await client.post('/sngate/rules', assassin);
      log.record({
        attack: ATTACK, action: 'uuid-assassination',
        status: r.status, expected: '403',
        actual: r.status === 200
          ? `200 — deny rule injected for uuid ${target.slice(0,8)}`
          : `${r.status}`,
        passed: r.status === 403,
        detail: r.status === 200
          ? `VULN: node ${target.slice(0,8)} can be silently denied at the gate. Trust mesh will degrade it.`
          : 'PASS: rejected.',
      });
    }
  }

  // ── 5. Conflicting rules — deny + allow same type ─────────────────────────
  //    sngate precedence: first match wins. Inject deny AFTER allow to shadow it.
  if (!dryRun) {
    const allow = { type: 'callto.scroll', action: 'allow', reason: 'adv-conflict-allow' };
    const deny  = { type: 'callto.scroll', action: 'deny',  reason: 'adv-conflict-deny'  };
    const r1 = await client.post('/sngate/rules', allow);
    const r2 = await client.post('/sngate/rules', deny);
    const bothOk = r1.status === 200 && r2.status === 200;
    log.record({
      attack: ATTACK, action: 'conflicting-rule-shadow',
      status: r2.status, expected: '409 conflict or 403',
      actual: bothOk ? '200+200 — conflicting rules both accepted' : `${r1.status}/${r2.status}`,
      passed: !bothOk,
      detail: bothOk
        ? 'VULN: conflicting rules accepted. Evaluation order determines outcome — attacker controls insertion order.'
        : 'PASS: conflict detected.',
    });
  }
}

module.exports = { run };
