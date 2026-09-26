// tests/modules/idearium-phase-sync.test.mjs — James, from a real production
// boot log + UI screenshot: an idea ("Daw") and its linked spec both
// permanently stuck showing phase "building" long after the real build
// finished. Root cause: idearium/spec-engine/index.js's completeChunk()
// correctly flips manifest.status to 'complete' once every chunk is done,
// but idearium/api/index.js never read that real status back to advance
// the idea/spec phase — confirmed by grep, zero real callers of the
// registered-but-unused `idea.progress` endpoint anywhere in the codebase.
//
// The actual fix (a new _syncPhaseFromManifest() helper + os.emit() calls)
// lives in idearium/api/index.js, a large HTTP-request-handling CJS module
// not practically unit-testable in isolation without booting the whole
// server. This test instead proves the real DATA CONTRACT that fix reads
// from: that a spec-engine manifest created with a real ideaUuid actually
// carries it through to completion, and that completing every real chunk
// really does flip manifest.status to 'complete' — the exact condition
// _syncPhaseFromManifest checks before emitting the phase-advance events.
import assert from 'assert';
const m = await import('../../idearium/spec-engine/index.js');

let passed = 0, failed = 0;
const t = (id, name, cond) => { if (cond) { passed++; console.log(`  ✓ ${id} ${name}`); } else { failed++; console.log(`  ✗ ${id} ${name}`); } };

const ideaUuid = 'test-idea-' + Date.now();
const spec = m.createSpec({ name: 'phase-sync-test-' + Date.now(), type: 'component', ideaUuid });

t('PS-001', 'createSpec() carries a real ideaUuid onto the manifest', spec.ideaUuid === ideaUuid);
t('PS-002', 'a freshly created spec starts building, not complete', spec.status === 'building');

// Complete every real chunk — the exact real path GUARDIAN/WARP dispatch
// takes, one completeChunk() call per section, same function this
// session's fix wires _syncPhaseFromManifest() onto.
let manifest = spec;
for (const chunk of manifest.chunks) {
  m.completeChunk(manifest.uuid, chunk.uuid, `## ${chunk.sectionTitle}\nreal content ${Date.now()}`);
  manifest = m.loadSpec(manifest.uuid);
}

t('PS-003', 'once every real chunk is complete, manifest.status flips to complete', manifest.status === 'complete');
t('PS-004', 'the real ideaUuid survives the full build to completion — this is what the phase-sync fix reads', manifest.ideaUuid === ideaUuid);
t('PS-005', 'manifest.doneChunks equals totalChunks at real completion', manifest.doneChunks === manifest.totalChunks);

// A spec with NO ideaUuid (created directly, not idea-linked) must not
// break the fix — _syncPhaseFromManifest only emits the idea-phase event
// when manifest.ideaUuid is truthy.
const standalone = m.createSpec({ name: 'phase-sync-standalone-' + Date.now(), type: 'component' });
t('PS-006', 'a spec with no real ideaUuid has one honestly null, not a fabricated value', standalone.ideaUuid === null);

console.log(`\n  idearium-phase-sync: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
