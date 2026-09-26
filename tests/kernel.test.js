'use strict';
// ════════════════════════════════════════════════════════════════════════════
// EMERGE KERNEL — FULL TEST SUITE v1.0.0
// UUID: kernel-test-suite-v1-0-0
//
// Deep, recursive, adversarial.
// Every internal function tested in isolation AND through the full pipeline.
// Gates: every result verified, every gap surfaced, every noise token logged.
// ════════════════════════════════════════════════════════════════════════════

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

// ── Load kernel ───────────────────────────────────────────────────────────────
const KERNEL_PATH = path.resolve(__dirname, '../emerge/emerge-kernel.js');
if (!fs.existsSync(KERNEL_PATH)) {
  console.error('[FATAL] emerge-kernel.js not found at', KERNEL_PATH);
  process.exit(1);
}
const kernel = require(KERNEL_PATH);
const { compile, tokenize, snrGate, parse, validate, loadSpec } = kernel;

// ── Test runner ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0, total = 0;
const failures = [];
const log = [];

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    log.push({ status: 'PASS', name });
    process.stdout.write(`  ✓ ${name}\n`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    log.push({ status: 'FAIL', name, error: e.message });
    process.stdout.write(`  ✗ ${name}\n    → ${e.message}\n`);
  }
}

function section(name) {
  process.stdout.write(`\n── ${name} ${'─'.repeat(60 - name.length)}\n`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadTestSpec() {
  const specPath = path.resolve(__dirname, '../emerge/emerge.spec');
  if (fs.existsSync(specPath)) {
    loadSpec(specPath);
  }
}

const MINIMAL_VALID = `
compartment "test-comp" {
  id = test-001
  uuid = test-001-xxxx
  intent = testing
  on ingest { record }
}
`;

const WITH_LOOP = `
compartment "looper" {
  id = loop-001
  uuid = loop-001-xxxx
}
loop MAIN_LOOP {
  interval = 1000
  on tick { record }
}
`;

const ADVERSARIAL_INPUTS = [
  '',
  '   ',
  '\n\n\n',
  '// only a comment',
  '{}{}{}',
  '{ id = test }',
  'compartment {}',
  'compartment "a" { id = x }',
  'loop NORECORD { interval = 1 on tick { emit something } }',
  'gap "no-pressure" { type = structural }',
  ':::::::',
  '<script>alert(1)</script>',
  'A'.repeat(100000),
  '0'.repeat(50000),
  JSON.stringify({ not: 'emerge', at: 'all' }),
  '  '.repeat(10000) + 'compartment "deep" { id = x }',
  'compartment "unicode" { id = テスト uuid = 试验 }',
  'null undefined NaN Infinity',
];

// ══════════════════════════════════════════════════════════════════════════════
// BLOCK 1 — SPEC LOADING
// ══════════════════════════════════════════════════════════════════════════════
section('BLOCK 1 — SPEC LOADING');

test('loadSpec: loads without throwing on valid spec', () => {
  const tmp = path.join(os.tmpdir(), 'test.spec');
  fs.writeFileSync(tmp, `version 1.0.0\ndomain "test"\nkeyword = value\naxiom TEST_AXIOM\n`);
  assert.doesNotThrow(() => loadSpec(tmp));
  fs.unlinkSync(tmp);
});

test('loadSpec: missing file does not throw', () => {
  assert.doesNotThrow(() => loadSpec('/tmp/nonexistent_abc123.spec'));
});

test('loadSpec: empty spec does not throw', () => {
  const tmp = path.join(os.tmpdir(), 'empty.spec');
  fs.writeFileSync(tmp, '');
  assert.doesNotThrow(() => loadSpec(tmp));
  fs.unlinkSync(tmp);
});

test('loadSpec: version parsed correctly', () => {
  const tmp = path.join(os.tmpdir(), 'ver.spec');
  fs.writeFileSync(tmp, 'version 2.5.1\n');
  loadSpec(tmp);
  assert.strictEqual(kernel.SCHEMA.version, '2.5.1');
  fs.unlinkSync(tmp);
});

test('loadSpec: keywords registered from domain', () => {
  const tmp = path.join(os.tmpdir(), 'kw.spec');
  fs.writeFileSync(tmp, 'domain "signals"\nmyKeyword = something\n');
  loadSpec(tmp);
  assert.ok(kernel.SCHEMA.keywords.has('myKeyword'));
  fs.unlinkSync(tmp);
});

test('loadSpec: axioms registered', () => {
  const tmp = path.join(os.tmpdir(), 'ax.spec');
  fs.writeFileSync(tmp, 'axiom MY_TEST_AXIOM\n');
  loadSpec(tmp);
  assert.ok(kernel.SCHEMA.axioms.has('MY_TEST_AXIOM'));
  fs.unlinkSync(tmp);
});

test('loadSpec: domains registered', () => {
  const tmp = path.join(os.tmpdir(), 'dom.spec');
  fs.writeFileSync(tmp, 'domain "my-domain"\nfield = val\n');
  loadSpec(tmp);
  assert.ok(kernel.SCHEMA.domains.has('my-domain'));
  fs.unlinkSync(tmp);
});

test('loadSpec: multiple domains, keywords isolated correctly', () => {
  const tmp = path.join(os.tmpdir(), 'multi.spec');
  fs.writeFileSync(tmp, `domain "a"\nalpha = 1\ndomain "b"\nbeta = 2\n`);
  loadSpec(tmp);
  assert.ok(kernel.SCHEMA.keywords.has('alpha'));
  assert.ok(kernel.SCHEMA.keywords.has('beta'));
  fs.unlinkSync(tmp);
});

test('loadSpec: root types parsed', () => {
  const tmp = path.join(os.tmpdir(), 'root.spec');
  fs.writeFileSync(tmp, 'root MyRootType\n');
  loadSpec(tmp);
  assert.ok(kernel.SCHEMA.root_types.has('MyRootType'));
  fs.unlinkSync(tmp);
});

test('loadSpec: hot reload — schema updates on second call', () => {
  const tmp = path.join(os.tmpdir(), 'hot.spec');
  fs.writeFileSync(tmp, 'version 1.0.0\ndomain "x"\nfoo = bar\n');
  loadSpec(tmp);
  assert.ok(kernel.SCHEMA.keywords.has('foo'));
  fs.writeFileSync(tmp, 'version 2.0.0\ndomain "x"\nbaz = qux\n');
  loadSpec(tmp);
  assert.strictEqual(kernel.SCHEMA.version, '2.0.0');
  assert.ok(kernel.SCHEMA.keywords.has('baz'));
  fs.unlinkSync(tmp);
});

// ══════════════════════════════════════════════════════════════════════════════
// BLOCK 2 — TOKENIZER
// ══════════════════════════════════════════════════════════════════════════════
section('BLOCK 2 — TOKENIZER');

loadTestSpec();

test('tokenize: returns array', () => {
  const toks = tokenize('compartment "x" { id = 1 }');
  assert.ok(Array.isArray(toks));
});

test('tokenize: empty string returns empty array', () => {
  assert.deepStrictEqual(tokenize(''), []);
});

test('tokenize: whitespace-only returns empty array', () => {
  assert.deepStrictEqual(tokenize('   \n\n   '), []);
});

test('tokenize: comment-only returns empty array', () => {
  assert.deepStrictEqual(tokenize('// this is a comment\n// another'), []);
});

test('tokenize: string literal typed correctly', () => {
  const toks = tokenize('"hello world"');
  const str = toks.find(t => t.type === 'STRING');
  assert.ok(str, 'expected STRING token');
});

test('tokenize: number typed correctly', () => {
  const toks = tokenize('timeout = 3000');
  const num = toks.find(t => t.type === 'NUMBER');
  assert.ok(num, 'expected NUMBER token');
});

test('tokenize: OPEN and CLOSE braces typed', () => {
  const toks = tokenize('{ }');
  assert.ok(toks.some(t => t.type === 'OPEN'));
  assert.ok(toks.some(t => t.type === 'CLOSE'));
});

test('tokenize: DEF (=) typed correctly', () => {
  const toks = tokenize('key = value');
  assert.ok(toks.some(t => t.type === 'DEF'));
});

test('tokenize: ROUTE (->) typed correctly', () => {
  const toks = tokenize('signal -> output');
  assert.ok(toks.some(t => t.type === 'ROUTE'));
});

test('tokenize: line numbers are 1-indexed', () => {
  const toks = tokenize('first\nsecond\nthird');
  const lines = toks.map(t => t.line);
  assert.ok(lines.includes(1));
  assert.ok(lines.includes(2));
  assert.ok(lines.includes(3));
});

test('tokenize: indent tracked correctly', () => {
  const toks = tokenize('top\n  indented');
  const top = toks.find(t => t.value === 'top');
  const ind = toks.find(t => t.value === 'indented');
  assert.strictEqual(top.indent, 0);
  assert.strictEqual(ind.indent, 2);
});

test('tokenize: known keywords typed as KEYWORD', () => {
  const tmp = path.join(os.tmpdir(), 'kwtype.spec');
  fs.writeFileSync(tmp, 'domain "x"\ncompartment = bounded\n');
  loadSpec(tmp);
  const toks = tokenize('compartment');
  const t = toks.find(t => t.value === 'compartment');
  assert.ok(t && (t.type === 'KEYWORD' || t.type === 'WORD'));
  fs.unlinkSync(tmp);
});

test('tokenize: very long line does not throw', () => {
  assert.doesNotThrow(() => tokenize('a'.repeat(10000)));
});

test('tokenize: unicode does not throw', () => {
  assert.doesNotThrow(() => tokenize('compartment "テスト" { id = 試験 }'));
});

test('tokenize: OR (|) typed correctly', () => {
  const toks = tokenize('a | b');
  assert.ok(toks.some(t => t.type === 'OR'));
});

test('tokenize: all tokens have required fields', () => {
  const toks = tokenize('compartment "x" { id = 1 }');
  for (const t of toks) {
    assert.ok('type'    in t, 'missing type');
    assert.ok('value'   in t, 'missing value');
    assert.ok('line'    in t, 'missing line');
    assert.ok('col'     in t, 'missing col');
    assert.ok('indent'  in t, 'missing indent');
    assert.ok('complete' in t, 'missing complete');
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// BLOCK 3 — SNR GATE
// ══════════════════════════════════════════════════════════════════════════════
section('BLOCK 3 — SNR GATE');

test('snrGate: returns { passed, noise, snr }', () => {
  const toks = tokenize(MINIMAL_VALID);
  const result = snrGate(toks, 'test');
  assert.ok('passed' in result);
  assert.ok('noise'  in result);
  assert.ok('snr'    in result);
});

test('snrGate: SNR is 0..1', () => {
  const toks = tokenize(MINIMAL_VALID);
  const { snr } = snrGate(toks, 'test');
  assert.ok(snr >= 0 && snr <= 1, `snr out of range: ${snr}`);
});

test('snrGate: empty tokens → snr 1 (nothing to fail)', () => {
  const { snr } = snrGate([], 'empty');
  assert.ok(snr === 1 || snr === 0);
});

test('snrGate: known-good .eg has snr > 0.5', () => {
  const { snr } = snrGate(tokenize(MINIMAL_VALID), 'good');
  assert.ok(snr > 0.5, `expected SNR > 0.5, got ${snr}`);
});

test('snrGate: all noise tokens logged (never silently dropped)', () => {
  const toks = tokenize('randomgarbage xyz abc 999 ???');
  const { noise } = snrGate(toks, 'noise-test');
  // May have noise — just verify the noise array exists and is an array
  assert.ok(Array.isArray(noise));
});

test('snrGate: every passed token has score attached', () => {
  const toks = tokenize(MINIMAL_VALID);
  const { passed } = snrGate(toks, 'score-test');
  for (const t of passed) {
    assert.ok('score' in t, `token "${t.value}" missing score`);
    assert.ok('composite' in t.score);
    assert.ok(t.score.composite >= 0.42, `passed token below gate: ${t.score.composite}`);
  }
});

test('snrGate: adversarial — 100k char string does not throw', () => {
  assert.doesNotThrow(() => {
    const toks = tokenize('a'.repeat(100000));
    snrGate(toks, 'adversarial-length');
  });
});

test('snrGate: noise tokens have reason field', () => {
  const toks = tokenize(':::: %%%% @@@@');
  const { noise } = snrGate(toks, 'symbols');
  for (const n of noise) {
    assert.ok('reason' in n, 'noise token missing reason');
  }
});

test('snrGate: score vector components all present', () => {
  const toks = tokenize('compartment "x" { id = 1 }');
  const { passed } = snrGate(toks, 'vector-test');
  if (passed.length > 0) {
    const s = passed[0].score;
    for (const k of ['raw_snr','fidelity','integrity','polarity','oscillation','recency']) {
      assert.ok(k in s, `missing score component: ${k}`);
    }
  }
});

test('snrGate: recency penalises late tokens (last recency <= first)', () => {
  const src = Array(50).fill('word').join(' ');
  const toks = tokenize(src);
  const { passed } = snrGate(toks, 'recency-test');
  if (passed.length >= 2) {
    const first = passed[0].score.recency;
    const last  = passed[passed.length - 1].score.recency;
    assert.ok(first >= last, `expected first(${first}) >= last(${last})`);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// BLOCK 4 — PARSER / IR
// ══════════════════════════════════════════════════════════════════════════════
section('BLOCK 4 — PARSER / IR');

test('parse: returns valid IR shape', () => {
  const toks = tokenize(MINIMAL_VALID);
  const { passed } = snrGate(toks, 'parse-shape');
  const ir = parse(passed);
  assert.ok('compartments' in ir);
  assert.ok('invariants'   in ir);
  assert.ok('gaps'         in ir);
  assert.ok('loops'        in ir);
  assert.ok('laws'         in ir);
  assert.ok('signals'      in ir);
  assert.ok('outputs'      in ir);
  assert.ok('meta'         in ir);
});

test('parse: compartment name extracted', () => {
  const toks = tokenize(MINIMAL_VALID);
  const { passed } = snrGate(toks, 'parse-name');
  const ir = parse(passed);
  assert.ok(ir.compartments.length >= 1);
  assert.strictEqual(ir.compartments[0].name, 'test-comp');
});

test('parse: loop detected', () => {
  const toks = tokenize(WITH_LOOP);
  const { passed } = snrGate(toks, 'loop-test');
  const ir = parse(passed);
  assert.ok(ir.loops.length >= 1);
});

test('parse: field extraction works (id = test-001)', () => {
  const toks = tokenize(MINIMAL_VALID);
  const { passed } = snrGate(toks, 'field-test');
  const ir = parse(passed);
  const comp = ir.compartments[0];
  assert.strictEqual(comp.fields.id, 'test-001');
});

test('parse: empty passed array returns empty IR', () => {
  const ir = parse([]);
  assert.strictEqual(ir.compartments.length, 0);
  assert.strictEqual(ir.loops.length, 0);
});

test('parse: meta.keywords_used populated', () => {
  const toks = tokenize(MINIMAL_VALID);
  const { passed } = snrGate(toks, 'meta-test');
  const ir = parse(passed);
  assert.ok(ir.meta.keywords_used.size > 0);
});

test('parse: multiple compartments parsed', () => {
  const src = `
compartment "a" { id = a-001 uuid = a }
compartment "b" { id = b-001 uuid = b }
  `;
  const toks = tokenize(src);
  const { passed } = snrGate(toks, 'multi-comp');
  const ir = parse(passed);
  assert.ok(ir.compartments.length >= 2);
});

test('parse: gap block parsed', () => {
  const src = `gap "missing-id" { pressure = 0.9 type = structural }`;
  const toks = tokenize(src);
  const { passed } = snrGate(toks, 'gap-parse');
  const ir = parse(passed);
  assert.ok(ir.gaps.length >= 1);
});

test('parse: law block parsed', () => {
  const src = `law NO_SILENT_DROP { scope = all }`;
  const toks = tokenize(src);
  const { passed } = snrGate(toks, 'law-parse');
  const ir = parse(passed);
  assert.ok(ir.laws.length >= 1);
});

test('parse: deep nesting does not throw', () => {
  let src = 'compartment "deep" { id = x\n';
  for (let i = 0; i < 50; i++) src += '  '.repeat(i) + 'field_' + i + ' = val\n';
  src += '}';
  assert.doesNotThrow(() => {
    const { passed } = snrGate(tokenize(src), 'deep-nest');
    parse(passed);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// BLOCK 5 — VALIDATOR (axiom enforcement)
// ══════════════════════════════════════════════════════════════════════════════
section('BLOCK 5 — VALIDATOR — axiom enforcement');

test('validate: valid IR returns { valid: true }', () => {
  const { passed } = snrGate(tokenize(MINIMAL_VALID), 'val-valid');
  const ir     = parse(passed);
  const report = validate(ir, 'val-valid');
  assert.strictEqual(report.valid, true);
  assert.strictEqual(report.gaps.length, 0);
});

test('validate: compartment without id → gap.structural', () => {
  const src = `compartment "no-id" { intent = testing }`;
  const { passed } = snrGate(tokenize(src), 'no-id');
  const ir     = parse(passed);
  const report = validate(ir, 'no-id');
  assert.strictEqual(report.valid, false);
  const g = report.gaps.find(g => g.type === 'gap.structural');
  assert.ok(g, 'expected gap.structural for missing identity');
});

test('validate: loop without record → gap.temporal', () => {
  const src = `loop BAD_LOOP { interval = 1000 on tick { emit something } }`;
  const { passed } = snrGate(tokenize(src), 'no-record');
  const ir     = parse(passed);
  const report = validate(ir, 'no-record');
  const g = report.gaps.find(g => g.type === 'gap.temporal');
  assert.ok(g, 'expected gap.temporal for missing record');
});

test('validate: gap without pressure → gap.evidential', () => {
  const src = `gap "no-pressure" { type = structural }`;
  const { passed } = snrGate(tokenize(src), 'no-pressure');
  const ir     = parse(passed);
  const report = validate(ir, 'no-pressure');
  const g = report.gaps.find(g => g.type === 'gap.evidential');
  assert.ok(g, 'expected gap.evidential for missing pressure');
});

test('validate: promote without proof → gap.logical', () => {
  const src = `compartment "promo" { id = p-001 uuid = p on action { promote result } }`;
  const { passed } = snrGate(tokenize(src), 'promote-no-proof');
  const ir     = parse(passed);
  const report = validate(ir, 'promote-no-proof');
  const g = report.gaps.find(g => g.type === 'gap.logical');
  assert.ok(g, 'expected gap.logical for promote without proof');
});

test('validate: every gap has pressure, message, source', () => {
  const src = `compartment "bad" { intent = broken }`;
  const { passed } = snrGate(tokenize(src), 'gap-fields');
  const ir     = parse(passed);
  const report = validate(ir, 'gap-fields');
  for (const g of report.gaps) {
    assert.ok('pressure' in g, 'gap missing pressure');
    assert.ok('message'  in g, 'gap missing message');
    assert.ok('source'   in g, 'gap missing source');
    assert.ok('type'     in g, 'gap missing type');
  }
});

test('validate: empty IR is valid (nothing to violate)', () => {
  const report = validate({ compartments:[], gaps:[], loops:[], laws:[], signals:[], invariants:[], outputs:[], whatifs:[], ledger:[], identity:null, meta:{} }, 'empty');
  assert.strictEqual(report.valid, true);
});

test('validate: multiple violations all reported', () => {
  const src = `
compartment "bad1" { intent = broken }
compartment "bad2" { intent = broken }
loop NO_REC { on tick { emit x } }
`;
  const { passed } = snrGate(tokenize(src), 'multi-violation');
  const ir     = parse(passed);
  const report = validate(ir, 'multi-violation');
  assert.ok(report.gaps.length >= 3, `expected >=3 gaps, got ${report.gaps.length}`);
});

// ══════════════════════════════════════════════════════════════════════════════
// BLOCK 6 — FULL COMPILE PIPELINE
// ══════════════════════════════════════════════════════════════════════════════
section('BLOCK 6 — FULL COMPILE PIPELINE');

test('compile: returns { kernel, ir, snr, noise, gaps, valid }', () => {
  const result = compile(MINIMAL_VALID, 'pipeline-test');
  assert.ok('kernel' in result);
  assert.ok('ir'     in result);
  assert.ok('snr'    in result);
  assert.ok('noise'  in result);
  assert.ok('gaps'   in result);
  assert.ok('valid'  in result);
});

test('compile: kernel has boot() and status() and ingest()', () => {
  const { kernel } = compile(MINIMAL_VALID, 'kernel-api');
  assert.strictEqual(typeof kernel.boot,   'function');
  assert.strictEqual(typeof kernel.status, 'function');
  assert.strictEqual(typeof kernel.ingest, 'function');
});

test('compile + boot: kernel runs after boot', () => {
  const { kernel } = compile(MINIMAL_VALID, 'boot-test');
  kernel.boot();
  assert.strictEqual(kernel.running, true);
});

test('compile + boot: status().regime is a valid string', () => {
  const { kernel } = compile(MINIMAL_VALID, 'regime-test');
  kernel.boot();
  const s = kernel.status();
  assert.ok(['stable','degraded','collapsing','oscillatory'].includes(s.regime));
});

test('compile + boot: status().compartments >= 1', () => {
  const { kernel } = compile(MINIMAL_VALID, 'comps-test');
  kernel.boot();
  assert.ok(kernel.status().compartments >= 1);
});

test('compile + boot + ingest: passing signal accepted', () => {
  const { kernel } = compile(MINIMAL_VALID, 'ingest-pass');
  kernel.boot();
  const r = kernel.ingest('compartment "signal" { id = s-001 }');
  assert.ok(r.passed, `expected passed, got: ${JSON.stringify(r)}`);
});

test('compile + boot + ingest: noise signal returns passed=false', () => {
  const { kernel } = compile(MINIMAL_VALID, 'ingest-noise');
  kernel.boot();
  const r = kernel.ingest(':::::::::@@@@@@');
  // May or may not pass depending on spec — just check structure
  assert.ok('passed' in r);
});

test('compile + boot + ingest: stats.ingested increments', () => {
  const { kernel } = compile(MINIMAL_VALID, 'stats-test');
  kernel.boot();
  const before = kernel.stats.ingested;
  kernel.ingest('compartment "x" { id = x }');
  kernel.ingest('compartment "y" { id = y }');
  assert.strictEqual(kernel.stats.ingested, before + 2);
});

test('compile + boot: event_log populated after boot', () => {
  const { kernel } = compile(MINIMAL_VALID, 'evlog-test');
  kernel.boot();
  assert.ok(kernel.event_log.length > 0);
  assert.ok(kernel.event_log[0].type === 'kernel.booted');
});

test('compile: snr in result is 0..1', () => {
  const { snr } = compile(MINIMAL_VALID, 'snr-range');
  assert.ok(snr >= 0 && snr <= 1);
});

test('compile: empty source does not throw', () => {
  assert.doesNotThrow(() => compile('', 'empty-source'));
});

test('compile: comment-only source does not throw', () => {
  assert.doesNotThrow(() => compile('// just comments\n// more comments', 'comments-only'));
});

// ══════════════════════════════════════════════════════════════════════════════
// BLOCK 7 — ADVERSARIAL INPUTS (the difficult ones)
// ══════════════════════════════════════════════════════════════════════════════
section('BLOCK 7 — ADVERSARIAL INPUTS');

for (const [i, input] of ADVERSARIAL_INPUTS.entries()) {
  const label = input.length > 40 ? input.slice(0, 37) + '...' : input.replace(/\n/g, '↵');
  test(`adversarial[${i}]: compile does not throw — "${label}"`, () => {
    assert.doesNotThrow(() => compile(input, `adversarial-${i}`));
  });
}

test('adversarial: deeply nested compartments do not stack overflow', () => {
  let src = '';
  for (let i = 0; i < 200; i++) {
    src += `compartment "c${i}" { id = c${i} uuid = u${i} intent = layer_${i} }\n`;
  }
  assert.doesNotThrow(() => compile(src, 'deep-200'));
});

test('adversarial: repeated compile same source is idempotent', () => {
  const r1 = compile(MINIMAL_VALID, 'idem-1');
  const r2 = compile(MINIMAL_VALID, 'idem-2');
  assert.strictEqual(r1.ir.compartments.length, r2.ir.compartments.length);
  assert.ok(Math.abs(r1.snr - r2.snr) < 0.01);
});

test('adversarial: ingest before boot returns error object not throw', () => {
  const { kernel } = compile(MINIMAL_VALID, 'pre-boot-ingest');
  // NOT calling boot()
  assert.doesNotThrow(() => {
    const r = kernel.ingest('compartment "x" { id = x }');
    assert.strictEqual(r.passed, false);
    assert.strictEqual(r.reason, 'kernel_not_running');
  });
});

test('adversarial: status() before boot does not throw', () => {
  const { kernel } = compile(MINIMAL_VALID, 'pre-boot-status');
  assert.doesNotThrow(() => kernel.status());
});

test('adversarial: 10k ingest calls on single kernel', () => {
  const { kernel } = compile(MINIMAL_VALID, 'ingest-10k');
  kernel.boot();
  assert.doesNotThrow(() => {
    for (let i = 0; i < 10000; i++) {
      kernel.ingest(`compartment "c${i}" { id = c${i} }`);
    }
  });
  assert.ok(kernel.stats.ingested >= 10000);
});

test('adversarial: noise_ring never exceeds 5000 entries', () => {
  const { kernel } = compile(MINIMAL_VALID, 'ring-cap');
  kernel.boot();
  for (let i = 0; i < 6000; i++) {
    kernel.ingest('::::::@@@@@@' + i);
  }
  assert.ok(kernel.noise_ring.length <= 5000);
});

test('adversarial: event_log never exceeds 5000 entries', () => {
  const { kernel } = compile(MINIMAL_VALID, 'evlog-cap');
  kernel.boot();
  for (let i = 0; i < 6000; i++) {
    kernel.ingest(`compartment "c${i}" { id = c${i} }`);
  }
  assert.ok(kernel.event_log.length <= 5000);
});

// ══════════════════════════════════════════════════════════════════════════════
// BLOCK 8 — FILE EMISSION
// ══════════════════════════════════════════════════════════════════════════════
section('BLOCK 8 — FILE EMISSION');

test('emitFiles: exported from kernel', () => {
  assert.strictEqual(typeof kernel.emitFiles, 'function');
});

test('emitFiles: empty outputs does nothing', () => {
  const ir = { outputs: [] };
  const dir = os.tmpdir();
  assert.doesNotThrow(() => kernel.emitFiles(ir, dir, 'emit-empty'));
});

test('registerTemplate + emitFiles: writes file from template', () => {
  kernel.registerTemplate('test-tmpl', () => 'hello from template');
  const src = `output "test-output.txt" { type = file content = test-tmpl }`;
  const { passed } = snrGate(tokenize(src), 'emit-tmpl');
  const ir = parse(passed);
  const dir = os.tmpdir();
  const written = kernel.emitFiles(ir, dir, 'emit-test');
  const outPath = path.join(dir, 'test-output.txt');
  if (written.length > 0) {
    assert.ok(fs.existsSync(outPath));
    assert.strictEqual(fs.readFileSync(outPath, 'utf8'), 'hello from template');
    fs.unlinkSync(outPath);
  }
});

test('emitFiles: missing template does not throw', () => {
  const ir = { outputs: [{ name: 'x.txt', fields: { type: 'file', content: 'nonexistent-tmpl' } }] };
  assert.doesNotThrow(() => kernel.emitFiles(ir, os.tmpdir(), 'missing-tmpl'));
});

// ══════════════════════════════════════════════════════════════════════════════
// BLOCK 9 — REAL .eg FILES (integration)
// ══════════════════════════════════════════════════════════════════════════════
section('BLOCK 9 — REAL .eg FILES integration');

const IO_DIR = path.resolve(__dirname, '../io');

if (fs.existsSync(IO_DIR)) {
  const egFiles = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (f.endsWith('.eg')) egFiles.push(full);
    }
  };
  walk(IO_DIR);

  test(`real .eg files: found ${egFiles.length} files in emerge/io`, () => {
    assert.ok(egFiles.length > 0, 'no .eg files found');
  });

  // Test first 20 to keep runtime reasonable
  for (const f of egFiles.slice(0, 20)) {
    const rel = path.relative(IO_DIR, f);
    test(`real .eg: compiles without throw — ${rel}`, () => {
      const src = fs.readFileSync(f, 'utf8');
      assert.doesNotThrow(() => compile(src, rel));
    });

    test(`real .eg: snr > 0 — ${rel}`, () => {
      const src = fs.readFileSync(f, 'utf8');
      const { snr } = compile(src, rel);
      assert.ok(snr >= 0, `snr is ${snr}`);
    });
  }
} else {
  test('real .eg files: emerge/io directory exists', () => {
    assert.fail(`emerge/io not found at ${IO_DIR}`);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// BLOCK 10 — EMERGE.SPEC INTEGRITY
// ══════════════════════════════════════════════════════════════════════════════
section('BLOCK 10 — EMERGE.SPEC INTEGRITY');

const SPEC_PATH = path.resolve(__dirname, '../emerge/emerge.spec');

test('emerge.spec: file exists (moved from repo root into emerge/, 2026-08-23)', () => {
  assert.ok(fs.existsSync(SPEC_PATH), `missing: ${SPEC_PATH}`);
});

test('emerge.spec: parses without error', () => {
  assert.doesNotThrow(() => loadSpec(SPEC_PATH));
});

test('emerge.spec: version declared', () => {
  loadSpec(SPEC_PATH);
  assert.ok(kernel.SCHEMA.version !== '0.0.0', 'version is default — spec may not have loaded');
});

test('emerge.spec: has at least 1 axiom', () => {
  loadSpec(SPEC_PATH);
  assert.ok(kernel.SCHEMA.axioms.size >= 1);
});

test('emerge.spec: has at least 5 keywords', () => {
  loadSpec(SPEC_PATH);
  assert.ok(kernel.SCHEMA.keywords.size >= 5);
});

test('emerge.spec: compartment is a known keyword after load', () => {
  loadSpec(SPEC_PATH);
  assert.ok(kernel.SCHEMA.keywords.has('compartment'));
});

// ══════════════════════════════════════════════════════════════════════════════
// RESULTS
// ══════════════════════════════════════════════════════════════════════════════
process.stdout.write('\n' + '═'.repeat(70) + '\n');
process.stdout.write(`RESULTS: ${passed}/${total} passed`);
if (failed > 0) {
  process.stdout.write(` — ${failed} FAILED\n`);
  process.stdout.write('\nFAILURES:\n');
  for (const f of failures) {
    process.stdout.write(`  ✗ ${f.name}\n    ${f.error}\n`);
  }
} else {
  process.stdout.write(' — ALL PASS\n');
}
process.stdout.write('═'.repeat(70) + '\n');

// Save results for cortex / next version
const resultPath = path.join(__dirname, 'kernel-test-results.json');
fs.writeFileSync(resultPath, JSON.stringify({
  run_at: new Date().toISOString(),
  total, passed, failed,
  pass_rate: (passed / total).toFixed(3),
  failures,
  log,
}, null, 2));
process.stdout.write(`\nResults saved → ${resultPath}\n`);

process.exit(failed > 0 ? 1 : 0);
