'use strict';
/**
 * lib/agent-tools/tools/sandbox/cos-plugin.js — copilot's access to COS
 * plugin gates (host/gates/plugin.js: install/enable/disable/remove).
 * comp_id: nexus.lib.agent-tools.tools.cos-plugin
 * UUID: nexus-tool-cos-plugin-v1-0000-2026-0814-jamesbrooks-001
 *
 * §WIRED 2026-08-14 — sibling of the other cos-*.js tools this session.
 * addPlugin/scaffoldPlugin (both file-system writes creating new plugin
 * source from scratch) are deliberately NOT exposed — install/enable/
 * disable/remove operate on plugins that already exist and are declared;
 * scaffolding new plugin code from a bare name is a different, riskier
 * shape (arbitrary file creation) left to a person using the real CLI.
 */
function _host() {
  const { createHost } = require('../../../../cos/host/index.js');
  return createHost();
}

const ACTIONS = {
  list: () => {
    const { listPluginsCommand } = require('../../../../cos/cli/commands/plugin.js');
    const logs = [];
    listPluginsCommand(_host(), { json: true }, { log: (...x) => logs.push(x.join(' ')) });
    try { return { ok: true, plugins: JSON.parse(logs.join('')) }; }
    catch (_) { return { ok: true, raw: logs }; }
  },
  show: (a) => {
    if (!a.idOrName) return { error: 'show needs idOrName' };
    const { showPlugin } = require('../../../../cos/cli/commands/plugin.js');
    const logs = [];
    showPlugin(_host(), a.idOrName, { json: true }, { log: (...x) => logs.push(x.join(' ')) });
    try { return { ok: true, plugin: JSON.parse(logs.join('')) }; }
    catch (_) { return { ok: true, raw: logs }; }
  },
  enable: (a) => {
    if (!a.idOrName) return { error: 'enable needs idOrName' };
    const { enablePluginCommand } = require('../../../../cos/cli/commands/plugin.js');
    const logs = [];
    const r = enablePluginCommand(_host(), a.idOrName, { log: (...x) => logs.push(x.join(' ')) });
    return { ok: true, result: r, logs };
  },
  disable: (a) => {
    if (!a.idOrName) return { error: 'disable needs idOrName' };
    const { disablePluginCommand } = require('../../../../cos/cli/commands/plugin.js');
    const logs = [];
    const r = disablePluginCommand(_host(), a.idOrName, { log: (...x) => logs.push(x.join(' ')) });
    return { ok: true, result: r, logs };
  },
  remove: (a) => {
    if (!a.idOrName) return { error: 'remove needs idOrName' };
    const { removePluginCommand } = require('../../../../cos/cli/commands/plugin.js');
    const logs = [];
    const r = removePluginCommand(_host(), a.idOrName, { log: (...x) => logs.push(x.join(' ')) });
    return { ok: true, result: r, logs };
  },
};

module.exports = {
  name: 'cos_plugin',
  description:
    'Read or manage the lifecycle of an already-existing COS plugin. Actions: "list", "show" (needs ' +
    'idOrName), "enable" (needs idOrName), "disable" (needs idOrName), "remove" (needs idOrName). ' +
    'Scaffolding brand-new plugin source is deliberately not exposed here.',
  parameters: {
    type: 'object',
    properties: {
      action:   { type: 'string', enum: Object.keys(ACTIONS) },
      idOrName: { type: 'string', description: 'required for every action except "list"' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `cos_plugin ${args.action} failed: ${e.message}` }; }
  },
};
