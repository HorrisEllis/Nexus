'use strict';
/**
 * lib/consent.js — explicit, per-item, revocable consent registry
 * UUID: nexus-consent-v1-0000-2026-0707-jamesbrooks-001
 * Version: 1.0.0
 *
 * §CONSENT — this file exists because of one specific line in
 * docs/NEXUS-PHASE-MAP-CROSSREF.md: "rfr2's resonance, irs.js,
 * relational.js — people-modeling category, still needs your explicit
 * per-item yes, not bundled under a phase-map pretext." That line asked
 * for a real mechanism, not just a promise to ask nicely — this is it.
 *
 * Disk-first, same pattern as loom/schema/registry.js: re-read before
 * every read so two processes (orchestrator + whatever else checks
 * consent) never see stale state. Nothing here is a hard delete —
 * revoking consent writes granted:false, it doesn't erase the record
 * of when/whether it was ever asked.
 *
 * §HONEST NOTE — as of this file's creation, meta/rfr2's specifically
 * people-modeling-named submodules (resonance, irs.js, relational.js)
 * do not exist on disk in this codebase (checked directly — grepped the
 * whole tree). This registry gates the real RFR2 submodules that
 * *do* exist and *are* relational/interaction-shaped (observer, context,
 * query, via lib/rfr2-bridge.js) exactly as if the named ones were
 * present, and copilot/lib/user-model.js checks it before every such
 * call. When resonance/irs/relational are actually authored, they read
 * this exact same consent key — no new gate to build later.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'consent.json');

function _load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch (_) { return {}; }
}

function _persist(state) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
}

/** setConsent(key, granted) — records the decision, always with a timestamp. */
function setConsent(key, granted) {
  const state = _load();
  const now = Date.now();
  state[key] = {
    key,
    granted: !!granted,
    firstAskedAt: state[key]?.firstAskedAt ?? now,
    decidedAt: now,
    history: [...(state[key]?.history || []), { granted: !!granted, ts: now }].slice(-20),
  };
  _persist(state);
  return state[key];
}

/** getConsent(key) — null means "never asked", not "denied". Callers must
 *  treat null as "ask before proceeding", the same as false. */
function getConsent(key) {
  const state = _load();
  return state[key] || null;
}

function isGranted(key) {
  const rec = getConsent(key);
  return !!(rec && rec.granted === true);
}

module.exports = { setConsent, getConsent, isGranted };
