'use strict';
/**
 * lib/semantic-variant.js — the same meaning in different words, and proof that it is new.
 * comp_id: nexus.lib.semantic-variant
 * §0.39.265
 *
 * James: "Can we have copilot create .jobs to chat gpt. With a semantic randomizer to change what the job says
 * each time. and force novelty each time. … Maybe even have copilot create alternative semantic sentences with
 * the same meaning?"
 *
 * Pure pieces copilot/lib/reword.js puts together (Ollama first, this file's rewriter as the fallback):
 *
 *   protect(text)      sets aside everything whose exact characters ARE the meaning — fenced and inline code,
 *                      URLs, file paths, identifiers (camelCase, snake_case, CONSTANTS, dotted.names), quoted
 *                      strings, numbers/versions, {placeholders}, @names — as markers ⟦0⟧ ⟦1⟧ …, so a rewriter
 *                      (a model or the JS below) only ever sees and changes the prose around them.
 *   restore(masked, tokens)   puts them back.
 *   validate(original, variant, tokens)   a variant is usable only if every protected token is in it exactly,
 *                      nothing new was invented in code, its length is within reason, and it is not the original.
 *   jsVariant(text, seed)     a deterministic rewriter for when no model is reachable: openers, phrasing and
 *                      synonym swaps from a small, meaning-safe table, applied to the prose only.
 *   similarity(a, b)   word-trigram Jaccard (0 = nothing shared, 1 = identical wording).
 *   NoveltyStore       what was actually sent, per agent (last 50), in <data root>/copilot/novelty/<key>.jsonl;
 *                      isNovel(text) = below the similarity threshold against every one of them.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Markers while protecting are private-use characters around letters (no digits, no word boundary a later
// pattern could match inside); protect() turns them into ⟦0⟧ ⟦1⟧ … at the end, the form a model keeps intact.
const _enc = (i) => i.toString(26).split('').map(c => String.fromCharCode(97 + parseInt(c, 26))).join('');
const _dec = (s) => parseInt(s.split('').map(c => (c.charCodeAt(0) - 97).toString(26)).join(''), 26);
const PMARK = (i) => `\uE000${_enc(i)}\uE001`;
const PMARK_RE = /\uE000([a-z]+)\uE001/g;
const MARK = (i) => `⟦${i}⟧`;
const MARK_RE = /⟦(\d+)⟧/g;

// Order matters: bigger spans first, so a path inside a code block stays inside that block.
const PROTECT = [
  /```[\s\S]*?```/g,                                   // fenced code
  /`[^`\n]+`/g,                                        // inline code
  /https?:\/\/[^\s)>\]]+/g,                            // URLs
  /"[^"\n]{1,200}"|“[^”\n]{1,200}”/g,                  // double-quoted strings
  /(?<![\w])'[^'\n]{2,200}'(?![\w])/g,                 // single-quoted strings (not apostrophes)
  /\{[\w.-]+\}/g,                                      // {placeholders}
  /(?:[A-Za-z]:)?(?:[\w.-]+[\\/])+[\w.-]+/g,           // paths: a/b, src/x.js, C:\x\y
  /\b[\w-]+\.(?:js|ts|mjs|cjs|jsx|tsx|py|rb|php|go|rs|json|md|spec|yml|yaml|html|css|sh|bat|txt|sql|toml|lock)\b/g,
  /\b[a-z]+(?:[A-Z][a-z0-9]*)+\b/g,                    // camelCase
  /\b[A-Za-z]+(?:_[A-Za-z0-9]+)+\b/g,                  // snake_case / CONSTANT_CASE
  /\b[A-Z]{2,}[0-9]*\b/g,                              // ACRONYMS / CONSTANTS
  /\b\w+(?:\.\w+){1,}\(?\)?/g,                         // dotted.names, calls
  /@[\w-]+/g,                                          // @names
  /\bv?\d+(?:\.\d+)+\b|\b\d+(?:[.,]\d+)?\s?(?:ms|s|m|h|kb|mb|gb|%|px)?\b/gi,   // versions, numbers (+unit)
];

function protect(text) {
  const tokens = [];
  let masked = String(text || '');
  for (const re of PROTECT) {
    masked = masked.replace(re, (m) => {
      if (/[\uE000\uE001]/.test(m)) return m;                  // overlaps a span already set aside
      tokens.push(m);
      return PMARK(tokens.length - 1);
    });
  }
  masked = masked.replace(PMARK_RE, (_m, l) => MARK(_dec(l)));
  return { masked, tokens };
}

function restore(masked, tokens) {
  return String(masked).replace(MARK_RE, (m, i) => (tokens[+i] !== undefined ? tokens[+i] : m));
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}⟦⟧\s]/gu, ' ').replace(/\s+/g, ' ').trim();

function _grams(s, n = 3) {
  const w = norm(s).split(' ').filter(Boolean);
  if (w.length < n) return new Set([w.join(' ')]);
  const out = new Set();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
}
function similarity(a, b) {
  const A = _grams(a), B = _grams(b);
  if (!A.size && !B.size) return 1;
  let inter = 0; for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

/** validate(original, variant, tokens) -> { ok, reasons[] } */
function validate(original, variant, tokens = null) {
  const reasons = [];
  const v = String(variant || '').trim();
  const o = String(original || '').trim();
  if (!v) return { ok: false, reasons: ['empty'] };
  const toks = tokens || protect(o).tokens;
  const missing = toks.filter(t => !v.includes(t));
  if (missing.length) reasons.push(`dropped or changed ${missing.length} protected part(s): ${missing.slice(0, 3).map(x => JSON.stringify(x.slice(0, 40))).join(', ')}`);
  const fencesO = (o.match(/```/g) || []).length, fencesV = (v.match(/```/g) || []).length;
  if (fencesV !== fencesO) reasons.push('changed the code blocks');
  if (/⟦\d+⟧/.test(v)) reasons.push('left a marker unrestored');
  const ratio = v.length / Math.max(1, o.length);
  if (o.length > 40 && (ratio < 0.5 || ratio > 2.2)) reasons.push(`length changed too much (${ratio.toFixed(2)}×)`);
  if (norm(v) === norm(o)) reasons.push('identical to the original');
  return { ok: reasons.length === 0, reasons };
}

// ── the JS rewriter: prose only, meaning-safe swaps ──────────────────────────
function _rng(seed) { let x = (typeof seed === 'number' ? seed : parseInt(crypto.createHash('md5').update(String(seed)).digest('hex').slice(0, 8), 16)) >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
const pick = (r, a) => a[Math.floor(r() * a.length)];

// [pattern, alternatives] — each alternative means the same in context; all case-insensitive, word-bounded.
const SWAPS = [
  [/\bcan you\b/i, ['could you', 'would you', 'can you please']],
  [/\bcould you\b/i, ['can you', 'would you']],
  [/\bplease\b/i, ['kindly', 'please']],
  [/\bexplain\b/i, ['walk me through', 'talk me through', 'describe']],
  [/\bshow me\b/i, ['give me', 'let me see']],
  [/\bhelp me\b/i, ['give me a hand to', 'help me']],
  [/\bfix\b/i, ['repair', 'sort out', 'fix']],
  [/\bcheck\b/i, ['look at', 'review', 'check']],
  [/\bmake sure\b/i, ['ensure', 'confirm']],
  [/\bi want\b/i, ["i'd like", 'i would like']],
  [/\bi need\b/i, ["i'd need", 'i need']],
  [/\bwhat is\b/i, ["what's", 'what exactly is']],
  [/\bhow does\b/i, ['in what way does', 'how exactly does']],
  [/\bwhy does\b/i, ['what makes', 'for what reason does']],
  [/(^|[.!?]\s+)also\b/i, ['$1additionally', '$1on top of that,', '$1and']],
  [/\bright now\b/i, ['at the moment', 'currently']],
  [/\bget\b/i, ['obtain', 'get']],
  [/\buse\b/i, ['make use of', 'use']],
  [/\bstart\b/i, ['begin', 'start']],
  [/\bbig\b/i, ['large']],
  [/\bsmall\b/i, ['little', 'minor']],
  [/\bquick(ly)?\b/i, ['fast', 'brief']],
  [/\bthanks\b/i, ['thank you', 'cheers']],
];
const OPENERS = ['', 'Quick one: ', "Here's what I'm after: ", 'When you get a chance: ', 'Question for you: ', 'Next up: ', 'One more: ', 'Okay — '];
// No closers: how to answer is the editable 'voice' block's job (lib/repo-prompt-blocks.js), not the rewriter's.

function _matchCase(src, rep) { return src[0] && src[0] === src[0].toUpperCase() ? rep[0].toUpperCase() + rep.slice(1) : rep; }

/** jsVariant(text, seed) -> string — prose-only rewrite, protected parts untouched */
function jsVariant(text, seed = Date.now()) {
  const r = _rng(seed);
  const { masked, tokens } = protect(text);
  let out = masked;
  let swaps = 0;
  for (const [re, alts] of SWAPS) {
    if (!re.test(out) || r() < 0.35) continue;
    out = out.replace(re, (...a) => {
      const m = a[0], g1 = typeof a[1] === 'string' ? a[1] : '';
      const rep = (pick(r, alts.filter(x => x.replace('$1', '').toLowerCase() !== m.slice(g1.length).toLowerCase())) || m).replace('$1', g1);
      swaps++;
      return g1 + _matchCase(m.slice(g1.length), rep.slice(g1.length));
    });
  }
  const first = out.trimStart();
  const opener = pick(r, OPENERS.slice(swaps ? 0 : 1));
  out = opener ? opener + (/^⟦/.test(first) ? first : first[0].toLowerCase() + first.slice(1)) : first;
  return restore(out, tokens);
}

// ── novelty ──────────────────────────────────────────────────────────────────
function _dataRoot() {
  try { const sb = require('./test-sandbox.js'); if (sb && typeof sb.ensure === 'function' && process.env.NEXUS_TEST_SANDBOX) return process.env.NEXUS_TEST_SANDBOX; } catch (_) {}
  return process.env.NEXUS_DATA_ROOT || path.join(__dirname, '..', 'data');
}

class NoveltyStore {
  constructor({ dir = path.join(_dataRoot(), 'copilot', 'novelty'), keep = 50, threshold = 0.6 } = {}) { this.dir = dir; this.keep = keep; this.threshold = threshold; }
  _file(key) { return path.join(this.dir, `${String(key || 'default').replace(/[^\w.-]+/g, '_').slice(0, 80)}.jsonl`); }
  recent(key) {
    try { return fs.readFileSync(this._file(key), 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean).slice(-this.keep); }
    catch (_) { return []; }
  }
  /** check(key, text) -> { novel, maxSimilarity, closest } */
  check(key, text) {
    let max = 0, closest = null;
    for (const r of this.recent(key)) { const s = similarity(text, r.text); if (s > max) { max = s; closest = r.text; } }
    return { novel: max < this.threshold, maxSimilarity: +max.toFixed(3), closest };
  }
  record(key, text, meta = {}) {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.appendFileSync(this._file(key), JSON.stringify({ at: Date.now(), text: String(text).slice(0, 4000), ...meta }) + '\n');
    const all = this.recent(key);
    if (all.length >= this.keep) { try { fs.writeFileSync(this._file(key), all.slice(-this.keep).map(x => JSON.stringify(x)).join('\n') + '\n'); } catch (_) {} }
  }
}

module.exports = { protect, restore, validate, jsVariant, similarity, NoveltyStore, MARK_RE };
