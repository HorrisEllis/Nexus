'use strict';
// tests/modules/test-nexstore-log.test.js — N1 of docs/2026-09-29-nex-node-store-phasemap.spec (0.39.300).
// The map's proof: "a child process killed mid-append (many times, at random points); on reopen every acknowledged
// record is there, the chain verifies, the torn tail is reported".
//
//   LG-01  25 rounds: a child appends (records of random size, small segments so it rolls over) and says each ack;
//          it is SIGKILLed at a random moment. On every reopen: every acknowledged record is there with its hash, the
//          chain verifies, the dead writer's lock is taken over and said. Every fifth round the death also lands
//          inside a frame (the frame's first bytes written, the rest never) — the torn tail is cut, kept under torn/,
//          reported, and nothing acknowledged is lost
//   LG-02  corruption is refused, never repaired by dropping: a flipped byte in an earlier segment, a broken link
//   LG-03  one writer (I2): a second open while the writer lives is refused, in another process and in this one
//   LG-04  provenance (I3): every record carries seq, prev, hash, op, type, id, change, causedBy, by, at; a write
//          without a cause field is refused (causedBy: null is allowed and said)
//   LG-05  reads: from/to across segments, in seq order, from disk
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '../..');
const L = require(path.join(ROOT, 'lib/nexstore/log.js'));
const R = require(path.join(ROOT, 'lib/nexstore/record.js'));
const SEG = 96 * 1024;

// ── the child: append forever, say each ack once the append has returned ──
if (process.argv[2] === '--child') {
  const log = L.open(process.argv[3], { segmentBytes: SEG, by: 'test-child' });
  process.stdout.write(`open ${log.lastSeq}\n`);
  let n = 0;
  for (;;) {
    const size = 1 + Math.floor(Math.random() * 12000);
    const rec = log.append({ op: 'create', type: 'probe', id: `p${process.pid}-${n++}`, change: { pad: 'x'.repeat(size) }, causedBy: null });
    fs.writeSync(1, `ack ${rec.seq} ${rec.hash}\n`);
  }
}

let passed = 0, failed = 0;
const pending = [];
function test(id, name, fn) {
  pending.push(async () => {
    try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
    catch (e) { console.error(`  ✗ ${id} ${name}\n    ${e.stack}`); failed++; }
  });
}
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), `nexlog-${p}-`));
const wait = (ms) => new Promise(r => setTimeout(r, ms));

function runChild(dir, killAfterMs) {
  return new Promise((resolve, reject) => {
    const c = spawn(process.execPath, [__filename, '--child', dir], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } });
    let out = '', err = '', opened = false;
    c.stdout.on('data', (d) => {
      out += d;
      if (!opened && /^open /m.test(out)) { opened = true; setTimeout(() => c.kill('SIGKILL'), killAfterMs); }
    });
    c.stderr.on('data', (d) => { err += d; });
    c.on('exit', (code, sig) => {
      if (sig !== 'SIGKILL') return reject(new Error(`the child exited by itself (${code}): ${err}`));
      const acks = out.split('\n').filter(l => /^ack \d+ [0-9a-f]{64}$/.test(l)).map(l => { const [, s, h] = l.split(' '); return { seq: +s, hash: h }; });
      resolve({ acks, err });
    });
    setTimeout(() => { if (!opened) c.kill('SIGKILL'); }, 15000);
  });
}

/** the death inside a frame: the next frame's first bytes reach the disk, the rest never do */
function tearTail(dir) {
  const segs = fs.readdirSync(dir).filter(f => /^seg-\d{6}\.log$/.test(f)).sort();
  const lastSeg = path.join(dir, segs[segs.length - 1]);
  const frame = R.encode(R.seal({ op: 'create', type: 'probe', id: 'never-acked', change: { pad: 'y'.repeat(3000) }, causedBy: null }, { seq: 999999, prev: null }));
  const cut = 1 + Math.floor(Math.random() * (frame.length - 2));
  fs.appendFileSync(lastSeg, frame.subarray(0, cut));
  return cut;
}

test('LG-01', 'killed mid-append 25 times: every ack survives, the chain verifies, the torn tail is reported', async () => {
  const dir = tmp('kill');
  const acked = new Map();
  let tornSeen = 0, tornMade = 0, staleSeen = 0, naturalTorn = 0, appendedBeyondAck = 0;
  for (let round = 1; round <= 25; round++) {
    const { acks } = await runChild(dir, 15 + Math.floor(Math.random() * 120));
    for (const a of acks) acked.set(a.seq, a.hash);
    let made = 0;
    if (round % 5 === 0) { made = tearTail(dir); tornMade++; }
    const log = L.open(dir, { segmentBytes: SEG });
    try {
      const rep = log.report;
      if (rep.staleLock) staleSeen++;
      if (made) {
        assert.ok(rep.torn, `round ${round}: the torn tail is reported`);
        assert.strictEqual(rep.torn.bytes >= made, true, `round ${round}: the cut covers the torn frame (${rep.torn.bytes} ≥ ${made})`);
        assert.ok(rep.torn.savedTo && fs.existsSync(path.join(dir, rep.torn.savedTo)), 'the cut bytes are kept under torn/ (§0.3)');
      }
      if (rep.torn) { tornSeen++; if (!made) naturalTorn++; }
      const all = log.read();
      const bySeq = new Map(all.map(r => [r.seq, r]));
      for (const [seq, hash] of acked) {
        const r = bySeq.get(seq);
        assert.ok(r, `round ${round}: acknowledged seq ${seq} is there`);
        assert.strictEqual(r.hash, hash, `round ${round}: seq ${seq} is the record that was acknowledged`);
      }
      appendedBeyondAck += Math.max(0, log.lastSeq - Math.max(0, ...acked.keys()));
      const v = log.verify();
      assert.ok(v.ok, `round ${round}: the chain verifies (${v.error || JSON.stringify(v.torn)})`);
      assert.strictEqual(v.records, log.lastSeq, 'records 1…last, no gap');
      assert.ok(!all.some(r => r.id === 'never-acked'), 'the torn record never became a record');
    } finally { log.close(); }
  }
  assert.ok(acked.size > 50, `the children acknowledged ${acked.size} records`);
  const segs = fs.readdirSync(dir).filter(f => /^seg-/.test(f));
  assert.ok(segs.length > 1, `the log rolled over into ${segs.length} segments`);
  assert.strictEqual(tornSeen >= tornMade, true, 'every torn tail made was reported');
  assert.ok(staleSeen >= 20, `the dead writer's lock was taken over and said (${staleSeen}/25)`);
  console.log(`      ${acked.size} acknowledged · ${segs.length} segments · ${tornSeen} torn tails reported (${naturalTorn} by the kill itself) · ${staleSeen} stale locks taken over`);
});

test('LG-02', 'corruption is refused, never repaired by dropping', async () => {
  const dir = tmp('corrupt');
  let log = L.open(dir, { segmentBytes: 4096 });
  for (let i = 0; i < 40; i++) log.append({ op: 'create', type: 'probe', id: `c${i}`, change: { pad: 'z'.repeat(300) }, causedBy: null });
  log.close();
  const segs = fs.readdirSync(dir).filter(f => /^seg-/.test(f)).sort();
  assert.ok(segs.length >= 3, 'several segments');
  const first = path.join(dir, segs[0]), original = fs.readFileSync(first);
  const bad = Buffer.from(original); bad[R.HEAD + 20] ^= 0xFF; fs.writeFileSync(first, bad);
  assert.throws(() => L.open(dir), /corrupt at byte 0 .*not the last segment/, 'a bad frame in an earlier segment refuses the open');
  assert.ok(!fs.existsSync(path.join(dir, 'LOCK')), 'a refused open leaves no lock behind');
  assert.strictEqual(L.verify(dir).ok, false);
  fs.writeFileSync(first, original);
  // a broken link with a valid crc: rewrite record 2's body with a forged prev, re-framed so the crc holds
  const d1 = R.decode(original, 0), d2 = R.decode(original, d1.next);
  const forged = R.encode({ ...d2.rec, prev: 'f'.repeat(64) });
  fs.writeFileSync(first, Buffer.concat([original.subarray(0, d1.next), forged, original.subarray(d2.next)]));
  assert.throws(() => L.open(dir), /prev does not match/, 'a broken link is refused');
  const tampered = R.encode({ ...d2.rec, change: { pad: 'tampered' } });
  fs.writeFileSync(first, Buffer.concat([original.subarray(0, d1.next), tampered, original.subarray(d2.next)]));
  assert.throws(() => L.open(dir), /hash does not match/, 'a changed record is refused');
  fs.writeFileSync(first, original);
  log = L.open(dir); assert.strictEqual(log.lastSeq, 40, 'restored, all forty there'); log.close();
});

test('LG-03', 'one writer (I2)', async () => {
  const dir = tmp('lock');
  const c = spawn(process.execPath, ['-e', `const L=require(${JSON.stringify(path.join(ROOT, 'lib/nexstore/log.js'))});L.open(${JSON.stringify(dir)});console.log('held');setInterval(()=>{},1000)`], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res) => c.stdout.on('data', (d) => { if (/held/.test(d)) res(); }));
  try { assert.throws(() => L.open(dir), /already has a writer \(pid \d+\)/, 'a second writer is refused while the first lives'); }
  finally { c.kill('SIGKILL'); await wait(100); }
  const log = L.open(dir); assert.ok(log.report.staleLock, 'once it dies its lock is taken over, and said');
  assert.throws(() => L.open(dir), /already open in this process/);
  log.close();
  const again = L.open(dir); assert.strictEqual(again.report.staleLock, null, 'a clean close leaves no lock'); again.close();
});

test('LG-04', 'provenance on every record; no write without a cause field (I3)', async () => {
  const dir = tmp('prov');
  const log = L.open(dir, { by: 'architect' });
  const a = log.append({ op: 'create', type: 'idea', id: 'u1', change: { text: 'hi' }, causedBy: null });
  const b = log.append({ op: 'patch', type: 'idea', id: 'u1', change: { text: 'hello' }, causedBy: a.hash });
  for (const f of R.FIELDS) assert.ok(f in a, `the record carries ${f}`);
  assert.strictEqual(a.seq, 1); assert.strictEqual(a.prev, null); assert.strictEqual(b.prev, a.hash);
  assert.strictEqual(a.by, 'architect'); assert.ok(!Number.isNaN(Date.parse(a.at)));
  assert.throws(() => log.append({ op: 'create', type: 'idea', id: 'u2' }), /no write without a cause field/);
  assert.throws(() => log.append({ type: 'idea', causedBy: null }), /needs an op/);
  assert.strictEqual(log.lastSeq, 2, 'a refused write took no seq');
  log.close();
});

test('LG-05', 'reads across segments, in seq order, from disk', async () => {
  const dir = tmp('read');
  const log = L.open(dir, { segmentBytes: 2048 });
  for (let i = 1; i <= 60; i++) log.append({ op: 'create', type: 'n', id: String(i), change: { pad: 'r'.repeat(100) }, causedBy: null });
  assert.ok(log.segmentCount >= 4, `${log.segmentCount} segments`);
  assert.deepStrictEqual(log.read({ from: 17, to: 41 }).map(r => r.seq), Array.from({ length: 25 }, (_, i) => 17 + i));
  assert.strictEqual(log.read().length, 60);
  assert.deepStrictEqual(log.read({ from: 60 }).map(r => r.id), ['60']);
  log.close();
  const v = L.verify(dir); assert.ok(v.ok && v.records === 60);
  // the same check from a fresh process: nothing lives only in memory
  const r = spawnSync(process.execPath, ['-e', `const L=require(${JSON.stringify(path.join(ROOT, 'lib/nexstore/log.js'))});const l=L.open(${JSON.stringify(dir)});console.log(l.lastSeq, l.read({from:30,to:30})[0].id);l.close()`], { encoding: 'utf8' });
  assert.strictEqual(r.stdout.trim(), '60 30');
});

(async () => {
  for (const p of pending) await p();
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
