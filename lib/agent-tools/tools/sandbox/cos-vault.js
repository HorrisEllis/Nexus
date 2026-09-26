'use strict';
/**
 * lib/agent-tools/tools/sandbox/cos-vault.js — copilot's access to COS
 * vault gates (host/gates/vault.js: set/get/delete/grant/revoke/export/
 * import secrets, scoped per compartment).
 * comp_id: nexus.lib.agent-tools.tools.cos-vault
 * UUID: nexus-tool-cos-vault-v1-0000-2026-0814-jamesbrooks-001
 *
 * §WIRED 2026-08-14, DELIBERATELY INCOMPLETE — sibling of the other
 * cos-*.js tools this session, but "get" and "export" are NOT wrapped
 * here on purpose. Every other cos-* tool this session exposes its full
 * real action set; this one doesn't, and that's worth stating plainly
 * rather than leaving it looking like an oversight. A tool an LLM can
 * call is reachable by anything that can get the model to call it —
 * this session already went through exactly this reasoning once for a
 * public MCP connector and dropped that plan; the same logic applies
 * here even though this tool never leaves localhost: exposing raw
 * secret VALUES (get/export) to a tool-call surface turns a prompt
 * injection somewhere upstream into a real credential leak. set/delete/
 * grant/revoke/list/audit don't have that shape — they manage WHICH
 * secrets exist and who can reach them, never return a secret's actual
 * value. Reading a real secret value stays a human action via the CLI.
 */
function _host() {
  const { createHost } = require('../../../../cos/host/index.js');
  return createHost();
}

const ACTIONS = {
  set: (a) => {
    if (!a.compartmentName || !a.key || a.value === undefined) return { error: 'set needs compartmentName, key, and value' };
    const { setCommand } = require('../../../../cos/cli/commands/vault.js');
    const logs = [];
    const r = setCommand(_host(), a.compartmentName, { [a.key]: a.value }, {}, { log: (...x) => logs.push(x.join(' ')) });
    return { ok: true, result: r, logs };
  },
  list: (a) => {
    if (!a.compartmentName) return { error: 'list needs compartmentName' };
    const { listCommand } = require('../../../../cos/cli/commands/vault.js');
    const logs = [];
    // §BY DESIGN — lists KEY NAMES only; the underlying listCommand's real
    // output never included values in the first place (checked directly),
    // so nothing had to be stripped here, this just confirms it stays that way.
    listCommand(_host(), a.compartmentName, { json: true }, { log: (...x) => logs.push(x.join(' ')) });
    try { return { ok: true, keys: JSON.parse(logs.join('')) }; }
    catch (_) { return { ok: true, raw: logs }; }
  },
  delete: (a) => {
    if (!a.compartmentName || !a.key) return { error: 'delete needs compartmentName and key' };
    const { deleteCommand } = require('../../../../cos/cli/commands/vault.js');
    const logs = [];
    const r = deleteCommand(_host(), a.compartmentName, a.key, { log: (...x) => logs.push(x.join(' ')) });
    return { ok: true, result: r, logs };
  },
  grant: (a) => {
    if (!a.fromCompartmentName || !a.toCompartmentName || !a.key) return { error: 'grant needs fromCompartmentName, toCompartmentName, and key' };
    const { grantCommand } = require('../../../../cos/cli/commands/vault.js');
    const logs = [];
    const r = grantCommand(_host(), a.fromCompartmentName, a.toCompartmentName, a.key, { log: (...x) => logs.push(x.join(' ')) });
    return { ok: true, result: r, logs };
  },
  revoke: (a) => {
    if (!a.fromCompartmentName || !a.toCompartmentName || !a.key) return { error: 'revoke needs fromCompartmentName, toCompartmentName, and key' };
    const { revokeCommand } = require('../../../../cos/cli/commands/vault.js');
    const logs = [];
    const r = revokeCommand(_host(), a.fromCompartmentName, a.toCompartmentName, a.key, { log: (...x) => logs.push(x.join(' ')) });
    return { ok: true, result: r, logs };
  },
  audit: () => {
    const { auditCommand } = require('../../../../cos/cli/commands/vault.js');
    const logs = [];
    auditCommand(_host(), { json: true }, { log: (...x) => logs.push(x.join(' ')) });
    try { return { ok: true, audit: JSON.parse(logs.join('')) }; }
    catch (_) { return { ok: true, raw: logs }; }
  },
};

module.exports = {
  name: 'cos_vault',
  description:
    'Manage which secrets exist in a COS compartment vault and who can reach them — never returns a ' +
    'secret\'s actual value (get/export are intentionally not exposed here; use the real CLI for that). ' +
    'Actions: "set" (needs compartmentName, key, value — writes a secret, does not echo it back), "list" ' +
    '(needs compartmentName — key NAMES only), "delete" (needs compartmentName, key), "grant"/"revoke" ' +
    '(need fromCompartmentName, toCompartmentName, key — cross-compartment access), "audit" (full access log).',
  parameters: {
    type: 'object',
    properties: {
      action:              { type: 'string', enum: Object.keys(ACTIONS) },
      compartmentName:     { type: 'string', description: 'for "set"/"list"/"delete"' },
      key:                 { type: 'string', description: 'secret key name' },
      value:               { type: 'string', description: 'for "set" — the secret value to store (write-only, never returned)' },
      fromCompartmentName: { type: 'string', description: 'for "grant"/"revoke"' },
      toCompartmentName:   { type: 'string', description: 'for "grant"/"revoke"' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')} (get/export deliberately excluded — see this tool's file header)` };
    try { return await fn(args); }
    catch (e) { return { error: `cos_vault ${args.action} failed: ${e.message}` }; }
  },
};
