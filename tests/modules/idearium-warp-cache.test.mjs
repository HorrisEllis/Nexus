// idearium-warp-cache — Phase 2: WARP's exact cache is in the real build path.
// UUID: idearium-warp-cache-test-v1-0000-2026-0709-jamesbrooks-001
//
// Before this wire, idearium's production build called as.buildChunkWithAgent()
// directly. warp-build-dispatch.js had ZERO consumers and could not even be
// imported (it named an export chunk-dispatch.js never made). Every chunk paid
// full tokens, every time, forever. These tests fail if that regresses.
import assert from 'assert';
import { createWarpChunkDispatch } from '../../idearium/spec-engine/warp-build-dispatch.js';

let passed = 0, failed = 0;
const test = (id, name, fn) => { try { fn(); passed++; console.log(`  ✓ ${id} ${name}`); } catch (e) { failed++; console.log(`  ✗ ${id} ${name}\n    ${e.message}`); } };

let agentCalls = 0;
const as = { buildChunkWithAgent: async () => { agentCalls++; return { ok: true, text: '## Purpose\nreal', agent: 'ollama' }; } };
const dispatch = createWarpChunkDispatch(as, {});
const P = 'Write the Purpose section for test spec ' + Date.now(); // unique per run: cache file persists

const a = await dispatch(P, { chunkTitle: 'Purpose' });
const b = await dispatch(P, { chunkTitle: 'Purpose' });
const c = await dispatch(P + ' DIFFERENT', { chunkTitle: 'Purpose' });

test('T-001', 'cold build generates via the agent', () => { assert.strictEqual(a.source, 'generated'); assert.strictEqual(a.cacheHit, false); });
test('T-002', 'identical prompt is served from the exact cache', () => { assert.strictEqual(b.source, 'crystal'); assert.strictEqual(b.cacheHit, true); });
test('T-003', 'a cache hit costs zero', () => assert.strictEqual(b.cost, 0));
test('T-004', 'cache hit returns the identical text, not a regeneration', () => assert.strictEqual(a.text, b.text));
test('T-005', 'a different prompt does NOT hit (no wrong-output cache hit)', () => { assert.strictEqual(c.cacheHit, false); assert.notStrictEqual(a.digest, c.digest); });
test('T-006', 'only unique prompts reach the agent', () => assert.strictEqual(agentCalls, 2));
test('T-007', 'provenance survives the verification wrapper', () => assert.ok(b.digest && typeof b.source === 'string'));

console.log(`\n  idearium-warp-cache: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
