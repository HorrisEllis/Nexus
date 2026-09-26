'use strict';
// §SANDBOX — idearium + COS under a throwaway root (lib/test-sandbox.js).
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cos-remote-api.test.js — §0.39.265
 *
 * The compartment-remote routes against a REAL idearium API process:
 *   a spec-created repo's compartment → add a folder remote → push (the repo
 *   folder is mounted and travels) → "another machine" (its own COS home)
 *   pulls it, edits the project, pushes → pull through the API brings the
 *   edit into the repo itself (readable through the repo's file API) →
 *   browse + clone pulls a compartment this machine did not have, and its
 *   project becomes a new repo.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
let passed = 0, failed = 0;
async function test(desc, fn) {
  try { await fn(); console.log(`  ✓ ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${desc}\n    ${e.message}`); failed++; }
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-remote-api-'));
const remoteDir = path.join(tmp, 'remote');
const machineB = path.join(tmp, 'machine-b');
const PORT = 20000 + Math.floor(Math.random() * 20000);

function call(method, p, body, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: '127.0.0.1', port: PORT, method, path: p, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}, timeout: timeoutMs }, (res) => {
      let s = ''; res.on('data', d => { s += d; }); res.on('end', () => { try { resolve({ status: res.statusCode, ...JSON.parse(s) }); } catch (_) { resolve({ status: res.statusCode, raw: s }); } });
    });
    req.on('error', reject); req.on('timeout', () => { req.destroy(new Error('timeout')); });
    if (data) req.write(data); req.end();
  });
}
function onB(code) {
  const r = spawnSync(process.execPath, ['-e', `
    const R = require(${JSON.stringify(path.join(ROOT, 'lib', 'cos-remote.js'))});
    const bridge = require(${JSON.stringify(path.join(ROOT, 'lib', 'cos-bridge.js'))});
    const fs = require('fs'), path = require('path');
    (async () => { const out = await (async () => { ${code} })(); process.stdout.write('\\n@@' + JSON.stringify(out)); })().catch(e => process.stdout.write('\\n@@' + JSON.stringify({ threw: e.message })));
  `], { env: { ...process.env, COS_DATA_ROOT: machineB }, encoding: 'utf8', timeout: 120000 });
  const line = (r.stdout || '').split('\n').reverse().find(l => l.startsWith('@@'));
  if (!line) throw new Error(`machine B: ${r.stderr}`);
  return JSON.parse(line.slice(2));
}

(async () => {
  console.log('\n  compartment remotes — through the idearium API');
  const api = spawn(process.execPath, [path.join(ROOT, 'idearium', 'api', 'index.js')], { env: { ...process.env, IDEARIUM_PORT: String(PORT), NEXUS_SUPERVISED: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; api.stdout.on('data', d => { log += d; }); api.stderr.on('data', d => { log += d; });
  const stop = () => { try { api.kill(); } catch (_) {} };
  try {
    let up = false;
    for (let i = 0; i < 120 && !up; i++) { try { up = (await call('GET', '/health', null, 2000)).ok === true; } catch (_) {} if (!up) await new Promise(r => setTimeout(r, 500)); }
    if (!up) throw new Error(`idearium did not start:\n${log.slice(-2000)}`);
    for (let i = 0; i < 40; i++) { const t = await call('GET', '/api/spec-engine/templates'); if (t.ok) break; await new Promise(r => setTimeout(r, 250)); }

    let repoUuid, cid;
    await test('a spec-created repo has a compartment, listed with its repo', async () => {
      const c = await call('POST', '/api/spec-engine/specs', { name: 'beatbox', description: 'a beat box' });
      assert.ok(c.ok && c.repoUuid, JSON.stringify(c).slice(0, 300));
      repoUuid = c.repoUuid;
      const wr = await call('POST', `/api/repos/${repoUuid}/file`, { path: 'src/beat.js', content: 'module.exports = "boom";\n' });
      assert.ok(wr.ok, JSON.stringify(wr).slice(0, 300));
      const l = await call('GET', '/api/cos/compartments');
      const mine = l.compartments.find(x => x.repo && x.repo.uuid === repoUuid);
      assert.ok(mine, 'the repo\'s compartment is listed');
      cid = mine.id;
    });

    await test('add a folder remote and push — the repo folder is mounted and travels with the compartment', async () => {
      const a = await call('POST', `/api/cos/compartments/${cid}/remotes`, { name: 'usb', location: remoteDir });
      assert.ok(a.ok, JSON.stringify(a));
      assert.strictEqual((await call('POST', `/api/cos/compartments/${cid}/remotes`, { name: 'bad', location: 'not/absolute' })).status, 400);
      const p = await call('POST', `/api/cos/compartments/${cid}/remotes/usb/push`, {});
      assert.ok(p.ok && p.state === 'not-pushed', JSON.stringify(p));
      const l = await call('GET', `/api/cos/compartments/${cid}/remotes`);
      assert.ok(l.parts.includes('project') && l.repoUuid === repoUuid, JSON.stringify(l));
      const meta = JSON.parse(fs.readFileSync(path.join(remoteDir, l.name, 'meta.json'), 'utf8'));
      assert.ok(meta.files.some(f => f[0] === 'project' && f[1] === 'src/beat.js'), 'the repo file is in the bundle');
      assert.strictEqual((await call('GET', `/api/cos/compartments/${cid}/remotes/usb/status`)).state, 'in-sync');
    });

    await test('another machine pulls, edits the project, pushes; the API pull brings the edit INTO the repo', async () => {
      const name = (await call('GET', `/api/cos/compartments/${cid}/remotes`)).name;
      const b = onB(`const r = await R.pull({ location: ${JSON.stringify(remoteDir)}, name: ${JSON.stringify(name)}, projectDir: ${JSON.stringify(path.join(tmp, 'b-project'))} });
        if (!r.ok) return r;
        bridge.mountPath(r.compartmentId, { path: r.project.dir, role: 'project' });
        fs.writeFileSync(path.join(r.project.dir, 'src', 'beat.js'), 'module.exports = "boom-tss";\\n');
        return await R.push({ compartment: r.compartmentId, remote: 'origin' });`);
      assert.ok(b.ok, JSON.stringify(b));
      assert.strictEqual((await call('GET', `/api/cos/compartments/${cid}/remotes/usb/status`)).state, 'behind');
      const refused = await call('POST', `/api/cos/compartments/${cid}/remotes/usb/push`, {});
      assert.ok(refused.status === 409 && refused.detail && refused.detail.state === 'behind', JSON.stringify(refused));
      const p = await call('POST', `/api/cos/compartments/${cid}/remotes/usb/pull`, {});
      assert.ok(p.ok && p.repoSync && p.repoSync.applied.includes('src/beat.js'), JSON.stringify(p).slice(0, 600));
      const f = await call('GET', `/api/repos/${repoUuid}/file?path=src%2Fbeat.js`);
      assert.ok(JSON.stringify(f).includes('boom-tss'), `the repo itself has the edit: ${JSON.stringify(f).slice(0, 300)}`);
      const after = await call('GET', `/api/cos/compartments/${cid}/remotes/usb/status`);
      assert.strictEqual(after.state, 'in-sync', `bringing the edit into the repo must not make this machine look "ahead": ${JSON.stringify(after.diff)}`);
    });

    await test('browse + clone: a compartment only the other machine had is pulled here and its project becomes a repo', async () => {
      const b = onB(`const c = bridge.createCompartment({ name: 'synthkit', purpose: 'a synth' });
        const proj = ${JSON.stringify(path.join(tmp, 'synth-project'))};
        fs.mkdirSync(path.join(proj, 'src'), { recursive: true }); fs.writeFileSync(path.join(proj, 'src', 'osc.js'), 'module.exports = 440;\\n');
        bridge.mountPath(c.compartment.id, { path: proj, role: 'project' });
        R.addRemote(c.compartment.id, { name: 'usb', location: ${JSON.stringify(remoteDir)} });
        return await R.push({ compartment: c.compartment.id, remote: 'usb' });`);
      assert.ok(b.ok, JSON.stringify(b));
      const br = await call('POST', '/api/cos/remote/browse', { location: remoteDir });
      const s = br.compartments.find(x => x.name === 'synthkit');
      assert.ok(br.ok && s && !s.here && s.purpose === 'a synth', JSON.stringify(br));
      const c = await call('POST', '/api/cos/remote/clone', { location: remoteDir, name: 'synthkit' }, 300000);
      assert.ok(c.ok && c.repo && c.repo.repoUuid, JSON.stringify(c).slice(0, 600));
      const f = await call('GET', `/api/repos/${c.repo.repoUuid}/file?path=src%2Fosc.js`);
      assert.ok(JSON.stringify(f).includes('440'), JSON.stringify(f).slice(0, 300));
      const l = await call('GET', '/api/cos/compartments');
      const here = l.compartments.find(x => x.name === 'synthkit');
      assert.ok(here && here.repo && here.repo.uuid === c.repo.repoUuid && here.remotes.some(r => r.name === 'origin'), 'the new compartment is linked to its repo and remembers where it came from');
      assert.strictEqual((await call('POST', '/api/cos/remote/clone', { location: remoteDir, name: 'synthkit' })).status, 400, 'a second clone is refused');
    });
  } catch (e) { console.error(`  ✗ ${e.message}`); failed++; }
  finally { stop(); fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
