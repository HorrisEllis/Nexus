'use strict';
/**
 * src/copilot/hat.js — the Clear Glass hat
 * component_id: cg.copilot.hat
 *
 * §BUILT 2026-09-26 — James: "make a clearglass hat for the copilot cli,
 * match the idearium agent cli or the floating menu cli in the tv ui."
 *
 * A hat is lib/hat-forge.js data: base agent + persona (+ optional tool
 * scope). Idearium's repo agents wear a per-repo hat WITHOUT switching
 * copilot's global agent — the persona is composed into that one call.
 * Clear Glass does the same: the clear_glass hat's persona rides in
 * systemExtra on every co-pilot call from the browser, and backend/agent
 * (ollama | copilot | guardian + NCP agent) ride as per-call fields —
 * the same fields ui/tv-shell/menu.js sends — so wearing it here never
 * changes what any other surface is wearing.
 *
 * Found by role (seedKey 'clear_glass'), so a rename in the hat forge
 * doesn't orphan it. Forged on first use if missing.
 */

const SEED_KEY = 'clear_glass';
const DEFAULT_NAME = 'clear_glass';
const DEFAULT_PERSONA = [
  'You are wearing the Clear Glass hat: the operator of Clear Glass, the NEXUS sovereign browser.',
  'You see the live page DOM, the tab (agentId) you were asked from, and the picked elements.',
  'Act, do not narrate: issue ```driver JSON blocks for navigation, clicks, typing, extraction.',
  'Prefer the smallest action that answers. Before a destructive or outward action (submit, purchase, send, delete) say what you will do and wait.',
  'Site settings, macros, autofill profiles, bookmarks and history are Clear Glass tools — use them instead of re-deriving.',
  'When a step fails, report the exact error and the selector/url involved; never claim success you did not observe.',
].join('\n');

let _forge = null;
function forge() {
  if (_forge !== null) return _forge;
  try { _forge = require('../../../lib/hat-forge.js'); }
  catch (e) { _forge = false; console.warn('[cg-hat] lib/hat-forge unavailable:', e.message); }
  return _forge;
}

function _shape(h, source) {
  return h ? { ok: true, exists: true, source, name: h.name, uuid: h.uuid || null, baseAgent: h.baseAgent, allowedAgents: h.allowedAgents || null,
    personaPrompt: h.personaPrompt || '', toolScope: h.toolScope || null, model: h.model || null } : { ok: true, exists: false };
}

/** The hat as it stands, without forging. */
function status() {
  const hf = forge();
  if (!hf) return { ok: true, exists: false, source: 'builtin', name: DEFAULT_NAME, personaPrompt: DEFAULT_PERSONA, reason: 'hat forge unavailable — using the built-in persona' };
  let h = null;
  try { h = hf.bySeedKey(SEED_KEY) || hf.get(DEFAULT_NAME); } catch (_) {}
  return h ? _shape(h, 'forge') : { ok: true, exists: false, source: 'builtin', name: DEFAULT_NAME, personaPrompt: DEFAULT_PERSONA };
}

/** Find it, or forge it with the default persona. Idempotent. */
function ensure() {
  const cur = status();
  if (cur.exists) return { ...cur, created: false };
  const hf = forge();
  if (!hf) return { ...cur, created: false };
  const r = hf.forge({ name: DEFAULT_NAME, baseAgent: 'copilot', personaPrompt: DEFAULT_PERSONA, seedKey: SEED_KEY });
  if (r && r.ok === false) return { ok: false, error: (r.errors || []).join('; ') || 'forge refused', personaPrompt: DEFAULT_PERSONA, name: DEFAULT_NAME };
  return { ...status(), created: true };
}

/** Edit the persona (or model/baseAgent) through the forge's own update path. */
function update(patch = {}) {
  const hf = forge();
  if (!hf) return { ok: false, error: 'hat forge unavailable' };
  const cur = ensure();
  if (!cur.exists) return { ok: false, error: cur.error || 'no hat' };
  const allowed = {};
  for (const k of ['personaPrompt', 'model', 'baseAgent', 'allowedAgents', 'toolScope']) if (patch[k] !== undefined) allowed[k] = patch[k];
  const r = hf.update(cur.uuid || cur.name, allowed);
  if (r && r.ok === false) return { ok: false, error: (r.errors || []).join('; ') || 'update refused' };
  return status();
}

/** Persona text to compose into a call; '' when the hat is off. */
function personaFor(wear) {
  if (!wear) return '';
  const s = status();
  const persona = s.personaPrompt || DEFAULT_PERSONA;
  return `## Hat: ${s.name || DEFAULT_NAME}\n${persona}`;
}

module.exports = { status, ensure, update, personaFor, SEED_KEY, DEFAULT_PERSONA };
