'use strict';
/**
 * lib/agent-tools/tools/nexus/update.js — nexus.update.tool: is there a newer Nexus on GitHub, and bring it in.
 * comp_id: nexus.agent-tools.nexus.update
 * Map: docs/2026-10-25-nexus-update-phasemap.spec (UP4)
 *
 * James, 2026-10-25: "can we make a tool for the copilot (remmber copilot is meant to be a hat.) like a update tool using github?"
 * An agent tool, so any agent wearing a co-pilot hat has it (lib/hat-seed.js). The work is lib/nexus-update.js; this is its door.
 * apply and rollback change Nexus's own code: confirm:true, after the person said yes (UP_D2). Restarting is his, never the tool's.
 */
const { toolName } = require('../../naming.js');
const U = () => require('../../../nexus-update.js');

const ACTIONS = {
  check:    (a) => U().check({ fetch: a.fetch !== false }),
  history:  () => ({ ok: true, history: U().history({}).slice(0, 30) }),
  apply:    (a) => U().apply({ confirm: a.confirm === true, by: 'agent' }),
  rollback: (a) => U().rollback({ confirm: a.confirm === true, by: 'agent' }),
};

module.exports = {
  name: toolName('nexus', 'update'),
  description:
    'Update Nexus from GitHub. check: this version vs GitHub\'s, every release in between with James\'s own words, the systems it ' +
    'changes, and what an update would set aside (his changed data files are copied to _archive/update/ first) or refuse (his ' +
    'edits to code the update also changes; local commits). apply{confirm:true}: fast-forward, npm install if the lockfile changed. ' +
    'rollback{confirm:true}: back to the commit the last update came from. history. ALWAYS show check\'s result to the person and ' +
    'ask before apply or rollback; never restart anything yourself — say which systems to restart (the Updates page has the buttons).',
  parameters: {
    type: 'object',
    properties: {
      action:  { type: 'string', enum: Object.keys(ACTIONS) },
      confirm: { type: 'boolean', description: 'apply / rollback: true only after the person said yes' },
      fetch:   { type: 'boolean', description: 'check: false reads what was last fetched (no network)' },
    },
    required: ['action'],
  },
  async execute(a = {}) {
    const fn = ACTIONS[a.action];
    if (!fn) return { ok: false, error: `unknown action "${a.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return fn(a); } catch (e) { return { ok: false, error: `update ${a.action} failed: ${e.message}` }; }
  },
};
