'use strict';
// Real test for the 2026-09-03 loom/schema/definitions.js split. James:
// "look at all the rest. all schemas should be seperated." Same pattern
// as lib/node-schemas.js's own split, applied to loom's 5-schema
// monolith (component/seam/hook/wire/concern).
//
// component.js was already indirectly exercised (lib/node-schemas'
// own component split re-requires it) — hook/wire/seam/concern had no
// real test touching them at all before this.

const definitions = require('../loom/schema/definitions.js');

const EXPECTED = {
  COMPONENT_SCHEMA: ['id', 'namespace', 'name', 'version'],
  SEAM_SCHEMA:      ['id', 'component_id', 'name', 'kind'],
  HOOK_SCHEMA:      ['id', 'component_id', 'name', 'type', 'direction'],
  WIRE_SCHEMA:      ['id', 'from_hook_id', 'to_hook_id'],
  CONCERN_SCHEMA:   ['id', 'kind', 'title', 'severity', 'source'],
};

function main() {
  // ── every schema still resolves, same requiredKeys as pre-split ──────
  for (const [name, expectedKeys] of Object.entries(EXPECTED)) {
    const schema = definitions[name];
    if (!schema) throw new Error(`${name} did not resolve through the split at all`);
    const actualKeys = schema.requiredKeys;
    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
      throw new Error(`${name}.requiredKeys changed during the split: expected ${JSON.stringify(expectedKeys)}, got ${JSON.stringify(actualKeys)}`);
    }
  }
  console.log('PASS: all 5 schemas (component/seam/hook/wire/concern) resolve through definitions.js with unchanged requiredKeys');

  // ── each schema's own split file also resolves directly, not just
  // through the loader — proves the files are real, not just definitions.js
  // quietly holding the content some other way ──────────────────────────
  const direct = {
    COMPONENT_SCHEMA: require('../loom/schema/component.js').COMPONENT_SCHEMA,
    SEAM_SCHEMA:      require('../loom/schema/seam.js').SEAM_SCHEMA,
    HOOK_SCHEMA:      require('../loom/schema/hook.js').HOOK_SCHEMA,
    WIRE_SCHEMA:      require('../loom/schema/wire.js').WIRE_SCHEMA,
    CONCERN_SCHEMA:   require('../loom/schema/concern.js').CONCERN_SCHEMA,
  };
  for (const name of Object.keys(EXPECTED)) {
    if (definitions[name] !== direct[name]) throw new Error(`${name}: definitions.js's re-export is not the same real object as requiring the split file directly`);
  }
  console.log('PASS: each split file resolves directly and is the exact same real object definitions.js re-exports (not a copy)');

  // ── KNOWN_HOOK_TYPES moved to hook.js, still re-exported ──────────────
  const hookTypes = definitions.KNOWN_HOOK_TYPES;
  const EXPECTED_HOOK_TYPES = ['api', 'event_bus', 'callto', 'direct', 'webserver', 'cli'];
  if (JSON.stringify(hookTypes) !== JSON.stringify(EXPECTED_HOOK_TYPES)) {
    throw new Error(`KNOWN_HOOK_TYPES changed during the split: got ${JSON.stringify(hookTypes)}`);
  }
  if (definitions.KNOWN_HOOK_TYPES !== require('../loom/schema/hook.js').KNOWN_HOOK_TYPES) {
    throw new Error('KNOWN_HOOK_TYPES re-export is not the same real object as hook.js\'s own export');
  }
  console.log('PASS: KNOWN_HOOK_TYPES moved to hook.js (its real, direct association), unchanged content, correctly re-exported');

  // ── real Object.freeze survives the move — these were frozen before,
  // must still be frozen after (a real regression a naive split could
  // introduce if a schema got spread/cloned instead of moved as-is) ─────
  for (const name of Object.keys(EXPECTED)) {
    if (!Object.isFrozen(definitions[name])) throw new Error(`${name} is no longer frozen after the split`);
  }
  console.log('PASS: every schema is still Object.freeze()\'d, same as before the split');
}

try { main(); console.log('ALL PASS'); process.exit(0); }
catch (e) { console.error('FAIL:', e.message); process.exit(1); }
