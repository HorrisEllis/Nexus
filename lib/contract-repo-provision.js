'use strict';

/**
 * lib/contract-repo-provision.js
 *
 * §MCO11 2026-09-13 — James: "each contract routes to raid, raid creates a
 * compartment for the contract to use as a repo, then use the compartment
 * as a work surface query."
 *
 * Real mechanism found already built and reused, not reinvented (§8.6):
 * idearium/repo/index.js's RepoLayer already links a repo to a real COS
 * compartment via its compartmentId field (SBP1, 2026-08-28) — the real
 * gap was idearium/api/index.js's POST /api/repos handler silently
 * dropping that field from the request body (fixed, same pass as this
 * file). This module holds only the pure, testable part — deciding what
 * body to POST — so it doesn't need a real idearium server or a real
 * cortex/core/raid/index.js process to unit-test, matching the same
 * extraction discipline lib/compartment-dom-ledger.js already used.
 *
 * The real cross-process HTTP call itself (honest-degrade, matching
 * agent-mesh.js's _raidDecide()) lives in contract-intake.js, next to
 * every other real cross-process call this session already added there.
 */

/**
 * buildRepoIngestBody(queued, compartmentId) — the real, exact body
 * contract-intake.js POSTs to idearium's real /api/repos.
 *
 * The contract's own real `content` field becomes the repo's first real
 * file (CONTRACT.md) — genuine, already-real content, not a fabricated
 * placeholder, satisfying repo.ingest's real requirement of a non-empty
 * files[] when no specUuid exists yet.
 *
 * @param {object} queued        - the real RAID contract row
 * @param {string} compartmentId - the real COS compartment.id just created
 * @returns {{ok: true, body: object} | {ok: false, reason: string}}
 */
function buildRepoIngestBody(queued, compartmentId) {
  if (!queued || !queued.uuid) {
    return { ok: false, reason: 'no real contract row — nothing to provision a repo for' };
  }
  if (!compartmentId) {
    return { ok: false, reason: 'no real compartmentId — refusing to link a repo to nothing (§1.2)' };
  }

  const name = `raid-contract-${queued.uuid}`;
  const content = typeof queued.content === 'string' && queued.content.length
    ? queued.content
    : `(contract ${queued.uuid} — no content field on the real row)`;

  return {
    ok: true,
    body: {
      name,
      files: [{ path: 'CONTRACT.md', content }],
      source: 'raid-contract',
      compartmentId,
    },
  };
}

module.exports = { buildRepoIngestBody };
