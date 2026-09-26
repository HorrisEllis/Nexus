// idearium-reuse — Phase 6: intelligence in the loop. "Query previous builds to
// reduce tokens and redundancy." Two levers: spec dedup + cross-spec chunk reuse.
import assert from 'assert';
const m = await import('../../idearium/spec-engine/index.js');

let passed = 0, failed = 0;
const t = (id, name, cond) => { if (cond) { passed++; console.log(`  ✓ ${id} ${name}`); } else { failed++; console.log(`  ✗ ${id} ${name}`); } };

// --- spec-level dedup ---
const n = 'reuse-test-' + Date.now();
const a = m.createSpec({ name: n, type: 'library' });
const b = m.createSpec({ name: n, type: 'library' });
t('T-001', 'first spec has no duplicateOf', a.duplicateOf === null);
t('T-002', 'second spec points duplicateOf at the first', b.duplicateOf === a.uuid);
t('T-003', 'findByDedupKey locates an existing spec', m.findByDedupKey(n, 'library') !== null);
t('T-004', 'findByDedupKey returns null for a novel name', m.findByDedupKey('never-' + Date.now(), 'library') === null);

// --- cross-spec chunk reuse ---
const s1 = m.createSpec({ name: 'src-' + Date.now(), type: 'system' });
const p1 = s1.chunks.find(c => c.sectionId === 'purpose');
m.completeChunk(s1.uuid, p1.uuid, '## Purpose\nauthored ' + Date.now());
const s2 = m.createSpec({ name: 'dst-' + Date.now(), type: 'system' });
const p2 = s2.chunks.find(c => c.sectionId === 'purpose');

const prior = m.findPriorSection('purpose', p2.sectionDesc, s2.uuid);
t('T-005', 'findPriorSection locates a built section in another spec', prior !== null && !!prior.content);
t('T-006', 'findPriorSection excludes the current spec', prior.specUuid !== s2.uuid);
t('T-007', 'an unbuilt section returns null', m.findPriorSection('no-such-section', '', s2.uuid) === null);

// --- template seeds are NOT reusable content ---
const g1 = m.createSpec({ name: 'g1-' + Date.now(), templateId: 'genesis' });
const priorMeta = m.findPriorSection('meta', g1.chunks.find(c=>c.sectionId==='meta').sectionDesc, 'none');
t('T-008', 'template-seeded meta is excluded from reuse', priorMeta === null || priorMeta.agent !== 'template');

console.log(`\n  idearium-reuse: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
