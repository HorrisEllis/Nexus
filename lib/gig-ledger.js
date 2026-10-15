'use strict';
/**
 * lib/gig-ledger.js — what can be said to a Fiverr buyer, and the check that it is true (PF0, 0.60.53)
 * comp_id: nexus.lib.gig-ledger
 * UUID: nexus-lib-gig-ledger-v1-0000-2026-1015-jamesbrooks-001
 * Map: docs/2026-10-15-fiverr-ledger-phasemap.spec
 *
 * James, 2026-10-15: "can you create a ledger for anything you can log thats useful for fiverr, that you can verify for a
 * fact? like i want to keep a record overtime. like anything that slots to a gig template. to automate."
 *
 * Append-only (§0.3). Three record types in one file, never edited or deleted:
 *   claim   { id, ts, kind, claim, quote?, slot, evidence:[{type,ref,...}], source:{via,agent,run}, tags }
 *   verify  { id, ts, of, ok, results:[{type,ref,ok,detail}] }     (a later verify of the same claim supersedes the earlier)
 *   note    { id, ts, of, text }                                    (a retraction or a correction, said, not erased)
 *
 * A claim is TRUE only while its evidence checks out, and the check is deterministic code, never a model:
 *   commit  { ref: sha }                    git cat-file says the commit exists
 *   file    { ref: path, sha256? }          the file exists; if a hash was kept and the file has changed, the result says changed (ok stays true: it exists)
 *   test    { ref: tests/…/x.test.js }      runs it; ok only when it reports `N passed, 0 failed` with N > 0 (a test that cannot fail proves nothing)
 *   count   { ref: dir, suffix, min }       at least `min` files in dir end with suffix
 * A claim with no evidence is stored (the record is kept) but is never ok, so it never reaches a gig.
 *
 * Slots are the gig template's parts: skill → skills, deliverable → portfolio, metric → numbers, pattern → process, decision → about.
 * facts({ slot }) returns only claims whose latest verify is ok. That is the one door to a gig draft.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const MODULE_ID = 'nexus.lib.gig-ledger';
const KINDS = Object.freeze({ skill: 'skills', deliverable: 'portfolio', metric: 'numbers', pattern: 'process', decision: 'about' });
const ROOT = path.join(__dirname, '..');
const dir = () => process.env.GIG_LEDGER_DIR || path.join(ROOT, 'data', 'gig-ledger');
const file = () => path.join(dir(), 'ledger.jsonl');
const id = () => crypto.randomBytes(6).toString('hex');

function _append(rec) {
  fs.mkdirSync(dir(), { recursive: true });
  const row = { id: id(), ts: Date.now(), ...rec };
  fs.appendFileSync(file(), JSON.stringify(row) + '\n', 'utf8');
  return row;
}
function _all() {
  let t; try { t = fs.readFileSync(file(), 'utf8'); } catch (_) { return []; }
  return t.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
}
const _safeRel = (p) => { const a = path.resolve(ROOT, String(p || '')); return a.startsWith(ROOT + path.sep) ? a : null; };

/** record({ kind, claim, quote, evidence, source, tags }) → the claim row. Not verified until verify() runs. */
function record({ kind, claim, quote = null, evidence = [], source = {}, tags = [] } = {}) {
  if (!KINDS[kind]) throw new Error(`gig-ledger: kind must be one of ${Object.keys(KINDS).join(', ')}`);
  if (!claim || !String(claim).trim()) throw new Error('gig-ledger: a claim is required');
  const ev = (Array.isArray(evidence) ? evidence : []).map(e => {
    const x = { ...e };
    if (x.type === 'file' && !x.sha256) { const a = _safeRel(x.ref); try { if (a) x.sha256 = crypto.createHash('sha256').update(fs.readFileSync(a)).digest('hex'); } catch (_) { /* missing: verify will say so */ } }
    return x;
  });
  return _append({ type: 'claim', kind, slot: KINDS[kind], claim: String(claim).trim().slice(0, 400), quote: quote ? String(quote).slice(0, 400) : null, evidence: ev, source, tags });
}

const CHECK = {
  commit(e) {
    if (!/^[0-9a-f]{7,40}$/i.test(String(e.ref || ''))) return { ok: false, detail: 'not a commit hash' };
    const r = spawnSync('git', ['cat-file', '-e', `${e.ref}^{commit}`], { cwd: ROOT, encoding: 'utf8' });
    return r.status === 0 ? { ok: true, detail: 'commit exists' } : { ok: false, detail: 'no such commit here' };
  },
  file(e) {
    const a = _safeRel(e.ref); if (!a) return { ok: false, detail: 'outside the repo' };
    let buf; try { buf = fs.readFileSync(a); } catch (_) { return { ok: false, detail: 'file missing' }; }
    const h = crypto.createHash('sha256').update(buf).digest('hex');
    return { ok: true, detail: e.sha256 && e.sha256 !== h ? 'exists; changed since it was recorded' : 'exists' };
  },
  test(e) {
    const a = _safeRel(e.ref);
    if (!a || !/^tests[\\/].+\.test\.js$/.test(path.relative(ROOT, a))) return { ok: false, detail: 'only tests/**/*.test.js can be run as evidence' };
    const r = spawnSync(process.execPath, [a], { cwd: ROOT, encoding: 'utf8', timeout: 120000, env: { ...process.env, NEXUS_TEST_SANDBOX: '1' } });
    const m = /(\d+) passed, (\d+) failed/.exec(`${r.stdout || ''}\n${r.stderr || ''}`);
    if (!m) return { ok: false, detail: r.error ? `did not finish: ${r.error.code || r.error.message}` : 'no "N passed, N failed" line' };
    const pass = +m[1], failed = +m[2];
    return { ok: failed === 0 && pass > 0 && r.status === 0, detail: `${pass} passed, ${failed} failed` };
  },
  count(e) {
    const a = _safeRel(e.ref); if (!a) return { ok: false, detail: 'outside the repo' };
    let n = 0; try { n = fs.readdirSync(a).filter(f => f.endsWith(String(e.suffix || ''))).length; } catch (_) { return { ok: false, detail: 'folder missing' }; }
    return { ok: n >= (e.min || 1), detail: `${n} found, ${e.min || 1} claimed` };
  },
};

/** verify(claimId) → the verify row. Every evidence item must pass; none means not ok (the claim is kept, never shown). */
function verify(claimId) {
  const c = _all().find(r => r.type === 'claim' && r.id === claimId);
  if (!c) throw new Error(`gig-ledger: no claim ${claimId}`);
  const results = c.evidence.map(e => { const f = CHECK[e.type]; const r = f ? f(e) : { ok: false, detail: `unknown evidence type ${e.type}` }; return { type: e.type, ref: e.ref, ...r }; });
  return _append({ type: 'verify', of: claimId, ok: results.length > 0 && results.every(r => r.ok), results });
}

/** note(claimId, text) — a correction or retraction, said in the ledger. A noted claim is withheld from facts(). */
function note(claimId, text) { return _append({ type: 'note', of: claimId, text: String(text || '').slice(0, 300) }); }

/** list({ slot, kind, onlyVerified }) → claims with their latest verify folded in */
function list({ slot = null, kind = null, onlyVerified = false } = {}) {
  const rows = _all(); const v = new Map(); const n = new Set();
  for (const r of rows) { if (r.type === 'verify') v.set(r.of, r); else if (r.type === 'note') n.add(r.of); }
  return rows.filter(r => r.type === 'claim' && (!slot || r.slot === slot) && (!kind || r.kind === kind))
    .map(c => ({ ...c, verified: v.has(c.id) ? { ok: v.get(c.id).ok, at: v.get(c.id).ts, results: v.get(c.id).results } : null, withdrawn: n.has(c.id) }))
    .filter(c => !onlyVerified || (c.verified && c.verified.ok && !c.withdrawn));
}

/** facts({ slot }) → only what is verified ok and not withdrawn: the one door a gig draft reads */
function facts({ slot = null } = {}) { return list({ slot, onlyVerified: true }); }

/** factsText({ slot }) → the verified claims as plain lines, each with its evidence, for a gig prompt's `extra` */
function factsText({ slot = null } = {}) {
  return facts({ slot }).map(c => `- [${c.slot}] ${c.claim}${c.quote ? ` (his words: “${c.quote}”)` : ''} — checked: ${c.verified.results.map(r => `${r.type} ${r.ref} ${r.detail}`).join('; ')}`).join('\n');
}

/** verifyAll() → re-checks every claim; evidence that has gone stale turns a claim off, and says so */
function verifyAll() { return list().map(c => verify(c.id)); }

module.exports = { MODULE_ID, KINDS, record, verify, note, list, facts, factsText, verifyAll, dir };
