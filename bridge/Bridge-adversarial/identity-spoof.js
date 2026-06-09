'use strict';
/**
 * attacks/identity-spoof.js
 *
 * Exploit: POST /pulse registers any UUID as a node with only API key auth.
 * No cryptographic ownership proof required.
 * The registered UUID immediately affects nodeRegistry and trustMesh.
 *
 * Vectors tested:
 *   1. Register a spoofed UUID using a real node's known shortId shape
 *   2. Impersonate the target bridge itself (same UUID)
 *   3. Register with a forged logicalId to poison groupHint
 *   4. Verify spoofed node appears in /nodes list
 *   5. Trigger trust scoring for spoofed identity (Bayesian cold start)
 *
 * Expected defensive behavior:
 *   - /pulse should require a signed challenge tied to the UUID's keypair
 *   - Self-impersonation should be rejected
 *   - Unknown UUIDs should start in quarantine, not neutral trust
 */

const ATTACK = 'IDENTITY_SPOOF';

async function run({ client, log, dryRun, crypto }) {
  // Get real identity to spoof against
  let targetUUID = null;
  let targetShortId = null;

  if (!dryRun) {
    const id = await client.get('/identity');
    targetUUID    = id.body?.uuid;
    targetShortId = id.body?.shortId || targetUUID?.slice(0, 8);
  }

  // ── 1. Spoof a plausible UUID (same shortId prefix pattern) ───────────────
  const spoofedUUID = crypto.randomUUID();

  if (!dryRun) {
    const r = await client.post('/pulse', {
      instanceId:   spoofedUUID,
      logicalId:    'legitimate-node-group',
      capabilities: ['mesh', 'data', 'callto'],
    });
    const registered = r.status === 200;
    log.record({
      attack: ATTACK, action: 'uuid-spoof-register',
      status: r.status, expected: '401 or 403 (ownership proof required)',
      actual: registered
        ? `200 — uuid ${spoofedUUID.slice(0,8)} registered with no proof`
        : `${r.status}`,
      passed: !registered,
      detail: registered
        ? 'VULN: any UUID accepted at /pulse. No cryptographic ownership challenge.'
        : 'PASS: spoofed UUID rejected.',
    });

    // ── 2. Verify spoofed node appears in /nodes ───────────────────────────
    if (registered) {
      const nodes = await client.get('/nodes?all=true');
      const found = nodes.body?.nodes?.some(n => n.uuid === spoofedUUID);
      log.record({
        attack: ATTACK, action: 'uuid-spoof-in-registry',
        status: nodes.status, expected: 'NOT in registry',
        actual: found ? `node ${spoofedUUID.slice(0,8)} active in registry` : 'absent',
        passed: !found,
        detail: found
          ? 'VULN: spoofed node in live registry — affects mesh topology, routing decisions, trustMesh.'
          : 'PASS: not present.',
      });
    }
  } else {
    log.record({ attack: ATTACK, action: 'uuid-spoof-register', status: 0, expected: 'dry-run', actual: 'skipped', passed: true });
  }

  // ── 3. Self-impersonation — register the target's own UUID ────────────────
  if (!dryRun && targetUUID) {
    const r = await client.post('/pulse', {
      instanceId:   targetUUID,
      logicalId:    'shadow-bridge',
      capabilities: ['mesh', 'data', 'guardian', 'callto'],
    });
    const accepted = r.status === 200;
    log.record({
      attack: ATTACK, action: 'self-impersonation',
      status: r.status, expected: '409 conflict or 403',
      actual: accepted
        ? `200 — target UUID ${targetShortId} re-registered as shadow-bridge`
        : `${r.status}`,
      passed: !accepted,
      detail: accepted
        ? `VULN: bridge accepted its own UUID from external pulse. nodeRegistry now has a ghost twin. Trust signals double-counted.`
        : 'PASS: self-impersonation blocked.',
    });
  }

  // ── 4. GroupHint poisoning — forge logicalId to join trusted group ────────
  if (!dryRun) {
    const poisonId = crypto.randomUUID();
    const r = await client.post('/pulse', {
      instanceId: poisonId,
      logicalId:  'production-cluster-primary', // guessed trusted group name
      capabilities: ['mesh'],
    });
    const accepted = r.status === 200;
    log.record({
      attack: ATTACK, action: 'grouphint-poison',
      status: r.status, expected: '403 (logicalId verification required)',
      actual: accepted
        ? `200 — rogue node joined group 'production-cluster-primary'`
        : `${r.status}`,
      passed: !accepted,
      detail: accepted
        ? 'VULN: logicalId/groupHint accepted without membership proof. Routing decisions may route traffic to attacker.'
        : 'PASS: rejected.',
    });
  }

  // ── 5. Rapid UUID churn — flood registry to exhaust memory/storage ────────
  if (!dryRun) {
    const CHURN_COUNT = 20;
    let accepted = 0;
    for (let i = 0; i < CHURN_COUNT; i++) {
      const r = await client.post('/pulse', { instanceId: crypto.randomUUID(), logicalId: `ghost-${i}` });
      if (r.status === 200) accepted++;
    }
    log.record({
      attack: ATTACK, action: `registry-churn-${CHURN_COUNT}-uuids`,
      status: 200, expected: '0 accepted (rate limit)',
      actual: `${accepted}/${CHURN_COUNT} registered`,
      passed: accepted === 0,
      detail: accepted > 0
        ? `VULN: ${accepted} ghost nodes registered with no rate limit. Registry grows unbounded.`
        : 'PASS: rate limited.',
    });
  }
}

module.exports = { run };
