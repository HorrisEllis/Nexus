'use strict';
/**
 * lib/lean-mode.js — 0.60.20 — lean mode: only what a build needs runs.
 *
 * James (2026-10-13): "start lean? why not just have that a toggle? i want to test it now" · "no, i dont do cli. i dont
 * have access to it. since running nexus is one cmmand" · "idearium for the lean toggle" · "not floating menu button.
 * fragmented".
 *
 * Why: his machine fell to 6.6% free memory with every service up; copilot held the planner's request and the
 * connection dropped (ECONNRESET), so the phase build fell back to a whole-phase run. The services held here are the
 * ones a build does not use. One toggle, in Idearium's Settings: it stops (or starts) them now through the supervisor
 * (autopilot /control), and `npm run start:all` reads the same file at boot, so it is still one command.
 *
 *   HOLD                the services lean mode keeps stopped
 *   read({ root })      → { on, hold, at, by }   the saved state (off when no file)
 *   write(on, { root, by })                      saved to <data>/autopilot-boot.json (state, never committed)
 */
const fs = require('fs');
const path = require('path');

const VERSION = '1.0.0';
const HOLD = Object.freeze(['architect', 'diagnostic', 'eravos', 'intelligence', 'intelligence-consumer']);

function fileOf(root = path.join(__dirname, '..')) {
  return path.join(process.env.NEXUS_DATA_ROOT || path.join(root, 'data'), 'autopilot-boot.json');
}

function read({ root } = {}) {
  try {
    const j = JSON.parse(fs.readFileSync(fileOf(root), 'utf8'));
    return { on: j.lean === true, hold: Array.isArray(j.hold) && j.hold.length ? j.hold : [...HOLD], at: j.at || null, by: j.by || null };
  } catch (_) { return { on: false, hold: [...HOLD], at: null, by: null }; }
}

function write(on, { root, by = 'person' } = {}) {
  const f = fileOf(root);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const rec = { lean: !!on, hold: [...HOLD], at: Date.now(), by };
  fs.writeFileSync(f, JSON.stringify(rec, null, 2));
  return { on: rec.lean, hold: rec.hold, at: rec.at, by };
}

module.exports = { VERSION, HOLD, fileOf, read, write };
