'use strict';
/**
 * guardian/lib/agent-registry.js — guardian is the SOURCE OF TRUTH for agents.
 * 2026-09-19 (docs/2026-09-19-guardian-mesh-first-dispatch-phasemap.spec).
 *
 * Owns, per agent: id/url, the DOM selectors (input/send/resp), the accounts that exist for it (the
 * account manager's view, one default), selector-repair history, and health. The Clear Glass mesh no
 * longer carries its own copy as authority: it asks guardian for selectors, and when its archaeology /
 * DOM-mapping tier repairs a drifted selector it REPORTS it here (recordRepair), so the fix survives
 * restarts and reaches every consumer (mesh, userscript fallback, picker).
 *
 * Seed (agent-registry.seed.json) was extracted programmatically from clear-glass/src/mesh/agent-mesh.js's
 * AGENT_REGISTRY. Only OVERRIDES (repairs, accounts, health) are persisted, atomically, so a seed update
 * still reaches agents nobody has modified.
 */
const fs = require('fs');
const path = require('path');

const MODULE_ID = 'guardian.agent-registry';
const SEED = require('./agent-registry.seed.json');

function createAgentRegistry({ dir = process.env.GUARDIAN_AGENTS_DIR || path.join(__dirname, '../../data/guardian/agents'), now = Date.now, accountAuthority = null } = {}) {
  const file = path.join(dir, 'agents.json');
  let overrides = {};
  try { overrides = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { overrides = {}; }

  function persist() {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(overrides, null, 2));
    fs.renameSync(tmp, file);
  }
  function ov(id) { return (overrides[id] = overrides[id] || {}); }

  function get(id) {
    const s = SEED[id]; if (!s) return null;
    const o = overrides[id] || {};
    return {
      id: s.id, name: s.name, url: s.url, color: s.color,
      selectors: { ...s.selectors, ...(o.selectors || {}) },
      selectorHistory: o.selectorHistory || [],
      accounts: o.accounts || [],
      health: o.health || { ok: 0, fail: 0, lastOkAt: null, lastFailAt: null, lastStage: null },
    };
  }
  const list = () => Object.keys(SEED).map(get);

  // A repaired selector reported by the mesh (archaeology / automatic DOM mapping). Only the three known
  // keys, only non-empty strings; the previous value is kept in history so a bad repair can be reverted.
  function recordRepair(id, selectors, meta = {}) {
    if (!SEED[id]) throw new Error(`unknown agent: ${id}`);
    const cur = get(id).selectors, changed = {};
    for (const k of ['input', 'send', 'resp']) {
      if (typeof selectors[k] === 'string' && selectors[k].trim() && selectors[k] !== cur[k]) changed[k] = selectors[k].trim();
    }
    if (!Object.keys(changed).length) return { changed: false, selectors: cur };
    const o = ov(id);
    o.selectors = { ...(o.selectors || {}), ...changed };
    o.selectorHistory = [...(o.selectorHistory || []), { at: now(), from: Object.fromEntries(Object.keys(changed).map(k => [k, cur[k]])), to: changed, source: meta.source || 'mesh', evidence: meta.evidence || null }].slice(-50);
    persist();
    return { changed: true, selectors: get(id).selectors };
  }

  // ── accounts (the account manager's view; cookie-vault identity is keyed by {agentId, accountId}) ──
  function addAccount(id, { id: accountId, label, makeDefault = false }) {
    if (!SEED[id]) throw new Error(`unknown agent: ${id}`);
    if (!accountId) throw new Error('accountId required');
    const o = ov(id); o.accounts = o.accounts || [];
    if (!o.accounts.some(a => a.id === accountId)) o.accounts.push({ id: accountId, label: label || accountId, default: false });
    if (makeDefault || o.accounts.length === 1) o.accounts.forEach(a => { a.default = a.id === accountId; });
    persist(); return get(id).accounts;
  }
  // explicit account must exist (never silently substitute another identity); none given => the default;
  // no accounts registered at all => null (the agent's default profile).
  function resolveAccount(id, explicit) {
    const acc = (get(id) || {}).accounts || [];
    if (explicit) {
      if (!acc.some(a => a.id === explicit)) { const e = new Error(`unknown_account: ${explicit} for ${id}`); e.code = 'unknown_account'; throw e; }
      return explicit;
    }
    const d = acc.find(a => a.default) || acc[0];
    return d ? d.id : null;
  }

  // §2026-09-23 — when an accountAuthority is given (guardian/server.js passes
  // Clear Glass's, see cg-account-authority.js) it is the ONLY account truth;
  // the local list above is then unused and stays only for authority-less
  // callers (tests, a guardian run without Clear Glass). Unknown agent still
  // fails here first — guardian stays the source of truth for AGENTS.
  async function resolveAccountAsync(id, explicit) {
    if (!accountAuthority) return resolveAccount(id, explicit);
    if (!SEED[id]) throw new Error(`unknown agent: ${id}`);
    return accountAuthority.resolve(id, explicit || null);
  }

  function recordOutcome(id, { ok, stage = null }) {
    if (!SEED[id]) return;
    const h = ov(id).health = ov(id).health || { ok: 0, fail: 0, lastOkAt: null, lastFailAt: null, lastStage: null };
    if (ok) { h.ok++; h.lastOkAt = now(); } else { h.fail++; h.lastFailAt = now(); h.lastStage = stage; }
    persist();
  }

  return { list, get, recordRepair, addAccount, resolveAccount, resolveAccountAsync, hasAccountAuthority: !!accountAuthority, recordOutcome, MODULE_ID };
}

module.exports = { createAgentRegistry, MODULE_ID };
