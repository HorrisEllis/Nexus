'use strict';
// versionium/event-taxonomy.js — real event vocabulary for the sovereign
// Versionium system. Conforms to lib/event-taxonomy-pattern.js's ET1
// shape (§VS1, docs/2026-09-02-versionium-sovereign-and-cleanup-
// phasemap.spec).
//
// §CHECKED, NOT GUESSED — every event below is a real
// jaaDB.insert('event_log', {type: '...'}) call or a real bus emission
// already present in versionium/lib/engine.js and server.js, confirmed
// by reading those files directly before documenting them here, matching
// guardian/event-taxonomy.js's own stated discipline for the same reason.

module.exports = Object.freeze({
  VERSIONIUM_COMMITTED: {
    description: 'A real commit was written — manual (via the versionium_commit tool or a build-phase contract dispatch) or automatic (live-field sigma crossing threshold).',
    payloadShape: ['commitId', 'branch', 'parentId', 'system', 'sigma'],
    severity: 'info',
  },
  VERSIONIUM_RESTORE_REQUESTED: {
    description: 'A real temporal-replay request against a specific commit — read-only, never mutates live state.',
    payloadShape: ['commitId'],
    severity: 'info',
  },
  VERSIONIUM_RESTORE_FAILED: {
    description: 'A restore request named a real commit with no stored snapshot (predates temporal replay, or its capture failed at commit time), or a genuinely nonexistent commitId.',
    payloadShape: ['commitId', 'reason'],
    severity: 'notable',
  },
  VERSIONIUM_STATE_REQUESTED: {
    description: 'A real getState request — direct-restore read of a commit\'s stored state payload, distinct from restore()\'s causal replay context.',
    payloadShape: ['commitId'],
    severity: 'info',
  },
  VERSIONIUM_AUTOCOMMIT_TRIGGERED: {
    description: 'Cortex\'s live field entropy crossed SIGMA_THRESH and the cooldown had elapsed — a real, automatic commit was made.',
    payloadShape: ['sigma', 'regime'],
    severity: 'notable',
  },
});
