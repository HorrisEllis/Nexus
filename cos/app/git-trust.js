'use strict';
/**
 * cos/app/git-trust.js — COS makes git trust his linked Nexus folder for the service (COS 0.10.1, Nexus 0.60.545).
 *
 * James, 2026-11-15, with Settings › Update still saying "an unzipped release folder (no .git yet)" and the check failing:
 * "you fixed this right? like do i reinstall? this needs to be automatic."
 *
 * Why the fix in lib/nexus-update.js (10a02b08, `-c safe.directory`) could not reach him: that file lives in his Nexus folder, and the
 * only thing that updates the folder is that same file, run by the NexusCOS service (LocalSystem). Git refuses a folder owned by another
 * user ("detected dubious ownership"), so the old code loops and never fetches the new code. COS's own exe is the one piece that updates
 * on his machine without that folder (cos-v releases, CA10). So COS does it: when it opens, it tells git, once, for every user on this
 * machine, to trust exactly his linked folder — `git config --system --add safe.directory <folder>`. The service's git reads the system
 * config, the old code's check works, and the automatic update brings the new code in. Nothing else is trusted; nothing in the folder changes.
 *
 * The system config needs admin. COS usually runs elevated (his "admin access"); when it does not, it asks Windows once (one UAC prompt)
 * and remembers the answer, so it never asks again for the same folder.
 *
 *   norm(dir)                                   → the folder as git writes it (forward slashes)
 *   trusted({ dir, git })                       → true when the system config already trusts it (or '*')
 *   ensure({ dir, git, elevate, asked, save })  → { ok, action: 'none'|'trusted'|'trusted-elevated'|'skipped', why? }
 *     git(args) runs git as this user and returns { ok, out, error }; elevate(args) runs git once as admin (UAC) and returns { ok, error }.
 */
const fs = require('fs'), path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const norm = (dir) => String(dir || '').replace(/\\/g, '/').replace(/\/+$/, '');

function runGit(args) {
  try { return { ok: true, out: execFileSync('git', args, { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 }).trim() }; }
  catch (e) { return { ok: false, out: String((e.stdout || '')).trim(), error: String((e.stderr || e.message || '')).trim(), code: e.status }; }
}

// one UAC prompt: PowerShell starts git elevated and waits for it (Windows only)
function elevateGit(args) {
  if (process.platform !== 'win32') return { ok: false, error: 'not Windows' };
  const quoted = args.map(a => `'${String(a).replace(/'/g, "''")}'`).join(',');
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `$p = Start-Process -FilePath git -ArgumentList ${quoted} -Verb RunAs -WindowStyle Hidden -Wait -PassThru; exit $p.ExitCode`],
  { windowsHide: true, encoding: 'utf8', timeout: 120000 });
  return r.status === 0 ? { ok: true } : { ok: false, error: String(r.stderr || r.error || `exit ${r.status}`).trim() || 'declined' };
}

function trusted({ dir, git = runGit }) {
  const r = git(['config', '--system', '--get-all', 'safe.directory']);
  if (!r.ok) return false;   // none set (git exits 1) or no system config
  const want = norm(dir).toLowerCase();
  return r.out.split(/\r?\n/).map(s => norm(s.trim()).toLowerCase()).some(s => s === '*' || s === want);
}

function ensure({ dir, git = runGit, elevate = elevateGit, asked = () => false, save = () => {} } = {}) {
  if (!dir) return { ok: true, action: 'skipped', why: 'no linked Nexus folder' };
  if (!fs.existsSync(path.join(dir, '.git'))) return { ok: true, action: 'skipped', why: 'the folder has no .git yet: the update check attaches it' };
  if (trusted({ dir, git })) return { ok: true, action: 'none' };
  const args = ['config', '--system', '--add', 'safe.directory', norm(dir)];
  const r = git(args);
  if (r.ok && trusted({ dir, git })) { save(norm(dir)); return { ok: true, action: 'trusted' }; }
  if (asked(norm(dir))) return { ok: false, action: 'skipped', why: 'Windows was asked once and said no; COS does not ask again for this folder' };
  save(norm(dir));   // remembered before asking, so a declined prompt is never shown twice
  const e = elevate(args);
  if (e.ok && trusted({ dir, git })) return { ok: true, action: 'trusted-elevated' };
  return { ok: false, action: 'skipped', why: `git could not be told to trust the folder (${(e.error || r.error || 'no answer').split('\n')[0]})` };
}

module.exports = { norm, trusted, ensure, runGit, elevateGit };
