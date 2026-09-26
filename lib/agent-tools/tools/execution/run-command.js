'use strict';
/**
 * lib/agent-tools/tools/run-command.js — run_command tool
 * UUID: nexus-agent-tools-run-command-v1-0000-2026-0706-jamesbrooks-001
 * Spec: docs/forge.spec §command_and_keyword_layer (status was
 * not_built; this is the build).
 *
 * The autonomy keystone: AX-008 gave the model sight (bridge/diagnostic
 * streams into copilot); this gives it hands. One tool, dispatching
 * through cockpit's real INTERACTION_CONTRACT — the same contract the
 * CLI and UI use ("CLI = UI = same contract", cockpit/cli.js's own
 * header) — so a model that can call this can list/create/run/arm
 * pipelines, i.e. create and schedule its own workflows through the
 * already-real cron/interval/webhook trigger engine.
 *
 * §SCHEMA FROM THE CONTRACT, NOT HARDCODED — the description enumerates
 * the real command vocabulary by reading INTERACTION_CONTRACT at load
 * time, exactly as forge.spec specified ("schema lists cockpit's real
 * commands, read from cockpit/cli.js's own contract"). A command added
 * to the contract appears here with zero changes to this file.
 *
 * §HONEST BOUNDARY — exec() routes whatever string it's given; commands
 * whose ForgeCLI deps aren't composed in cockpit/live.js (guardian/
 * idearium handles) return ForgeCLI's own error/empty results rather
 * than this tool pretending broader coverage than the live instance has.
 */

const { INTERACTION_CONTRACT } = require('../../../../cockpit/cli.js');
const { ready } = require('../../../../cockpit/live.js');

const _vocab = INTERACTION_CONTRACT.commands
  .map(c => `${c.cmd}${(c.args || []).map(a => ` <${a.name}>`).join('')} — ${c.description}`)
  .join('\n');

module.exports = {
  name: 'run_command',
  description:
    `Execute a NEXUS cockpit command. Commands follow cockpit's real interaction contract (v${INTERACTION_CONTRACT.version}). Available commands:\n${_vocab}\nAlso: "forge help" lists commands.`,
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The full command string, e.g. "forge pipeline list" or "forge pipeline create My Pipeline"',
      },
      opts: {
        type: 'object',
        description: 'Optional named options for the command, e.g. {"payload": "{\\"key\\":1}"} for forge pipeline run',
      },
    },
    required: ['command'],
  },
  execute: async ({ command, opts = {} }) => {
    if (!command || typeof command !== 'string') return { error: 'command string is required' };
    if (!/^(forge|help)\b/i.test(command.trim())) {
      return { error: `unrecognized command namespace — commands start with "forge" (try "forge help")` };
    }
    try {
      const cli = await ready();
      const result = await cli.exec(command.trim(), opts);
      return result ?? { error: 'command produced no result' };
    } catch (e) {
      return { error: e.message };
    }
  },
};
