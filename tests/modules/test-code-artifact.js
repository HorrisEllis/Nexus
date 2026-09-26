'use strict';
/**
 * tests/modules/test-code-artifact.js — guardian/lib/code-artifact.js.
 *
 * §12 brutal: every refusal path is asserted, not just the happy one —
 * a module whose whole point is "never guess" has to be proven to
 * refuse. Staging is exercised against a real temp dir via stage:false
 * plus one real intake.stage() run, so the disk write is proven, not
 * assumed.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CA = require('../../guardian/lib/code-artifact.js');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'code-artifact-'));

console.log('\n── extractCodeBlocks ──────────────────────────────────────');

t('extracts a single tagged fence with its language', () => {
  const b = CA.extractCodeBlocks('here you go:\n\n```js\nconst a = 1;\n```\n\ndone');
  assert.strictEqual(b.length, 1);
  assert.strictEqual(b[0].code, 'const a = 1;');
  assert.strictEqual(b[0].tag, 'js');
  assert.strictEqual(b[0].syntax, 'javascript');
});

t('extracts several fences in order with indices', () => {
  const b = CA.extractCodeBlocks('```py\nx=1\n```\ntext\n```js\nlet y=2\n```');
  assert.strictEqual(b.length, 2);
  assert.strictEqual(b[0].syntax, 'python');
  assert.strictEqual(b[1].syntax, 'javascript');
  assert.deepStrictEqual(b.map(x => x.index), [0, 1]);
});

t('untagged fence yields syntax null, not a guess', () => {
  const b = CA.extractCodeBlocks('```\nplain\n```');
  assert.strictEqual(b[0].syntax, null);
  assert.strictEqual(b[0].tag, null);
});

t('info string with attributes keeps only the language word', () => {
  const b = CA.extractCodeBlocks('```js title="x.js"\nconst a=1;\n```');
  assert.strictEqual(b[0].syntax, 'javascript');
  assert.strictEqual(b[0].info, 'js title="x.js"');
});

t('no fence returns empty array, never throws', () => {
  assert.deepStrictEqual(CA.extractCodeBlocks('just prose'), []);
  assert.deepStrictEqual(CA.extractCodeBlocks(null), []);
  assert.deepStrictEqual(CA.extractCodeBlocks(undefined), []);
});

t('indented fence is still found', () => {
  const b = CA.extractCodeBlocks('- item:\n  ```js\n  const a=1;\n  ```');
  assert.strictEqual(b.length, 1);
});

console.log('\n── syntax resolution ──────────────────────────────────────');

t('aliases normalize to one canonical name', () => {
  assert.strictEqual(CA.normalizeSyntax('JS'), 'javascript');
  assert.strictEqual(CA.normalizeSyntax('node'), 'javascript');
  assert.strictEqual(CA.normalizeSyntax('py'), 'python');
  assert.strictEqual(CA.normalizeSyntax('c++'), 'cpp');
});

t('unknown language is kept lowercased, not discarded', () => {
  assert.strictEqual(CA.normalizeSyntax('Brainfuck'), 'brainfuck');
});

t('extension implies syntax', () => {
  assert.strictEqual(CA.syntaxForFileName('src/a.ts'), 'typescript');
  assert.strictEqual(CA.syntaxForFileName('a.py'), 'python');
  assert.strictEqual(CA.syntaxForFileName('x.unknownext'), null);
});

console.log('\n── pickBlock ──────────────────────────────────────────────');

t('declared syntax wins over a larger block of another language', () => {
  const blocks = CA.extractCodeBlocks('```py\n' + 'x=1\n'.repeat(50) + '```\n```js\nlet y=2\n```');
  const p = CA.pickBlock(blocks, { syntax: 'js' });
  assert.strictEqual(p.matchedBy, 'syntax');
  assert.strictEqual(p.block.syntax, 'javascript');
});

t('fileName extension supplies the syntax when none declared', () => {
  const blocks = CA.extractCodeBlocks('```py\nx=1\n```\n```js\nlet y=2\n```');
  const p = CA.pickBlock(blocks, { fileName: 'a.py' });
  assert.strictEqual(p.block.syntax, 'python');
});

t('largest matching block wins inside a tier', () => {
  const blocks = CA.extractCodeBlocks('```js\na\n```\n```js\n' + 'b\n'.repeat(40) + '```');
  const p = CA.pickBlock(blocks, { syntax: 'js' });
  assert.ok(p.block.code.length > 40);
});

t('untagged fence is accepted when a syntax was wanted', () => {
  const p = CA.pickBlock(CA.extractCodeBlocks('```\nconst a=1;\n```'), { syntax: 'js' });
  assert.strictEqual(p.matchedBy, 'untagged');
});

t('wrong-language-only reply is a refusal, never a fallback', () => {
  const p = CA.pickBlock(CA.extractCodeBlocks('```py\nx=1\n```'), { syntax: 'js' });
  assert.strictEqual(p.block, null);
  assert.strictEqual(p.reason, 'syntax-mismatch');
  assert.deepStrictEqual(p.found, ['python']);
});

t('no syntax wanted at all takes the largest block', () => {
  const p = CA.pickBlock(CA.extractCodeBlocks('```\na\n```\n```\n' + 'b\n'.repeat(30) + '```'), {});
  assert.strictEqual(p.matchedBy, 'largest');
});

t('whitespace-only fences are not code', () => {
  const p = CA.pickBlock(CA.extractCodeBlocks('```js\n   \n```'), { syntax: 'js' });
  assert.strictEqual(p.reason, 'no-code-block');
});

console.log('\n── filename safety ────────────────────────────────────────');

t('absolute and climbing paths are rejected', () => {
  assert.strictEqual(CA._safeRelative('/etc/passwd'), null);
  assert.strictEqual(CA._safeRelative('../../etc/passwd'), null);
  assert.strictEqual(CA._safeRelative('a/../../b'), null);
  assert.strictEqual(CA._safeRelative('C:\\win\\x'), null);
});

t('a nested relative path is allowed', () => {
  assert.strictEqual(CA._safeRelative('src/lib/a.js'), 'src/lib/a.js');
});

console.log('\n── capture ────────────────────────────────────────────────');

t('writes the code to the declared file name', () => {
  const dir = path.join(tmp, 'c1');
  const r = CA.capture({
    job: { id: 'j1', fileName: 'src/thing.js', syntax: 'js', provider: 'claude' },
    text: 'sure:\n```js\nmodule.exports = 1;\n```',
    dir, stage: false,
  });
  assert.strictEqual(r.ok, true, r.reason);
  assert.strictEqual(r.fileName, 'src/thing.js');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'src/thing.js'), 'utf8'), 'module.exports = 1;');
  assert.strictEqual(r.syntax, 'javascript');
  assert.strictEqual(r.bytes, 'module.exports = 1;'.length);
  assert.strictEqual(r.sha256.length, 64);
});

t('a job with no fileName captures nothing and says why', () => {
  const r = CA.capture({ job: { id: 'j2' }, text: '```js\nx\n```', dir: tmp, stage: false });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'no-filename');
});

t('a reply with no code is a reported refusal, not a crash', () => {
  const r = CA.capture({ job: { id: 'j3', fileName: 'a.js' }, text: 'I would suggest...', dir: tmp, stage: false });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'no-code-block');
  assert.strictEqual(r.blockCount, 0);
});

t('python returned for a .js file is refused, and no file is written', () => {
  const dir = path.join(tmp, 'c4');
  const r = CA.capture({ job: { id: 'j4', fileName: 'a.js' }, text: '```py\nx=1\n```', dir, stage: false });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'syntax-mismatch');
  assert.strictEqual(fs.existsSync(path.join(dir, 'a.js')), false);
});

t('unsafe fileName refuses before any write', () => {
  const r = CA.capture({ job: { id: 'j5', fileName: '../escape.js' }, text: '```js\nx\n```', dir: tmp, stage: false });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'unsafe-filename');
});

t('fence tag and extension disagreeing is reported, not flattened', () => {
  const dir = path.join(tmp, 'c6');
  const r = CA.capture({ job: { id: 'j6', fileName: 'a.js' }, text: '```\nconst a=1;\n```', dir, stage: false });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.syntax, 'javascript');   // the file name is the authority
  assert.strictEqual(r.fenceSyntax, null);      // the agent claimed nothing
  assert.strictEqual(r.matchedBy, 'untagged');
});

t('the picked block is auditable (index + count + how)', () => {
  const dir = path.join(tmp, 'c7');
  const r = CA.capture({
    job: { id: 'j7', fileName: 'a.js' },
    text: '```py\nx=1\n```\n```js\nlet y=2\n```',
    dir, stage: false,
  });
  assert.strictEqual(r.blockIndex, 1);
  assert.strictEqual(r.blockCount, 2);
  assert.strictEqual(r.matchedBy, 'syntax');
});

t('capture never throws on garbage input', () => {
  assert.strictEqual(CA.capture({}).ok, false);
  assert.strictEqual(CA.capture().ok, false);
  assert.strictEqual(CA.capture({ job: { id: 'x', fileName: 'a.js' }, text: null, dir: tmp, stage: false }).ok, false);
});

t('real intake.stage() run produces a drop with the declared filename', () => {
  const dir = path.join(tmp, 'c8');
  const intakeDir = path.join(tmp, 'intake');
  process.env.NEXUS_INTAKE_DIR = intakeDir;
  delete require.cache[require.resolve('../../lib/intake.js')];
  const r = CA.capture({
    job: { id: 'j8', fileName: 'staged.js', provider: 'claude' },
    text: '```js\nconst staged = true;\n```',
    dir, stage: true,
  });
  assert.strictEqual(r.ok, true, r.reason);
  if (r.stageError) throw new Error(`staging failed: ${r.stageError}`);
  assert.ok(r.dropId, 'expected a real dropId');
  const contract = require('../../lib/intake.js').read(r.dropId);
  assert.ok(contract, 'staged contract should be readable back');
  assert.strictEqual(contract.provenance.filename, 'staged.js');
  assert.strictEqual(contract.provenance.jobId, 'j8');
});

console.log('\n── the listener, and where it is wired ────────────────────');

t('WIRE-001 onJobComplete captures and emits on a job that declared a file', () => {
  const events = [];
  const bus = { emit: (n, p) => events.push([n, p]) };
  const r = CA.onJobComplete({
    job: { id: 'w1', fileName: 'w.js', provider: 'claude' },
    text: '```js\nconst w = 1;\n```', bus,
  });
  assert.ok(r && r.ok, r && r.reason);
  // Found by NAME, not by position — two events fire now
  // (guardian.response.captured for the exchange itself, then
  // guardian.artifact.captured for the named file) and positional
  // indexing would break on any future addition.
  const cap = events.find(e => e[0] === 'guardian.artifact.captured');
  assert.ok(cap, `no artifact.captured — got ${events.map(e => e[0]).join(', ')}`);
  assert.strictEqual(cap[1].fileName, 'w.js');
});

t('WIRE-002 a job with no fileName produces no ARTIFACT (but is still recorded)', () => {
  // §CORRECTED 2026-09-20 — this used to assert "emits nothing", and it
  // kept passing after .response capture was added, for the WRONG
  // REASON: the capture was silently failing (MODULE_ID undefined) so
  // nothing was emitted either way. Found by running the real path by
  // hand instead of trusting a green suite. The real contract is
  // narrower and is what is asserted now: no fileName means no
  // file ARTIFACT, never that the exchange goes unrecorded.
  const events = [];
  const r = CA.onJobComplete({ job: { id: 'w2' }, text: '```js\nx\n```', bus: { emit: (...a) => events.push(a) } });
  assert.strictEqual(r, null, 'produced an artifact for a job that named no file');
  assert.ok(!events.find(e => e[0] === 'guardian.artifact.captured'),
    'emitted artifact.captured for a job that never asked for a file');
});

t('WIRE-006 REGRESSION: the response capture path does not silently fail', () => {
  // The exact bug above. recordAgentResponse swallows its own errors by
  // design (a capture must never cost a completion), which means a
  // programming error inside it is invisible unless something asserts
  // the success path for real.
  const r = CA.recordAgentResponse({
    job: { id: 'rec-1', provider: 'claude', prompt: 'p' },
    text: 'reply:\n```swift\nlet x = 1\n```',
    blocks: CA.extractCodeBlocks('reply:\n```swift\nlet x = 1\n```'),
  });
  assert.ok(r, 'recordAgentResponse returned null — it is failing silently again');
  assert.ok(r.responsePath && r.responsePath.endsWith('.response'), 'no .response path');
  assert.ok(r.contentHash && r.contentHash.startsWith('sha256:'), 'no content hash');
});

t('WIRE-007 the .response node on disk carries the code blocks and syntax', () => {
  const fs = require('fs'), path = require('path');
  const text = 'here:\n```swift\nlet x = 1\n```\nand:\n```py\nx=1\n```';
  const r = CA.recordAgentResponse({
    job: { id: 'rec-2', provider: 'claude', fileName: 'a.swift', syntax: 'swift' },
    text, blocks: CA.extractCodeBlocks(text),
  });
  assert.ok(r, 'no record written');
  const { ensureCompartment } = require('../../clear-glass/src/downloads/artifact-chat-index.js');
  const { createHost } = require('../../cos/host/index.js');
  const c = ensureCompartment(createHost());
  const root = c.fs?.root || c.root;
  const node = JSON.parse(fs.readFileSync(path.join(root, r.responsePath), 'utf8'));
  assert.strictEqual(node.kind, 'chat');
  assert.strictEqual(node.raw.codeBlockCount, 2);
  assert.deepStrictEqual(node.raw.codeBlocks.map(b => b.syntax), ['swift', 'python']);
  assert.deepStrictEqual(node.raw.codeBlocks.map(b => b.ext), ['.swift', '.py']);
  assert.strictEqual(node.raw.declaredFileName, 'a.swift');
  assert.strictEqual(node.raw.response, text, 'the full reply is the source of truth and must be kept');
});

t('WIRE-008 a missing SQLite index does NOT lose the response', () => {
  // better-sqlite3 is an optional dependency and is genuinely absent
  // here, which is the real state of the target machine. The .response
  // file is the source of truth; the index is disposable. Before this
  // pass recordResponse threw in exactly this situation, AFTER writing
  // the file — losing a successful capture to an unavailable accelerator.
  const r = CA.recordAgentResponse({
    job: { id: 'rec-3', provider: 'claude' },
    text: '```js\nconst a=1;\n```',
    blocks: CA.extractCodeBlocks('```js\nconst a=1;\n```'),
  });
  assert.ok(r, 'the capture was lost when the index was unavailable');
  assert.ok(r.responsePath, 'no source-of-truth file');
  // indexed may be true or false depending on the environment — what
  // must never happen is the whole capture being lost. If it is false,
  // the reason has to be reported rather than swallowed.
  if (r.indexed === false) assert.ok(r.indexError, 'index failed with no reported reason');
});

t('WIRE-003 a refusal emits guardian.artifact.refused with its reason', () => {
  const events = [];
  const r = CA.onJobComplete({
    job: { id: 'w3', fileName: 'a.js' }, text: 'no code here',
    bus: { emit: (n, p) => events.push([n, p]) },
  });
  assert.strictEqual(r.ok, false);
  const ref = events.find(e => e[0] === 'guardian.artifact.refused');
  assert.ok(ref, `no artifact.refused — got ${events.map(e => e[0]).join(', ')}`);
  assert.strictEqual(ref[1].reason, 'no-code-block');
});

t('WIRE-004 a throwing bus never costs the capture', () => {
  const r = CA.onJobComplete({
    job: { id: 'w4', fileName: 'b.js' }, text: '```js\nconst b=1;\n```',
    bus: { emit: () => { throw new Error('bus down'); } },
  });
  assert.ok(r && r.ok, 'a bus failure swallowed the artifact');
});

t('WIRE-005 an unclosed fence is its own reason, not no-code-block', () => {
  const r = CA.onJobComplete({ job: { id: 'w5', fileName: 'c.js' }, text: '```js\nconst c = 1;' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'unclosed-fence');
});

t('WIRE-010 every real completion point calls the shared listener', () => {
  // The gap this closes was "capture() is wired into exactly one of
  // guardian's completion paths." Asserting the wiring structurally is
  // the only way that claim stays true — a future edit that drops one
  // of these fails here rather than silently producing no artifact.
  const fs = require('fs'), path = require('path');
  const R = path.join(__dirname, '../..');
  const sites = [
    ['guardian/lib/ncp-handler.js', 1],
    ['guardian/lib/provider-routing.js', 2],
    ['guardian/server.js', 1],
  ];
  for (const [rel, count] of sites) {
    const src = fs.readFileSync(path.join(R, rel), 'utf8');
    const n = (src.match(/onJobComplete\(/g) || []).length;
    assert.strictEqual(n, count, `${rel}: expected ${count} onJobComplete call(s), found ${n}`);
  }
});

t('WIRE-011 the browser-command path is deliberately NOT wired', () => {
  // dispatcher.js completes with JSON.stringify(result.result) from a
  // browser action — structured data, not an agent's chat reply. Wiring
  // it for symmetry would only ever produce refusals.
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../../guardian/lib/dispatcher.js'), 'utf8');
  assert.ok(!src.includes('onJobComplete'), 'dispatcher.js was wired — see the note in code-artifact.js');
});

console.log('\n── captureAll: every block, not just the declared one ────');

const allTmp = fs.mkdtempSync(path.join(tmp, 'all-'));
const MULTI = 'First:\n```js src/a.js\nconst a=1;\n```\nThen:\n```swift\nlet x=1\n```\nAnd:\n```py\nx=1\n```\nPlain:\n```\njust text\n```';

t('ALL-001 every fenced block becomes a real file', () => {
  const dir = path.join(allTmp, 'a1');
  const r = CA.captureAll({ job: { id: 'a1', fileName: 'src/a.js', syntax: 'js' }, text: MULTI, dir, stage: false });
  assert.strictEqual(r.blockCount, 4);
  assert.strictEqual(r.captured, 4, 'blocks were discarded — the exact gap this closes');
  for (const b of r.blocks) assert.ok(fs.existsSync(b.path), `${b.fileName} not on disk`);
});

t('ALL-002 each block keeps its OWN syntax', () => {
  const dir = path.join(allTmp, 'a2');
  const r = CA.captureAll({ job: { id: 'a2' }, text: MULTI, dir, stage: false });
  assert.deepStrictEqual(r.blocks.map(b => b.syntax), ['javascript', 'swift', 'python', null]);
  assert.deepStrictEqual(r.blocks.map(b => b.ext), ['.js', '.swift', '.py', null]);
});

t('ALL-003 the job-declared name goes to the block that matches it', () => {
  const dir = path.join(allTmp, 'a3');
  const r = CA.captureAll({ job: { id: 'a3', fileName: 'src/a.js', syntax: 'js' }, text: MULTI, dir, stage: false });
  const d = r.blocks.find(b => b.nameSource === 'job-declared');
  assert.ok(d, 'no block took the declared name');
  assert.strictEqual(d.fileName, 'src/a.js');
  assert.strictEqual(d.derivedName, false);
  assert.strictEqual(r.blocks.filter(b => b.nameSource === 'job-declared').length, 1,
    'more than one block claimed the declared name');
});

t('ALL-004 a path stated in the fence is USED, and marked as the agent\'s', () => {
  // Was an open question at ship time. An agent naming its own file is
  // real evidence; the job's declared name still outranks it.
  const dir = path.join(allTmp, 'a4');
  const text = '```js lib/one.js\nconst a=1;\n```\n```js lib/two.js\nconst b=2;\n```';
  const r = CA.captureAll({ job: { id: 'a4' }, text, dir, stage: false });
  const names = r.blocks.map(b => b.fileName);
  assert.ok(names.includes('lib/one.js') && names.includes('lib/two.js'), `got ${names.join(', ')}`);
  assert.ok(r.blocks.every(b => b.nameSource === 'fence-declared'));
  assert.ok(r.blocks.every(b => b.derivedName === false));
});

t('ALL-005 an invented name is MARKED invented, never passed off as stated', () => {
  const dir = path.join(allTmp, 'a5');
  const r = CA.captureAll({ job: { id: 'a5' }, text: MULTI, dir, stage: false });
  const derived = r.blocks.filter(b => b.derivedName);
  assert.ok(derived.length >= 3);
  for (const b of derived) {
    assert.strictEqual(b.nameSource, 'derived');
    assert.ok(b.fileName.startsWith('block-'), b.fileName);
  }
});

t('ALL-006 an unknown language gets NO extension rather than a guessed one', () => {
  const dir = path.join(allTmp, 'a6');
  const r = CA.captureAll({ job: { id: 'a6' }, text: '```\nplain\n```', dir, stage: false });
  assert.strictEqual(r.blocks[0].ext, null);
  assert.strictEqual(r.blocks[0].fileName, 'block-0');
});

t('ALL-007 a fence path that escapes its directory is refused, not written', () => {
  const dir = path.join(allTmp, 'a7');
  const r = CA.captureAll({ job: { id: 'a7' }, text: '```js ../escape.js\nconst a=1;\n```', dir, stage: false });
  assert.ok(!r.blocks[0].fileName.includes('..'), `unsafe name accepted: ${r.blocks[0].fileName}`);
  assert.strictEqual(r.blocks[0].derivedName, true);
});

t('ALL-008 no code is an honest reason, and an unclosed fence its own', () => {
  assert.strictEqual(CA.captureAll({ job: { id: 'a8' }, text: 'prose', stage: false }).reason, 'no-code-block');
  assert.strictEqual(CA.captureAll({ job: { id: 'a8b' }, text: '```js\nx', stage: false }).reason, 'unclosed-fence');
});

t('ALL-009 every block stages through the real intake gate', () => {
  const dir = path.join(allTmp, 'a9');
  process.env.NEXUS_INTAKE_DIR = path.join(allTmp, 'intake9');
  delete require.cache[require.resolve('../../lib/intake.js')];
  const r = CA.captureAll({ job: { id: 'a9', provider: 'claude' }, text: MULTI, dir, stage: true });
  const staged = r.blocks.filter(b => b.dropId);
  assert.strictEqual(staged.length, r.captured, `only ${staged.length}/${r.captured} staged`);
  const contract = require('../../lib/intake.js').read(staged[0].dropId);
  assert.strictEqual(contract.provenance.jobId, 'a9');
  assert.ok('blockIndex' in contract.provenance, 'block index not carried into provenance');
});

console.log(`\n${fail === 0 ? '✓' : '✗'} code-artifact: ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
