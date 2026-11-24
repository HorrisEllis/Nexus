// written by Nexus from the phase's examples (lib/test-first.js fromExamples): no model
import assert from 'node:assert';
import { autocorrect } from '../autocorrect.js';

assert.deepStrictEqual(autocorrect("let x = 1"), { body: "let x = 1", fixes: [] });
assert.deepStrictEqual(autocorrect("if !x { y }"), { body: "if not x { y }", fixes: ["!"] });
assert.deepStrictEqual(autocorrect("a != b"), { body: "a != b", fixes: [] });
assert.deepStrictEqual(autocorrect("a && b"), { body: "a and b", fixes: ["&&"] });
assert.deepStrictEqual(autocorrect("a || b"), { body: "a or b", fixes: ["||"] });
assert.deepStrictEqual(autocorrect("a === b"), { body: "a == b", fixes: ["==="] });
assert.deepStrictEqual(autocorrect("a !== b"), { body: "a != b", fixes: ["!=="] });
assert.deepStrictEqual(autocorrect("let x = 1;"), { body: "let x = 1", fixes: [";"] });
assert.deepStrictEqual(autocorrect("a && !b;"), { body: "a and not b", fixes: ["&&", "!", ";"] });
assert.deepStrictEqual(autocorrect("say \"a && b\""), { body: "say \"a && b\"", fixes: [] });
console.log('ok');
