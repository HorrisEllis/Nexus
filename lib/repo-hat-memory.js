'use strict';
/**
 * lib/repo-hat-memory.js — what the project agent has actually learned.
 * UUID: nexus-repo-hat-memory-v1-0000-2026-0920-jamesbrooks-001
 * Version: 0.1.0
 *
 * §REPO-HAT-MEMORY 2026-09-20 — James: "learns as it works, updating the
 * .hat and .agent as models."
 *
 * §WHY THIS IS A SEPARATE STORE AND NOT A HAT FIELD. The obvious move is
 * to accrete learning into the hat's own personaPrompt — it is in
 * hat-forge's MUTABLE_FIELDS, so it would work on the first write. It
 * breaks on the second: lib/repo-hat.js's refreshRepoHatPersona()
 * rebuilds personaPrompt WHOLESALE from the atlas, by design, because a
 * persona that still says "not indexed yet" after indexing is a lie told
 * to the agent on every dispatch. Any learning living inside that string
 * is destroyed by the next refresh, silently, with no error.
 *
 * So learning lives here, in its own table, and buildPersona() COMPOSES
 * the two: grounded facts from the atlas + observations from this store.
 * A refresh then re-grounds the facts and preserves the learning, which
 * is the only arrangement where both stay true.
 *
 * §WHAT AN OBSERVATION IS. Something the agent found out by working —
 * not a summary of what it said. Four real kinds, and the list is closed
 * on purpose (an open vocabulary becomes a free-text field wearing a
 * schema):
 *   fact        — something true about this repo the atlas does not carry
 *   convention  — how this project does a thing, inferred from its code
 *   pitfall     — something that went wrong, so it is not repeated
 *   correction  — the person told the agent it was wrong about something
 *
 * A `correction` outranks everything else when the persona is built: a
 * thing James said directly is worth more than a thing the agent
 * concluded, and if they contradict, the correction is the one that
 * survives into the next dispatch.
 *
 * §DEDUP. Same repo + same kind + same normalised text bumps occurrences
 * on the existing row rather than writing a second one, matching
 * lib/gap-field.js's own convention for exactly this problem. An agent
 * that re-learns the same fact on every session would otherwise flood
 * its own persona with one sentence repeated forty times.
 *
 * §THE FIELD IS dedupKey, NOT key, AND THAT IS NOT COSMETIC. Found by
 * running the test, not by reading: guardian/jaa-store.js's insert()
 * derives every row's primary store id as `row.id || row.key || uuid()`
 * (line 148, and again at 483/563 on the reload paths). A field literally
 * named `key` is therefore silently promoted to the row's identity — so
 * two observations sharing normalised text but differing in kind
 * collided on one store id and the second overwrote the first, losing a
 * real observation with no error anywhere. `id` and `key` are reserved
 * field names in this store for any table.
 *
 * §THIS DOES NOT TRAIN ANYTHING. "Learns" here means a real, inspectable,
 * editable record that is fed back into the agent's context — not weight
 * updates, not fine-tuning. Stated plainly so nobody reads more into the
 * word than the mechanism delivers.
 */

const crypto = require('crypto');

const MODULE_ID = 'repo-hat-memory';
const VERSION = '0.1.0';
const TABLE = 'repo_hat_memory';

const KINDS = Object.freeze(['fact', 'convention', 'pitfall', 'correction']);

// A correction is worth more than a conclusion. Used for ordering only —
// nothing is ever dropped from the store because of it.
const KIND_WEIGHT = Object.freeze({ correction: 3, pitfall: 2, convention: 1, fact: 0 });

// How many observations reach the persona. The rest stay queryable but out
// of the prompt — a persona that grows without bound eventually crowds out
// the request it is attached to.
const PERSONA_MAX = 24;

function _jaa() {
  // Lazily required, same as lib/repo-hat.js's own _forge(): this module is
  // loaded by a UI-facing route and must not drag the store in at import.
  return require('./../cortex/memory/jaa-db.js').jaaDB;
}

function _normalise(text) {
  return String(text || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * record(repoUuid, { kind, text, source, evidence }) — one observation.
 * Returns { ok, observation, deduped } or { ok:false, errors }.
 *
 * `evidence` is optional but strongly wanted: a chunk id, a file path, a
 * command that failed. An observation with no evidence is still stored —
 * refusing it would lose real signal — but it is marked, and the persona
 * says which ones are unevidenced so the agent weighs them accordingly.
 */
function record(repoUuid, { kind, text, source = 'agent', evidence = null } = {}) {
  const errors = [];
  if (!repoUuid) errors.push('repoUuid is required');
  if (!KINDS.includes(kind)) errors.push(`kind must be one of: ${KINDS.join(', ')}`);
  if (!text || String(text).trim().length < 3) errors.push('text must be at least 3 characters');
  if (errors.length) return { ok: false, errors };

  const body = String(text).trim();
  const dedupKey = _normalise(body);
  const jaa = _jaa();
  const now = Date.now();

  const existing = (jaa.query(TABLE, r => r.repoUuid === repoUuid && r.kind === kind && r.dedupKey === dedupKey, 1) || [])[0];
  if (existing) {
    const patch = {
      occurrences: (existing.occurrences || 1) + 1,
      lastSeen: now,
      // A later sighting that carries evidence upgrades one that did not.
      evidence: existing.evidence || evidence || null,
    };
    jaa.update(TABLE, { uuid: existing.uuid }, patch);
    return { ok: true, observation: { ...existing, ...patch }, deduped: true };
  }

  const observation = {
    uuid: crypto.randomUUID(),
    repoUuid, kind, dedupKey,
    text: body,
    source,
    evidence: evidence || null,
    occurrences: 1,
    firstSeen: now,
    lastSeen: now,
  };
  jaa.insert(TABLE, observation);
  return { ok: true, observation, deduped: false };
}

/** list(repoUuid, { limit, kind }) — everything learned, newest first. */
function list(repoUuid, { limit = 200, kind = null } = {}) {
  if (!repoUuid) return [];
  const rows = _jaa().query(
    TABLE,
    r => r.repoUuid === repoUuid && (!kind || r.kind === kind),
    limit
  ) || [];
  return rows.slice().sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
}

/** forget(uuid) — remove one observation. The person's edit always wins. */
function forget(observationUuid) {
  if (!observationUuid) return { ok: false, errors: ['observationUuid is required'] };
  try {
    _jaa().delete(TABLE, r => r.uuid === observationUuid);
    return { ok: true, forgotten: observationUuid };
  } catch (e) { return { ok: false, errors: [`forget failed: ${e.message}`] }; }
}

/** clear(repoUuid) — forget everything for one repo. Used by hat revoke. */
function clear(repoUuid) {
  if (!repoUuid) return { ok: false, errors: ['repoUuid is required'] };
  const before = list(repoUuid, { limit: 10000 }).length;
  try {
    _jaa().delete(TABLE, r => r.repoUuid === repoUuid);
    return { ok: true, cleared: before };
  } catch (e) { return { ok: false, errors: [`clear failed: ${e.message}`] }; }
}

/**
 * personaBlock(repoUuid) — the learned section of the persona, or null
 * when nothing has been learned yet.
 *
 * Returns null rather than an empty heading on purpose: a persona that
 * says "What this agent has learned:" followed by nothing reads to the
 * model as "this project has no conventions", which is a stronger and
 * falser claim than saying nothing at all.
 *
 * Ordering is corrections first, then by weight, then by how often the
 * observation has recurred — an agent that hit the same pitfall six times
 * should see it before one it noted once.
 */
function personaBlock(repoUuid, { max = PERSONA_MAX } = {}) {
  const rows = list(repoUuid, { limit: 10000 });
  if (!rows.length) return null;

  const ranked = rows.slice().sort((a, b) => {
    const w = (KIND_WEIGHT[b.kind] || 0) - (KIND_WEIGHT[a.kind] || 0);
    if (w !== 0) return w;
    const o = (b.occurrences || 1) - (a.occurrences || 1);
    if (o !== 0) return o;
    return (b.lastSeen || 0) - (a.lastSeen || 0);
  }).slice(0, max);

  const lines = [
    ``,
    `What you have learned working on this project (${rows.length} observation${rows.length === 1 ? '' : 's'}${rows.length > ranked.length ? `, ${ranked.length} shown` : ''}):`,
  ];
  for (const r of ranked) {
    const times = (r.occurrences || 1) > 1 ? ` [seen ${r.occurrences}×]` : '';
    const ev = r.evidence ? ` [${r.evidence}]` : ' [no evidence recorded — treat as weaker]';
    lines.push(`- (${r.kind}) ${r.text}${times}${ev}`);
  }
  lines.push(
    ``,
    `A correction came from the person and outranks anything you concluded yourself.`,
    `If an observation above contradicts what you now read in the real files, the files win — and say so.`,
  );
  return lines.join('\n');
}

/** stats(repoUuid) — counts per kind, for the UI header. */
function stats(repoUuid) {
  const rows = list(repoUuid, { limit: 10000 });
  const byKind = {};
  for (const k of KINDS) byKind[k] = 0;
  for (const r of rows) if (byKind[r.kind] !== undefined) byKind[r.kind]++;
  return {
    total: rows.length,
    byKind,
    lastSeen: rows.length ? Math.max(...rows.map(r => r.lastSeen || 0)) : null,
  };
}

module.exports = {
  MODULE_ID, VERSION, TABLE, KINDS, KIND_WEIGHT, PERSONA_MAX,
  record, list, forget, clear, personaBlock, stats,
};
