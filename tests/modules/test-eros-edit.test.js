'use strict';
/**
 * tests/modules/test-eros-edit.test.js — ES5: edit ErosmancerOS's TypeScript yourself (clear-glass/src/eros/edit.js)
 * James, 2026-11-05: "can you make a way to import type scripts so i can edit it myself, and import the changes."
 *
 *   EE-01  export copies every .ts under src with a manifest; diff names an edit with its lines; nothing changes until --yes
 *   EE-02  import --yes writes the edit, puts the old file in the archive, runs the module's test, records the change in full
 *   EE-03  refused, with why: a syntax error; a file changed in Nexus since the export (unless --force)
 *   EE-04  a module test that fails after the import restores the old file; a file deleted in the folder is never deleted
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const E = require('../../clear-glass/src/eros/edit.js');

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }

const HOSTILE = `export const PATTERNS = [\n  { type: "cloudflare-challenge", level: "high" },\n  { type: "fingerprint-script", level: "low" },\n  { type: "honeypot", level: "medium" },\n];\n`;
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eros-edit-'));
  const eros = path.join(root, 'erosmancer-os');
  fs.mkdirSync(path.join(eros, 'src', 'hostile'), { recursive: true }); fs.mkdirSync(path.join(eros, 'src', 'behavior'), { recursive: true });
  fs.writeFileSync(path.join(eros, 'src', 'hostile', 'index.ts'), HOSTILE);
  fs.writeFileSync(path.join(eros, 'src', 'behavior', 'index.ts'), 'export const PACE = 1;\n');
  return { root, eros, dir: path.join(root, 'my-edit'), archiveRoot: path.join(root, '_archive') };
}
const edited = HOSTILE.replace('  { type: "fingerprint-script", level: "low" },\n', '');

(async () => {
  console.log('\n⬡  Edit ErosmancerOS yourself (ES5)\n');

  await test('EE-01', 'export with a manifest; diff names the edit; a dry run changes nothing', async () => {
    const F = fixture();
    const x = E.exportTo(F.dir, { eros: F.eros });
    assert.deepStrictEqual([x.ok, x.files], [true, 2]);
    assert.ok(fs.existsSync(path.join(F.dir, E.MANIFEST)));
    fs.writeFileSync(path.join(F.dir, 'hostile', 'index.ts'), edited);
    const d = E.diff(F.dir, { eros: F.eros });
    assert.deepStrictEqual(d.changed, [{ file: 'hostile/index.ts', added: 0, removed: 1 }], JSON.stringify(d));
    const dry = await E.importFrom(F.dir, { eros: F.eros, archiveRoot: F.archiveRoot });
    assert.ok(dry.ok && !dry.applied && /--yes/.test(dry.dryRun));
    assert.strictEqual(fs.readFileSync(path.join(F.eros, 'src', 'hostile', 'index.ts'), 'utf8'), HOSTILE, 'nothing written on a dry run');
  });

  await test('EE-02', 'import --yes: written, the old archived, its test run, recorded in full', async () => {
    const F = fixture(); E.exportTo(F.dir, { eros: F.eros });
    fs.writeFileSync(path.join(F.dir, 'hostile', 'index.ts'), edited);
    const ran = [], recs = [];
    const recorder = { record: async (r) => { recs.push(r); return { ok: true }; }, fullChange: (items, o) => items.map(i => ({ ...i, beforeText: i.before ? String(o.readBlob(i.before)) : null, afterText: String(o.readBlob(i.after)) })) };
    const r = await E.importFrom(F.dir, { apply: true, eros: F.eros, archiveRoot: F.archiveRoot, testRunner: (m) => { ran.push(m); return { ran: true, ok: true }; }, recorder, now: new Date('2026-11-05T12:00:00Z') });
    assert.ok(r.ok && r.applied, JSON.stringify(r));
    assert.strictEqual(fs.readFileSync(path.join(F.eros, 'src', 'hostile', 'index.ts'), 'utf8'), edited);
    assert.strictEqual(fs.readFileSync(path.join(F.archiveRoot, 'erosmancer-edits', '2026-11-05T12-00-00-000Z', 'hostile', 'index.ts'), 'utf8'), HOSTILE, 'the old file is kept');
    assert.deepStrictEqual(ran, ['hostile']);
    assert.strictEqual(recs.length, 1); assert.match(recs[0].message, /hostile\/index\.ts/);
    assert.deepStrictEqual([recs[0].change[0].beforeText, recs[0].change[0].afterText], [HOSTILE, edited], 'the whole change, before and after');
  });

  await test('EE-03', 'refused with why: a syntax error, and a file changed in Nexus since the export', async () => {
    const F = fixture(); E.exportTo(F.dir, { eros: F.eros });
    fs.writeFileSync(path.join(F.dir, 'hostile', 'index.ts'), 'export const PATTERNS = [ { type: "x" ;\n');
    const bad = await E.importFrom(F.dir, { apply: true, eros: F.eros, archiveRoot: F.archiveRoot, testRunner: () => ({ ran: false }) });
    assert.ok(!bad.ok && bad.refused[0].why === 'its syntax does not parse' && /hostile\/index\.ts:1/.test(bad.refused[0].errors[0]), JSON.stringify(bad));
    assert.strictEqual(fs.readFileSync(path.join(F.eros, 'src', 'hostile', 'index.ts'), 'utf8'), HOSTILE);
    fs.writeFileSync(path.join(F.dir, 'hostile', 'index.ts'), edited);
    fs.writeFileSync(path.join(F.eros, 'src', 'hostile', 'index.ts'), HOSTILE + '// changed in Nexus\n');
    const c = await E.importFrom(F.dir, { apply: true, eros: F.eros, archiveRoot: F.archiveRoot, testRunner: () => ({ ran: false }) });
    assert.ok(!c.ok && /changed in Nexus since your export/.test(c.refused[0].why), JSON.stringify(c));
    const forced = await E.importFrom(F.dir, { apply: true, force: true, eros: F.eros, archiveRoot: F.archiveRoot, testRunner: () => ({ ran: false, why: 'none' }), recorder: { record: async () => ({ ok: true }) } });
    assert.ok(forced.ok && forced.applied, '--force imports it anyway');
  });

  await test('EE-04', 'a failing module test restores the old file; a deleted file is never deleted', async () => {
    const F = fixture(); E.exportTo(F.dir, { eros: F.eros });
    fs.writeFileSync(path.join(F.dir, 'hostile', 'index.ts'), edited);
    fs.unlinkSync(path.join(F.dir, 'behavior', 'index.ts'));
    const r = await E.importFrom(F.dir, { apply: true, eros: F.eros, archiveRoot: F.archiveRoot, testRunner: () => ({ ran: true, ok: false, tail: '1 failed' }) });
    assert.ok(!r.ok && r.restored && /old files are back/.test(r.why), JSON.stringify(r));
    assert.strictEqual(fs.readFileSync(path.join(F.eros, 'src', 'hostile', 'index.ts'), 'utf8'), HOSTILE);
    assert.deepStrictEqual(r.missing, ['behavior/index.ts']);
    assert.ok(fs.existsSync(path.join(F.eros, 'src', 'behavior', 'index.ts')), 'the file deleted in the folder stays in Nexus');
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
})();
