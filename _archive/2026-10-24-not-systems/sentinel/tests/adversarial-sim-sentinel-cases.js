// Lifted from tests/modules/test-adversarial-sim.js in 0.60.234 when Sentinel was archived; they test cli/sentinel.js (now ../cli/sentinel.js).
// Not run: they need that file's helpers (ROOT, spawnSync, purgeTestRows, test) from the suite they came from.
// ── BUG 3 (UC7.1): ack manufactured evidence ───────────────────────────────
test('AS-004', 'ACK VALIDATES THE FAULT EXISTS — it previously reported ok:true for a uuid matching nothing', () => {
  // This was the worst of the three: it wrote a real ledger row acknowledging
  // something that never existed. Worse than failing — it MANUFACTURES
  // EVIDENCE. An operator could "clear" a typo, believe a real fault was
  // handled, and the ledger would agree with them permanently. Same shape as
  // SEN-7: reporting success for work that did not happen.
  const r = spawnSync(process.execPath, [path.join(ROOT, 'cli/sentinel.js'), 'faults', 'ack', 'definitely-not-a-real-uuid', '--json'],
    { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
  let d = null; try { d = JSON.parse(r.stdout); } catch (_) {}
  assert.ok(d, `ack must emit parseable JSON, got: ${r.stdout.slice(0, 200)}`);
  assert.strictEqual(d.ok, false, 'acknowledging a nonexistent fault must FAIL');
  assert.ok(/no such fault/.test(d.error));
  assert.notStrictEqual(r.status, 0, 'and exit non-zero');
  purgeTestRows('sentinel');
});

test('AS-005', 'an ack records WHICH fault it cleared, so the row is auditable later', () => {
  const src = fs.readFileSync(path.join(ROOT, 'cli/sentinel.js'), 'utf8');
  assert.ok(/faultType: target\.type/.test(src), 'the row must capture the fault as it stood when acknowledged');
  assert.ok(/manufacture evidence/.test(src), 'and the reasoning must be recorded where the check lives');
});

test('AS-006', 'an UNREADABLE store refuses the ack rather than acknowledging blind', () => {
  const src = fs.readFileSync(path.join(ROOT, 'cli/sentinel.js'), 'utf8');
  assert.ok(/cannot verify the fault exists/.test(src),
    'if the store cannot be read the fault cannot be verified, and acknowledging it would record a fact nobody established');
});
