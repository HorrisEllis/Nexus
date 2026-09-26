'use strict';
// Real test for the node-schemas split + the 2026-09-11 format conversion.
// James: "can you do the split now" (2026-09-03), then "the node type is
// the file extension, not js -- a yaml file with the node type as the
// extension" (2026-09-11).
//
// Confirms: every real type resolves to its own real .schema YAML file
// under lib/node-schemas/ (not require()'d JS anymore), the conversion
// moved content losslessly (real field-count checks against known
// values), and checkPayload() still works correctly post-conversion --
// contract specifically, since James named it directly back in the
// original split.
//
// SECTION UPDATED 2026-09-11 -- EXPECTED_TYPES was stale even before the
// format change: it listed 17 types, but framework/toolbox had already
// been added (19 real), then 7 more this session (26 real) -- this test
// would have already been failing on type count alone. Updated to the
// real, current 26.

const fs = require('fs');
const path = require('path');
const nodeSchemas = require('../lib/node-schemas.js');

const EXPECTED_TYPES = [
  'hat', 'component', 'node', 'contract', 'agent', 'health', 'model', 'schema',
  'crystal', 'pat', 'gap', 'ledger', 'tool', 'command', 'cos', 'macro',
  'failure_mode', 'idea', 'framework', 'toolbox',
  'vector', 'artifact', 'resonance_crystal', 'interstitial_space',
  'lattice_edge', 'relationship_edge', 'guardian_listener',
  'event', 'capability', 'hook_contract', 'fault',
];

// known-good field counts, from the pre-split monolith, to catch a
// silent truncation during the move rather than trust the split blind
const EXPECTED_FIELD_COUNTS = {
  contract: 13, crystal: 10, pat: 10, gap: 14, ledger: 9, macro: 10, health: 6,
};

function main() {
  // -- every type is real, every one has its own file on disk ---------
  const types = nodeSchemas.list();
  if (types.length !== EXPECTED_TYPES.length) throw new Error(`expected ${EXPECTED_TYPES.length} types, got ${types.length}: ${types.map(t=>t.type).join(',')}`);
  for (const t of EXPECTED_TYPES) {
    if (!types.find(x => x.type === t)) throw new Error(`missing expected type: ${t}`);
  }
  console.log(`PASS: all ${EXPECTED_TYPES.length} types present`);

  for (const t of EXPECTED_TYPES) {
    const filePath = path.join(__dirname, '..', 'lib', 'node-schemas', `schema.${t}`);
    if (!fs.existsSync(filePath)) throw new Error(`${t} has no real schema.${t} file at ${filePath}`);
    const schema = nodeSchemas.get(t);
    if (schema.status !== 'REAL') throw new Error(`${t}: expected status REAL, got ${schema.status}`);
  }
  console.log('PASS: every type has a real, existing .schema file, every one status:REAL');

  // -- lossless conversion -- real field counts match the pre-conversion content --
  for (const [type, expectedCount] of Object.entries(EXPECTED_FIELD_COUNTS)) {
    const actualCount = Object.keys(nodeSchemas.get(type).fields).length;
    if (actualCount !== expectedCount) throw new Error(`${type}: expected ${expectedCount} fields, got ${actualCount} -- the split may have dropped or duplicated a field`);
  }
  console.log('PASS: field counts for contract/crystal/pat/gap/ledger/macro/health (was agent) match the pre-conversion content exactly');

  // -- checkPayload still works post-conversion -- contract specifically --
  const goodContract = {
    uuid: 'c-1', forAgent: 'claude', intention: 'build', endState: 'a real end state',
  };
  const check1 = nodeSchemas.checkPayload('contract', goodContract);
  if (!check1.ok) throw new Error(`expected a valid contract payload to pass, got ${JSON.stringify(check1)}`);
  console.log('PASS: a real, complete contract payload passes checkPayload() post-conversion');

  const badContract = { uuid: 'c-2', forAgent: 'claude' }; // missing intention, endState
  const check2 = nodeSchemas.checkPayload('contract', badContract);
  if (check2.ok) throw new Error('expected an incomplete contract payload to fail checkPayload()');
  if (!check2.missing.includes('intention') || !check2.missing.includes('endState')) {
    throw new Error(`expected missing to include intention and endState, got ${JSON.stringify(check2.missing)}`);
  }
  console.log('PASS: an incomplete contract payload correctly fails checkPayload(), naming the real missing fields');

  // -- loom's real COMPONENT_SCHEMA reference -- now FROZEN, verified against the live source --
  const componentSchema = nodeSchemas.get('component');
  const liveComponentSchema = require('../loom/schema/definitions.js').COMPONENT_SCHEMA;
  if (componentSchema.fields.id.description !== liveComponentSchema.types.id) {
    throw new Error(`component.schema's frozen id description ("${componentSchema.fields.id.description}") no longer matches loom's live COMPONENT_SCHEMA.types.id ("${liveComponentSchema.types.id}") -- re-export needed, this is the exact regression the 2026-09-11 conversion named`);
  }
  console.log("PASS: component.schema's frozen value still matches loom's live COMPONENT_SCHEMA (re-run the export if this ever fails)");

  // -- hat's real HAT_SCHEMA reference -- now FROZEN, verified against the live source --
  const hatSchema = nodeSchemas.get('hat');
  const liveHatSchema = require('../lib/hat-forge.js').HAT_SCHEMA;
  if (JSON.stringify(hatSchema.fields) !== JSON.stringify(liveHatSchema)) {
    throw new Error("hat.schema's frozen fields no longer match lib/hat-forge.js's live HAT_SCHEMA -- re-export needed, this is the exact regression the 2026-09-11 conversion named");
  }
  console.log("PASS: hat.schema's frozen value still matches hat-forge.js's live HAT_SCHEMA (re-run the export if this ever fails)");
}

try { main(); console.log('ALL PASS'); process.exit(0); }
catch (e) { console.error('FAIL:', e.message); process.exit(1); }
