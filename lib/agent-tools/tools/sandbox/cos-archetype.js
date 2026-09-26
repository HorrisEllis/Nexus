'use strict';
/**
 * lib/agent-tools/tools/sandbox/cos-archetype.js — copilot's access to COS
 * archetype gates (assign/import/detect a compartment template).
 * comp_id: nexus.lib.agent-tools.tools.cos-archetype
 * UUID: nexus-tool-cos-archetype-v1-0000-2026-0814-jamesbrooks-001
 *
 * §WIRED 2026-08-14 — James: "all the compartment tools." cos_compartment
 * (2026-08-12) only ever wrapped cos/host/gates/compartment.js. Five
 * sibling gate files in the same directory — archetype, blueprint,
 * playgrounds, plugin, vault — had zero agent-tool coverage. Same reuse
 * pattern as cos_compartment.js (§16.5): calls the real CLI command
 * functions the actual `cos` CLI calls, not a reimplementation.
 */
function _host() {
  const { createHost } = require('../../../../cos/host/index.js');
  return createHost();
}

const ACTIONS = {
  list: () => {
    const { listArchetypesCommand } = require('../../../../cos/cli/commands/archetype.js');
    const logs = [];
    listArchetypesCommand(_host(), { json: true }, { log: (...x) => logs.push(x.join(' ')) });
    try { return { ok: true, archetypes: JSON.parse(logs.join('')) }; }
    catch (_) { return { ok: true, raw: logs }; }
  },
  show: (a) => {
    if (!a.idOrName) return { error: 'show needs idOrName' };
    const { showArchetype } = require('../../../../cos/cli/commands/archetype.js');
    const logs = [];
    showArchetype(_host(), a.idOrName, { json: true }, { log: (...x) => logs.push(x.join(' ')) });
    try { return { ok: true, archetype: JSON.parse(logs.join('')) }; }
    catch (_) { return { ok: true, raw: logs }; }
  },
  assign: (a) => {
    if (!a.compartmentName || !a.archetypeIdOrName) return { error: 'assign needs compartmentName and archetypeIdOrName' };
    const { assignArchetype } = require('../../../../cos/cli/commands/archetype.js');
    const logs = [];
    const r = assignArchetype(_host(), a.compartmentName, a.archetypeIdOrName, {}, { log: (...x) => logs.push(x.join(' ')) });
    return { ok: true, result: r, logs };
  },
  detect: (a) => {
    if (!a.targetPath) return { error: 'detect needs targetPath (relative to project root)' };
    const { detectArchetypeCommand } = require('../../../../cos/cli/commands/archetype.js');
    const logs = [];
    const r = detectArchetypeCommand(_host(), a.targetPath, { json: true }, { log: (...x) => logs.push(x.join(' ')) });
    return { ok: true, result: r, logs };
  },
  // §WIRED 2026-08-14 — James: "create compartment types." createArchetype
  // (the real function) only ever read from a file path on disk
  // (fs.readFileSync). An agent tool taking an inline definition and
  // emitting the same real 'host:archetype:import' event directly is
  // safer (no arbitrary-path file read) and more natural for a tool call
  // — same real gate, same result/error listening pattern, no temp file.
  create: (a) => {
    if (!a.archetype || !a.archetype.name) return { error: 'create needs archetype (an object with at least a name)' };
    const host = _host();
    let result = null, errored = null;
    const unsubCreated = host.bus.on(require('../../../../cos/foundation/event-contracts.js').ARCHETYPE.CREATED, (ev) => { result = ev.payload; });
    const unsubError   = host.bus.on(require('../../../../cos/foundation/event-contracts.js').ARCHETYPE.ERROR,   (ev) => { errored = ev.payload; });
    host.bus.emit('host:archetype:import', { raw: a.archetype, sysmap: host.sysmap });
    unsubCreated(); unsubError();
    if (errored) return { ok: false, error: errored.reason };
    return { ok: true, archetype: result };
  },
};

module.exports = {
  name: 'cos_archetype',
  description:
    'Read, assign, detect, or create COS compartment archetypes (templates a compartment can be based ' +
    'on). Actions: "list", "show" (needs idOrName), "assign" (needs compartmentName + archetypeIdOrName — ' +
    'attaches an archetype to an existing compartment), "detect" (needs targetPath — inspects a real path ' +
    'and reports which archetype it matches, if any), "create" (needs archetype — an inline definition ' +
    'object with at least a name; registered directly, no file needed).',
  parameters: {
    type: 'object',
    properties: {
      action:             { type: 'string', enum: Object.keys(ACTIONS) },
      idOrName:           { type: 'string', description: 'for "show"' },
      compartmentName:    { type: 'string', description: 'for "assign"' },
      archetypeIdOrName:  { type: 'string', description: 'for "assign"' },
      targetPath:         { type: 'string', description: 'for "detect" — path relative to project root' },
      archetype:          { type: 'object', description: 'for "create" — inline archetype definition, needs at least a name' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `cos_archetype ${args.action} failed: ${e.message}` }; }
  },
};
