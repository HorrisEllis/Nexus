'use strict';
/**
 * cortex/personas.js — Personality profiles for Copilot
 * UUID: nexus-cortex-personas-v1-0000-2026-0707-jamesbrooks-001
 * Version: 1.0.0
 *
 * §GAP CLOSED 2026-07-07 — forge.spec's "personalities" piece, confirmed
 * this session to have zero existing implementation anywhere. A
 * personality is data, not code: {name, systemPrompt, allowedTools,
 * defaultIntent}. Copilot adopts one per conversation to change its
 * behavior, tool access, and default intent.
 *
 * §WHY NOT push-recall's tiers — considered storing these as a 'persona'
 * tier in cortex/push-recall.js and rejected it: push-recall's tiers are
 * for *searchable content* that gets lexically/recency scored and ranked
 * into a context packet. A persona is a config object fetched by exact
 * name, never ranked against a query — mixing them would pollute content
 * recall results with config objects that have no business being scored
 * as "relevant memory." Separate concern, separate module, same real JAA
 * backing (injected, not hard-required — same pattern as push-recall
 * itself). One table: 'personas'.
 *
 * Ships with real default personas, not an empty store — so Copilot has
 * working profiles from first boot, not a feature that only works after
 * a user manually creates one.
 */

const DEFAULT_PERSONAS = Object.freeze({
  default: {
    name: 'default',
    systemPrompt: 'You are the NEXUS co-pilot. You help navigate, build, and diagnose the system. You have access to real tools — use them rather than guessing.',
    allowedTools: ['read_file', 'run_command'],
    defaultIntent: 'ask',
  },
  builder: {
    name: 'builder',
    systemPrompt: 'You are the NEXUS co-pilot in builder mode. Bias toward action: scaffold, dispatch, and run pipelines. Prefer running a real cockpit command over describing what could be done.',
    allowedTools: ['read_file', 'run_command'],
    defaultIntent: 'build',
  },
  diagnostician: {
    name: 'diagnostician',
    systemPrompt: 'You are the NEXUS co-pilot in diagnostic mode. Trace root causes through the causal graph before proposing fixes. Cite the real evidence (events, gaps, sigma) rather than speculating.',
    allowedTools: ['read_file'],
    defaultIntent: 'diagnose',
  },
});

class PersonaStore {
  constructor({ jaa = null } = {}) {
    this._jaa = jaa;
    this._seeded = false;
  }

  // Lazily seed the defaults into JAA on first use, without clobbering
  // any user-modified persona of the same name already stored.
  _seed() {
    if (this._seeded || !this._jaa) return;
    this._seeded = true;
    let existing = [];
    try { existing = this._jaa.tail('personas', 100); } catch (_) { existing = []; }
    const existingNames = new Set(existing.map(p => p.name));
    for (const p of Object.values(DEFAULT_PERSONAS)) {
      if (!existingNames.has(p.name)) {
        try { this._jaa.insert('personas', { ...p, ts: Date.now(), builtin: true }); } catch (_) {}
      }
    }
  }

  /**
   * get(name) — return a persona by exact name. Falls back to the
   * built-in default (never null) so a caller always has a working
   * profile, even if JAA is unavailable or the name is unknown.
   */
  get(name) {
    this._seed();
    if (this._jaa) {
      try {
        const all = this._jaa.tail('personas', 100);
        const found = all.find(p => p.name === name);
        if (found) return found;
      } catch (_) { /* fall through to in-memory defaults */ }
    }
    return DEFAULT_PERSONAS[name] || DEFAULT_PERSONAS.default;
  }

  /** list() — all known persona names. */
  list() {
    this._seed();
    if (this._jaa) {
      try {
        const all = this._jaa.tail('personas', 100);
        if (all.length) return all.map(p => p.name);
      } catch (_) {}
    }
    return Object.keys(DEFAULT_PERSONAS);
  }

  /**
   * set(persona) — create or update a persona. Validates the real
   * required shape rather than accepting anything — a persona missing a
   * systemPrompt is useless and should fail loudly, not silently store.
   */
  set(persona) {
    if (!persona?.name) throw new Error('[personas] persona requires a name');
    if (!persona.systemPrompt) throw new Error('[personas] persona requires a systemPrompt');
    const row = {
      name: persona.name,
      systemPrompt: persona.systemPrompt,
      allowedTools: Array.isArray(persona.allowedTools) ? persona.allowedTools : [],
      defaultIntent: persona.defaultIntent || 'ask',
      ts: Date.now(),
      builtin: false,
    };
    if (this._jaa) {
      try { this._jaa.insert('personas', row); } catch (e) { throw new Error(`[personas] store failed: ${e.message}`); }
    }
    return { ok: true, name: row.name };
  }
}

module.exports = { PersonaStore, DEFAULT_PERSONAS };
