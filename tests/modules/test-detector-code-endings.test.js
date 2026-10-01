'use strict';
/**
 * tests/modules/test-detector-code-endings.test.js — 0.39.284. James's log: every code chunk of a new spec ended
 * "exceeded outer wall-clock attempt cap" — each Ollama reply refused by lib/seam/detector.js as mid_sentence_end,
 * because code ends in } ; or a closing ``` fence. A complete code reply passes; a truly cut-off one still does not;
 * the failure names the check's reason.
 */
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '../..');
const { Detector } = require(path.join(ROOT, 'lib/seam/detector.js'));
let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };
console.log('\ntest-detector-code-endings\n');
const p = { minResponseChars: 40, hasSeamContract: false, keywords: [] };
const fn = 'function addNode(id, node) {\n  state.graph.set(id, node);\n  return node;\n}';
check('DC-01 a fenced code reply (closed ```) is complete', !Detector.truncation('```js src/graph.js\n' + fn + '\n```', p).truncated);
check('DC-02 bare code ending in } or ; is complete', !Detector.truncation(fn, p).truncated && !Detector.truncation(fn + '\nmodule.exports = { addNode };', p).truncated);
check('DC-03 prose cut off mid-sentence is still caught', Detector.truncation('The graph module adds nodes and then it goes on to', p).reason === 'mid_sentence_end');
check('DC-04 an unclosed fence followed by prose is still caught', Detector.truncation('```js\n' + fn + '\n```\nand then the next part', p).truncated);
const cd = fs.readFileSync(path.join(ROOT, 'idearium/spec-engine/chunk-dispatch.js'), 'utf8');
check('DC-05 the cap failure names the last check (detection.summary)', /last check: \$\{comp\.detection\.summary\}/.test(cd));
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
