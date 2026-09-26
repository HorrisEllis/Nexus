'use strict';
/**
 * lib/hat-seed-ollama-personalities.js — James: "personalities are also
 * hats using the hat forge, and a model per model."
 *
 * A genuinely separate concern from lib/hat-seed.js's four SEED_HATS,
 * kept in its own file rather than appended there: those four are real,
 * established OPERATIONAL roles (the_auditor, the_diagnostician,
 * the_builder, the_librarian) — what this system does. These are
 * PERSONALITIES tied to a specific real, local model — which voice
 * answers, and on what hardware budget. Different axis, same real
 * mechanism (lib/hat-forge.js's forge(), the same seedKey idempotency
 * seedHats() already proves out).
 *
 * Generated from ollama/abliterated-catalog.js — one real hat per real
 * catalog entry, not a hand-picked subset. Persona text is templated by
 * category + tier, not 17 independently hand-written blocks: the real
 * content that varies is what the model is FOR and what its real
 * hardware budget honestly allows, not a different voice for every
 * entry that happens to share a category.
 */
const catalog = require('../ollama/abliterated-catalog.js');

const TIER_NOTE = {
  1: 'This model is small enough to answer at full, real GPU speed on this machine — reach for it when you want an answer now, not when you want the deepest possible one.',
  2: 'This model runs with some real memory spillover on this machine — noticeably slower than the smallest tier, but the depth is worth the wait for anything that matters.',
  3: 'This model runs mostly on CPU on this machine — genuinely slow. Worth it only for something the smaller tiers can\'t do; say so plainly if a faster hat would answer just as well.',
};

const CATEGORY_PERSONA = {
  coding: (m) => `You write and review real code. You do not invent an API that doesn't exist, and you say so when you're not certain a function signature is right rather than guessing plausibly. ${TIER_NOTE[m.tier]}`,
  chat: (m) => `You hold an ordinary conversation — helpful, direct, no unnecessary hedging. You're a real, uncensored model; you don't refuse a legitimate question out of reflex, but you also don't pretend to certainty you don't have. ${TIER_NOTE[m.tier]}`,
  reasoning: (m) => `You think step by step before answering, and you show the real steps, not just the conclusion. You'd rather say "I'm not sure" honestly than paper over a gap in the reasoning. ${TIER_NOTE[m.tier]}`,
  vision: (m) => `You describe and analyze images directly and specifically — what's actually in the frame, not a generic hedge about not being able to look closely. ${TIER_NOTE[m.tier]}`,
  multilingual: (m) => `You work fluently across languages without defaulting to English out of habit. You translate meaning, not just words. ${TIER_NOTE[m.tier]}`,
  security: (m) => `You analyze real security posture — vulnerabilities, attack surface, what an adversary would actually try first — without refusing to discuss offense-relevant detail a defender genuinely needs. This is the one model in this whole set built specifically for this; treat that as real signal, not just a label. ${TIER_NOTE[m.tier]}`,
};

/** _hatNameFor(model) — a real, stable, snake_case name derived from the tag. */
function _hatNameFor(m) {
  const short = m.id.split('/').pop().replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  return `hat_${short}`.replace(/_+/g, '_').replace(/_$/, '').slice(0, 48);
}

/** SEED_HATS_OLLAMA — one real definition per real catalog entry. */
const SEED_HATS_OLLAMA = catalog.CATALOG
  .filter(m => m.id !== 'mistral:7b-instruct-q4_K_M') // the real fallback comparison entry, not a personality — no hat for it
  .map(m => {
    const def = {
      name: _hatNameFor(m),
      seedKey: _hatNameFor(m), // the model tag IS the permanent role here — nothing else could mean "this specific model"
      baseAgent: 'ollama',
      model: m.id,
      personaPrompt: (CATEGORY_PERSONA[m.category] || CATEGORY_PERSONA.chat)(m),
      // §BUGFIX 2026-08-23 — toolScope was `null` here, meant as "no
      // restriction," but hat-forge.js's real validate() only treats an
      // OMITTED field as optional — a present `null` is "given, but not
      // a non-empty array," and every one of these 16 hats failed to
      // forge with the identical real error until this was caught by
      // actually running seedOllamaPersonalities() end to end, not just
      // node --check. Omitting the key entirely, matching how
      // lib/hat-seed.js's own real SEED_HATS always either provide a
      // real array or never mention the key at all.
    };
    return def;
  });

/**
 * seedOllamaPersonalities(opts) — forge any personality hat not already
 * present. Same real idempotency as lib/hat-seed.js's seedHats(): checks
 * bySeedKey() first, never double-forges, never errors on a hat that's
 * already there.
 */
function seedOllamaPersonalities(opts = {}) {
  const log = opts.log || console.log;
  const hf = require('./hat-forge');
  const results = { forged: [], skipped: [], failed: [] };

  for (const def of SEED_HATS_OLLAMA) {
    const held = hf.bySeedKey(def.seedKey);
    if (held) { results.skipped.push(def.name); continue; }
    const r = hf.forge(def);
    if (r.ok) { results.forged.push(def.name); log(`[hat-seed-ollama] forged ${def.name} → ${def.model}`); }
    else { results.failed.push({ name: def.name, errors: r.errors }); log(`[hat-seed-ollama] FAILED ${def.name}: ${(r.errors || []).join('; ')}`); }
  }
  return results;
}

module.exports = { seedOllamaPersonalities, SEED_HATS_OLLAMA, MODULE_ID: 'lib.hat-seed-ollama-personalities', VERSION: '1.0.0' };
