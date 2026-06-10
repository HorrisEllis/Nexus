/**
 * cli/commands/schema.js
 * COMPARTMENT OS — cos schema validate
 *
 * Author: James Brooks (Erosmancer)
 * Version: 1.0.0
 *
 * Validates all hooks in the system map against the hook schema.
 * Throws on first violation per COS-1 (nothing silently fails).
 *
 * Hook: hk-h-021
 * Event: host:schema:validated
 */

'use strict';

const { validateHook, HookSchemaError } = require('../../foundation/hook-schema.js');
const { HOST }                          = require('../../foundation/event-contracts.js');

/**
 * Validate all registered hooks against the hook schema.
 * @param {object} host
 * @param {{ json?: boolean }} flags
 * @param {object} out
 * @returns {{ valid: number, invalid: number, errors: object[] }}
 */
function validateSchema(host, flags = {}, out = {}) {
  const log   = out.log   || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));

  const map   = host.sysmap.get();
  const hooks = map.hooks || [];

  const errors = [];
  let valid    = 0;

  for (const hook of hooks) {
    try {
      validateHook(hook);
      valid++;
    } catch (err) {
      errors.push({ hookId: hook.id, name: hook.name, message: err.message });
    }
  }

  const result = {
    total:   hooks.length,
    valid,
    invalid: errors.length,
    errors,
  };

  host.bus.emit(HOST.SCHEMA_VALIDATED, result);

  if (flags.json) {
    log(JSON.stringify(result, null, 2));
    return result;
  }

  if (hooks.length === 0) {
    log('\n  No hooks to validate.\n');
    return result;
  }

  if (errors.length === 0) {
    log(`\n  ✓  ${valid} hook${valid !== 1 ? 's' : ''} valid\n`);
  } else {
    log(`\n  ${valid} valid  ·  ${errors.length} invalid\n`);
    for (const e of errors) {
      log(`  ✖  ${e.name || e.hookId}`);
      log(`     ${e.message}`);
    }
    log('');
    error(`  Schema validation failed: ${errors.length} error${errors.length !== 1 ? 's' : ''}`);
  }

  return result;
}

module.exports = { validateSchema };
