'use strict';
/**
 * tests/modules/test-code-tools.test.js — /api/repos/:uuid/code/* (idearium/repo/code-api.js) and the eleven agent
 * tools over it (lib/agent-tools/tools/idearium/code.js). 0.39.273 CB4/CB5.
 *
 * The API runs against the REAL RepoLayer (the one getRepoLayer() hands production) and the real inject trail; the
 * tools run over real HTTP against a server that routes exactly as idearium/api/index.js does (code/* → handleCode,
 * injects/:id/revert|reject → lib/repo-inject.js), so what is asserted is what goes over the wire.
 *
 *   CT-1xx  reads: overview, search, chunk, refs, outline, read, grep — and a repo indexed before 0.39.273 self-heals
 *   CT-2xx  writes in review mode: proposed, stacked, read back as pending, syntax breaks refused, expectHash
 *   CT-3xx  writes in auto mode: applied + reindexed, batch all-or-nothing with rollback, move, chunk edit, delete
 *   CT-4xx  the tools: registered, scoped, guided, listed; shapes; repoUuid from the run's context; revert/withdraw
 */
require('../../lib/test-sandbox.js').ensure();
// CLAUDE.md — "silence [jaa]-style logs or the runner miscounts": module chatter ("[jaa] …", "[idearium…] …",
// "[API] …") is dropped; the test's own lines (which never start with "[") are kept.
{ const _log = console.log, _warn = console.warn;
  const chatter = (a) => typeof a[0] === 'string' && /^\[[\w./ -]+\]/.test(a[0]);
  console.log = (...a) => { if (!chatter(a)) _log(...a); };
  console.warn = (...a) => { if (!chatter(a)) _warn(...a); }; }
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
// fixtures name modules that exist only in the temp repo; building the word at runtime keeps loom's source scanner
// from reading them as dangling edges of THIS file
const RQ = ['req', 'uire'].join('');

const ROOT = path.resolve(__dirname, '..', '..');

let passed = 0, failed = 0;
async function t(id, name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${id} ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${id} ${name}\n      ${String(e.stack || e.message).split('\n').slice(0, 5).join('\n      ')}`); }
}

const MATH = "'use strict';\n/** Adds two numbers. */\nfunction add(a, b) {\n  return a + b;\n}\n\n/** Multiplies two numbers. */\nfunction mul(a, b) {\n  return a * b;\n}\n\nmodule.exports = { add, mul };\n";
const APP = "const { add } = " + RQ + "('./math');\n\n/** Sums a list. */\nfunction total(xs) {\n  return xs.reduce((s, x) => add(s, x), 0);\n}\n\nmodule.exports = { total };\n";

async function main() {
  console.log('\ntest-code-tools\n');
  const api = await import(path.join(ROOT, 'idearium', 'api', 'index.js'));
  const { handleCode } = await import(path.join(ROOT, 'idearium', 'repo', 'code-api.js'));
  const layer = api.getRepoLayer();
  const RI = require(path.join(ROOT, 'lib', 'repo-inject.js'));
  let rec = null;
  for (let i = 0; i < 20; i++) {
    rec = layer.ingest({ name: `code-tools-test-${Date.now()}`, source: 'test', files: [
      { path: 'src/math.js', content: MATH }, { path: 'src/app.js', content: APP },
      { path: 'tests/math.test.js', content: "const assert = require('assert');\nconst { add } = " + RQ + "('../src/math');\nassert.strictEqual(add(2, 3), 5);\n" },
    ] });
    if (!(rec && rec.error && /no spec-engine/.test(rec.error))) break;
    await new Promise(r => setTimeout(r, 250));
  }
  const U = (rec.repo || rec).uuid;
  layer.refresh(U);
  const dir = layer.get(U).materializeDir || path.join(layer.dataDir, 'projects', U);
  const events = [];
  const call = (method, op, query = {}, body = {}) => handleCode({ method, op, layer, repo: layer.get(U), uuid: U, dir, query, body, emit: (type, p) => events.push({ type, p }) });
  const disk = (p) => { try { return fs.readFileSync(path.join(dir, p), 'utf8'); } catch (_) { return null; } };

  console.log('── reads ──────────────────────────────────────────────');
  await t('CT-101', 'a repo indexed before 0.39.273 (no cards) indexes itself on the first code call', async () => {
    fs.rmSync(path.join(dir, 'indexes', 'cards.json'), { force: true });
    const r = await call('GET', 'overview');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.ok(fs.existsSync(path.join(dir, 'indexes', 'cards.json')));
    assert.strictEqual(r.body.repo.writeMode, 'review');
    assert.strictEqual(r.body.files, 3);
  });
  await t('CT-102', 'search by meaning → chunk card with code → refs', async () => {
    const s = await call('GET', 'search', { q: 'multiply two numbers' });
    assert.strictEqual(s.body.hits[0].name, 'mul');
    const c = await call('GET', 'chunk', { id: s.body.hits[0].id });
    assert.strictEqual(c.status, 200); assert.strictEqual(c.body.card.doc, 'Multiplies two numbers.');
    assert.match(c.body.text, /^7\t\/\*\* Multiplies/);
    const d = await call('GET', 'definition', { name: 'add' });
    assert.strictEqual(d.body.definitions.length, 1, JSON.stringify(d.body.definitions));
    assert.ok(d.body.usedBy.some(u => u.file === 'src/app.js' && u.basis === 'import'));
  });
  await t('CT-103', 'an ambiguous chunk ref is a 409 with candidates; a missing one a 404', async () => {
    const miss = await call('GET', 'chunk', { id: 'nothingLikeThis' });
    assert.strictEqual(miss.status, 404);
    const amb = await call('GET', 'chunk', { id: 'src/math.js' });
    assert.strictEqual(amb.status, 409); assert.ok(amb.body.candidates.length >= 3);
  });
  await t('CT-104', 'outline, read (numbered, hash), grep, tree', async () => {
    const o = await call('GET', 'outline', { path: 'src/math.js' });
    assert.ok(o.body.chunks.some(c => c.name === 'add'));
    const r = await call('GET', 'read', { path: 'src/math.js', start: 3, end: 4 });
    assert.strictEqual(r.body.text, '3\tfunction add(a, b) {\n4\t  return a + b;\n'); assert.strictEqual(r.body.hash.length, 64);
    const g = await call('GET', 'grep', { pattern: 'reduce' });
    assert.strictEqual(g.body.total, 1); assert.ok(g.body.matches[0].chunkId);
    const tr = await call('GET', 'tree', { path: 'src' });
    assert.ok(tr.body.entries.some(e => /src\/math\.js/.test(e)));
    assert.strictEqual((await call('GET', 'read', { path: '../../etc/passwd' })).status >= 400, true);
  });
  await t('CT-105', 'the wrong verb, and an unknown op, are refused with what exists', async () => {
    assert.strictEqual((await call('GET', 'edit')).status, 405);
    const u = await call('GET', 'nope');
    assert.strictEqual(u.status, 404); assert.match(u.body.error, /GET overview/);
  });

  console.log('\n── writes, review mode ────────────────────────────────');
  let firstInject = null;
  await t('CT-201', 'an edit is PROPOSED (nothing on disk changes), with a diff', async () => {
    const onDisk = disk('src/math.js');
    const r = await call('POST', 'edit', {}, { path: 'src/math.js', edits: [{ old: 'return a * b;', new: 'return a * b * 1;' }] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.status, 'proposed'); assert.match(r.body.files[0].diff, /\+  return a \* b \* 1;/);
    firstInject = r.body.files[0].inject;
    assert.strictEqual(disk('src/math.js'), onDisk);
    assert.ok(events.some(e => e.type === 'idearium.repo.code.changed' && e.p.status === 'proposed'));
  });
  await t('CT-202', 'a second edit to the same file STACKS onto the pending proposal (the first is not lost)', async () => {
    const r = await call('POST', 'edit', {}, { path: 'src/math.js', edits: [{ old: 'return a + b;', new: 'return b + a;' }] });
    assert.strictEqual(r.body.files[0].inject, firstInject); assert.strictEqual(r.body.files[0].stacked, true);
    const n = RI.get(firstInject);
    assert.ok(n.content.includes('return a * b * 1;') && n.content.includes('return b + a;'), n.content);
  });
  await t('CT-203', 'code/read shows the pending version and says so; view=committed shows the file', async () => {
    const w = await call('GET', 'read', { path: 'src/math.js' });
    assert.ok(w.body.pending && w.body.text.includes('return b + a;'));
    const c = await call('GET', 'read', { path: 'src/math.js', view: 'committed' });
    assert.ok(!c.body.pending && c.body.text.includes('return a + b;'));
  });
  await t('CT-204', 'an edit that introduces a syntax error is refused with the error and line; force writes it', async () => {
    const r = await call('POST', 'edit', {}, { path: 'src/app.js', edits: [{ old: '  return xs.reduce((s, x) => add(s, x), 0);\n}', new: '  return xs.reduce((s, x) => add(s, x), 0);' }] });
    assert.strictEqual(r.status, 422); assert.match(r.body.error, /syntax error/); assert.strictEqual(r.body.nothingWritten, true);
    const f = await call('POST', 'edit', {}, { path: 'src/app.js', dryRun: true, force: true, edits: [{ old: '  return xs.reduce((s, x) => add(s, x), 0);\n}', new: '  return xs.reduce((s, x) => add(s, x), 0);' }] });
    assert.strictEqual(f.status, 200); assert.strictEqual(f.body.dryRun, true);
  });
  await t('CT-205', 'expectHash: a stale hash is a 409; the current one passes', async () => {
    const r = await call('GET', 'read', { path: 'src/app.js' });
    assert.strictEqual((await call('POST', 'edit', {}, { path: 'src/app.js', expectHash: 'deadbeefdeadbeef', dryRun: true, edits: [{ old: 'Sums', new: 'Adds up' }] })).status, 409);
    assert.strictEqual((await call('POST', 'edit', {}, { path: 'src/app.js', expectHash: r.body.hash.slice(0, 12), dryRun: true, edits: [{ old: 'Sums', new: 'Adds up' }] })).status, 200);
  });
  await t('CT-206', 'write refuses to replace an existing file unless overwrite; creates a new one', async () => {
    assert.strictEqual((await call('POST', 'write', {}, { path: 'src/app.js', content: 'x' })).status, 409);
    const r = await call('POST', 'write', {}, { path: 'src/new.js', content: 'module.exports = 1;\n' });
    assert.strictEqual(r.body.files[0].created, true);
    RI.reject(r.body.files[0].inject);
  });

  console.log('\n── writes, auto mode ──────────────────────────────────');
  RI.reject(firstInject);
  RI.setMode(U, 'auto');
  await t('CT-301', 'an edit applies at once, lands on disk, and the index follows', async () => {
    const r = await call('POST', 'edit', {}, { path: 'src/math.js', edits: [{ old: '/** Multiplies two numbers. */', new: '/** Multiplies two numbers, exactly. */' }] });
    assert.strictEqual(r.body.status, 'applied', JSON.stringify(r.body));
    assert.ok(disk('src/math.js').includes('exactly.'));
    const c = await call('GET', 'chunk', { id: 'mul' });
    assert.strictEqual(c.body.card.doc, 'Multiplies two numbers, exactly.');
    assert.ok(!c.body.stale);
  });
  await t('CT-302', 'batch: all ops are validated first — one bad op writes NOTHING', async () => {
    const before = disk('src/app.js');
    const r = await call('POST', 'batch', {}, { ops: [
      { op: 'write', path: 'src/sub.js', content: 'module.exports = (a, b) => a - b;\n' },
      { op: 'edit', path: 'src/app.js', edits: [{ old: 'NOT THERE', new: 'x' }] },
    ] });
    assert.strictEqual(r.status, 422); assert.match(r.body.error, /^op 2:/); assert.strictEqual(r.body.nothingWritten, true);
    assert.strictEqual(disk('src/sub.js'), null); assert.strictEqual(disk('src/app.js'), before);
  });
  await t('CT-303', 'batch: later ops see earlier ones; one reindex; both files written', async () => {
    const r = await call('POST', 'batch', {}, { ops: [
      { op: 'write', path: 'src/sub.js', content: "const { add } = " + RQ + "('./math');\nfunction sub(a, b) {\n  return add(a, -b);\n}\nmodule.exports = { sub };\n" },
      { op: 'edit', path: 'src/sub.js', edits: [{ old: 'function sub(a, b) {', new: '/** Subtracts. */\nfunction sub(a, b) {' }] },
      { op: 'edit', path: 'src/app.js', edits: [{ insertAfter: 1, new: "const { sub } = " + RQ + "('./sub');" }] },
    ] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body)); assert.strictEqual(r.body.files.length, 2);
    assert.ok(disk('src/sub.js').includes('/** Subtracts. */')); assert.ok(disk('src/app.js').includes("" + RQ + "('./sub')"));
    const s = await call('GET', 'search', { q: 'subtracts' });
    assert.strictEqual(s.body.hits[0].name, 'sub');
  });
  await t('CT-304', 'a commit that fails mid-batch rolls back what it already applied', async () => {
    const before = disk('src/app.js');
    const origApply = RI.apply;
    let n = 0;
    RI.apply = (id, o) => (++n === 2 ? { ok: false, errors: ['simulated failure'] } : origApply(id, o));
    try {
      const r = await call('POST', 'batch', {}, { ops: [
        { op: 'edit', path: 'src/app.js', edits: [{ old: 'Sums a list.', new: 'Sums a list, carefully.' }] },
        { op: 'write', path: 'src/other.js', content: 'module.exports = 2;\n' },
      ] });
      assert.strictEqual(r.status, 409); assert.match(r.body.error, /simulated failure/);
      assert.ok(r.body.rolledBack.every(x => x.reverted));
    } finally { RI.apply = origApply; }
    assert.strictEqual(disk('src/app.js'), before); assert.strictEqual(disk('src/other.js'), null);
  });
  await t('CT-305', 'move: new path written, old path gone, and the lines that name the old file are listed', async () => {
    const r = await call('POST', 'move', {}, { from: 'src/sub.js', to: 'src/minus.js' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(disk('src/sub.js'), null); assert.ok(disk('src/minus.js').includes('function sub'));
    assert.ok(r.body.ops[0].mayReference.some(x => x.startsWith('src/app.js:')));
  });
  await t('CT-306', 'chunk edit: replaces exactly the chunk; a chunk whose text changed since indexing is refused', async () => {
    const c = await call('GET', 'chunk', { id: 'add' });
    const r = await call('POST', 'edit', {}, { chunk: c.body.card.id, content: '/** Adds two numbers. */\nfunction add(a, b) {\n  return Number(a) + Number(b);\n}\n' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body)); assert.ok(disk('src/math.js').includes('Number(a) + Number(b)'));
    assert.ok(disk('src/math.js').includes('function mul'), 'a neighbour was lost');
    // a pending proposal changes the file's working text under the indexed chunk: a chunk edit must refuse, not
    // overwrite lines that no longer hold that chunk
    RI.setMode(U, 'review');
    const p = await call('POST', 'edit', {}, { path: 'src/math.js', edits: [{ old: 'return Number(a) + Number(b);', new: 'const s = Number(a) + Number(b);\n  return s;' }] });
    assert.strictEqual(p.body.status, 'proposed');
    const stale = await call('POST', 'edit', {}, { chunk: c.body.card.id, content: 'function add() {}\n' });
    assert.strictEqual(stale.status, 409, JSON.stringify(stale.body)); assert.match(stale.body.error, /changed since it was indexed/);
    RI.reject(p.body.files[0].inject);
    RI.setMode(U, 'auto');
  });
  await t('CT-307', 'delete through the trail, then revert it', async () => {
    const r = await call('POST', 'delete', {}, { path: 'src/minus.js' });
    assert.strictEqual(r.status, 200); assert.strictEqual(disk('src/minus.js'), null);
    const v = RI.revert(r.body.files[0].inject, { layer });
    assert.ok(v.ok, JSON.stringify(v.errors)); assert.ok(disk('src/minus.js').includes('function sub'));
  });
  await t('CT-308', 'check: syntax per file, and the related tests (a repo with no COS compartment says it could not run them)', async () => {
    const r = await call('POST', 'check', {}, { paths: ['src/math.js'], tests: true });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.files[0].ok, true);
    assert.ok(r.body.tests.runs.some(x => x.file === 'tests/math.test.js'), JSON.stringify(r.body.tests));
    assert.ok(r.body.tests.ran >= 1 || r.body.tests.couldNotRun >= 1);
  });

  console.log('\n── the agent tools ────────────────────────────────────');
  const T = require(path.join(ROOT, 'lib/agent-tools/tools/idearium/code.js'));
  await t('CT-401', 'registered in the tool registry, in the Files & code group, with a guide note each', () => {
    const AT = require(path.join(ROOT, 'lib/agent-tools/index.js'));
    const C = require(path.join(ROOT, 'lib/agent-tools/tool-catalog.js'));
    const G = require(path.join(ROOT, 'lib/agent-tools/tool-guide.js'));
    for (const n of T.CODE_TOOLS) {
      assert.ok(AT.TOOLS.has(n), `${n} not registered`);
      assert.strictEqual(C.groupOf(n).id, 'files', `${n} group`);
      assert.ok(G.toolGuide([n]).includes(n), `${n} has no guide note`);
    }
    assert.strictEqual(T.CODE_TOOLS.length, 11);
  });
  await t('CT-402', 'scope: every code tool in a new repo hat; the read-only ones always in scope; the harness scope lists them', () => {
    const RH = require(path.join(ROOT, 'lib/repo-hat.js'));
    const RA = require(path.join(ROOT, 'lib/repo-agent.js'));
    for (const n of T.CODE_TOOLS) assert.ok(RH.REPO_TOOL_SCOPE.includes(n), `${n} not in REPO_TOOL_SCOPE`);
    for (const n of T.READ_ONLY) assert.ok(RA.ALWAYS_IN_SCOPE.includes(n));
    assert.ok(!RA.ALWAYS_IN_SCOPE.includes('idearium.code_edit.tool'), 'a write tool was widened into every scope');
    assert.deepStrictEqual(RA.listedTools(), [...T.LISTED, 'loom.find.tool']);
  });

  // a server that routes exactly as idearium/api/index.js does for these paths
  const srv = http.createServer((req, res) => {
    let raw = ''; req.on('data', c => { raw += c; });
    req.on('end', async () => {
      const [p, qs] = req.url.split('?');
      const query = Object.fromEntries(new URLSearchParams(qs || ''));
      const body = raw ? JSON.parse(raw) : {};
      const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      let m = /^\/api\/repos\/([^/]+)\/code\/([^/]+)$/.exec(p);
      if (m) {
        const r = await handleCode({ method: req.method, op: m[2], layer, repo: layer.get(m[1]), uuid: m[1], dir, query, body, emit: () => {} });
        if (r.status >= 400) { const { error, ...detail } = r.body; return send(r.status, { ok: false, error, detail }); }
        return send(200, { ok: true, ...r.body });
      }
      m = /^\/api\/repos\/([^/]+)\/injects\/([^/]+)\/(revert|reject)$/.exec(p);
      if (m) { const r = m[3] === 'revert' ? RI.revert(m[2], { layer }) : RI.reject(m[2], { reason: body.reason }); return r.ok ? send(200, { ok: true, inject: r.inject }) : send(400, { ok: false, error: r.errors.join('; ') }); }
      send(404, { ok: false, error: 'no route' });
    });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  process.env.IDEARIUM_PORT = String(srv.address().port);
  const ctx = { context: { agentId: `repo-${U}` } };

  await t('CT-403', 'repoUuid comes from the run\'s context (repo-<uuid> agent); without one the tool says so', async () => {
    assert.match((await T.code_map.execute({}, {})).error, /no repo/);
    const m = await T.code_map.execute({}, ctx);
    assert.strictEqual(m.repo.uuid, U);
  });
  await t('CT-404', 'code_search → code_chunk → code_refs answer in the compact shapes', async () => {
    const s = await T.code_search.execute({ query: 'multiply' }, ctx);
    assert.ok(s.results[0].id && /^src\/math\.js:\d+-\d+$/.test(s.results[0].at) && s.results[0].summary, JSON.stringify(s));
    const c = await T.code_chunk.execute({ id: 'src/math.js#mul' }, ctx);
    assert.strictEqual(c.name, 'mul'); assert.ok(c.code.includes('return a * b;')); assert.ok(Array.isArray(c.usedBy));
    const r = await T.code_refs.execute({ name: 'add' }, ctx);
    assert.ok(r.definedIn.length === 1 && r.usedBy.some(u => /src\/app\.js, import/.test(u)), JSON.stringify(r));
  });
  await t('CT-405', 'code_read (lines + outline), code_grep', async () => {
    const r = await T.code_read.execute({ path: 'src/math.js', start: 1, end: 3 }, ctx);
    assert.strictEqual(r.lines, `1-3 of ${disk('src/math.js').split('\n').length}`); assert.strictEqual(r.hash.length, 12);
    const o = await T.code_read.execute({ path: 'src/math.js', outline: true }, ctx);
    assert.ok(o.chunks.some(l => / function add /.test(l)));
    const g = await T.code_grep.execute({ pattern: 'function (add|mul)', regex: true }, ctx);
    assert.strictEqual(g.total, 2); assert.ok(g.matches[0].chunk);
  });
  await t('CT-406', 'code_edit: shorthand {old,new} works; a refusal comes back with its detail flattened', async () => {
    const ok = await T.code_edit.execute({ path: 'src/app.js', old: 'Sums a list.', new: 'Sums a list of numbers.' }, ctx);
    assert.strictEqual(ok.status, 'applied', JSON.stringify(ok)); assert.match(ok.files[0].diff, /\+\/\*\* Sums a list of numbers\. \*\//);
    const bad = await T.code_edit.execute({ path: 'src/app.js', edits: [{ old: 'nope nope', new: 'x' }] }, ctx);
    assert.match(bad.error, /not found/); assert.strictEqual(bad.nothingWritten, true);
  });
  await t('CT-407', 'code_write (create / move / delete), code_batch, code_check', async () => {
    const w = await T.code_write.execute({ path: 'src/k.js', content: 'module.exports = 3;\n' }, ctx);
    assert.strictEqual(w.files[0].created, true, JSON.stringify(w));
    const mv = await T.code_write.execute({ action: 'move', path: 'src/k.js', to: 'src/k2.js' }, ctx);
    assert.strictEqual(mv.status, 'applied', JSON.stringify(mv));
    const d = await T.code_write.execute({ action: 'delete', path: 'src/k2.js' }, ctx);
    assert.strictEqual(d.files[0].deleted, true, JSON.stringify(d)); assert.strictEqual(disk('src/k2.js'), null);
    const b = await T.code_batch.execute({ ops: [{ op: 'write', path: 'src/z.js', content: 'module.exports = 0;\n' }], dryRun: true }, ctx);
    assert.match(b.status, /dry run/); assert.strictEqual(disk('src/z.js'), null);
    const c = await T.code_check.execute({ paths: ['src/app.js'], tests: false }, ctx);
    assert.strictEqual(c.passed, true, JSON.stringify(c));
  });
  await t('CT-408', 'code_changes: list, then revert an applied change; withdraw a proposal', async () => {
    const l = await T.code_changes.execute({}, ctx);
    const applied = l.changes.find(x => x.status === 'applied' && x.path === 'src/app.js');
    assert.ok(applied, JSON.stringify(l.changes.slice(0, 3)));
    const before = disk('src/app.js');
    const v = await T.code_changes.execute({ action: 'revert', inject: applied.inject }, ctx);
    assert.ok(!v.error, v.error); assert.notStrictEqual(disk('src/app.js'), before);
    RI.setMode(U, 'review');
    const p = await T.code_edit.execute({ path: 'src/app.js', edits: [{ old: 'function total', new: 'function total2' }], force: true }, ctx);
    assert.strictEqual(p.status, 'proposed');
    const wd = await T.code_changes.execute({ action: 'withdraw', inject: p.files[0].inject }, ctx);
    assert.ok(!wd.error); assert.strictEqual(RI.get(p.files[0].inject).status, 'rejected');
  });

  await t('CT-409', 'a hat forged before the code tools gets them on persona refresh — added, named, nothing removed', () => {
    const RH = require(path.join(ROOT, 'lib/repo-hat.js'));
    const forge = require(path.join(ROOT, 'lib/hat-forge.js'));
    const repo = { ...layer.get(U), compartmentId: 'cos.test.code-tools' };   // a hat is scoped by a compartment
    const e = RH.ensureRepoHat({ repo, repoDir: dir });
    assert.ok(e.ok, JSON.stringify(e.errors));
    const hat = RH.getRepoHat(U);
    const old = hat.toolScope.filter(x => !T.CODE_TOOLS.includes(x)).concat(['loom.card.tool']);
    const u = forge.update(hat.uuid || hat.id, { toolScope: old });
    assert.ok(u.ok !== false, JSON.stringify(u.errors));
    const r = RH.refreshRepoHatPersona({ repo, repoDir: dir });
    assert.ok(r.ok, JSON.stringify(r.errors));
    assert.deepStrictEqual([...r.toolsAdded].sort(), [...T.CODE_TOOLS].sort());
    const after = RH.getRepoHat(U).toolScope;
    assert.ok(after.includes('idearium.code_edit.tool') && after.includes('loom.card.tool'));
    assert.ok(/idearium\.code_search\.tool/.test(RH.getRepoHat(U).personaPrompt));
    assert.deepStrictEqual(RH.refreshRepoHatPersona({ repo, repoDir: dir }).toolsAdded, [], 'a second refresh adds nothing');
  });

  srv.close();
  console.log(`\n${failed ? '✗' : '✓'} code-tools: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
