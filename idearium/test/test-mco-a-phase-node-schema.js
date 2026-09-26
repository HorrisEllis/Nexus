/**
 * idearium/test/test-mco-a-phase-node-schema.js — MCO-A gate proof, half 2.
 * idearium-repository-overhaul-phasemap.spec's own gate: "MET when both
 * are indexed in their systems' schemas/index.js and one real round-trip
 * row passes each." This is that round-trip for schema.phase_node.
 *
 * §17.10 (verify before promote) — same reasoning as its versionium
 * sibling (tests/modules/test-mco-a-file-delta-schema.js): writes a real
 * row through idearium's real, cortex-backed store (idearium/lib/db.js)
 * ahead of MCO-E actually building idearium.roadmap.phase.update, so the
 * schema shape is proven now rather than assumed.
 *
 * Run: node idearium/test/test-mco-a-phase-node-schema.js
 * (needs JAA_DATA_DIR set before import so this doesn't touch real data —
 * set below, isolated, same convention as every other test in this tree.)
 */
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mco-a-phase-node-test-'));
process.env.JAA_DATA_DIR = TMP;

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

const schemas = await import('../schemas/index.js');
const { appendRow, loadTable } = await import('../lib/db.js');

test('MCOA-004', 'schema.phase_node is indexed in idearium/schemas, status OPEN', () => {
  const def = schemas.get('phase_node');
  if (!def) throw new Error('expected phase_node to be indexed');
  if (def.status !== 'OPEN' && def.status !== 'REAL') throw new Error(`expected status OPEN or REAL, got ${def.status}`); // REAL since MCO-E
  const required = Object.entries(def.fields).filter(([, f]) => f.required).map(([k]) => k).sort();
  const expected = ['order', 'project_id', 'status', 'title', 'uuid'].sort();
  if (JSON.stringify(required) !== JSON.stringify(expected)) {
    throw new Error(`required fields mismatch: got ${JSON.stringify(required)}, expected ${JSON.stringify(expected)}`);
  }
});

test('MCOA-005', 'a real phase_node row round-trips through idearium\'s real cortex-backed store unchanged', () => {
  const row = {
    uuid: 'phase-mcoa-0001',
    project_id: 'idea-mcoa-fixture',
    order: 1,
    title: 'MCO-A schema round-trip fixture',
    status: 'planned',
    depends_on: [],
    ts: Date.now(),
  };
  appendRow('idearium_phase_nodes', row);
  const rows = loadTable('idearium_phase_nodes');
  const back = rows.find((r) => r.uuid === row.uuid);
  if (!back) throw new Error('expected the row to read back');
  for (const key of Object.keys(row)) {
    const a = JSON.stringify(back[key]);
    const b = JSON.stringify(row[key]);
    if (a !== b) throw new Error(`field "${key}" did not round-trip: got ${a}, expected ${b}`);
  }
});

test('MCOA-006', 'status enum is honestly enforced by the schema definition, not by the store (store stays permissive, schema is the contract)', () => {
  const def = schemas.get('phase_node');
  const allowed = def.fields.status.enum;
  if (!allowed.includes('planned') || !allowed.includes('complete')) {
    throw new Error(`expected planned/complete in enum, got ${JSON.stringify(allowed)}`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
