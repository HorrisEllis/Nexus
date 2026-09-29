'use strict';
/**
 * lib/agent-tools/tools/governance/versionium-commit.js — versionium_commit,
 * versionium_history, versionium_restore tools
 * UUID: nexus-tool-versionium-commit-v1-0000-2026-0814-jamesbrooks-001
 *
 * §VERSIONIUM MIGRATION 2026-09-01 — James: "migrate to versionium
 * completely." Checked directly before touching anything: this tool used
 * to require('../../../../cortex/versionium/index.js') DIRECTLY — a real
 * AX-010 violation (§nexus-system-foundation-addendum-v1.2.0.spec), and a
 * genuinely silent bug, not just a style issue. This tool is required from
 * guardian/server.js and copilot/server.js/lifeline.js — different
 * processes than cortex. A cross-process require() gives the CALLING
 * process its own separate module instance, with its own separate
 * in-memory kernel (cortex/versionium/index.js's `_kernel`, created at
 * module scope). Every commit made through this tool was snapshotting
 * THAT OTHER PROCESS's own near-empty kernel ring, not cortex's real,
 * accumulated one — restore() on an agent-issued commit would silently
 * replay a near-empty history. Fixed: this tool now calls cortex's real
 * HTTP routes (cortex/boot.js's /api/versionium/*) via lib/nexus-client.js,
 * the same sovereign-transport primitive every other cross-process
 * capability in this codebase already uses (e.g. guardian's own
 * cortex.raid.decide migration, same addendum).
 *
 * §VS1 2026-09-02 (docs/2026-09-02-versionium-sovereign-and-cleanup-
 * phasemap.spec) — versionium is no longer even inside cortex's process.
 * It's its own sovereign system now (versionium/server.js, port 3754).
 * Every call below was repointed from systemId 'cortex' to 'versionium'
 * — cortex/boot.js's own former /api/versionium/* routes now return a
 * real 410 redirect notice rather than silently 404ing, so a stale
 * caller that missed this update fails loud, not quiet.
 *
 * Also un-staled a claim: the previous version of this file's description
 * said "rewind, branch-switching, and snapshot restore are mapped... but
 * not built." Checked directly: restore() WAS built (2026-08-30, real
 * kernel-based temporal replay) — the description was simply never
 * updated afterward, the same "stale pending status" pattern this
 * codebase has caught before (GA3/BL30). versionium_restore below is that
 * capability's first real tool exposure. Branch-switching is still
 * genuinely unbuilt — not claimed here either.
 */
const nx = require('../../../nexus-client.js');

const commitTool = {
  name: 'versionium_commit',
  description:
    'Commit the current state via Versionium (message required, optional branch/causedBy/system). ' +
    'Real temporal replay (versionium_restore) and calendar playback also exist as of 2026-09-01 — ' +
    'this is no longer the only real capability. Branch-switching is still unbuilt.',
  parameters: {
    type: 'object',
    properties: {
      message:   { type: 'string', description: 'required — what this commit represents' },
      branch:    { type: 'string', description: 'optional, defaults to "main"' },
      causedBy:  { type: 'string', description: 'optional — what triggered this commit' },
      system:    { type: 'string', description: 'optional — which system this commit is for (e.g. "guardian", "ollama-bridge"), for per-system version history' },
    },
    required: ['message'],
  },
  async execute({ message, branch, causedBy, system } = {}) {
    if (!message) return { error: 'message is required' };
    try {
      return await nx.post('versionium', '/api/versionium/commit', { message, branch, causedBy, system });
    } catch (e) { return { error: `versionium_commit failed: ${e.message}` }; }
  },
};

const historyTool = {
  name: 'versionium_history',
  description:
    'Read real Versionium commit history, optionally filtered by system — the live source for ' +
    '"what changed in system X" and for a spec\'s version_history: section (LM1).',
  parameters: {
    type: 'object',
    properties: {
      system: { type: 'string', description: 'optional — filter to commits for this system' },
    },
  },
  async execute({ system } = {}) {
    try {
      // §0.39.271 V1 — n= → the newest commits (without it, the first 200 stored).
      const path = system ? `/api/versionium/history?system=${encodeURIComponent(system)}&n=100` : '/api/versionium/history?n=100';
      return await nx.get('versionium', path);
    } catch (e) { return { error: `versionium_history failed: ${e.message}` }; }
  },
};

const restoreTool = {
  name: 'versionium_restore',
  description:
    'Real temporal replay — given a commitId, returns that commit plus the completion record from ' +
    'replaying its stored kernel snapshot. Read-only: does not mutate any live state.',
  parameters: {
    type: 'object',
    properties: {
      commitId: { type: 'string', description: 'required — a real commitId, e.g. from versionium_history' },
    },
    required: ['commitId'],
  },
  async execute({ commitId } = {}) {
    if (!commitId) return { error: 'commitId is required' };
    try {
      return await nx.get('versionium', `/api/versionium/restore/${encodeURIComponent(commitId)}`);
    } catch (e) { return { error: `versionium_restore failed: ${e.message}` }; }
  },
};

module.exports = { commitTool, historyTool, restoreTool };
