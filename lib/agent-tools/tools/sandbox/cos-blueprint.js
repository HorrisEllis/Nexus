'use strict';
/**
 * lib/agent-tools/tools/sandbox/cos-blueprint.js — copilot's access to COS
 * blueprint gates (a blueprint = a reusable multi-compartment topology
 * template; an "instance" is a real running compartment created from one).
 * comp_id: nexus.lib.agent-tools.tools.cos-blueprint
 * UUID: nexus-tool-cos-blueprint-v1-0000-2026-0814-jamesbrooks-001
 *
 * §WIRED 2026-08-14 — sibling of cos-archetype.js, same session, same
 * reuse pattern. scale (hk-b-004) and map (hk-b-007) are deferred per
 * host/gates/blueprint.js's own header — not wrapped here since they
 * don't exist as real gates yet; wrapping them would declare a capability
 * with nothing behind it, exactly what loom's dangling-report exists to
 * catch.
 */
function _host() {
  const { createHost } = require('../../../../cos/host/index.js');
  return createHost();
}

const ACTIONS = {
  list: () => {
    const { listBlueprintsCommand } = require('../../../../cos/cli/commands/blueprint.js');
    const logs = [];
    listBlueprintsCommand(_host(), { json: true }, { log: (...x) => logs.push(x.join(' ')) });
    try { return { ok: true, blueprints: JSON.parse(logs.join('')) }; }
    catch (_) { return { ok: true, raw: logs }; }
  },
  show: (a) => {
    if (!a.idOrName) return { error: 'show needs idOrName' };
    const { showBlueprint } = require('../../../../cos/cli/commands/blueprint.js');
    const logs = [];
    showBlueprint(_host(), a.idOrName, { json: true }, { log: (...x) => logs.push(x.join(' ')) });
    try { return { ok: true, blueprint: JSON.parse(logs.join('')) }; }
    catch (_) { return { ok: true, raw: logs }; }
  },
  create: (a) => {
    if (!a.idOrName || !a.instanceName) return { error: 'create needs idOrName (blueprint) and instanceName (new compartment name)' };
    const { createBlueprintInstance } = require('../../../../cos/cli/commands/blueprint.js');
    const logs = [];
    const r = createBlueprintInstance(_host(), a.idOrName, a.instanceName, { log: (...x) => logs.push(x.join(' ')) });
    return { ok: true, result: r, logs };
  },
  status: (a) => {
    if (!a.instanceId) return { error: 'status needs instanceId' };
    const { showBlueprintStatus } = require('../../../../cos/cli/commands/blueprint.js');
    const logs = [];
    showBlueprintStatus(_host(), a.instanceId, { json: true }, { log: (...x) => logs.push(x.join(' ')) });
    try { return { ok: true, status: JSON.parse(logs.join('')) }; }
    catch (_) { return { ok: true, raw: logs }; }
  },
  destroy: (a) => {
    if (!a.instanceId) return { error: 'destroy needs instanceId' };
    const { destroyBlueprintInstanceCommand } = require('../../../../cos/cli/commands/blueprint.js');
    const logs = [];
    const r = destroyBlueprintInstanceCommand(_host(), a.instanceId, { log: (...x) => logs.push(x.join(' ')) });
    return { ok: true, result: r, logs };
  },
};

module.exports = {
  name: 'cos_blueprint',
  description:
    'Manage COS blueprints (reusable multi-compartment topology templates) and their instances. Actions: ' +
    '"list", "show" (needs idOrName), "create" (needs idOrName + instanceName — spawns a real compartment ' +
    'instance from a blueprint), "status" (needs instanceId), "destroy" (needs instanceId). Import from a ' +
    'file is deliberately not exposed — that\'s a file-system write left to the real CLI.',
  parameters: {
    type: 'object',
    properties: {
      action:       { type: 'string', enum: Object.keys(ACTIONS) },
      idOrName:     { type: 'string', description: 'for "show"/"create" — the blueprint' },
      instanceName: { type: 'string', description: 'for "create" — name of the new compartment instance' },
      instanceId:   { type: 'string', description: 'for "status"/"destroy"' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `cos_blueprint ${args.action} failed: ${e.message}` }; }
  },
};
