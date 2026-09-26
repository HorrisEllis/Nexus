'use strict';
/**
 * lib/repo-git.js — real git for an Idearium repo: status, remote, commit,
 * push, pull, clone, and an SSH key to do it with.
 * UUID: nexus-repo-git-v1-0000-2026-0926-jamesbrooks-001
 * Version: 0.1.0
 *
 * §0.39.265 — James: "what about push pull, cd ci, ssh, and git support?"
 *
 * What was there: every repo's materialized folder keeps a `.git` (materialize
 * preserves it), CI/CD per compartment (cos/ci) and SSH keys registered by path
 * in the compartment vault (cos/ci/keys.js). What was not: anything that talks
 * to a git remote. This module is that, and nothing else:
 *
 *   status(dir)                    branch, remotes, ahead/behind, changed files, last commit
 *   ensureRepo(dir)                git init (branch main) + Idearium's own artifacts excluded
 *   setRemote(dir, url, name)      validated URL (https, ssh://, git@host:path) — never file:/ext::
 *   commit(dir, { message })       add -A + commit; "nothing to commit" is a result, not an error
 *   push / pull(dir, { … })        with an SSH key path and/or an HTTPS token; pull is fast-forward
 *                                  only and returns exactly which files changed, so the caller can
 *                                  bring them into the repo (Idearium's content is the spec)
 *   clone(url, dest, { … })        into a fresh folder
 *   readTree(dir)                  a cloned folder as zip-ingest entries (same import rules as a zip)
 *   keygen({ alias })              ed25519 key at ~/.ssh/nexus_<alias>; returns the PUBLIC key to
 *                                  paste into GitHub/GitLab. The private key never leaves the disk.
 *
 * §NEVER HANGS ON A PROMPT. Every git runs with GIT_TERMINAL_PROMPT=0 and ssh in
 * BatchMode, with a timeout: a missing credential fails with git's own message
 * instead of waiting forever for input nothing can type. (On Windows, Git
 * Credential Manager may still open its own sign-in window for an https remote —
 * that is the person signing in, not a hang.)
 *
 * §SECRETS. An HTTPS token is passed through git's GIT_CONFIG_* environment
 * (an Authorization header for that one process), never on the command line
 * (visible in the process list) and never written to .git/config. ssh uses
 * StrictHostKeyChecking=accept-new: the first host key seen is recorded, a
 * CHANGED one is refused — the usual trust-on-first-use for git hosts.
 *
 * Everything is async (child processes), so a slow push never blocks the API.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const MODULE_ID = 'repo-git';
const VERSION = '0.1.0';
const DEFAULT_TIMEOUT = 120000;

// Idearium writes these into a repo's folder for itself; they are not the project.
const INTERNAL = Object.freeze(['chunks/', 'atlas.json', 'indexes/', 'verification.json', 'verification.lazy.json', 'graph.json',
  'spec-graph.json', 'proof.json', '.nexus-ci-runs/', '.idearium-sources.json', 'manifest.json', 'project.json']);

let _gitOk = null;

/** run(args, { cwd, env, timeoutMs, input }) -> { ok, code, stdout, stderr, timedOut } */
function run(args, { cwd = process.cwd(), env = {}, timeoutMs = DEFAULT_TIMEOUT, bin = 'git' } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(bin, args, { cwd, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...env } });
    } catch (e) { resolve({ ok: false, code: null, stdout: '', stderr: e.message }); return; }
    let stdout = '', stderr = '', timedOut = false;
    const cap = (s, d) => (s.length < 2_000_000 ? s + d : s);
    child.stdout.on('data', (d) => { stdout = cap(stdout, String(d)); });
    child.stderr.on('data', (d) => { stderr = cap(stderr, String(d)); });
    const t = setTimeout(() => { timedOut = true; try { child.kill(); } catch (_) {} }, timeoutMs);
    child.on('error', (e) => { clearTimeout(t); resolve({ ok: false, code: null, stdout, stderr: stderr || e.message }); });
    child.on('close', (code) => {
      clearTimeout(t);
      resolve({ ok: code === 0 && !timedOut, code, stdout, stderr: timedOut ? `${stderr}\n(timed out after ${Math.round(timeoutMs / 1000)}s)`.trim() : stderr, timedOut });
    });
  });
}

async function gitAvailable() {
  if (_gitOk !== null) return _gitOk;
  const r = await run(['--version'], { timeoutMs: 10000 });
  _gitOk = r.ok ? r.stdout.trim() : false;
  return _gitOk;
}

/** validateRemoteUrl(url) -> { ok, url, kind: 'https'|'ssh' } | { ok:false, error } */
function validateRemoteUrl(url) {
  const u = String(url || '').trim();
  if (!u) return { ok: false, error: 'a remote URL is required' };
  if (/\s/.test(u) || u.startsWith('-')) return { ok: false, error: 'that is not a git URL' };
  if (/^https?:\/\/[^/\s]+\/.+/i.test(u)) return { ok: true, url: u, kind: 'https' };
  if (/^ssh:\/\/[^/\s]+\/.+/i.test(u)) return { ok: true, url: u, kind: 'ssh' };
  if (/^[\w.-]+@[\w.-]+:[^\s]+$/.test(u)) return { ok: true, url: u, kind: 'ssh' };
  return { ok: false, error: 'use an https://…, ssh://… or git@host:owner/repo.git URL' };
}

/** authEnv({ keyPath, token, url }) — the environment one git process needs to reach a remote. */
function authEnv({ keyPath = null, token = null, url = '' } = {}) {
  const env = {};
  if (keyPath) {
    const q = (p) => `"${String(p).replace(/\\/g, '/').replace(/"/g, '\\"')}"`;
    env.GIT_SSH_COMMAND = `ssh -i ${q(keyPath)} -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new`;
  } else {
    env.GIT_SSH_COMMAND = 'ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new';
  }
  if (token && /^https?:\/\//i.test(url)) {
    const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
    env.GIT_CONFIG_COUNT = '1';
    env.GIT_CONFIG_KEY_0 = 'http.extraHeader';
    env.GIT_CONFIG_VALUE_0 = `Authorization: Basic ${basic}`;
  }
  return env;
}

function isRepo(dir) { return fs.existsSync(path.join(dir, '.git')); }

function _writeExcludes(dir) {
  const p = path.join(dir, '.git', 'info', 'exclude');
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const cur = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
    const missing = INTERNAL.filter(e => !cur.split(/\r?\n/).includes(`/${e}`));
    if (missing.length) fs.appendFileSync(p, `${cur && !cur.endsWith('\n') ? '\n' : ''}# Idearium's own files (lib/repo-git.js)\n${missing.map(e => `/${e}`).join('\n')}\n`);
  } catch (_) { /* best effort — a missing exclude only means those files show as untracked */ }
}

async function ensureRepo(dir) {
  if (!(await gitAvailable())) return { ok: false, error: 'git is not installed on this computer — install it from git-scm.com (Windows: winget install --id Git.Git -e)' };
  if (!fs.existsSync(dir)) return { ok: false, error: `repo folder not found: ${dir}` };
  let created = false;
  if (!isRepo(dir)) {
    let r = await run(['init', '-b', 'main'], { cwd: dir, timeoutMs: 30000 });
    if (!r.ok) {   // git < 2.28 has no -b
      r = await run(['init'], { cwd: dir, timeoutMs: 30000 });
      if (!r.ok) return { ok: false, error: r.stderr.trim() || 'git init failed' };
      await run(['symbolic-ref', 'HEAD', 'refs/heads/main'], { cwd: dir });
    }
    created = true;
  }
  _writeExcludes(dir);
  return { ok: true, created };
}

/** status(dir) -> { ok, git, initialized, branch, remotes, upstream, ahead, behind, changes, lastCommit } */
async function status(dir) {
  const git = await gitAvailable();
  if (!git) return { ok: true, git: false, initialized: false, error: 'git is not installed on this computer' };
  if (!dir || !fs.existsSync(dir) || !isRepo(dir)) return { ok: true, git, initialized: false };
  const [br, rem, st, last] = await Promise.all([
    run(['symbolic-ref', '--short', 'HEAD'], { cwd: dir }),   // names the branch even before its first commit
    run(['remote', '-v'], { cwd: dir }),
    run(['status', '--porcelain=v1', '-b'], { cwd: dir }),
    run(['log', '-1', '--format=%H%x09%s%x09%ct'], { cwd: dir }),
  ]);
  const remotes = [];
  for (const line of rem.stdout.split('\n')) {
    const m = line.match(/^(\S+)\s+(\S+)\s+\(fetch\)$/);
    if (m) remotes.push({ name: m[1], url: m[2] });
  }
  const lines = st.stdout.split('\n').filter(Boolean);
  const head = lines[0] && lines[0].startsWith('## ') ? lines.shift() : '';
  const up = head.match(/\.\.\.(\S+)/);
  const ahead = +(head.match(/ahead (\d+)/) || [0, 0])[1];
  const behind = +(head.match(/behind (\d+)/) || [0, 0])[1];
  const changes = lines.slice(0, 500).map(l => ({ status: l.slice(0, 2).trim() || '?', path: l.slice(3) }));
  let lastCommit = null;
  if (last.ok && last.stdout.trim()) {
    const [hash, subject, ct] = last.stdout.trim().split('\t');
    lastCommit = { hash, short: hash.slice(0, 8), subject, at: +ct * 1000 };
  }
  return { ok: true, git, initialized: true, branch: br.ok ? br.stdout.trim() : null, remotes, upstream: up ? up[1] : null,
    ahead, behind, changes, changeCount: lines.length, lastCommit };
}

async function setRemote(dir, url, name = 'origin') {
  const v = validateRemoteUrl(url);
  if (!v.ok) return v;
  if (!/^[\w.-]+$/.test(name)) return { ok: false, error: 'remote name may only use letters, digits, . _ -' };
  const e = await ensureRepo(dir);
  if (!e.ok) return e;
  const has = (await run(['remote'], { cwd: dir })).stdout.split('\n').includes(name);
  const r = await run(has ? ['remote', 'set-url', name, v.url] : ['remote', 'add', name, v.url], { cwd: dir });
  return r.ok ? { ok: true, name, url: v.url, kind: v.kind } : { ok: false, error: r.stderr.trim() };
}

async function commit(dir, { message = '', authorName = null, authorEmail = null } = {}) {
  const msg = String(message || '').trim();
  if (!msg) return { ok: false, error: 'a commit message is required' };
  const e = await ensureRepo(dir);
  if (!e.ok) return e;
  const add = await run(['add', '-A'], { cwd: dir, timeoutMs: 60000 });
  if (!add.ok) return { ok: false, error: add.stderr.trim() || 'git add failed' };
  const staged = await run(['diff', '--cached', '--name-only'], { cwd: dir });
  if (!staged.stdout.trim()) return { ok: true, nothingToCommit: true };
  // Use the person's own git identity when they have one; otherwise a named default, never a failure.
  const ident = [];
  const hasEmail = (await run(['config', 'user.email'], { cwd: dir })).stdout.trim();
  if (authorName || !hasEmail) ident.push('-c', `user.name=${authorName || 'Nexus'}`);
  if (authorEmail || !hasEmail) ident.push('-c', `user.email=${authorEmail || 'nexus@localhost'}`);
  const r = await run([...ident, 'commit', '-m', msg], { cwd: dir, timeoutMs: 60000 });
  if (!r.ok) return { ok: false, error: r.stderr.trim() || r.stdout.trim() || 'git commit failed' };
  const h = await run(['rev-parse', 'HEAD'], { cwd: dir });
  return { ok: true, commit: h.stdout.trim(), files: staged.stdout.trim().split('\n').length };
}

async function _remoteUrl(dir, remote) {
  const r = await run(['remote', 'get-url', remote], { cwd: dir });
  return r.ok ? r.stdout.trim() : null;
}

async function push(dir, { remote = 'origin', branch = null, keyPath = null, token = null, timeoutMs = DEFAULT_TIMEOUT } = {}) {
  if (!isRepo(dir)) return { ok: false, error: 'this repo has no git history yet — commit first' };
  const url = await _remoteUrl(dir, remote);
  if (!url) return { ok: false, error: `no remote named "${remote}" — set the remote URL first` };
  const b = branch || (await run(['symbolic-ref', '--short', 'HEAD'], { cwd: dir })).stdout.trim() || 'main';
  const r = await run(['push', '-u', remote, b], { cwd: dir, env: authEnv({ keyPath, token, url }), timeoutMs });
  return r.ok ? { ok: true, remote, branch: b, output: (r.stderr + r.stdout).trim() } : { ok: false, error: (r.stderr || r.stdout).trim() || 'git push failed', remote, branch: b };
}

/** pull — fast-forward only. Returns the files that changed ({status:'A'|'M'|'D', path}). */
async function pull(dir, { remote = 'origin', branch = null, keyPath = null, token = null, timeoutMs = DEFAULT_TIMEOUT } = {}) {
  if (!isRepo(dir)) return { ok: false, error: 'this repo has no git history yet' };
  const url = await _remoteUrl(dir, remote);
  if (!url) return { ok: false, error: `no remote named "${remote}" — set the remote URL first` };
  const b = branch || (await run(['symbolic-ref', '--short', 'HEAD'], { cwd: dir })).stdout.trim() || 'main';
  const dirty = (await run(['status', '--porcelain'], { cwd: dir })).stdout.trim();
  if (dirty) return { ok: false, error: 'this repo has uncommitted changes — commit them first, then pull' };
  const before = (await run(['rev-parse', 'HEAD'], { cwd: dir })).stdout.trim() || null;
  const env = authEnv({ keyPath, token, url });
  const f = await run(['fetch', remote, b], { cwd: dir, env, timeoutMs });
  if (!f.ok) return { ok: false, error: (f.stderr || f.stdout).trim() || 'git fetch failed' };
  const m = before
    ? await run(['merge', '--ff-only', `${remote}/${b}`], { cwd: dir, timeoutMs: 60000 })
    : await run(['checkout', '-B', b, `${remote}/${b}`], { cwd: dir, timeoutMs: 60000 });
  if (!m.ok) return { ok: false, error: /not possible to fast-forward|diverg/i.test(m.stderr) ? `the remote and this repo have both changed — they cannot be fast-forwarded (${m.stderr.trim().split('\n').pop()})` : (m.stderr || m.stdout).trim() };
  const after = (await run(['rev-parse', 'HEAD'], { cwd: dir })).stdout.trim();
  let changed = [];
  if (before !== after) {
    const d = before
      ? await run(['diff', '--name-status', '--no-renames', before, after], { cwd: dir })
      : await run(['ls-files'], { cwd: dir });
    changed = d.stdout.split('\n').filter(Boolean).map(l => before ? { status: l[0], path: l.slice(1).trim() } : { status: 'A', path: l.trim() });
  }
  return { ok: true, remote, branch: b, before, after, upToDate: before === after, changed };
}

async function clone(url, dest, { keyPath = null, token = null, depth = 1, timeoutMs = 300000 } = {}) {
  const v = validateRemoteUrl(url);
  if (!v.ok) return v;
  if (!(await gitAvailable())) return { ok: false, error: 'git is not installed on this computer — install it from git-scm.com (Windows: winget install --id Git.Git -e)' };
  if (fs.existsSync(dest) && fs.readdirSync(dest).length) return { ok: false, error: `destination is not empty: ${dest}` };
  const args = ['clone', ...(depth ? ['--depth', String(depth), '--no-single-branch'] : []), '--', v.url, dest];
  const r = await run(args, { env: authEnv({ keyPath, token, url: v.url }), timeoutMs });
  return r.ok ? { ok: true, dir: dest } : { ok: false, error: (r.stderr || r.stdout).trim() || 'git clone failed' };
}

/** readTree(dir, { skipDirs }) -> zip-ingest entries ({ entryName, getData }) for every file outside .git */
function readTree(dir, { skipDirs = ['.git', 'node_modules'] } = {}) {
  const skip = new Set(skipDirs);
  const out = [];
  const walk = (rel) => {
    let ents; try { ents = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (!skip.has(e.name)) walk(r); continue; }
      if (e.isFile()) out.push({ entryName: r, getData: () => fs.readFileSync(path.join(dir, r)) });
    }
  };
  walk('');
  return out;
}

/** keygen({ alias, comment }) -> { ok, keyPath, publicKey, existed } — ed25519, no passphrase (it is used unattended). */
async function keygen({ alias, comment = null, sshDir = path.join(os.homedir(), '.ssh') } = {}) {
  // same rule as a vault key alias (cos/ci/keys.js ALIAS_RE), so the new key can be registered under it
  if (!/^[a-z][a-z0-9_]{1,38}$/.test(String(alias || ''))) return { ok: false, error: 'alias: snake_case, 2-39 characters, starting with a letter (e.g. github_deploy)' };
  const keyPath = path.join(sshDir, `nexus_${alias}`);
  if (fs.existsSync(keyPath)) {
    let pub = null; try { pub = fs.readFileSync(`${keyPath}.pub`, 'utf8').trim(); } catch (_) {}
    return { ok: true, keyPath, publicKey: pub, existed: true };
  }
  fs.mkdirSync(sshDir, { recursive: true });
  const r = await run(['-t', 'ed25519', '-N', '', '-C', comment || `nexus-${alias}`, '-f', keyPath], { bin: 'ssh-keygen', timeoutMs: 30000 });
  if (!r.ok) return { ok: false, error: /ENOENT|not found|not recognized/i.test(r.stderr) ? 'ssh-keygen is not installed (Windows: Settings → Optional features → OpenSSH Client)' : (r.stderr.trim() || 'ssh-keygen failed') };
  if (process.platform !== 'win32') { try { fs.chmodSync(keyPath, 0o600); } catch (_) {} }
  return { ok: true, keyPath, publicKey: fs.readFileSync(`${keyPath}.pub`, 'utf8').trim(), existed: false };
}

module.exports = { MODULE_ID, VERSION, INTERNAL, run, gitAvailable, validateRemoteUrl, authEnv, isRepo, ensureRepo, status, setRemote, commit, push, pull, clone, readTree, keygen };
