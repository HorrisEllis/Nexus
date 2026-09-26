'use strict';
/**
 * loom/test/system-scaffold.test.js — Phase 145 verification.
 * Doesn't just check the generator's return value — actually spawns the
 * generated CLI as a child process and hits the generated API's HTTP
 * server, because a code generator that produces syntax errors is worse
 * than no generator at all.
 * Run: node loom/test/system-scaffold.test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { execFileSync } = require('child_process');
const { scaffoldSystem } = require('../templates/system-scaffold');

let pass = 0, fail = 0;
function check(label, fn) {
  return Promise.resolve().then(fn).then(() => { pass++; console.log(`  PASS  ${label}`); })
    .catch(e => { fail++; console.log(`  FAIL  ${label} — ${e.message}`); });
}

async function main() {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-scaffold-out-'));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-scaffold-data-'));

  console.log('\nLOOM Phase 145 — system-scaffold test\n');

  const operations = [
    { id: 'list', verb: 'list', method: 'GET', apiPath: '/api/widgets', description: 'list widgets' },
    { id: 'create', verb: 'create', method: 'POST', apiPath: '/api/widgets', params: ['name'], description: 'create a widget' },
  ];

  let result;
  await check('scaffoldSystem writes all nine projections (extended 2026-09-11), no UI file among them', async () => {
    result = scaffoldSystem('widget-forge', {
      port: 9911, purpose: 'test system', operations, outDir, dataDir,
    });
    assert.strictEqual(result.written.length, 9);
    const names = result.written.map(p => path.basename(p));
    assert.ok(names.includes('index.js') || true); // both cli/index.js and api/index.js share basename, checked below
    assert.ok(result.written.some(p => p.endsWith('cli/index.js')));
    assert.ok(result.written.some(p => p.endsWith('api/index.js')));
    assert.ok(result.written.some(p => p.endsWith('registry-components.js')));
    assert.ok(result.written.some(p => p.endsWith('interaction-contract.json')));
    assert.ok(result.written.some(p => p.endsWith('spec/widget-forge.spec')), 'real .spec, not .spec.md');
    assert.ok(result.written.some(p => p.endsWith('config.js')));
    assert.ok(result.written.some(p => p.endsWith('event-taxonomy.js')));
    assert.ok(result.written.some(p => p.endsWith('command-index.js')));
    assert.ok(result.written.some(p => p.endsWith('tool-index.js')));
    assert.ok(!result.written.some(p => /ui[\/\\]/.test(p)), 'a ui/ path was generated — this must never happen');
    assert.ok(fs.existsSync(path.join(outDir, 'data', 'widget-forge', 'failures')), 'data/<system>/failures not created');
    assert.ok(fs.existsSync(path.join(outDir, 'data', 'widget-forge', 'invariant')), 'data/<system>/invariant not created');
  });

  await check('generated component + hooks actually registered in LOOM, on disk', async () => {
    assert.strictEqual(result.registered.component.ok, true, JSON.stringify(result.registered.component));
    assert.strictEqual(result.registered.hooks.length, 2);
    assert.ok(result.registered.hooks.every(h => h.ok));
    const onDisk = JSON.parse(fs.readFileSync(path.join(dataDir, 'registry.json'), 'utf8'));
    assert.ok(onDisk.component['nexus.widget-forge']);
    assert.strictEqual(Object.keys(onDisk.hook).length, 2);
  });

  await check('generated interaction-contract.json matches idearium\'s real shape (id/version/namespace/port/transport/resources)', async () => {
    const contract = JSON.parse(fs.readFileSync(path.join(outDir, 'widget-forge', 'interaction-contract.json'), 'utf8'));
    for (const key of ['id', 'version', 'namespace', 'port', 'transport', 'resources']) {
      assert.ok(key in contract, `missing key: ${key}`);
    }
    assert.strictEqual(contract.namespace, 'widget-forge');
    assert.strictEqual(contract.port, 9911);
    assert.ok(contract.resources.list);
    assert.ok(contract.resources.create);
  });

  await check('generated registry-components.js is valid, loadable JS with correct entries', async () => {
    const mod = require(path.join(outDir, 'widget-forge', 'registry-components.js'));
    assert.strictEqual(mod.length, 2);
    assert.strictEqual(mod[0].id, 'widget-forge.list');
    assert.strictEqual(mod[1].route.method, 'POST');
  });

  await check('generated API actually starts and responds to a real HTTP request', async () => {
    const { createServer } = require(path.join(outDir, 'widget-forge', 'api', 'index.js'));
    const server = createServer();
    await new Promise(resolve => server.listen(9911, resolve));
    try {
      const body = await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:9911/api/widgets', res => {
          let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d));
        }).on('error', reject);
      });
      const parsed = JSON.parse(body);
      assert.strictEqual(parsed.ok, true);
      assert.strictEqual(parsed.op, 'list');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  await check('generated CLI actually runs as a real child process and prints real JSON', async () => {
    const cliPath = path.join(outDir, 'widget-forge', 'cli', 'index.js');
    const out = execFileSync('node', [cliPath, 'list'], { encoding: 'utf8' });
    const parsed = JSON.parse(out);
    assert.strictEqual(parsed.ok, true);
    assert.strictEqual(parsed.op, 'list');
  });

  await check('generated CLI on an unknown verb exits non-zero with a clear message, does not hang', async () => {
    let threw = false;
    try {
      execFileSync('node', [path.join(outDir, 'widget-forge', 'cli', 'index.js'), 'nonexistent-verb'], { encoding: 'utf8' });
    } catch (e) {
      threw = true;
      assert.ok(e.stderr.includes('Unknown verb'));
    }
    assert.ok(threw, 'expected the CLI to exit non-zero on an unknown verb');
  });

  await check('overlapping paths (e.g. /api/x and /api/x/sub) route to the correct handler, not the shorter prefix — regression test for a real bug found this session', async () => {
    const overlapOps = [
      { id: 'thing.list', verb: 'list', method: 'GET', apiPath: '/api/thing' },
      { id: 'thing.detail', verb: 'detail', method: 'GET', apiPath: '/api/thing/detail' },
    ];
    const r = scaffoldSystem('overlap-check', { port: 9913, operations: overlapOps, outDir, dataDir });
    const { createServer } = require(path.join(outDir, 'overlap-check', 'api', 'index.js'));
    const server = createServer();
    await new Promise(resolve => server.listen(9913, resolve));
    try {
      const body = await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:9913/api/thing/detail', res => {
          let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d));
        }).on('error', reject);
      });
      const parsed = JSON.parse(body);
      assert.strictEqual(parsed.op, 'thing.detail', `expected the more specific route to win, got op="${parsed.op}"`);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  await check('a :param path segment (e.g. /proposals/:id/evaluate) matches a real id and extracts it into args — regression test for a real bug found this session', async () => {
    const paramOps = [
      { id: 'thing.list',     verb: 'list',     method: 'GET',  apiPath: '/things' },
      { id: 'thing.evaluate', verb: 'evaluate', method: 'POST', apiPath: '/things/:id/evaluate' },
    ];
    scaffoldSystem('param-check', { port: 9914, operations: paramOps, outDir, dataDir });
    const { createServer } = require(path.join(outDir, 'param-check', 'api', 'index.js'));
    const server = createServer();
    await new Promise(resolve => server.listen(9914, resolve));
    try {
      const body = await new Promise((resolve, reject) => {
        const req = http.request('http://127.0.0.1:9914/things/abc123/evaluate', { method: 'POST' }, res => {
          let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d));
        });
        req.on('error', reject);
        req.end();
      });
      const parsed = JSON.parse(body);
      assert.strictEqual(parsed.op, 'thing.evaluate', `expected the :id route to match a real id, got op="${parsed.op}"`);
      assert.strictEqual(parsed.args.id, 'abc123', `expected :id to be extracted into args.id, got ${JSON.stringify(parsed.args)}`);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  await check('a POST body is actually read and merged into args, not silently ignored — regression test for a real bug found this session', async () => {
    const bodyOps = [
      { id: 'thing.create', verb: 'create', method: 'POST', apiPath: '/things' },
    ];
    scaffoldSystem('body-check', { port: 9915, operations: bodyOps, outDir, dataDir });
    const { createServer } = require(path.join(outDir, 'body-check', 'api', 'index.js'));
    const server = createServer();
    await new Promise(resolve => server.listen(9915, resolve));
    try {
      const body = await new Promise((resolve, reject) => {
        const payload = JSON.stringify({ text: 'a real proposed value', causedBy: 'test-trigger-id' });
        const req = http.request('http://127.0.0.1:9915/things', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        }, res => {
          let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d));
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
      });
      const parsed = JSON.parse(body);
      assert.strictEqual(parsed.args.text, 'a real proposed value', `expected the POST body's text field to reach args, got ${JSON.stringify(parsed.args)}`);
      assert.strictEqual(parsed.args.causedBy, 'test-trigger-id');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  await check('invalid system name is rejected before anything is written', async () => {
    assert.throws(() => scaffoldSystem('Bad Name!', { port: 1, operations, outDir, dataDir }), /lowercase/);
  });

  await check('empty operations list is rejected', async () => {
    assert.throws(() => scaffoldSystem('empty-ops', { port: 9912, operations: [], outDir, dataDir }), /non-empty array/);
  });

  console.log(`\n${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exit(1);
}

main();
