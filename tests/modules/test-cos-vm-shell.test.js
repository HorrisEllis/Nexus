'use strict';
// VS-01..06 (0.60.77): `cos vm shell` — the test VM's own terminal, passed straight through (ssh over the loopback forward).
// James, 2026-10-16: "Can we have a passthrogu to the terminal for the test inviremr t. Need to get cos working."
const assert = require('assert'), { EventEmitter } = require('events');
const { shellCommand, runVmCommand } = require('../../cos/cli/commands/vm.js');
const { desktopPorts } = require('../../cos/compartment/qemu-runtime.js');
let passed = 0, failed = 0;
const test = async (n, f) => { try { await f(); console.log('  ok ' + n); passed++; } catch (e) { console.log('  FAIL ' + n + '\n    ' + String(e.message).split('\n')[0]); failed++; } };
const comp = { id: 'comp-test-1', name: 'testvm', runtimeId: 'qemu-windows', entryFile: null, envVars: {}, fs: { root: process.cwd() } };
const host = { store: { getCompartmentByName: n => n === 'testvm' ? comp : null, getCompartment: () => null } };
const fakeSpawn = (code = 0, err = null) => { const calls = []; const f = (bin, args, opts) => { calls.push({ bin, args, opts }); const c = new EventEmitter(); setImmediate(() => err ? c.emit('error', err) : c.emit('close', code)); return c; }; f.calls = calls; return f; };
const sink = () => { const lines = []; return { lines, log: (...a) => lines.push(a.join(' ')), error: (...a) => lines.push(a.join(' ')) }; };

(async () => {
  await test('VS-01 a running VM: ssh to the loopback forward of THIS compartment, the terminal handed through (stdio inherit, a tty)', async () => {
    const sp = fakeSpawn(0), o = { ...sink(), spawn: sp, isLive: async () => true };
    const r = await shellCommand(host, 'testvm', [], {}, o);
    const c = sp.calls[0], port = desktopPorts('comp-test-1').sshPort;
    assert.strictEqual(c.bin, 'ssh'); assert.strictEqual(c.opts.stdio, 'inherit'); assert.ok(c.args.includes('-t'));
    assert.strictEqual(c.args[c.args.indexOf('-p') + 1], String(port)); assert.ok(c.args.includes('nexus@127.0.0.1')); assert.strictEqual(r.ok, true);
  });
  await test('VS-02 a command after the name runs that command, no tty forced; --user changes the login', async () => {
    const sp = fakeSpawn(0), o = { ...sink(), spawn: sp, isLive: async () => true };
    await shellCommand(host, 'testvm', ['npm', 'test'], { user: 'tester' }, o);
    const a = sp.calls[0].args; assert.ok(!a.includes('-t')); assert.deepStrictEqual(a.slice(-3), ['tester@127.0.0.1', 'npm', 'test']);
  });
  await test('VS-03 the guest\'s exit code comes back (a failing test in the VM is a failing command here)', async () => {
    const r = await shellCommand(host, 'testvm', ['false'], {}, { ...sink(), spawn: fakeSpawn(3), isLive: async () => true });
    assert.strictEqual(r.ok, false); assert.strictEqual(r.code, 3);
  });
  await test('VS-04 a VM that is not running: says so and how to start it, and does not call ssh', async () => {
    const sp = fakeSpawn(0), o = { ...sink(), spawn: sp, isLive: async () => false };
    const r = await shellCommand(host, 'testvm', [], {}, o); assert.strictEqual(r, null); assert.strictEqual(sp.calls.length, 0); assert.match(o.lines.join('\n'), /not running — start it first: cos start testvm/);
  });
  await test('VS-05 no ssh client: the message names where to get one (not a stack trace)', async () => {
    const o = { ...sink(), spawn: fakeSpawn(0, Object.assign(new Error('spawn ssh ENOENT'), { code: 'ENOENT' })), isLive: async () => true };
    const r = await shellCommand(host, 'testvm', [], {}, o); assert.strictEqual(r.ok, false); assert.match(o.lines.join('\n'), /OpenSSH Client/);
  });
  await test('VS-06 unknown compartment and a non-VM runtime are refused with their reason; the dispatcher routes `shell`', async () => {
    const o = sink(); assert.strictEqual(await shellCommand(host, 'nope', [], {}, o), null); assert.match(o.lines.join('\n'), /compartment not found/);
    const o2 = sink(); const h2 = { store: { getCompartmentByName: () => ({ ...comp, runtimeId: 'process' }) } }; assert.strictEqual(await shellCommand(h2, 'x', [], {}, o2), null); assert.match(o2.lines.join('\n'), /not "qemu-windows"|only applies/);
    const sp = fakeSpawn(0); const r = await runVmCommand(host, 'shell', ['testvm'], {}, { ...sink(), spawn: sp, isLive: async () => true }); assert.strictEqual(r.ok, true);
  });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
