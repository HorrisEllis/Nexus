'use strict';
/**
 * tests/modules/test-cos-git-trust.test.js — COS 0.10.1 (Nexus 0.60.545): COS makes git trust his linked folder for the service.
 * James, 2026-11-15: "you fixed this right? like do i reinstall? this needs to be automatic."
 *   GT-01 a folder with .git that the system config does not trust: COS adds exactly that folder (forward slashes), nothing else
 *   GT-02 already trusted (the folder, or '*'): nothing is written
 *   GT-03 not admin: Windows is asked once (elevate); declined, it is remembered and never asked again for that folder
 *   GT-04 no .git yet: skipped (the update check attaches it first)
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const T = require(path.join(__dirname, '..', '..', 'cos/app/git-trust.js'));

function fakeGit({ admin = true, start = [] } = {}) {
  const sys = [...start], calls = [];
  const git = (args) => {
    calls.push(args.join(' '));
    if (args.includes('--get-all')) return sys.length ? { ok: true, out: sys.join('\n') } : { ok: false, out: '', error: '' };
    if (args.includes('--add')) { if (!admin) return { ok: false, error: 'error: could not lock config file C:/Program Files/Git/etc/gitconfig: Permission denied' }; sys.push(args[args.length - 1]); return { ok: true, out: '' }; }
    return { ok: false, error: 'unexpected' };
  };
  return { git, sys, calls };
}
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gt-')); fs.mkdirSync(path.join(d, '.git')); return d; };

let pass = 0;
// GT-01
{ const d = tmp(), f = fakeGit(); const r = T.ensure({ dir: d, git: f.git });
  assert.strictEqual(r.action, 'trusted'); assert.deepStrictEqual(f.sys, [T.norm(d)]); assert.ok(!f.sys[0].includes('\\')); pass++; }
// GT-02
{ const d = tmp(); for (const start of [[T.norm(d)], ['*']]) { const f = fakeGit({ start }); const r = T.ensure({ dir: d, git: f.git });
  assert.strictEqual(r.action, 'none'); assert.ok(!f.calls.some(c => c.includes('--add'))); } pass++; }
// GT-03
{ const d = tmp(), f = fakeGit({ admin: false }); const asked = new Set(); let prompts = 0;
  const elevate = (args) => { prompts++; return { ok: false, error: 'The operation was canceled by the user.' }; };
  const opts = { dir: d, git: f.git, elevate, asked: (x) => asked.has(x), save: (x) => asked.add(x) };
  const a = T.ensure(opts); assert.strictEqual(a.ok, false); assert.strictEqual(prompts, 1);
  const b = T.ensure(opts); assert.strictEqual(prompts, 1, 'never asks twice'); assert.match(b.why, /asked once/);
  const f2 = fakeGit({ admin: false }); let p2 = 0;
  const ok = T.ensure({ dir: tmp(), git: f2.git, elevate: (args) => { p2++; f2.sys.push(args[args.length - 1]); return { ok: true }; } });
  assert.strictEqual(ok.action, 'trusted-elevated'); assert.strictEqual(p2, 1); pass++; }
// GT-04
{ const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gt-')), f = fakeGit(); const r = T.ensure({ dir: d, git: f.git });
  assert.strictEqual(r.action, 'skipped'); assert.strictEqual(f.calls.length, 0); pass++; }

console.log(`test-cos-git-trust: ${pass}/4 passed`);
