/**
 * foundation/command-schema.js
 * COMPARTMENT OS — Command Node Contract Validator
 *
 * Status: pre-release
 *
 * validateCommandNode(node, filePath) — throws CommandSchemaError if invalid.
 * Used by nodes/index.js (the command listener) at load time, and by
 * `cos schema validate --commands` for on-demand auditing.
 *
 * Mirrors foundation/hook-schema.js: same shape of error, same kebab-case
 * and semver rules, so `cos schema validate` can report on both hooks and
 * commands through one consistent contract.
 *
 * A valid command node is a CommonJS module exporting an object shaped like:
 *
 *   module.exports = {
 *     name:    'create',            // kebab-case, matches the CLI verb
 *     version: '1.0.0',             // semver — bump when run() signature changes
 *     summary: 'Create a new compartment',
 *     usage:   'cos create [name]',
 *     flags:   [                    // optional, documents accepted flags
 *       { name: 'json', type: 'boolean', description: 'Output as JSON' },
 *     ],
 *     run: async (ctx) => { ... },  // ctx = { host, args, flags, log, error }
 *   };
 */

'use strict';

const { CosAxiomError } = require('./axioms.js');

// ─── CommandSchemaError ────────────────────────────────────────────────────────

class CommandSchemaError extends Error {
  constructor(field, message, node = null) {
    super(`CommandSchema: ${field} — ${message}`);
    this.name  = 'CommandSchemaError';
    this.field = field;
    this.node  = node;
  }
}

// ─── Shared patterns (same rules as hook-schema.js) ───────────────────────────

const KEBAB_RE  = /^[a-z][a-z0-9-]*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

function isKebab(val) {
  return typeof val === 'string' && KEBAB_RE.test(val);
}

function isSemver(val) {
  return typeof val === 'string' && SEMVER_RE.test(val);
}

// ─── validateCommandNode ───────────────────────────────────────────────────────

/**
 * Validates a command node module against the COS command schema.
 * Throws CommandSchemaError (or CosAxiomError for axiom violations) on failure.
 * Returns the node unchanged if valid.
 *
 * @param {object} node      — the module.exports of a nodes/*.js file
 * @param {string} [source]  — file path, for error context
 * @returns {object} the validated node
 */
function validateCommandNode(node, source = null) {
  if (!node || typeof node !== 'object') {
    throw new CommandSchemaError('node', `must be an object (module.exports)${source ? ` — ${source}` : ''}`);
  }

  if (!isKebab(node.name)) {
    throw new CommandSchemaError('name', `must be kebab-case, got: ${JSON.stringify(node.name)}`, node);
  }
  if (!isSemver(node.version)) {
    throw new CommandSchemaError('version', `must be semver (x.y.z), got: ${JSON.stringify(node.version)}`, node);
  }
  if (typeof node.summary !== 'string' || node.summary.length === 0) {
    throw new CommandSchemaError('summary', 'must be a non-empty string', node);
  }
  if (typeof node.usage !== 'string' || node.usage.length === 0) {
    throw new CommandSchemaError('usage', 'must be a non-empty string', node);
  }
  if (node.flags !== undefined) {
    if (!Array.isArray(node.flags)) {
      throw new CommandSchemaError('flags', 'must be an array when present', node);
    }
    for (const [i, flag] of node.flags.entries()) {
      if (!flag || typeof flag.name !== 'string') {
        throw new CommandSchemaError(`flags[${i}].name`, 'must be a string', node);
      }
      if (!['boolean', 'string', 'number'].includes(flag.type)) {
        throw new CommandSchemaError(`flags[${i}].type`, `must be one of boolean|string|number, got: ${JSON.stringify(flag.type)}`, node);
      }
    }
  }
  if (typeof node.run !== 'function') {
    throw new CommandSchemaError('run', 'must be a function', node);
  }

  return node;
}

module.exports = {
  CommandSchemaError,
  validateCommandNode,
  isKebab,
  isSemver,
};
