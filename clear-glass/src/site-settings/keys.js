'use strict';
/**
 * clear-glass/src/site-settings/keys.js — the per-site keys every feature reads (SP1, 0.60.215).
 * Spec: clear-glass/spec/site-profile.spec MOD-SP-KEYS · Map: docs/2026-10-23-site-profile-processes-phasemap.spec SP1
 *
 * James, 2026-10-23: "I need site specific settings for the autofill, macros, workflows, passwords/accounts, snowflake, resume state.
 * Cleardriver, agentmesh and guardian setting."
 *
 * One table: what each key is, its type and allowed values, its default (today's behaviour — decision SP_D2), and the feature that reads it.
 * The same table validates a write, draws the Site Settings controls and answers the CLI's help. The network route is not here: it is a
 * netPolicy origin rule (SP-003), shown and edited through profile.js.
 * A default may come from a global option (driver timeouts, Guardian): `global` names that option's path.
 */

const KEYS = Object.freeze([
  { key: 'autofill.enabled',     feature: 'autofill',  type: 'bool',     default: true,   does: 'Offer and fill forms on this site' },
  { key: 'autofill.profileId',   feature: 'autofill',  type: 'string',   default: null,   does: 'The autofill profile used on this site (none: ask)' },
  { key: 'macros.enabled',       feature: 'macros',    type: 'bool',     default: true,   does: 'Macros may run on this site' },
  { key: 'macros.autoRun',       feature: 'macros',    type: 'string[]', default: [],     does: 'Macros run when a page of this site loads' },
  { key: 'workflows.enabled',    feature: 'workflows', type: 'bool',     default: true,   does: 'Workflows triggered by visiting a page run on this site' },
  { key: 'passwords.offer',      feature: 'passwords', type: 'enum',     values: ['ask', 'never'], default: 'ask', does: 'Offer to save a password on this site' },
  { key: 'passwords.autofill',   feature: 'passwords', type: 'bool',     default: true,   does: 'Fill a saved password on this site' },
  { key: 'passwords.accountId',  feature: 'passwords', type: 'string',   default: null,   does: 'The account that signs in on this site' },
  { key: 'resume.restore',       feature: 'resume',    type: 'enum',     values: ['off', 'scroll', 'scroll+forms'], default: 'off', does: 'On a revisit, put back where you were' },
  { key: 'driver.allowed',       feature: 'driver',    type: 'bool',     default: true,   global: 'driver.agentsMayDrive', does: 'Agents may drive this site (ClearDriver)' },
  { key: 'driver.navTimeoutMs',  feature: 'driver',    type: 'int',      min: 1000, max: 300000, default: 30000, global: 'driver.navTimeoutMs', does: 'How long a navigation may take' },
  { key: 'driver.waitTimeoutMs', feature: 'driver',    type: 'int',      min: 500,  max: 120000, default: 10000, global: 'driver.waitTimeoutMs', does: 'How long a wait for an element may take' },
  { key: 'mesh.enabled',         feature: 'mesh',      type: 'bool',     default: true,   does: 'Co-pilot and the agent mesh work on this site' },
  { key: 'mesh.agent',           feature: 'mesh',      type: 'string',   default: null,   does: 'The agent that answers Co-pilot on this site (none: the mesh decides)' },
  { key: 'guardian.listen',      feature: 'guardian',  type: 'bool',     default: true,   global: 'guardian.listen', does: "Guardian's listeners run on this site" },
  { key: 'guardian.capture',     feature: 'guardian',  type: 'bool',     default: true,   global: 'guardian.capture', does: 'Chats on this site are captured' },
]);
const FEATURES = Object.freeze(['autofill', 'macros', 'workflows', 'passwords', 'network', 'resume', 'driver', 'mesh', 'guardian']);
const BY_KEY = new Map(KEYS.map(k => [k.key, k]));

function byFeature(feature) { return KEYS.filter(k => k.feature === feature); }
function get(key) { return BY_KEY.get(key) || null; }

/** validate(key, value) → { ok, value } | { ok:false, why } — coerces '1'/'true', numbers from strings, one id or a list */
function validate(key, value) {
  const k = BY_KEY.get(key);
  if (!k) return { ok: false, why: `unknown site key "${key}" — known: ${KEYS.map(x => x.key).join(', ')}` };
  switch (k.type) {
    case 'bool': {
      if (typeof value === 'boolean') return { ok: true, value };
      if (value === 'true' || value === '1' || value === 1) return { ok: true, value: true };
      if (value === 'false' || value === '0' || value === 0) return { ok: true, value: false };
      return { ok: false, why: `${key} is on or off (true / false)` };
    }
    case 'enum':
      return k.values.includes(value) ? { ok: true, value } : { ok: false, why: `${key} is one of ${k.values.join(', ')} (got ${JSON.stringify(value)})` };
    case 'int': {
      const n = Number(value);
      if (!Number.isInteger(n)) return { ok: false, why: `${key} is a whole number` };
      if ((k.min != null && n < k.min) || (k.max != null && n > k.max)) return { ok: false, why: `${key} is between ${k.min} and ${k.max} (got ${n})` };
      return { ok: true, value: n };
    }
    case 'string':
      if (value == null || value === '') return { ok: true, value: null };
      return typeof value === 'string' && value.length <= 200 ? { ok: true, value } : { ok: false, why: `${key} is a short text (an id)` };
    case 'string[]': {
      const list = Array.isArray(value) ? value : String(value || '').split(/[\s,]+/).filter(Boolean);
      if (list.some(x => typeof x !== 'string' || x.length > 200) || list.length > 50) return { ok: false, why: `${key} is a list of ids (at most 50)` };
      return { ok: true, value: list };
    }
    default: return { ok: false, why: `${key}: no rule for type ${k.type}` };
  }
}

module.exports = { KEYS, FEATURES, byFeature, get, validate };
