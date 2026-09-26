/**
 * nodes/index.js
 * COMPARTMENT OS — Command Node Listener
 *
 * Status: pre-release
 *
 * Scans this directory for command node modules, validates each against
 * foundation/command-schema.js, and builds a name → node dispatch table.
 *
 * This replaces the hand-maintained switch statement that used to live in
 * cli/index.js. To add a new CLI command:
 *
 *   1. Drop a new file in cos/nodes/ (e.g. cos/nodes/rename.js)
 *   2. Export { name, version, summary, usage, flags?, run(ctx) }
 *   3. Nothing else to wire up — the listener picks it up automatically.
 *
 * A node that fails schema validation is skipped (not crashed on) so one
 * broken command can't take down the whole CLI — the failure is collected
 * and surfaced via `cos schema validate --commands` / `cos nodes list`.
 *
 * Files prefixed with `_` are ignored (helpers, not commands).
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const { validateCommandNode, CommandSchemaError } = require('../foundation/command-schema.js');

const NODES_DIR = __dirname;

/**
 * Load and validate all command nodes in this directory.
 * @returns {{ nodes: Map<string, object>, errors: Array<{file: string, message: string}> }}
 */
function loadNodes() {
  const nodes  = new Map();
  const errors = [];

  const files = fs.readdirSync(NODES_DIR)
    .filter(f => f.endsWith('.js'))
    .filter(f => f !== 'index.js')
    .filter(f => !f.startsWith('_'))
    .sort();

  for (const file of files) {
    const full = path.join(NODES_DIR, file);
    try {
      // Fresh require each load call (no cache) so `cos nodes reload`-style
      // tooling / tests can pick up edits without restarting the process.
      delete require.cache[require.resolve(full)];
      const mod = require(full);
      validateCommandNode(mod, file);

      if (nodes.has(mod.name)) {
        errors.push({ file, message: `duplicate command name "${mod.name}" (already loaded from another node)` });
        continue;
      }
      nodes.set(mod.name, { ...mod, __file: file });
    } catch (err) {
      if (err instanceof CommandSchemaError) {
        errors.push({ file, message: err.message });
      } else {
        errors.push({ file, message: `failed to load: ${err.message}` });
      }
    }
  }

  return { nodes, errors };
}

/**
 * Convenience: load nodes and throw if any failed validation.
 * Used at CLI boot — a malformed node should be loud, not silent.
 * @returns {Map<string, object>}
 */
function loadNodesOrThrow() {
  const { nodes, errors } = loadNodes();
  if (errors.length > 0) {
    const lines = errors.map(e => `  ✖ ${e.file}: ${e.message}`).join('\n');
    throw new Error(`${errors.length} command node(s) failed validation:\n${lines}`);
  }
  return nodes;
}

module.exports = { loadNodes, loadNodesOrThrow, NODES_DIR };
