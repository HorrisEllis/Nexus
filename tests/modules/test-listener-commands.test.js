'use strict';
/**
 * tests/modules/test-listener-commands.test.js — 0.59.4. James: "No I mean just using the capture. Like open the chat url.
 * In general. Use the listener to have you use a command."
 * A Guardian listener with the link target "Run Nexus commands": the command lines in what it hears run through the one
 * command tool — once each, the person's rows refused, prose left alone.
 */
const assert = require('assert');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const LC = require(path.join(ROOT, 'lib/listener-commands.js'));
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.stack}`); failed++; } }

(async () => {
  await test('LC-01', 'command lines are found: nexus> …, a ```nexus block, idearium … — prose is not', async () => {
    const t = 'Here is what I will run.\nnexus> census --limit 5\nIdearium works end to end now.\n```nexus\nfield point 3 click\n# a comment\n```\nidearium dump "a gig that builds booking sites"\nnot a command: nexus> inline in a sentence';
    assert.deepStrictEqual(LC.commandLines(t), [{ line: 'field point 3 click', explicit: true }, { line: 'census --limit 5', explicit: true }, { line: 'dump "a gig that builds booking sites"', explicit: false }]);
  });
  await test('LC-02', 'parse: the longest command name wins; flags and quoted words kept', async () => {
    const keys = ['field', 'field point', 'dump', 'census'];
    assert.deepStrictEqual(LC.parse('field point 3 click --via eros', keys), { command: 'field point', args: ['3', 'click'], flags: { via: 'eros' } });
    assert.deepStrictEqual(LC.parse('dump "two words" --lines', keys), { command: 'dump', args: ['two words'], flags: { lines: true } });
    assert.ok(LC.parse('fly away', keys).error);
  });
  await test('LC-03', 'a streaming reply heard many times runs each command once; prose "idearium …" with no command says nothing', async () => {
    const runs = [], said = [];
    const tool = { execute: async (i) => i.action === 'list' ? { commands: [{ command: 'census' }, { command: 'dump' }] } : (runs.push(i), { command: i.command, result: { text: 'ok' } }) };
    const R = LC.createRunner({ tool, onResult: (r) => said.push(r) });
    await R.hear('L1', 'nexus> census');
    await R.hear('L1', 'nexus> census\nmore text streaming');
    await R.hear('L1', 'nexus> census\nmore text streaming\nidearium is great');
    assert.strictEqual(runs.length, 1);
    assert.strictEqual(said.length, 1, 'the prose line was not reported');
    await R.hear('L2', 'nexus> census');
    assert.strictEqual(runs.length, 2, 'another listener is its own');
    await R.hear('L1', 'nexus> flyaway');
    assert.ok(/no Nexus command/.test(said[said.length - 1].error), 'an explicit unknown command is said');
  });
  await test('LC-04', 'through the real command tool: a person-only row is refused with the reason', async () => {
    const R = LC.createRunner({});
    const [r] = await R.hear('L9', 'nexus> access new tablet');
    assert.ok(r.refused && /person/.test(r.reason), JSON.stringify(r));
    assert.ok(/✗/.test(LC.summary(r)));
  });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
