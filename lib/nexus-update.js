'use strict';
/**
 * lib/nexus-update.js — is there a newer Nexus on GitHub, what is in it, and bring it in (reversibly).
 * component_id: nexus.lib.nexus-update
 * Map: docs/2026-10-25-nexus-update-phasemap.spec (UP1, UP2; UP5 the COS driver is the end state)
 *
 * James, 2026-10-25: "can we make a tool for the copilot (remmber copilot is meant to be a hat.) like a update tool using github?"
 * · on how an update lands: "first one but the second one needs to be the end state" (git clone now, COS later — UP_D1).
 *
 * One interface over drivers, so the tool, its rows and its page stay the same when the COS driver lands:
 *   detect({ root })                → { driver: 'git' | 'cos' | 'folder', root, why }
 *   check({ root, fetch, branch })  → { ok, driver, current, latest, behind, ahead, releases:[{ version, quote }], systems, lockChanged, plan }
 *   apply({ root, confirm, by })    → { ok, from, to, archived, npm, restart } — fast-forward only, data collisions archived first
 *   rollback({ root, confirm, by }) → { ok, from, to, npm, restart } — back to the commit the last update came from
 *   history({ root })               → [rows], newest first
 * Git reaches GitHub (origin); nothing here holds a token. Restarting is the person's (UP_D2): results name what to restart.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MODULE_ID = 'nexus.lib.nexus-update';
const VERSION = '1.0.0';
const ROOT = path.resolve(__dirname, '..');
const DATA_RE = /(^|\/)data\//;   // a tracked file Nexus rewrites while it runs (UP_D3)

const cmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
function git(root, args, { timeout = 60000 } = {}) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).trim();
}
const tryGit = (root, args, o) => { try { return { ok: true, out: git(root, args, o) }; } catch (e) { return { ok: false, error: String((e.stderr && e.stderr.toString()) || e.message).trim().split('\n').slice(-3).join(' ') }; } };
const _raw = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
const lines = (s) => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
const histFile = (root) => path.join(root, 'data', 'update', 'history.jsonl');

/** detect({ root }) — which driver can update this install */
function detect({ root = ROOT } = {}) {
  const norm = root.replace(/\\/g, '/');
  if (/\/projects\/nexus\/versions\/\d+\.\d+\.\d+\/?$/.test(norm)) return { driver: 'cos', root, why: 'this Nexus is a version in the COS store: COS updates it (COSA7, then switch) — the COS driver is UP5, not wired into this tool yet; use the COS app' };
  if (fs.existsSync(path.join(root, '.git')) && tryGit(root, ['remote', 'get-url', 'origin']).ok) return { driver: 'git', root, why: 'a git clone with an origin' };
  return { driver: 'folder', root, why: 'an unzipped release folder (no .git yet): the first check attaches it to GitHub in place (git init + its release commit; no file is touched) — or `node lib/nexus-update.js adopt <this folder> --yes` from a fresh clone' };
}

function _versionAt(root, ref) { const r = tryGit(root, ['show', `${ref}:VERSION`]); return r.ok ? r.out.trim() : null; }
/** each release newer than `current` in origin's lib/version.js, with his opening words (lineOf/quoteOf, the release record's own parser) */
function _releasesBetween(root, ref, current) {
  const R = require('./nexus-releases.js');
  const src = tryGit(root, ['show', `${ref}:lib/version.js`]); if (!src.ok) return [];
  const seen = new Map();
  for (const l of src.out.split('\n')) { const m = R.lineOf(l); if (m && !seen.has(m.version)) seen.set(m.version, m); }
  return [...seen.values()].filter(m => !current || cmp(m.version, current) > 0).sort((a, b) => cmp(b.version, a.version))
    .map(m => ({ version: m.version, quote: R.quoteOf(m.body), changelog: `CHANGELOG-${m.version}.md` }));
}
// what a fast-forward to `ref` meets in this working tree
function _plan(root, ref) {
  const changed = new Set(lines(tryGit(root, ['diff', '--name-only', 'HEAD', ref]).out));
  const added = new Set(lines(tryGit(root, ['diff', '--name-only', '--diff-filter=A', 'HEAD', ref]).out));
  // porcelain lines start with a two-column status (' M file'): read them untrimmed, or the first column is lost
  const st = tryGit(root, ['status', '--porcelain']);
  const status = (st.ok ? _raw(root, ['status', '--porcelain']) : '').split('\n').filter(l => l.length > 3).map(l => ({ code: l.slice(0, 2), file: l.slice(3).replace(/^"|"$/g, '') }));
  const modified = status.filter(s => s.code !== '??' && changed.has(s.file)).map(s => s.file);
  const untrackedHit = status.filter(s => s.code === '??' && added.has(s.file)).map(s => s.file);
  const hits = [...modified.map(f => ({ file: f, kind: 'modified' })), ...untrackedHit.map(f => ({ file: f, kind: 'untracked' }))];
  const archive = hits.filter(h => DATA_RE.test(h.file));
  const blocks = hits.filter(h => !DATA_RE.test(h.file));
  return { archive, blocks, keptLocal: status.filter(s => s.code !== '??' && !changed.has(s.file)).map(s => s.file).length };
}
const _systems = (files) => [...new Set(files.filter(f => f.includes('/')).map(f => f.split('/')[0]).filter(Boolean))].sort();   // folders only (a root file like VERSION is no system)

/** check({ root, fetch, branch }) — reads GitHub through git; changes nothing in the working tree */
function check({ root = ROOT, fetch = true, branch = 'main', attach = true } = {}) {
  let d = detect({ root });
  // §UP6 0.60.254 — James, 2026-10-26: "should be automatic". An unzipped folder is made updatable where it is (attachInPlace)
  let attached = null;
  if (d.driver === 'folder' && attach) {
    attached = attachInPlace({ root });
    if (!attached.ok) return { ok: false, driver: 'folder', error: attached.error, current: attached.version || null };
    d = detect({ root });
  }
  if (d.driver !== 'git') return { ok: false, driver: d.driver, error: d.why, current: (() => { try { return fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim(); } catch (_) { return null; } })() };
  if (fetch) { const f = tryGit(root, ['fetch', '--quiet', 'origin', branch], { timeout: 120000 }); if (!f.ok) return { ok: false, driver: 'git', error: `could not reach GitHub (git fetch origin ${branch}): ${f.error}` }; }
  const ref = `origin/${branch}`;
  if (!tryGit(root, ['rev-parse', '--verify', ref]).ok) return { ok: false, driver: 'git', error: `${ref} is not known here — fetch it first` };
  const current = _versionAt(root, 'HEAD'), latest = _versionAt(root, ref);
  const behind = +tryGit(root, ['rev-list', '--count', `HEAD..${ref}`]).out || 0, ahead = +tryGit(root, ['rev-list', '--count', `${ref}..HEAD`]).out || 0;
  const files = lines(tryGit(root, ['diff', '--name-only', 'HEAD', ref]).out);
  return { ok: true, driver: 'git', ...(attached && attached.action === 'attached' ? { attached } : {}), branch, current, latest, head: tryGit(root, ['rev-parse', 'HEAD']).out, remote: tryGit(root, ['rev-parse', ref]).out,
    behind, ahead, upToDate: behind === 0, releases: _releasesBetween(root, ref, current), files: files.length, systems: _systems(files),
    lockChanged: files.includes('package-lock.json'), plan: _plan(root, ref),
    can: behind === 0 ? 'nothing to update' : ahead > 0 ? `diverged: ${ahead} local commit(s) not on GitHub — merging is yours (git pull)` : null };
}

function _record(root, row) { const f = histFile(root); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.appendFileSync(f, JSON.stringify({ at: new Date().toISOString(), ...row }) + '\n'); }
/** history({ root }) — every update and rollback, newest first */
function history({ root = ROOT } = {}) {
  try { return fs.readFileSync(histFile(root), 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean).reverse(); } catch (_) { return []; }
}
function _npm(root, run, lockChanged = run) {
  if (!run) return { ran: false, why: lockChanged ? 'package-lock.json changed, npm install was not run here — run it before restarting' : 'package-lock.json did not change' };
  try { const out = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund'], { cwd: root, encoding: 'utf8', timeout: 15 * 60000, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' }); return { ran: true, ok: true, tail: lines(out).slice(-3) }; }
  catch (e) { return { ran: true, ok: false, error: String((e.stderr && e.stderr.toString()) || e.message).trim().split('\n').slice(-4).join(' ') }; }
}
const RESTART_NOTE = 'restart the systems whose files changed (Updates page, or `npm run start:all` again); a change to lib/ or the autopilot needs the whole Nexus restarted';

/** apply({ root, confirm, by, branch, fetch }) — fast-forward to origin; his data collisions archived first (UP_D3) */
function apply({ root = ROOT, confirm = false, by = 'person', branch = 'main', fetch = true, runNpm = true } = {}) {
  if (confirm !== true) return { ok: false, needsConfirm: true, error: 'apply changes Nexus\'s code: pass confirm:true once the person has said yes (check shows what it brings)' };
  const c = check({ root, fetch, branch }); if (!c.ok) return c;
  if (c.behind === 0) return { ok: true, action: 'none', why: 'already up to date', current: c.current };
  if (c.ahead > 0) return { ok: false, error: c.can, ahead: c.ahead };
  if (c.plan.blocks.length) return { ok: false, error: `local changes to code the update also changes — commit or set them aside first: ${c.plan.blocks.map(b => b.file).slice(0, 12).join(', ')}${c.plan.blocks.length > 12 ? ' …' : ''}`, blocks: c.plan.blocks };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archDir = path.join(root, '_archive', 'update', stamp);
  const archived = [];
  for (const h of c.plan.archive) {
    const src = path.join(root, h.file), dst = path.join(archDir, h.file);
    fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); archived.push(h.file);
    if (h.kind === 'modified') { const r = tryGit(root, ['checkout', '--', h.file]); if (!r.ok) return { ok: false, error: `could not set ${h.file} aside: ${r.error}`, archivedTo: archDir }; }
    else fs.rmSync(src, { force: true });
  }
  const m = tryGit(root, ['merge', '--ff-only', `origin/${branch}`], { timeout: 120000 });
  if (!m.ok) return { ok: false, error: `fast-forward refused: ${m.error}`, archived, archivedTo: archived.length ? archDir : null };
  const npm = _npm(root, runNpm && c.lockChanged, c.lockChanged);
  const row = { kind: 'update', by, from: { commit: c.head, version: c.current }, to: { commit: c.remote, version: c.latest }, archived, archivedTo: archived.length ? path.relative(root, archDir) : null, npm, systems: c.systems };
  _record(root, row);
  return { ok: true, action: 'updated', ...row, releases: c.releases, restart: { systems: c.systems, note: RESTART_NOTE } };
}

/** rollback({ root, confirm, by }) — back to the commit the last update came from (git reset --keep refuses to drop local edits) */
function rollback({ root = ROOT, confirm = false, by = 'person', runNpm = true } = {}) {
  if (confirm !== true) return { ok: false, needsConfirm: true, error: 'rollback changes Nexus\'s code: pass confirm:true once the person has said yes' };
  if (detect({ root }).driver !== 'git') return { ok: false, error: detect({ root }).why };
  const head = tryGit(root, ['rev-parse', 'HEAD']).out;
  const last = history({ root }).find(r => r.kind === 'update' && r.to && r.to.commit === head);
  if (!last) return { ok: false, error: 'the running commit did not come from an update this tool made — nothing to roll back to (history shows what it did)' };
  const lockDiffers = lines(tryGit(root, ['diff', '--name-only', head, last.from.commit]).out).includes('package-lock.json');
  const files = lines(tryGit(root, ['diff', '--name-only', head, last.from.commit]).out);
  const r = tryGit(root, ['reset', '--keep', last.from.commit]);
  if (!r.ok) return { ok: false, error: `rollback refused (local changes in the way): ${r.error}` };
  const npm = _npm(root, runNpm && lockDiffers, lockDiffers);
  const row = { kind: 'rollback', by, from: { commit: head, version: last.to.version }, to: { commit: last.from.commit, version: last.from.version }, npm, systems: _systems(files), note: last.archivedTo ? `the data files that update archived are still in ${last.archivedTo}` : null };
  _record(root, row);
  return { ok: true, action: 'rolled-back', ...row, restart: { systems: row.systems, note: RESTART_NOTE } };
}

/**
 * adopt({ root, from, confirm }) — the one-time move from an unzipped release folder into this clone (UP_D1's "first one"): his
 * STATE comes across, never code. A file is copied when the clone ignores its path (Cortex's memory stores, ledgers, .env — the
 * clone has none of it) or when it is a tracked file under a data/ folder (his runtime version, not the release's snapshot). The
 * clone's own copy of a tracked data file is kept in _archive/update/<ts>-adopt/ first. The old folder is only read.
 */
function adopt({ root = ROOT, from, confirm = false, by = 'person' } = {}) {
  if (confirm !== true) return { ok: false, needsConfirm: true, error: 'adopt writes his data into this clone: pass confirm:true once the person has said yes' };
  if (detect({ root }).driver !== 'git') return { ok: false, error: 'adopt runs in the git clone (the folder the data goes INTO)' };
  const src = path.resolve(String(from || ''));
  if (!from || !fs.existsSync(path.join(src, 'VERSION'))) return { ok: false, error: `${from || '(no folder)'} is not a Nexus folder (no VERSION in it)` };
  if (src === path.resolve(root)) return { ok: false, error: 'that is this clone' };
  const files = [];
  (function walk(d, rel) {
    let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of es) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), r); else if (e.isFile()) files.push(r);
    }
  })(src, '');
  const tracked = new Set(lines(tryGit(root, ['ls-files']).out));
  const untracked = files.filter(f => !tracked.has(f));
  let ignored = new Set();
  if (untracked.length) {
    try { ignored = new Set(lines(execFileSync('git', ['check-ignore', '--stdin'], { cwd: root, input: untracked.join('\n'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))); }
    catch (e) { if (e.status !== 1) return { ok: false, error: `git check-ignore failed: ${e.message}` }; }   // status 1 = none ignored
  }
  const take = files.filter(f => ignored.has(f) || (tracked.has(f) && DATA_RE.test(f)));
  const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-adopt`;
  let kept = 0;
  for (const f of take) {
    const dst = path.join(root, f);
    if (fs.existsSync(dst) && tracked.has(f)) { const a = path.join(root, '_archive', 'update', stamp, f); fs.mkdirSync(path.dirname(a), { recursive: true }); fs.copyFileSync(dst, a); kept++; }
    fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(path.join(src, f), dst);
  }
  const row = { kind: 'adopt', by, from: { folder: src, version: fs.readFileSync(path.join(src, 'VERSION'), 'utf8').trim() }, to: { commit: tryGit(root, ['rev-parse', 'HEAD']).out, version: _versionAt(root, 'HEAD') },
    copied: take.length, ignoredState: take.filter(f => ignored.has(f)).length, trackedData: take.filter(f => tracked.has(f)).length, archivedTo: kept ? path.join('_archive', 'update', stamp) : null, skippedCode: files.length - take.length };
  _record(root, row);
  return { ok: true, action: 'adopted', ...row, next: 'npm install here, then start Nexus from this folder (npm run start:all); the old folder is untouched' };
}

const REPO_URL = process.env.NEXUS_REPO_URL || 'https://github.com/HorrisEllis/Nexus.git';
/**
 * attachInPlace({ root, url }) — §UP6: an unzipped release folder becomes a git working tree of the commit it came from, with no file
 * touched: git init, origin = GitHub, fetch tag v<VERSION> and main (blobs on demand when the server allows), reset --mixed to the tag.
 * His runtime data then reads as his local changes (UP_D3 handles them at the next update). Undone by deleting .git.
 */
function attachInPlace({ root = ROOT, url = REPO_URL, branch = 'main' } = {}) {
  if (fs.existsSync(path.join(root, '.git'))) return { ok: true, action: 'none', why: 'already a git working tree' };
  let version = null; try { version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim(); } catch (_) {}
  if (!version) return { ok: false, error: `${root} has no VERSION file — not a Nexus release folder` };
  const v = tryGit(root, ['--version']);
  if (!v.ok) return { ok: false, version, error: 'git is not installed on this machine — install Git for Windows (https://git-scm.com/download/win), then the update tool attaches this folder to GitHub by itself' };
  const steps = [['init', '-q'], ['config', 'core.autocrlf', 'false'], ['remote', 'add', 'origin', url]];
  for (const a of steps) { const r = tryGit(root, a); if (!r.ok) return { ok: false, version, error: `git ${a[0]} failed: ${r.error}` }; }
  const tag = `v${version}`;
  const refs = [`+refs/tags/${tag}:refs/tags/${tag}`, `+refs/heads/${branch}:refs/remotes/origin/${branch}`];
  let f = tryGit(root, ['fetch', '--quiet', '--filter=blob:none', 'origin', ...refs], { timeout: 600000 });
  if (!f.ok) f = tryGit(root, ['fetch', '--quiet', 'origin', ...refs], { timeout: 600000 });   // a server or git without partial clone: the whole history
  if (!f.ok) { try { fs.rmSync(path.join(root, '.git'), { recursive: true, force: true }); } catch (_) {} return { ok: false, version, error: `could not fetch ${tag} from GitHub (${f.error}) — the folder is left as it was` }; }
  const r = tryGit(root, ['reset', '-q', '--mixed', tag], { timeout: 600000 });
  if (!r.ok) { try { fs.rmSync(path.join(root, '.git'), { recursive: true, force: true }); } catch (_) {} return { ok: false, version, error: `could not mark the folder as ${tag}: ${r.error} — the folder is left as it was` }; }
  tryGit(root, ['branch', '-M', branch]);
  const local = lines(tryGit(root, ['status', '--porcelain', '-uno']).out).length;
  const row = { kind: 'attach', by: 'auto', from: { folder: root, version }, to: { commit: tryGit(root, ['rev-parse', 'HEAD']).out, version }, localChanges: local, note: 'this folder is now a git working tree of its release; deleting .git undoes it' };
  _record(root, row);
  return { ok: true, action: 'attached', ...row };
}

// §UP7 — the policy (data/update/policy.json) and the automatic check's record (data/update/auto.json)
const POLICIES = ['auto', 'notify', 'off'];
const _pfile = (root) => path.join(root, 'data', 'update', 'policy.json');
const _afile = (root) => path.join(root, 'data', 'update', 'auto.json');
function getPolicy({ root = ROOT } = {}) {
  let p = {}; try { p = JSON.parse(fs.readFileSync(_pfile(root), 'utf8')); } catch (_) {}
  return { policy: POLICIES.includes(p.policy) ? p.policy : 'auto', everyHours: Number(p.everyHours) > 0 ? Number(p.everyHours) : 6, setAt: p.setAt || null };
}
function setPolicy({ root = ROOT, policy, everyHours } = {}) {
  if (policy !== undefined && !POLICIES.includes(policy)) return { ok: false, error: `policy must be one of ${POLICIES.join(', ')}` };
  const cur = getPolicy({ root }); const next = { policy: policy || cur.policy, everyHours: Number(everyHours) > 0 ? Number(everyHours) : cur.everyHours, setAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(_pfile(root)), { recursive: true }); fs.writeFileSync(_pfile(root), JSON.stringify(next, null, 2));
  return { ok: true, ...next };
}
function autoState({ root = ROOT } = {}) { try { return JSON.parse(fs.readFileSync(_afile(root), 'utf8')); } catch (_) { return null; } }

// which supervised systems a set of changed top-level folders needs restarted (lib/ or the lockfile: all of them); Clear Glass never by itself
const DIR_KERNELS = { ollama: ['ollama-bridge'], intelligence: ['intelligence', 'intelligence-consumer'] };
function restartPlan(systems = [], lockChanged = false, kernels = []) {
  const all = lockChanged || systems.includes('lib') || systems.includes('package.json');
  const want = all ? kernels.slice() : kernels.filter(k => systems.some(s => (DIR_KERNELS[s] || [s]).includes(k)));
  return { restart: want.filter(k => k !== 'clear-glass'), waitForHim: want.includes('clear-glass') || (all && kernels.includes('clear-glass')) ? ['clear-glass'] : [], supervisorChanged: systems.includes('lib') };
}

/**
 * autoTick({ root, idle, restart, npmAsync, kernels, log }) — §UP7, one automatic check. idle() → { idle, reasons }; restart(name) → a
 * supervised system restarted (autopilot's controlKernel); npmAsync() → Promise<{ ok, error? }> (not run in the supervisor's thread).
 */
async function autoTick({ root = ROOT, idle, restart, npmAsync, kernels = [], log = () => {} } = {}) {
  const pol = getPolicy({ root });
  const rec = { at: new Date().toISOString(), policy: pol.policy };
  const save = (x) => { const out = { ...rec, ...x }; try { fs.mkdirSync(path.dirname(_afile(root)), { recursive: true }); fs.writeFileSync(_afile(root), JSON.stringify(out, null, 2)); } catch (_) {} return out; };
  if (pol.policy === 'off') return save({ action: 'off' });
  const c = check({ root });
  if (!c.ok) { log(`[update] could not check: ${c.error}`); return save({ action: 'error', error: c.error }); }
  if (c.attached) log(`[update] this folder is now attached to GitHub as ${c.current} (git, in place; deleting .git undoes it)`);
  if (c.upToDate) return save({ action: 'up-to-date', current: c.current });
  const brings = `${c.current} → ${c.latest} (${c.behind} commit(s)${c.releases[0] && c.releases[0].quote ? `; ${c.releases[0].version}: ${String(c.releases[0].quote).slice(0, 120)}` : ''})`;
  if (c.can) { log(`[update] ${brings} is on GitHub, but: ${c.can}`); return save({ action: 'blocked', latest: c.latest, why: c.can }); }
  if (c.plan.blocks.length) { log(`[update] ${brings} is on GitHub, but your edits are in the way: ${c.plan.blocks.map(b => b.file).slice(0, 5).join(', ')}`); return save({ action: 'blocked', latest: c.latest, why: 'local code edits' }); }
  if (pol.policy === 'notify') { log(`[update] ${brings} is on GitHub — the Updates page (/update) brings it in`); return save({ action: 'available', current: c.current, latest: c.latest }); }
  const quiet = idle ? await idle() : { idle: true };
  if (!quiet.idle) { log(`[update] ${brings} waits until Nexus is idle (${(quiet.reasons || []).join('; ')})`); return save({ action: 'waiting', latest: c.latest, why: quiet.reasons }); }
  const a = apply({ root, confirm: true, by: 'auto', fetch: false, runNpm: false });
  if (!a.ok) { log(`[update] automatic update refused: ${a.error}`); return save({ action: 'refused', latest: c.latest, error: a.error }); }
  log(`[update] updated ${a.from.version} → ${a.to.version}${a.archived.length ? ` (${a.archived.length} data file(s) set aside in ${a.archivedTo})` : ''}`);
  let npm = { ran: false };
  if (c.lockChanged && npmAsync) { log('[update] package-lock.json changed — npm install…'); npm = await npmAsync(); npm.ran = true; if (!npm.ok) log(`[update] npm install failed: ${npm.error} — systems are NOT restarted; run npm install, then restart Nexus`); }
  const plan = restartPlan(c.systems, c.lockChanged, kernels);
  const restarted = [];
  if (!npm.ran || npm.ok) for (const k of plan.restart) { try { const r = await restart(k); restarted.push({ kernel: k, ok: !!(r && r.ok) }); } catch (e) { restarted.push({ kernel: k, ok: false, error: e.message }); } await new Promise(r => setTimeout(r, 1500)); }
  if (plan.waitForHim.length) log('[update] Clear Glass changed too — restart it when you are not using it (it is never restarted under you)');
  if (plan.supervisorChanged) log('[update] the supervisor itself changed — the next `npm run start:all` loads it');
  return save({ action: 'updated', from: a.from.version, to: a.to.version, archived: a.archived.length, npm, restarted, waitForHim: plan.waitForHim, supervisorChanged: plan.supervisorChanged });
}

/** startAuto(deps) — first tick after 2 min, then every policy.everyHours (re-read each time); a waiting update is retried in 15 min */
function startAuto(deps = {}) {
  const root = deps.root || ROOT; let timer = null, stopped = false;
  const next = (ms) => { if (stopped) return; timer = setTimeout(run, ms); if (timer.unref) timer.unref(); };
  async function run() {
    let r = null; try { r = await autoTick({ ...deps, root }); } catch (e) { (deps.log || (() => {}))(`[update] automatic check failed: ${e.message}`); }
    next(r && r.action === 'waiting' ? 15 * 60000 : getPolicy({ root }).everyHours * 3600000);
  }
  next(deps.firstMs != null ? deps.firstMs : 2 * 60000);
  return { stop() { stopped = true; if (timer) clearTimeout(timer); } };
}

module.exports = { MODULE_ID, VERSION, detect, check, apply, rollback, history, adopt, attachInPlace, getPolicy, setPolicy, autoState, restartPlan, autoTick, startAuto, cmp, DATA_RE, POLICIES };

// The one door that runs before Nexus is started in the clone (adopt), and a plain check: node lib/nexus-update.js check | adopt <folder> --yes
if (require.main === module) {
  const [cmd, arg] = process.argv.slice(2); const yes = process.argv.includes('--yes');
  const out = cmd === 'adopt' ? adopt({ from: arg, confirm: yes }) : cmd === 'check' ? check({}) : { ok: false, error: 'usage: node lib/nexus-update.js check | adopt <old Nexus folder> --yes' };
  if (cmd === 'adopt' && !yes && out.needsConfirm) out.error = `adopt copies his data from ${arg || '<folder>'} into this clone (code is not copied; the old folder is only read) — run again with --yes`;
  console.log(JSON.stringify(out, null, 2)); process.exit(out.ok ? 0 : 1);
}
