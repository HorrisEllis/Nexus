// spec-import — "import a .spec to build a repo." Parses a .spec's blocks into a
// manifest with authored sections pre-filled (zero tokens), promotable to a repo.
import assert from 'assert';
const m = await import('../../idearium/spec-engine/index.js');
let passed = 0, failed = 0;
const t = (id, name, cond) => { if (cond) { passed++; console.log(`  ✓ ${id} ${name}`); } else { failed++; console.log(`  ✗ ${id} ${name}`); } };

const specText = `spec:
  # BLOCK 1 — META
  meta:
    name: test-import
    version: 1.0.0
  # BLOCK 2 — INTENT
  intent:
    purpose: does a thing
  # BLOCK 8 — INTERFACES
  interfaces:
    api: GET /x
  # BLOCK 9 — VALIDATION
  validation:
    tests: it works`;

const r = m.importSpec({ name: 'test-import-' + Date.now(), specText });
t('T-001', 'parses all blocks', r.blocksFound === 4);
t('T-002', 'maps intent->purpose', r.sectionsFilled.includes('purpose'));
t('T-003', 'maps interfaces->api', r.sectionsFilled.includes('api'));
t('T-004', 'maps validation->tests', r.sectionsFilled.includes('tests'));
t('T-005', 'filled sections cost zero tokens (agent=import)', r.manifest.chunks.find(c=>c.sectionId==='purpose')?.agent === 'import');
t('T-006', 'nothing lost — unmatched recorded', Array.isArray(r.manifest.importedUnmatched));
t('T-007', 'empty specText throws', (()=>{ try { m.importSpec({specText:''}); return false; } catch { return true; } })());

console.log(`\n  spec-import: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
