'use strict';
/**
 * guardian/lib/cli-registry.js — Dynamic Custom CLI Registry
 * UUID: nexus-guardian-cli-registry-v1-0000-4000-0000-000000000001
 * Version: 1.0.0
 *
 * Stores user-defined CLI commands in JAA.
 * Each command maps a short name → DOM selector + action.
 *
 * A "custom command" is:
 *   name     — the CLI verb (e.g. "submit", "clear", "copy-last")
 *   selector — CSS selector identifying the target DOM element on the provider tab
 *   action   — what to do: "click" | "focus" | "type:<text>" | "read"
 *   provider — which tab this command lives on (claude, chatgpt, ollama, …)
 *   desc     — human label shown in help
 *   createdAt, updatedAt, uuid
 *
 * Execution:
 *   When the user types "guardian $ <name>" in the CLI panel,
 *   cli-registry resolves it to { selector, action, provider }.
 *   Guardian pushes NEXUS_CLI_EXEC via NCP to the target tab.
 *   The userscript runs the action and returns NEXUS_CLI_RESULT.
 *
 * DOM picker flow:
 *   1. User types: cli pick <name> [provider]
 *   2. Guardian sends NEXUS_DOM_PICK to the provider tab via NCP.
 *   3. Userscript activates overlay — user clicks an element.
 *   4. Userscript posts NEXUS_DOM_PICK_RESULT { selector, tagName, text, ... }
 *   5. Guardian stores the selector against <name> in JAA.
 *
 * §LAW II: every mutation written to JAA before ack.
 * §1.2:    every exec failure returned explicitly — nothing silent.
 */

const crypto = require('crypto');

const MODULE_ID = 'cli-registry';
const VERSION   = '1.0.0';

// Valid actions
const VALID_ACTIONS = new Set(['click', 'focus', 'read', 'hover', 'clear']);
// type:<text> is also valid — checked separately

function _validateAction(action) {
  if (!action) return 'action required';
  if (VALID_ACTIONS.has(action)) return null;
  if (action.startsWith('type:')) return null;
  if (action.startsWith('attr:')) return null;  // read an attribute value
  return `unknown action "${action}" — valid: click | focus | read | hover | clear | type:<text> | attr:<name>`;
}

function _validateName(name) {
  if (!name) return 'name required';
  if (!/^[a-z0-9_-]{1,32}$/.test(name))
    return 'name must be 1-32 chars, lowercase alphanumeric, - or _';
  return null;
}

class CLIRegistry {
  constructor(jaa) {
    if (!jaa) throw new Error('[cli-registry] JAA instance required');
    this._jaa = jaa;
    this._ensureTable();
    console.log(`[cli-registry] v${VERSION} ready`);
  }

  _ensureTable() {
    try { this._jaa._ensureTable?.('cli_commands'); } catch(_) {}
  }

  // ── CREATE / UPDATE ──────────────────────────────────────────────────────────

  set(name, opts = {}) {
    const nameErr = _validateName(name);
    if (nameErr) return { ok: false, error: nameErr };

    const { selector, action = 'click', provider = 'claude', desc = '' } = opts;
    if (!selector) return { ok: false, error: 'selector required' };

    const actionErr = _validateAction(action);
    if (actionErr) return { ok: false, error: actionErr };

    const existing = this._find(name, provider);
    const ts = Date.now();

    if (existing) {
      this._jaa.update('cli_commands', existing.uuid, {
        selector, action, provider, desc,
        updatedAt: ts,
      });
      const updated = this._get(existing.uuid);
      console.log(`[cli-registry] updated "${name}" → ${selector} [${action}] on ${provider}`);
      return { ok: true, command: updated, action: 'updated' };
    }

    const uuid = crypto.randomUUID();
    this._jaa.insert('cli_commands', {
      uuid, name, selector, action, provider, desc,
      createdAt: ts, updatedAt: ts,
      pickPending: false,
    });
    const cmd = this._get(uuid);
    console.log(`[cli-registry] created "${name}" → ${selector} [${action}] on ${provider}`);
    return { ok: true, command: cmd, action: 'created' };
  }

  // ── MARK PICK PENDING (waiting for DOM picker result) ────────────────────────

  markPickPending(name, provider = 'claude', action = 'click', desc = '') {
    const nameErr = _validateName(name);
    if (nameErr) return { ok: false, error: nameErr };

    const existing = this._find(name, provider);
    const ts = Date.now();

    if (existing) {
      this._jaa.update('cli_commands', existing.uuid, {
        pickPending: true, action, desc, updatedAt: ts,
      });
      return { ok: true, uuid: existing.uuid, status: 'pick_pending' };
    }

    const uuid = crypto.randomUUID();
    this._jaa.insert('cli_commands', {
      uuid, name, selector: null, action, provider, desc,
      createdAt: ts, updatedAt: ts,
      pickPending: true,
    });
    return { ok: true, uuid, status: 'pick_pending' };
  }

  // ── RESOLVE PICK (DOM picker returned a selector) ────────────────────────────

  resolvePick(name, provider, selector, meta = {}) {
    const existing = this._find(name, provider);
    if (!existing) return { ok: false, error: `no pending pick for "${name}" on ${provider}` };

    const ts = Date.now();
    this._jaa.update('cli_commands', existing.uuid, {
      selector,
      pickPending: false,
      pickMeta:   JSON.stringify(meta),  // tagName, innerText snippet, etc.
      updatedAt:  ts,
    });

    const cmd = this._get(existing.uuid);
    console.log(`[cli-registry] pick resolved "${name}" → ${selector} on ${provider}`);
    return { ok: true, command: cmd };
  }

  // ── GET / LIST ───────────────────────────────────────────────────────────────

  get(name, provider) {
    const cmd = this._find(name, provider);
    if (!cmd) return null;
    return this._parse(cmd);
  }

  list(provider) {
    const all = this._jaa.all('cli_commands') || [];
    const filtered = provider ? all.filter(c => c.provider === provider) : all;
    return filtered.map(c => this._parse(c));
  }

  // ── DELETE ───────────────────────────────────────────────────────────────────

  delete(name, provider) {
    const existing = this._find(name, provider);
    if (!existing) return { ok: false, error: `command "${name}" not found` };
    this._jaa.delete?.('cli_commands', existing.uuid)
      || this._jaa.update('cli_commands', existing.uuid, { _deleted: true });
    console.log(`[cli-registry] deleted "${name}" on ${provider || 'all'}`);
    return { ok: true, name, provider };
  }

  // ── RESOLVE FOR EXECUTION ────────────────────────────────────────────────────
  // Returns the command ready for NCP dispatch, or null if not found / incomplete.

  resolve(name, provider) {
    const cmd = this._find(name, provider) || this._findAny(name);
    if (!cmd) return null;
    if (!cmd.selector) return { ok: false, error: `"${name}" has no selector yet — run: cli pick ${name}` };
    if (cmd.pickPending) return { ok: false, error: `"${name}" is waiting for DOM pick — click an element in the ${cmd.provider} tab` };
    return { ok: true, ...this._parse(cmd) };
  }

  // ── INTERNAL ─────────────────────────────────────────────────────────────────

  _find(name, provider) {
    const all = this._jaa.all('cli_commands') || [];
    return all.find(c => c.name === name && (!provider || c.provider === provider) && !c._deleted) || null;
  }

  _findAny(name) {
    const all = this._jaa.all('cli_commands') || [];
    return all.find(c => c.name === name && !c._deleted) || null;
  }

  _get(uuid) {
    const all = this._jaa.all('cli_commands') || [];
    return this._parse(all.find(c => c.uuid === uuid));
  }

  _parse(cmd) {
    if (!cmd) return null;
    return {
      uuid:        cmd.uuid,
      name:        cmd.name,
      selector:    cmd.selector || null,
      action:      cmd.action   || 'click',
      provider:    cmd.provider || 'claude',
      desc:        cmd.desc     || '',
      pickPending: !!cmd.pickPending,
      pickMeta:    cmd.pickMeta ? (() => { try { return JSON.parse(cmd.pickMeta); } catch { return {}; } })() : {},
      createdAt:   cmd.createdAt,
      updatedAt:   cmd.updatedAt,
      ready:       !!cmd.selector && !cmd.pickPending,
    };
  }
}

module.exports = { CLIRegistry, MODULE_ID, VERSION };
