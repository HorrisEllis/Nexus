'use strict';
/**
 * lib/agent-tools/tools/sandbox/cos-playground.js — copilot's access to COS
 * playground gates. A playground is a disposable, isolated experiment
 * compartment (host/gates/playgrounds.js: create/destroy/promote/status);
 * "promote" turns a proven-out playground into a real permanent compartment.
 * comp_id: nexus.lib.agent-tools.tools.cos-playground
 * UUID: nexus-tool-cos-playground-v1-0000-2026-0814-jamesbrooks-001
 *
 * §WIRED 2026-08-14 — sibling of cos-archetype.js/cos-blueprint.js.
 * createPlaygroundCommand is genuinely async (the gate's own header:
 * the 'simulated' network mode starts a real HTTP server) — awaited here,
 * same as the real CLI does.
 */
function _host() {
  const { createHost } = require('../../../../cos/host/index.js');
  return createHost();
}

const ACTIONS = {
  create: async (a) => {
    if (!a.name) return { error: 'create needs name' };
    const { createPlaygroundCommand } = require('../../../../cos/cli/commands/playground.js');
    const logs = [];
    const r = await createPlaygroundCommand(_host(), a.name, { networkMode: a.networkMode }, { log: (...x) => logs.push(x.join(' ')) });
    return { ok: true, result: r, logs };
  },
  list: () => {
    const { listPlaygroundsCommand } = require('../../../../cos/cli/commands/playground.js');
    const logs = [];
    listPlaygroundsCommand(_host(), { json: true }, { log: (...x) => logs.push(x.join(' ')) });
    try { return { ok: true, playgrounds: JSON.parse(logs.join('')) }; }
    catch (_) { return { ok: true, raw: logs }; }
  },
  status: (a) => {
    if (!a.idOrName) return { error: 'status needs idOrName' };
    const { playgroundStatusCommand } = require('../../../../cos/cli/commands/playground.js');
    const logs = [];
    playgroundStatusCommand(_host(), a.idOrName, { json: true }, { log: (...x) => logs.push(x.join(' ')) });
    try { return { ok: true, status: JSON.parse(logs.join('')) }; }
    catch (_) { return { ok: true, raw: logs }; }
  },
  destroy: (a) => {
    if (!a.idOrName) return { error: 'destroy needs idOrName' };
    const { destroyPlaygroundCommand } = require('../../../../cos/cli/commands/playground.js');
    const logs = [];
    const r = destroyPlaygroundCommand(_host(), a.idOrName, { log: (...x) => logs.push(x.join(' ')) });
    return { ok: true, result: r, logs };
  },
  promote: (a) => {
    if (!a.compartmentId) return { error: 'promote needs compartmentId' };
    const { promoteCommand } = require('../../../../cos/cli/commands/playground.js');
    const logs = [];
    const r = promoteCommand(_host(), a.compartmentId, { log: (...x) => logs.push(x.join(' ')) });
    return { ok: true, result: r, logs };
  },
};

module.exports = {
  name: 'cos_playground',
  description:
    'Create, list, check status of, promote, or destroy a COS playground — a disposable isolated ' +
    'compartment meant for trying something before committing to it. Actions: "create" (needs name, ' +
    'optional networkMode), "list", "status" (needs idOrName), "destroy" (needs idOrName), "promote" ' +
    '(needs compartmentId — turns a playground that worked into a real permanent compartment).',
  parameters: {
    type: 'object',
    properties: {
      action:        { type: 'string', enum: Object.keys(ACTIONS) },
      name:          { type: 'string', description: 'for "create"' },
      networkMode:   { type: 'string', description: 'for "create" — optional network mode override' },
      idOrName:      { type: 'string', description: 'for "status"/"destroy"' },
      compartmentId: { type: 'string', description: 'for "promote"' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `cos_playground ${args.action} failed: ${e.message}` }; }
  },
};
