'use strict';
/**
 * lib/import-checks.js — 0.60.7 — the integrity checks an imported project goes through, written down as its notes.
 *
 * James (2026-10-13): "like maybe have integrity checks when importing?" — and PL4 of
 * docs/2026-10-13-projects-raid-and-gates-phasemap.spec: "the repo arrives with what is already broken written down".
 *
 * The checks are the catalogue's import stage (cos/spec/check-catalogue.spec), the ones that run without a model:
 *   CK-001  parses               cos/runtime/run.js syntaxCheck (the Debug tab's own check: one child, executes nothing)
 *   CK-002  requires resolve     cos/runtime/run.js resolveDeps brokenRelative
 *   CK-006  npm declared         resolveDeps packages via 'missing'
 *   CK-008  duplicate files      the same bytes at several paths (whole-file duplicates; near-duplicates are CK-008's rest)
 *   CK-060  secrets              key patterns + private-key blocks (scanSecrets, also used by lib/repo-history.js before
 *                                any history is stored)
 *   IMP-01  files arrived        files on disk = the files the import says it wrote (repo.sourceFileCount)
 *
 * toNotes() writes one note per check that found something (lib/repo-notes.js, source 'import', tags integrity + the
 * check id), updates it on the next run, and marks it done when the check comes back clean — never deletes (§0.3).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION = '1.0.0';

// what a credential looks like. Each names its kind; the value is never returned, only where it is and a masked hint.
const SECRET_RX = [
  ['private key', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/],
  ['AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b/],
  ['OpenAI key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/],
  ['Anthropic key', /\bsk-ant-[A-Za-z0-9_-]{32,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ['Stripe key', /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/],
  ['password in a URL', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s:/@]{4,}@[^\s/]+/i],
];
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz', '.woff', '.woff2', '.ttf', '.mp3', '.mp4', '.wav', '.ogg']);

/** scanSecrets(buf, file) → [{ path, line, kind, hint }] — what looks like a credential, masked. */
function scanSecrets(buf, file = '') {
  if (!buf || !buf.length || buf.length > 2 * 1024 * 1024 || SKIP_EXT.has(path.extname(file).toLowerCase())) return [];
  if (buf.subarray(0, 8000).includes(0)) return [];
  const text = buf.toString('utf8');
  const out = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length && out.length < 20; i++) {
    const ln = lines[i];
    if (ln.length > 4000) continue;
    for (const [kind, rx] of SECRET_RX) {
      const m = rx.exec(ln);
      if (!m) continue;
      if (/example|placeholder|your[-_ ]?(key|token)|xxxx|<[^>]+>/i.test(ln)) continue;
      const s = m[0];
      out.push({ path: file, line: i + 1, kind, hint: `${s.slice(0, 6)}…${s.length > 12 ? s.slice(-2) : ''}` });
      break;
    }
  }
  return out;
}

function _walk(dir, rel = '', out = []) {
  let ents = [];
  try { ents = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }); } catch (_) { return out; }
  for (const e of ents) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) _walk(dir, r, out);
    else if (e.isFile()) out.push(r);
  }
  return out;
}

/**
 * run({ repo, dir }) → { repoUuid, checkedAt, files, checks:[{ id, name, ok, severity, count, items:[...] }] }
 * Reads only; executes nothing from the project.
 */
async function run({ repo, dir } = {}) {
  if (!dir || !fs.existsSync(dir)) throw Object.assign(new Error(`the repo has no folder on disk to check (${dir || 'none'})`), { status: 409 });
  const files = _walk(dir);
  const RT = require('../cos/runtime/run.js');
  const checks = [];
  const add = (id, name, items, severity, extra = {}) => checks.push({ id, name, ok: !items.length, severity: items.length ? severity : 'ok', count: items.length, items: items.slice(0, 200), ...extra });

  const js = files.filter(f => RT.JS_EXT.has(path.extname(f)));
  try {
    const s = await RT.syntaxCheck(dir, { files: js });
    add('CK-001', 'parses', s.results.filter(r => !r.ok).map(r => ({ path: r.file, line: r.line || null, error: String(r.error || '').slice(0, 300) })), 'error', { checked: s.checked });
  } catch (e) { checks.push({ id: 'CK-001', name: 'parses', ok: false, severity: 'error', count: 0, items: [], error: `the check could not run: ${e.message}` }); }

  try {
    const d = RT.resolveDeps(dir, { files });
    add('CK-002', 'requires resolve', (d.brokenRelative || []).map(b => ({ path: b.file || b.from, spec: b.specifier || b.spec })), 'error');
    add('CK-006', 'npm packages declared', (d.packages || []).filter(p => p.via === 'missing').map(p => ({ name: p.name, usedBy: p.usedBy || p.count || null })), 'warn');
  } catch (e) { checks.push({ id: 'CK-002', name: 'requires resolve', ok: false, severity: 'error', count: 0, items: [], error: `the check could not run: ${e.message}` }); }

  const bySha = new Map();
  const secrets = [];
  for (const f of files) {
    let buf; try { buf = fs.readFileSync(path.join(dir, f)); } catch (_) { continue; }
    if (buf.length >= 200) {
      const h = crypto.createHash('sha256').update(buf).digest('hex');
      if (!bySha.has(h)) bySha.set(h, []);
      bySha.get(h).push(f);
    }
    secrets.push(...scanSecrets(buf, f));
  }
  add('CK-008', 'duplicate files', [...bySha.values()].filter(p => p.length > 1).map(paths => ({ paths })), 'warn');
  add('CK-060', 'secrets', secrets, 'error');

  const expected = repo && Number.isFinite(repo.sourceFileCount) ? repo.sourceFileCount : null;
  const onDisk = _walk(dir).length;
  add('IMP-01', 'files arrived', expected !== null && onDisk < expected ? [{ expected, onDisk }] : [], 'error', { expected, onDisk });

  return { repoUuid: repo ? repo.uuid : null, checkedAt: Date.now(), files: files.length, checks, ok: checks.every(c => c.ok) };
}

function _bodyOf(c) {
  const lines = [`${c.id} ${c.name}: ${c.count} found${c.checked ? ` (of ${c.checked} checked)` : ''}`];
  for (const it of c.items.slice(0, 40)) {
    if (c.id === 'CK-008') lines.push(`- ${it.paths.join('  =  ')}`);
    else if (c.id === 'CK-006') lines.push(`- ${it.name}${it.usedBy ? ` (used by ${it.usedBy})` : ''}`);
    else if (c.id === 'IMP-01') lines.push(`- ${it.onDisk} on disk, ${it.expected} written by the import`);
    else if (c.id === 'CK-060') lines.push(`- ${it.path}:${it.line} ${it.kind} (${it.hint})`);
    else lines.push(`- ${it.path}${it.line ? `:${it.line}` : ''} ${it.spec || it.error || ''}`.trimEnd());
  }
  if (c.items.length > 40) lines.push(`… and ${c.count - 40} more (Debug tab, or GET /api/repos/:uuid/integrity)`);
  // 0.60.200 — MASTERMIND (1,371 files): a CK-008 line joins every copy of a duplicated file, and the note went past repo-notes'
  // 20,000 characters, so no import check reached the repo's Notes. Each line and the body are cut, the full list is where it says.
  const LINE = 400, BODY = 19000;
  let out = lines.map(l => (l.length > LINE ? `${l.slice(0, LINE - 1)}…` : l)).join('\n');
  if (out.length > BODY) out = `${out.slice(0, BODY).replace(/\n[^\n]*$/, '')}\n… cut at ${BODY} characters (Debug tab, or GET /api/repos/:uuid/integrity)`;
  return out;
}

/** toNotes(repoUuid, result) → { added, updated, done } — one note per finding check; clean checks close their note. */
function toNotes(repoUuid, result) {
  const N = require('./repo-notes.js');
  const open = N.list({ repoUuid, tag: 'integrity', limit: 500 }).filter(n => n.source === 'import');
  const out = { added: 0, updated: 0, done: 0 };
  for (const c of result.checks) {
    const tag = c.id.toLowerCase();
    const mine = open.find(n => (n.tags || []).includes(tag));
    if (c.ok) {
      if (mine && mine.status === 'open') { N.update(mine.id, { status: 'done' }); out.done++; }
      continue;
    }
    if (!c.count && c.error) continue;
    const body = _bodyOf(c);
    const title = `Import check ${c.id} ${c.name}: ${c.count}`;
    // one note that cannot be written no longer stops the rest; it is said in the result (§1.2)
    try {
      if (mine) { N.update(mine.id, { body, title, status: 'open' }); out.updated++; }
      else { N.add({ repoUuid, body, title, kind: c.severity === 'error' ? 'todo' : 'question', tags: ['integrity', tag], source: 'import' }); out.added++; }
    } catch (e) { (out.failed = out.failed || []).push(`${c.id}: ${e.message}`); }
  }
  return out;
}

module.exports = { VERSION, SECRET_RX, scanSecrets, run, toNotes };
