'use strict';
/**
 * lib/nexus-read.js — read the Nexus tree from a command: a file, a log, a search (0.59.12).
 * comp_id: nexus.lib.nexus-read
 *
 * James, 2026-10-11: "the nexus> is for you. not me. give yourself the tools using nexus>. dude...."
 * The agent in a chat Clear Glass watches works on his machine only through `nexus>` lines. It could count phases but not
 * read a log, a file or a search result. These are the rows `log`, `file` and `grep` (idearium/cli/route-commands.js),
 * run in the process that hears the line. Read-only, and never a secret:
 *   - a path outside the Nexus folder is refused; so are .env, .git, .ssh, key files; a non-code file that names a
 *     secret (tokens, passwords, vaults, cookies, credentials, accounts); and anything under data/ that is not a .log
 *   - every line that comes back has key-shaped strings (sk-…, ghp_…, Bearer …, "password": …) replaced by [redacted]
 *
 *   readFile(rel, { from, lines })  → { text, path, from, to, total }
 *   tailLog(name, { lines, grep })  → { text, path, total }   name: autopilot (default) | errors | a path ending .log
 *   grep(pattern, { path, limit })  → { text, hits, files }
 */

const fs = require('fs');
const path = require('path');

const MODULE_ID = 'nexus.lib.nexus-read';
const VERSION = '1.0.0';
const ROOT = path.resolve(__dirname, '..');
const HARD = /(^|[\/\\])(\.env[^\/\\]*|\.git|\.ssh|node_modules)([\/\\]|$)|\.(pem|key|p12|pfx|kdbx)$|id_rsa|id_ed25519/i;   // never
const SOFT = /secret|passw(or)?d|credential|token|vault|cookie|keychain|accounts?\.json|app-keys|api[-_]?keys?/i;              // only as code
const CODE = /\.(js|mjs|cjs|ts|md|spec|html|css)$/i;
const SECRET_PATH = { test: (p) => HARD.test(p) || (SOFT.test(p) && !CODE.test(p) && !/\/$/.test(p)) };
const REDACT = [
  /\bsk-[A-Za-z0-9_-]{16,}/g, /\bgh[pousr]_[A-Za-z0-9]{20,}/g, /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, /(\bBearer\s+)[A-Za-z0-9._~+\/-]{12,}=*/gi,
  /((?:"|')?(?:password|passwd|secret|api[_-]?key|token|access[_-]?key|private[_-]?key)(?:"|')?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,}]+)/gi,
];
const LOGS = { autopilot: 'data/autopilot/autopilot.log', errors: 'data/error.log', error: 'data/error.log' };
const MAX_LINES = 200;

function redact(text) {
  let t = String(text);
  for (const re of REDACT) t = t.replace(re, (m, keep) => (typeof keep === 'string' && m.startsWith(keep) ? `${keep}[redacted]` : '[redacted]'));
  return t;
}

/** resolve(rel) → { abs, rel } | { error } — inside the Nexus folder, not a secret, under data/ only a .log */
function resolve(rel) {
  const r = String(rel || '').trim().replace(/^["']|["']$/g, '');
  if (!r) return { error: 'a path is needed' };
  const abs = path.resolve(ROOT, r);
  const inside = path.relative(ROOT, abs);
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) return { error: `${r} is outside the Nexus folder` };
  const norm = inside.split(path.sep).join('/');
  let dir = false; try { dir = fs.statSync(abs).isDirectory(); } catch (_) {}
  if (SECRET_PATH.test(dir ? `${norm}/` : norm)) return { error: `${norm} is refused: it may hold a secret` };
  if (/^data\//.test(norm) && !/\.log$/.test(norm)) return { error: `${norm} is refused: under data/ only .log files are read (the rest is his state)` };
  return { abs, rel: norm };
}

function readFile(rel, { from = 1, lines = 120 } = {}) {
  const p = resolve(rel); if (p.error) return p;
  let st; try { st = fs.statSync(p.abs); } catch (_) { return { error: `${p.rel} does not exist` }; }
  if (st.isDirectory()) {
    const names = fs.readdirSync(p.abs, { withFileTypes: true }).filter(d => !SECRET_PATH.test(`${p.rel}/${d.name}${d.isDirectory() ? '/' : ''}`))
      .map(d => `${d.name}${d.isDirectory() ? '/' : ''}`).sort();
    return { text: `${p.rel}/ — ${names.length} entries\n${names.slice(0, MAX_LINES).join('\n')}`, path: p.rel, total: names.length };
  }
  if (st.size > 8 * 1048576) return { error: `${p.rel} is ${(st.size / 1048576).toFixed(1)}MB — too big to read here` };
  const all = fs.readFileSync(p.abs, 'utf8').split('\n');
  const a = Math.max(1, parseInt(from, 10) || 1), n = Math.min(MAX_LINES, Math.max(1, parseInt(lines, 10) || 120));
  const b = Math.min(all.length, a + n - 1);
  const body = all.slice(a - 1, b).map((l, i) => `${String(a + i).padStart(5)}  ${l}`).join('\n');
  return { text: `${p.rel} — lines ${a}–${b} of ${all.length}${b < all.length ? ` (next: file ${p.rel} --from ${b + 1})` : ''}\n${redact(body)}`, path: p.rel, from: a, to: b, total: all.length };
}

function tailLog(name = 'autopilot', { lines = 60, grep: g = null } = {}) {
  const rel = LOGS[String(name || 'autopilot').toLowerCase()] || String(name);
  if (!/\.log$/.test(rel)) return { error: `"${name}" is not a log — autopilot, errors, or a path ending .log` };
  const p = resolve(rel); if (p.error) return p;
  let all; try { all = fs.readFileSync(p.abs, 'utf8').split('\n'); } catch (_) { return { error: `${p.rel} does not exist (is Nexus started with npm run start:all?)` }; }
  if (all[all.length - 1] === '') all.pop();
  let rows = all;
  if (g) { let re; try { re = new RegExp(g, 'i'); } catch (_) { re = null; } rows = all.filter(l => (re ? re.test(l) : l.includes(g))); }
  const n = Math.min(MAX_LINES, Math.max(1, parseInt(lines, 10) || 60));
  const tail = rows.slice(-n);
  return { text: `${p.rel} — last ${tail.length} of ${rows.length}${g ? ` matching /${g}/` : ''} line(s)\n${redact(tail.join('\n'))}`, path: p.rel, total: rows.length };
}

const SKIP_DIRS = new Set(['node_modules', '.git', '_archive', 'data', 'repos', 'nexus-self', 'worksets', 'undefined']);
function grep(pattern, { path: under = '.', limit = 40 } = {}) {
  if (!pattern) return { error: 'a pattern is needed' };
  let re; try { re = new RegExp(pattern, 'i'); } catch (e) { return { error: `not a pattern: ${e.message}` }; }
  const start = (!under || under === '.') ? { abs: ROOT, rel: '.' } : resolve(under);
  if (start.error) return start;
  const max = Math.min(200, Math.max(1, parseInt(limit, 10) || 40));
  const out = []; const files = new Set(); let scanned = 0;
  const walk = (dir) => {
    if (out.length >= max || scanned > 20000) return;
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      if (out.length >= max) return;
      const abs = path.join(dir, e.name); const rel = path.relative(ROOT, abs).split(path.sep).join('/');
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !HARD.test(rel)) walk(abs); continue; }
      if (!/\.(js|mjs|cjs|json|md|spec|html|css|ts|py|sh|yml|yaml|txt)$/i.test(e.name) || SECRET_PATH.test(rel)) continue;
      scanned++;
      let st; try { st = fs.statSync(abs); } catch (_) { continue; } if (st.size > 1048576) continue;
      const lines = fs.readFileSync(abs, 'utf8').split('\n');
      for (let i = 0; i < lines.length && out.length < max; i++) if (re.test(lines[i])) { out.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 200)}`); files.add(rel); }
    }
  };
  walk(start.abs);
  return { text: `/${pattern}/ in ${start.rel} — ${out.length}${out.length >= max ? '+' : ''} hit(s) in ${files.size} file(s)\n${redact(out.join('\n'))}`, hits: out.length, files: files.size };
}

module.exports = { MODULE_ID, VERSION, ROOT, resolve, redact, readFile, tailLog, grep, LOGS };
