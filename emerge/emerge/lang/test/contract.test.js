'use strict';
// emerge/lang/test/contract.test.js — the contract block (CIE-EG 6.1, MOD-CONTRACT; Nexus phase CIE1).
// James, 2026-11-06 (D7): "New contract block".
// The scaffold (lang/parser.js → lang/contract.js) and Emerge's own lang/cie/contract.eg are held to the same answers.

const assert = require('assert');
const path = require('path');
const L = require('../ledger');
const C = require('../contract');
const build = require('../build-loader');
const { parse } = require('../parser');
const { both, interpret, writeProgram, checkSrc } = require('./harness');

let passed = 0, failed = 0;
const t = (name, fn) => { try { fn(); passed++; process.stdout.write(`  ✓ ${name}\n`); } catch (e) { failed++; process.stdout.write(`  ✗ ${name}\n    ${String(e.message).split('\n').join('\n    ')}\n`); } };
process.stdout.write('contract: the contract block (CIE-EG 6.1)\n');

const COMPONENTS = `
component Counter {
  id = "demo.counter"
  namespace = "demo"
  version = "1.0.0"
  state { n: 0 }
  in bump(x: { by: num }) {
    state.n += x.by
    emit out changed { count: state.n }
  }
  out changed: { count: num }
}
component Display {
  id = "demo.display"
  namespace = "demo"
  version = "1.0.0"
  in show(v: { count: num }) { print("count {v.count}") }
}
`;
const contractOf = (body, id = 'counter_main') => `contract ${id} {\n${body}\n}\n`;
const MAIN = contractOf('  version = "1.0.0"\n  gate { max_steps = 50  checkpoint_every = 8 }\n  road Counter.changed -> Display.show');
const hashOf = src => parse(src, 'main.eg').items.find(i => i.type === 'Contract').hash;
const refusal = src => { try { parse(src, 'main.eg'); return null; } catch (e) { return e.message; } };

t('CT-01 the block parses, its road delivers, both backends agree, and the hash is in the genesis entry and every checkpoint', () => {
  const r = both(MAIN + COMPONENTS + 'for i in range(3) { send Counter.bump { by: 1 } }\n');
  assert.strictEqual(r.out, 'count 1\ncount 2\ncount 3\n');
  const W = r.rt.world.ledger;
  const h = hashOf(MAIN);
  assert.strictEqual(W[0].kind, 'genesis');
  assert.strictEqual(W[0].body.contract_hash, h);
  assert.deepStrictEqual(W[0].body.contract, { id: 'counter_main', version: '1.0.0' });
  const cks = W.filter(e => e.kind === 'checkpoint');
  assert.ok(cks.length >= 2, `checkpoint_every = 8 gives several checkpoints, got ${cks.length}`);
  for (const c of cks) assert.strictEqual(c.body.contract_hash, h);
  assert.ok(L.verify(W).ok, 'the ledger verifies');
  assert.strictEqual(r.rt.contract.hash, h);
});

t('CT-02 the gate settings replace the primitives for the run: max_steps is the storm limit, named as the contract\'s', () => {
  const PING = `
component Ping {
  id = "demo.ping"
  namespace = "demo"
  version = "1.0.0"
  in hit(x: { n: num }) { emit out again { n: x.n + 1 } }
  out again: { n: num }
}
`;
  const src = contractOf('  version = "1.0.0"\n  gate { max_steps = 3 }\n  road Ping.again -> Ping.hit') + PING + 'send Ping.hit { n: 0 }\n';
  const r = both(src);
  assert.notStrictEqual(r.code, 0);
  assert.match(r.err, /signal storm — more than 3 deliveries/);
  assert.match(r.err, /contract counter_main: gate\.max_steps/);
});

t('CT-03 refusals at parse: a road end not an identifier, an unknown setting, other text, no version, bad semver, a road twice, out of range, two contracts', () => {
  const cases = [
    ['road "x" -> Display.show', /a road end is Component\.hook/],
    ['version = "1.0.0"\n  gate { speed = 3 }', /gate has no setting "speed"/],
    ['version = "1.0.0"\n  text { encoding = "latin-1" }', /only "utf-8" is spoken/],
    ['road Counter.changed -> Display.show', /has no version/],
    ['version = "1.0"', /is not semver/],
    ['version = "01.0.0"', /is not semver/],
    ['version = "1.0.0"\n  road A.x -> B.y\n  road A.x -> B.y', /written twice/],
    ['version = "1.0.0"\n  gate { block_at = 1.5 }', /a pressure is in \[0, 1\]/],
    ['version = "1.0.0"\n  gate { max_steps = 0 }', /a whole number, at least 1/],
    ['version = "1.0.0"\n  gate { checkpoint_every = 2.5 }', /a whole number, at least 1/],
    ['version = "1.0.0"\n  version = "1.0.1"', /written twice/],
    ['version = "1.0.0"\n  limit = 3', /a contract holds version/],
  ];
  for (const [body, re] of cases) {
    const m = refusal(contractOf(body));
    assert.ok(m, `refused: ${body}`);
    assert.match(m, re, body);
  }
  assert.match(refusal(contractOf('version = "1.0.0"') + contractOf('version = "1.0.0"', 'other')), /a program has one contract/);
});

t('CT-04 changing the contract changes its hash; the order roads are written in does not', () => {
  const a = hashOf(contractOf('version = "1.0.0"\n  road A.x -> B.y\n  road C.z -> D.w'));
  const reordered = hashOf(contractOf('version = "1.0.0"\n  road C.z -> D.w\n  road A.x -> B.y'));
  const bumped = hashOf(contractOf('version = "1.0.1"\n  road A.x -> B.y\n  road C.z -> D.w'));
  const moreRoads = hashOf(contractOf('version = "1.0.0"\n  road A.x -> B.y\n  road C.z -> D.w\n  road E.v -> F.u'));
  const gate = hashOf(contractOf('version = "1.0.0"\n  gate { block_at = 0.8 }\n  road A.x -> B.y\n  road C.z -> D.w'));
  assert.strictEqual(a, reordered);
  assert.strictEqual(new Set([a, bumped, moreRoads, gate]).size, 4);
  assert.match(a, /^[0-9a-f]{64}$/);
});

t('CT-05 no contract: the genesis entry is as it was (no contract fields), and the defaults are the primitives\' own values', () => {
  const r = both(COMPONENTS + 'wire Counter.changed -> Display.show\nsend Counter.bump { by: 2 }\n');
  assert.strictEqual(r.out, 'count 2\n');
  const g = r.rt.world.ledger[0];
  assert.deepStrictEqual(Object.keys(g.body).sort(), ['chain_id', 'seed', 'text', 'version']);
  assert.strictEqual(r.rt.contract, null);
  const P = build.primitives();
  assert.deepStrictEqual(C.DEFAULTS.gate, { block_at: P.observe.gaps.block_at, max_steps: P.dispatch.max_deliveries, checkpoint_every: P.ledger.checkpoint_every });
});

t('CT-06 a road is checked like a wire: one to a hook that is not there is a check error; a road and a wire for the same pair is declared twice', () => {
  const bad = checkSrc(contractOf('version = "1.0.0"\n  road Counter.changed -> Display.nowhere') + COMPONENTS);
  assert.ok(bad.errors.some(e => /Display.*nowhere|no in hook/.test(e.message)), JSON.stringify(bad.errors.map(e => e.message)));
  const twice = checkSrc(MAIN + COMPONENTS + 'wire Counter.changed -> Display.show\n');
  assert.ok(twice.errors.some(e => /declared twice/.test(e.message)), JSON.stringify(twice.errors.map(e => e.message)));
});

t('CT-07 a contract belongs to the program that runs: a module that declares one is refused', () => {
  const { main } = writeProgram('use "lib.eg" as lib\nprint("x")\n', { 'lib.eg': contractOf('version = "1.0.0"', 'lib_contract') + 'fn f() = 1\n' });
  const r = interpret(main);
  assert.notStrictEqual(r.code, 0);
  assert.match(r.err, /declares a contract — a contract belongs to the program that runs/);
});

// ── Emerge's own contract.eg against the scaffold ───────────────────────────
const EG = path.join(__dirname, '..', 'cie', 'contract.eg');
function viaEmerge(sources) {
  const files = {};
  sources.forEach((s, i) => { files[`c${i}.txt`] = s; });
  const prog = `use ${JSON.stringify(EG)} as C\n` +
    `for i in range(${sources.length}) {\n` +
    `  try { print(C.contract_hash(C.parse_contract(read_file("c{i}.txt")))) } else e { print("refused") }\n}\n`;
  const { main, dir } = writeProgram(prog, files);
  const cwd = process.cwd();
  process.chdir(dir);
  try { const r = interpret(main); if (r.code !== 0) throw new Error(r.err); return r.out.trim().split('\n'); }
  finally { process.chdir(cwd); }
}

t('CT-08 contract.eg gives the same hash as the scaffold, byte for byte, and refuses what it refuses', () => {
  const good = [
    MAIN,
    contractOf('  version = "1.0.0"\n  text   { encoding = "utf-8"  normalization = "nfc" }\n  gate   { block_at = 0.9  max_steps = 100000  checkpoint_every = 256 }\n  road Counter.changed -> Display.show', 'emerge_main'),
    contractOf('version = "2.1.0-rc.1+build.7"\n  gate { block_at = 0.75 }\n  road Z.a -> Y.b\n  road A.b -> C.d'),
    contractOf('version = "0.0.1"  // a comment\n  gate { max_steps = 100_000 }'),
  ];
  const bad = [
    contractOf('road "x" -> Display.show'),
    contractOf('version = "1.0.0"\n  gate { speed = 3 }'),
    contractOf('version = "1.0"'),
    contractOf('version = "1.0.0"\n  road A.x -> B.y\n  road A.x -> B.y'),
    contractOf('version = "1.0.0"\n  gate { block_at = 1.5 }'),
    contractOf('version = "1.0.0"\n  text { normalization = "nfd" }'),
  ];
  const got = viaEmerge([...good, ...bad]);
  good.forEach((s, i) => assert.strictEqual(got[i], hashOf(s), `contract ${i}`));
  bad.forEach((s, i) => { assert.ok(refusal(s), `scaffold refuses ${i}`); assert.strictEqual(got[good.length + i], 'refused', `contract.eg refuses ${i}`); });
});

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
process.exitCode = failed ? 1 : 0;
