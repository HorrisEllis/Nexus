'use strict';
/**
 * tests/modules/test-intelligence-organs-move.js
 * Regression guard for the cortex -> intelligence consolidation (docs/2026-09-19-
 * cortex-to-intelligence-and-versionium-consolidation-phasemap.spec).
 *
 * Static pins that keep the migration from quietly un-migrating. The behavioural
 * proof (real servers, real event delivery, RAID registration, retry) lives in
 * test-intelligence-faculties-move.js. James: "each system needs to be sovereign.
 * if cortex going down breaks something, it needs to be moved."
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let passed = 0, failed = 0;
function test(id, desc, fn) { try { fn(); console.log(`   ${id} ${desc}`); passed++; } catch (e) { console.error(`   ${id} ${desc}\n    ${e.stack}`); failed++; } }

const MOVED = ['/api/intelligence/status', '/api/intelligence/event', '/api/intelligence/context', '/api/intelligence/patterns',
  '/api/intelligence/failures', '/api/intelligence/reuse', '/api/intelligence/intuition', '/api/intelligence/mastermind',
  '/api/intelligence/mastermind/patterns', '/api/intelligence/adversarial', '/api/intelligence/rca', '/api/cortex/query',
  '/api/cortex/lattice', '/api/liminal-space/status', '/api/liminal-space/list'];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'data', 'docs', 'tests', 'repo', '_archive', 'memory_store'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.(js|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

const BOOT = read('cortex/boot.js');
const liminal = require(path.join(ROOT, 'intelligence/liminal-space'));

test('IOM-001', 'cortex relays exactly the liminal-space events that do NOT originate inside intelligence', () => {
  const m = BOOT.match(/const RELAY_TO_INTELLIGENCE = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(m, 'relay set not found in cortex/boot.js');
  const relay = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]).sort();
  const sub = [...liminal.SUBSCRIBED_EVENTS];
  for (const t of relay) assert.ok(sub.includes(t), `cortex relays ${t}, which liminal-space does not subscribe to (intake would 400 it)`);
  const notRelayed = sub.filter(t => !relay.includes(t)).sort();
  assert.deepStrictEqual(notRelayed, ['cortex.intelligence.pattern_crystallised', 'tc.drift.signal'],
    'the only subscribed events cortex may NOT relay are the two that originate in intelligence (relaying would double-deliver)');
});

test('IOM-002', 'liminal-space\'s declared subscription list matches its real bus.on() calls', () => {
  const src = read('intelligence/liminal-space/index.js');
  const wired = [...src.matchAll(/_bus\.on\('([^']+)'/g)].map(x => x[1]).sort();
  assert.deepStrictEqual(wired, [...liminal.SUBSCRIBED_EVENTS].sort());
});

test('IOM-003', 'cortex tombstones exactly the 15 moved paths, each pointing at a path intelligence really serves', () => {
  const m = BOOT.match(/const MOVED_TO_INTELLIGENCE = \{([\s\S]*?)\};/);
  assert.ok(m);
  const pairs = [...m[1].matchAll(/'([^']+)':\s*'([^']+)'/g)];
  assert.deepStrictEqual(pairs.map(p => p[1]).sort(), [...MOVED].sort());
  const { createRoutes } = require(path.join(ROOT, 'intelligence/routes.js'));
  const r = createRoutes({ jaaDB: { tail: () => [], query: () => [], count: () => 0, reloadTable() {} }, getField: () => ({ entropy: 0 }), intelligence: {} });
  const indexServed = ['/api/intelligence/status', '/api/intelligence/event', '/api/intelligence/patterns', '/api/intelligence/failures', '/api/intelligence/reuse'];
  for (const [, , target] of pairs) {
    assert.ok(indexServed.includes(target) || r.owns('GET', target) || r.owns('POST', target), `intelligence serves nothing at ${target}`);
  }
});

test('IOM-004', 'cortex/boot.js no longer contains the faculty code or a second intelligence runtime', () => {
  for (const banned of ['createIntuition', 'createMastermind', '_proxyToIntelligence', "require('../intelligence').init", "name: 'intelligence'", "name: 'liminal-space'"])
    assert.ok(!BOOT.includes(banned), `cortex/boot.js still contains ${banned}`);
});

test('IOM-005', 'no in-repo caller reaches cortex for an intelligence path (sovereignty: cortex down must not break them)', () => {
  const bad = [];
  const pats = [
    /\$\{(CX_URL|CORTEX_URL|CORTEX_BASE|CX)\}\/api\/intelligence\/(context|intuition|mastermind|adversarial|patterns|rca|reuse|failures|event|status)/,
    /\$\{CORTEX_PORT\}\/api\/intelligence\//,
    /\/api\/cortex\/(query|lattice)/,
    /\b(GET|POST|get|post)\(\s*['"]cortex['"]\s*,\s*[`'"]\/api\/intelligence\//,
  ];
  for (const f of walk(ROOT)) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    if (rel === 'cortex/boot.js' || rel.startsWith('scripts/') || rel.startsWith('unintegrated/')) continue; // boot.js holds the tombstone map
    const src = fs.readFileSync(f, 'utf8');
    src.split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // comments/docs
      if (pats.some(p => p.test(line))) bad.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepStrictEqual(bad, [], 'callers still pointing at cortex:\n' + bad.join('\n'));
});

test('IOM-006', 'all six browser userscripts define INTELLIGENCE_URL and read context/status from it', () => {
  for (const f of ['userscript-claude.js', 'userscript-chatgpt.js', 'userscript-gemini.js', 'userscript-deepseek.js', 'userscript-perplexity.js', 'nexus-hey-claude.user.js']) {
    const s = read('guardian/' + f);
    assert.ok(/const INTELLIGENCE_URL = 'http:\/\/127\.0\.0\.1:3753'/.test(s), f + ' missing INTELLIGENCE_URL');
    assert.ok(!/\$\{CORTEX_URL\}\/api\/intelligence\//.test(s), f + ' still calls cortex for intelligence');
  }
});

test('IOM-007', 'contracts: cortex declares none of the moved paths; intelligence declares everything it serves', () => {
  const cx = JSON.parse(read('cortex/interaction-contract.json')).routes.map(r => r.path);
  for (const p of MOVED) assert.ok(!cx.includes(p), `cortex contract still declares ${p}`);
  const ic = JSON.parse(read('intelligence/interaction-contract.json'));
  assert.strictEqual(ic.ports.http, 3753);
  const ip = ic.routes.map(r => r.path);
  for (const p of [...MOVED.filter(x => x !== '/api/cortex/query' && x !== '/api/cortex/lattice'), '/api/intelligence/query', '/api/intelligence/lattice', '/api/intelligence/crystals', '/api/intelligence/bus'])
    assert.ok(ip.includes(p), `intelligence contract missing ${p}`);
});

test('IOM-008', 'hooks: cortex holds none of the moved routes; intelligence hooks live on :3753 and are unique', () => {
  const ch = require(path.join(ROOT, 'hooks/cortex.hooks.js')).hooks;
  for (const h of ch) assert.ok(!MOVED.includes(h.config && h.config.path), `cortex hook ${h.id} still declares ${h.config.path}`);
  const ih = require(path.join(ROOT, 'hooks/intelligence.hooks.js')).hooks;
  assert.ok(ih.length >= 9);
  assert.strictEqual(new Set(ih.map(h => h.id)).size, ih.length);
  for (const h of ih) { assert.strictEqual(h.to.surface, 'intelligence'); assert.strictEqual(h.to.port, 3753); }
  assert.ok(require(path.join(ROOT, 'hooks/index.js')).bySystem('intelligence').length === ih.length, 'hooks/index.js must register the intelligence hook system');
});

test('IOM-009', 'registries: cortex registers no intelligence.* components; intelligence registers its own, uniquely', () => {
  const cx = require(path.join(ROOT, 'cortex/registry-components.js'));
  assert.ok(!cx.some(c => /(^|\.)intelligence\./.test(c.id)), 'cortex registry still carries intelligence.* components');
  const ic = require(path.join(ROOT, 'intelligence/registry-components.js'));
  assert.strictEqual(new Set(ic.map(c => c.id)).size, ic.length);
  assert.ok(ic.every(c => c.namespace === 'intelligence'));
});

test('IOM-010', 'ports: intelligence is known to orchestrator; nexus-healer no longer shares intelligence\'s port', () => {
  const cfg = JSON.parse(read('orchestrator/orchestrator.config.json'));
  assert.strictEqual(cfg.ports.intelligence, 3753);
  assert.ok(/intelligence:\s*\{\s*port:\s*3753/.test(read('orchestrator/orchestrator.js')), 'orchestrator SYS map missing intelligence');
  const healer = read('nexus-healer/api/index.js').match(/NEXUS_HEALER_PORT \|\| '(\d+)'/)[1];
  const intel = require(path.join(ROOT, 'intelligence/config.js')).PORT;
  assert.notStrictEqual(parseInt(healer, 10), intel, 'nexus-healer and intelligence must not share a default port');
});

test('IOM-011', 'RAID registration is remote (server.js), and in-process registration is opt-in only', () => {
  const server = read('intelligence/server.js');
  assert.ok(/registerSelfRemote\('intelligence',\s*intelligence\.CAPABILITIES/.test(server));
  const idx = read('intelligence/index.js');
  assert.ok(/if \(cfg\.registerInProcess\)/.test(idx));
  assert.ok(require(path.join(ROOT, 'intelligence/index.js')).CAPABILITIES.length >= 16);
});


// -- CFR field relay removal (2026-09-19) -------------------------------------
test('IOM-012', 'cortex no longer serves /cfr/field|health (410 -> orchestrator) and declares no cfr routes/hooks/components', () => {
  assert.ok(/p === '\/cfr\/health' \|\| p === '\/cfr\/field'\) \{\s*const orchPort[\s\S]{0,400}?410/.test(BOOT), 'cortex must tombstone the CFR relay');
  assert.ok(!/_updateField\(body\)/.test(BOOT), 'cortex must not accept field writes over HTTP any more');
  const hooks = require(path.join(ROOT, 'hooks/cortex.hooks.js')).hooks;
  assert.ok(!hooks.some(h => /^\/cfr\//.test((h.config && h.config.path) || '')), 'cortex hooks still declare /cfr routes');
  assert.ok(!require(path.join(ROOT, 'cortex/registry-components.js')).some(c => /^cfr\./.test(c.name || c.id) || /\/cfr\//.test((c.route && c.route.path) || '')), 'cortex registry still declares cfr components');
});

test('IOM-013', 'no in-repo consumer reads the CFR field from cortex (all read the orchestrator, the authority)', () => {
  const bad = [];
  const pats = [/3748[^\n]{0,60}\/cfr\//, /\/cfr\/[^\n]{0,40}3748/, /\$\{(CX_URL|CORTEX_URL)\}\/cfr\//, /\$\{CORTEX_PORT\}\/cfr\//, /nx\.get\(\s*['"]cortex['"]\s*,\s*['"]\/cfr\//];
  for (const f of walk(ROOT)) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    if (rel === 'cortex/boot.js' || rel.startsWith('unintegrated/')) continue;
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      if (pats.some(p => p.test(line))) bad.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepStrictEqual(bad, [], 'consumers still reading the CFR field via cortex:\n' + bad.join('\n'));
});

test('IOM-014', 'intelligence fabricates no `tension` (field provider) and cfr-influence treats it as optional', () => {
  assert.ok(!('tension' in require(path.join(ROOT, 'intelligence/field-provider.js')).DEFAULTS), 'provider must not invent a tension value');
  const src = read('nexus/nexus-cfr-influence.js');
  assert.ok(/const required = \['coherence', 'friction', 'entropy', 'resonance'\]/.test(src), 'tension must not be a required field');
  assert.ok(/typeof tension === 'number'/.test(src), 'tension branches must be guarded');
});

console.log(`\n   ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
