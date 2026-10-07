'use strict';
// tests/modules/test-registry-harness.test.js — 0.39.266.
// James: "use the component registry as the wiring harness like loom does for nexus, that way it makes the registry a
// map and event bus, so chunks can have minial context" · "it's meant to make small llms capable of building entire
// codebases regardless of the size … thats way too much to inject when we have tools they can use to get context."
// Measured before: a 60-char question sent 22,269 chars; its 4 "matching" chunks were the wrong files.
//
//   RH-001  loom's scanner records events: emits/listens per file, emit→listen wires only where both sides exist
//   RH-002  an ordinary repo: card from its graph (requires / requiredBy / events / tests), found by path or basename
//   RH-003  find: components by path, events by name, and words in the code (code lines outrank comments)
//   RH-004  read: numbered line ranges, capped, says what is left
//   RH-005  namedIn: the component a question names (for the one card a prompt carries)
//   RH-006  the first message: harness scope lists the codebase tools + loom.find + one line of groups, carries a card,
//           no code, < 3,000 chars (0.39.273; was the five loom tools)
//   RH-007  the harness tools register, and find answers for tools (the browser is one find away)
require('../../lib/test-sandbox.js').ensure();

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-test-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} });

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${name}\n    ${e.stack}`); failed++; }
}

async function main() {
  const SM = require('../../loom/scanners/source-map.js');
  const H = require('../../lib/registry-harness.js');

  await test('RH-001', 'loom\'s scanner records events; wires only where both sides exist', () => {
    assert.deepStrictEqual(SM.eventsOf(SM.stripNonCode(
      "bus.emit('repo.saved', x);\n  // bus.emit('in.a.comment')\nstream.emit(new Event('sql.parse')); s.on('data', f); b.on('guardian.job.complete', g); const G = { signature: 'sql.plan' };")),
      { emits: ['repo.saved', 'sql.parse'], listens: ['guardian.job.complete', 'sql.plan'] });
    const declared = [];
    const driver = { declare: (kind, p) => { declared.push([kind, p]); return { ok: true }; } };
    const FILES = [
      ['a.js', 'nexus.a', [], { emits: ['x.done', 'only.emitted'], listens: [] }],
      ['b.js', 'nexus.b', [], { emits: [], listens: ['x.done'] }],
      ['c.js', 'nexus.c', [], { emits: ['self.loop'], listens: ['self.loop'] }],
    ];
    const r = SM.mapSource(driver, FILES);
    assert.deepStrictEqual(r.eventWires.map(w => [w.event, w.from, w.to]), [['x.done', 'nexus.a', 'nexus.b']]);
    assert.deepStrictEqual(r.eventHooks.map(h => h.id).sort(), ['nexus.a.emit.x.done', 'nexus.b.on.x.done'], 'no hook for one-sided or self events (no dangling hooks)');
    const em = SM.eventMap(FILES);
    assert.deepStrictEqual(em.byEvent['only.emitted'], { emitters: ['nexus.a'], listeners: [] }, 'one-sided events still in the map');
  });

  // an ordinary repo, as the idearium import pipeline leaves it: files + graph.json
  const repoDir = path.join(TMP, 'repo');
  const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(repoDir, rel)), { recursive: true }); fs.writeFileSync(path.join(repoDir, rel), text); };
  w('src/store.js', "/**\n * store.js — keeps rows on disk and hands out a lock for each flush.\n */\nconst lock = require('./lock');\nfunction flushTable(t) { return lock.acquireFlushLock(t); }\nbus.emit('store.flushed', {});\nmodule.exports = { flushTable };\n");
  w('src/lock.js', "// the flush lock\nfunction acquireFlushLock(t) { return true; }\nmodule.exports = { acquireFlushLock };\n");
  w('src/api.js', "const store = require('./store');\nbus.on('store.flushed', () => {});\n" + Array.from({ length: 300 }, (_, i) => `// line ${i}`).join('\n') + '\n');
  w('tests/store.test.js', "const store = require('../src/store');\n");
  w('src/notes.js', "// TODO: document the flush lock\nmodule.exports = {};\n");
  const edge = (from, to) => ({ resolution: 'resolved', from: `file:${from}`, to: `file:${to}` });
  fs.writeFileSync(path.join(repoDir, 'graph.json'), JSON.stringify({
    nodes: ['src/store.js', 'src/lock.js', 'src/api.js', 'tests/store.test.js', 'src/notes.js'].map(f => ({ id: `file:${f}`, kind: 'file', file: f })),
    edges: [edge('src/store.js', 'src/lock.js'), edge('src/api.js', 'src/store.js'), edge('tests/store.test.js', 'src/store.js')],
  }));
  const idx = H.indexFor({ uuid: 'r1' }, repoDir);

  await test('RH-002', 'an ordinary repo\'s card: wiring, events, tests, purpose', () => {
    const c = H.card(idx, 'store.js');
    assert.strictEqual(c.file, 'src/store.js');
    assert.match(c.purpose, /keeps rows on disk/);
    assert.deepStrictEqual(c.exports, ['flushTable']);
    assert.deepStrictEqual(c.requires, ['src/lock.js']);
    assert.deepStrictEqual(c.requiredBy, ['src/api.js']);
    assert.deepStrictEqual(c.tests, ['tests/store.test.js']);
    assert.deepStrictEqual(c.emits, [{ event: 'store.flushed', heardBy: ['src/api.js'] }]);
    assert.ok(JSON.stringify(c).length < 800, 'a card is small');
  });

  await test('RH-003', 'find: paths, events, and words in the code (code before comments)', () => {
    assert.strictEqual(H.find(idx, 'lock', { kind: 'component' }).results[0].file, 'src/lock.js');
    assert.deepStrictEqual(H.find(idx, 'store.flushed', { kind: 'event' }).results[0], { kind: 'event', id: 'store.flushed', why: '1 emitter(s), 1 listener(s)' });
    const t = H.find(idx, 'flush lock', { kind: 'text' }).results.map(x => x.file);
    assert.deepStrictEqual(t.slice(0, 2).sort(), ['src/lock.js', 'src/store.js'], 'files with the words in CODE first');
    assert.strictEqual(t[t.length - 1], 'src/notes.js', 'a file that only mentions it in a comment ranks last');
  });

  await test('RH-004', 'read: numbered ranges, capped, says what is left', () => {
    const r = H.read(idx, 'src/api.js', { start: 1 });
    assert.strictEqual(r.start, 1); assert.strictEqual(r.end, H.READ_MAX_LINES);
    assert.match(r.text, /^1\tconst store/);
    assert.match(r.more, /read again with start=201/);
    const tail = H.read(idx, 'src/api.js', { start: 290 });
    assert.strictEqual(tail.more, null);
    assert.match(H.read(idx, 'nope.js').error, /use find first/);
  });

  await test('RH-005', 'namedIn: what a question names', () => {
    assert.deepStrictEqual(H.namedIn(idx, 'add a retry limit to the flush lock in src/lock.js please').map(x => x.file), ['src/lock.js']);
    assert.deepStrictEqual(H.namedIn(idx, 'how does it work?'), []);
  });

  await test('RH-006', 'the first message: the codebase tools listed, a card, no code, < 3,000 chars', () => {
    const RA = require('../../lib/repo-agent.js');
    const U = `rh-${Date.now()}`;
    const repo = { uuid: U, name: 'rh' };
    assert.strictEqual(RA.getToolScope(U), 'harness');
    const ctx = RA.contextFor({ repo, repoDir, message: 'add a retry limit to the flush lock in src/lock.js' });
    assert.strictEqual(ctx.kind, 'card');
    assert.match(ctx.block, /^src\/lock\.js {2}\(src\/lock\.js, \d+ lines\)/);
    const text = RA.fillListedTools(RA.compose({ hat: null, message: 'add a retry limit to the flush lock in src/lock.js', context: ctx, repoUuid: U, backend: 'guardian' }), U);
    // 0.39.273 — the codebase tools replace loom.read / loom.write in the LIST (both still allowed); loom.find stays
    assert.match(text, /Available tools: idearium\.code_map\.tool, idearium\.code_search\.tool, idearium\.code_chunk\.tool, idearium\.code_read\.tool, idearium\.code_edit\.tool, idearium\.code_write\.tool, idearium\.code_check\.tool, loom\.find\.tool/);
    assert.match(text, /work_surface \(see \+ prove your changes\)/, 'the work surface is named (0.39.362 WS1), within the budget');
    assert.match(text, /Also: idearium\.code_grep\.tool/);
    // 0.39.278 — the other tools are reached as layers (nexus.tools.tool lists the categories), or found with loom.find
    assert.match(text, /More tools: nexus\.tools\.tool → nexus\.tools_expand\.tool .*, or loom\.find\.tool kind "tool"/);
    assert.ok(!/function acquireFlushLock/.test(text), 'no code in the first message');
    assert.ok(!/\{tools\}|\{tool_guide\}/.test(text));
    assert.ok(text.length < 3000, `first message ${text.length} chars`);
    assert.strictEqual(RA.scopeFor(U, null), 'all', 'every tool is still allowed');
  });

  await test('RH-007', 'the harness tools register; find answers for tools', async () => {
    const AT = require('../../lib/agent-tools/index.js');
    for (const n of ['loom.find.tool', 'loom.card.tool', 'loom.read.tool', 'loom.write.tool', 'loom.test.tool']) assert.ok(AT.TOOLS.has(n), n);
    const r = await AT.TOOLS.get('loom.find.tool').execute({ query: 'browser', kind: 'tool' }, { context: null });
    assert.ok(r.results.some(x => x.id === 'browser_action'), JSON.stringify(r.results.slice(0, 3)));
    assert.ok(r.results.every(x => x.kind === 'tool'));
    const none = await AT.TOOLS.get('loom.card.tool').execute({ id: 'x' }, { context: null });
    assert.match(none.error, /no repo/);
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
