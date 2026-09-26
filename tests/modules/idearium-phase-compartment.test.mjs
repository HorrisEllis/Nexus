// tests/modules/idearium-phase-compartment.test.mjs — James: "clicking on
// idearium phase to building does nothing, needs to change for the
// compartment... we need a compartment specifically made for idearium."
//
// Real chain proven here, no mocks: IdeaOS.emit('idearium.idea.phase',
// {phase:'building'}) really flips idea.phase (already worked before this
// fix); classify()+freeze()+spawn() (the same real fix wired into
// idearium/api/index.js's idea.phase route) really produces a real
// compartment for that idea's own real text; the idea's real `compartment`
// field (already an IdeaUpdateGate-allowed field, previously never
// populated by anything) really gets set to that real compartment's id.
// §SANDBOX 2026-09-25 — this test starts real NEXUS processes; they inherit a throwaway data root from here (lib/test-sandbox.js).
import { createRequire as __sandboxRequire } from 'module';
__sandboxRequire(import.meta.url)('../../lib/test-sandbox.js').ensure();
import assert from 'assert';
const { IdeaOS } = await import('../../idearium/index.js');
const { classify, freeze } = await import('../../lib/intent-classifier.js');
const { spawn } = await import('../../lib/compartment-engine.js');

let passed = 0, failed = 0;
const t = (id, name, cond) => { if (cond) { passed++; console.log(`  ✓ ${id} ${name}`); } else { failed++; console.log(`  ✗ ${id} ${name}`); } };

const os = new IdeaOS();
os.emit('idearium.idea.create', { text: 'build a rate limiter for the guardian API', tags: ['test'], source: 'test' });
const idea = os.db.ideas[os.db.ideas.length - 1];

t('IPC-001', 'a freshly created idea has no compartment yet', !idea.compartment);
t('IPC-002', 'a freshly created idea starts at phase seed', idea.phase === 'seed');

// The exact real chain idearium/api/index.js's idea.phase route now runs
// when phase transitions to 'building' with no existing compartment.
const { intent } = classify({ text: idea.text, source: 'idearium-idea-phase' });
const compartment = await spawn({ intent: freeze(intent) });

t('IPC-003', 'classify() produces a real intent from the idea\'s own text', intent.raw === idea.text);
t('IPC-004', 'spawn() produces a real, running compartment', compartment.status === 'RUNNING');
t('IPC-005', 'the compartment\'s intent_uuid traces back to the real classified intent', compartment.intent_uuid === intent.uuid);

os.emit('idearium.idea.phase', { uuid: idea.uuid, phase: 'building', source: 'test' });
os.emit('idearium.idea.update', { uuid: idea.uuid, fields: { compartment: compartment.id }, source: 'test' });

const updated = os.idea(idea.uuid);
t('IPC-006', 'the idea\'s phase really changed to building', updated.phase === 'building');
t('IPC-007', 'the idea\'s real compartment field is now set to the real compartment id', updated.compartment === compartment.id);

console.log(`\n  idearium-phase-compartment: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
