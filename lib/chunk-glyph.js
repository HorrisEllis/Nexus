'use strict';
/**
 * lib/chunk-glyph.js — the most compressed semantic form of a chunk.
 * UUID: nexus-lib-chunk-glyph-v1-0000-2026-0926-jamesbrooks-001
 * Version: 1.0.0
 *
 * §0.39.261 — James: "maybe leverage the most compressed semantix or
 * linguistics for the chunks?"
 *
 * A glyph keeps what a chunk MEANS and drops how it is spelled. For code that
 * is the chunk's own vocabulary and grammar: what it defines (and its
 * signature), what it calls, what it pulls in, what it announces (events,
 * routes), what it touches outside itself (env, fs, net, processes), what it
 * refuses (throws), and the one line its author wrote about it. For prose
 * (markdown, .spec): its headings, its obligations (MUST/SHALL/REQUIRED — the
 * SEAM contract words), its opening claim, and its rarest terms. For data
 * (json/yaml): its top-level keys.
 *
 * Deterministic, no model, no network: the same chunk text always gives the
 * same glyph, so glyphs are cached by content hash. Measured, not asserted:
 * every glyph carries its compression ratio (chunk chars / glyph chars).
 *
 * Grammar (one line, fields separated by " · ", each present only if non-empty):
 *   defs  ƒ name(params) | class Name | const name  — what the chunk defines
 *   ←     modules it requires/imports
 *   →     functions/methods it calls (most frequent first)
 *   ⚑     events it emits
 *   ⇄     routes it serves or requests
 *   $     env vars it reads
 *   io    fs.r fs.w net proc — side effects
 *   ✗     what it throws
 *   ¶     its own first comment line (purpose)
 *   §     prose: headings · ! obligations · ≈ key terms
 */

const VERSION = '1.0.0';

const JS_RE = /\.(?:[cm]?[jt]sx?)$/i;
const PROSE_RE = /\.(?:md|markdown|spec|txt)$/i;
const DATA_RE = /\.(?:json|ya?ml)$/i;
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'typeof', 'new', 'await', 'async', 'require', 'import', 'super', 'this', 'constructor', 'else', 'do', 'try', 'throw', 'case', 'in', 'of', 'delete', 'void', 'yield', 'export', 'default']);
const NOISE_CALLS = new Set(['push', 'map', 'filter', 'forEach', 'join', 'slice', 'split', 'replace', 'trim', 'includes', 'indexOf', 'toString', 'String', 'Number', 'Boolean', 'Array', 'Object', 'keys', 'values', 'entries', 'has', 'get', 'set', 'add', 'test', 'match', 'find', 'some', 'every', 'reduce', 'concat', 'sort', 'toLowerCase', 'toUpperCase', 'startsWith', 'endsWith', 'parseInt', 'parseFloat', 'isArray', 'from', 'assign', 'freeze', 'max', 'min', 'floor', 'round', 'ceil', 'abs', 'now', 'stringify', 'parse', 'log', 'warn', 'error', 'then', 'catch', 'resolve', 'reject', 'padStart', 'padEnd', 'repeat', 'fill', 'shift', 'unshift', 'pop', 'splice', 'reverse', 'flat', 'flatMap', 'at', 'charCodeAt', 'fromCharCode', 'Date', 'Promise', 'Error', 'Set', 'Map', 'JSON', 'Math', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']);
const STOPWORDS = new Set(('the a an and or but if then than that this these those of to in on at by for with from into as is are was were be been being it its it\'s not no do does did can could should would will may might must shall has have had which who whom what when where why how all any each every some such only own same so too very just also there here their them they we you our your his her he she i me my one two three about above after again against before below between both during further more most other over under until up down out off once while').split(/\s+/));

function _strip(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
    .replace(/`(?:[^`\\]|\\[\s\S])*`/g, '``');
}

function _top(counts, n) {
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n).map(([k]) => k);
}

function _firstComment(src) {
  const m = String(src).match(/^\s*(?:\/\*\*?\s*\n?\s*\*?\s*([^\n*][^\n]*)|\/\/\s*([^\n]+))/);
  const line = m ? (m[1] || m[2] || '').replace(/\*\/\s*$/, '').trim() : '';
  return line.length > 3 ? line.slice(0, 120) : '';
}

function glyphCode(text) {
  const raw = String(text || '');
  const src = _strip(raw);
  const defs = [];
  const add = (d) => { if (d && !defs.includes(d) && defs.length < 8) defs.push(d); };
  let m;
  const rxFn = /(?:^|[\s;(])(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g;
  while ((m = rxFn.exec(src))) add(`ƒ ${m[1]}(${m[2].replace(/\s+/g, '').replace(/=[^,]*/g, '').slice(0, 40)})`);
  const rxArrow = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(([^)]*)\)|([A-Za-z_$][\w$]*))\s*=>/g;
  while ((m = rxArrow.exec(src))) add(`ƒ ${m[1]}(${(m[2] || m[3] || '').replace(/\s+/g, '').replace(/=[^,]*/g, '').slice(0, 40)})`);
  const rxClass = /class\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+([A-Za-z_$][\w$.]*))?/g;
  while ((m = rxClass.exec(src))) add(`class ${m[1]}${m[2] ? `:${m[2]}` : ''}`);
  const rxMethod = /^\s{2,}(?:static\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/gm;
  while ((m = rxMethod.exec(src))) if (!KEYWORDS.has(m[1])) add(`.${m[1]}(${m[2].replace(/\s+/g, '').replace(/=[^,]*/g, '').slice(0, 30)})`);
  const rxExp = /module\.exports\s*=\s*\{([^}]{1,300})\}/;
  const ex = src.match(rxExp);
  const exports = ex ? ex[1].split(',').map(s => s.split(':')[0].trim()).filter(s => /^[A-Za-z_$][\w$]*$/.test(s)).slice(0, 12) : [];

  const mods = new Set();
  for (const rx of [/require\(\s*['"]([^'"]+)['"]\s*\)/g, /\bfrom\s+['"]([^'"]+)['"]/g, /import\(\s*['"]([^'"]+)['"]\s*\)/g]) { rx.lastIndex = 0; while ((m = rx.exec(raw))) mods.add(m[1].replace(/^node:/, '').replace(/^(?:\.\.\/)+/, '../').replace(/\.[cm]?js$/, '')); }

  const calls = new Map();
  const rxCall = /(?:([A-Za-z_$][\w$]*)\.)?([A-Za-z_$][\w$]*)\s*\(/g;
  while ((m = rxCall.exec(src))) {
    const name = m[2];
    if (KEYWORDS.has(name) || NOISE_CALLS.has(name)) continue;
    const key = m[1] && !['this', 'console'].includes(m[1]) ? `${m[1]}.${name}` : name;
    if (defs.some(d => d.startsWith(`ƒ ${name}(`))) continue;   // its own definitions are not calls out
    calls.set(key, (calls.get(key) || 0) + 1);
  }

  const events = new Set();
  const rxEmit = /\.(?:emit|broadcast|publish|on|once|subscribe)\(\s*['"]([\w.:-]{3,})['"]/g;
  while ((m = rxEmit.exec(raw))) events.add(m[1]);
  const routes = new Set();
  const rxRoute = /\b(GET|POST|PUT|PATCH|DELETE)\b['"\s,]+['"]?(\/[\w/:.-]{2,})/g;
  while ((m = rxRoute.exec(raw))) routes.add(`${m[1]} ${m[2]}`);
  const rxUrl = /['"`](\/api\/[\w/:.-]+)/g;
  while ((m = rxUrl.exec(raw))) if (![...routes].some(r => r.endsWith(m[1]))) routes.add(m[1]);
  const env = new Set();
  const rxEnv = /process\.env\.([A-Z_][A-Z0-9_]*)/g;
  while ((m = rxEnv.exec(raw))) env.add(m[1]);
  const io = [];
  if (/\bfs\.(?:read|exists|stat|readdir|createReadStream)|readFileSync|readdirSync/.test(src)) io.push('fs.r');
  if (/\bfs\.(?:write|append|mkdir|rm|unlink|rename|copy|createWriteStream)|writeFileSync|appendFileSync|renameSync|rmSync/.test(src)) io.push('fs.w');
  if (/\bhttps?\.(?:request|get|createServer)|\bfetch\(|\.listen\(|new\s+WebSocket|\bnet\.(?:connect|createServer)/.test(src)) io.push('net');
  if (/\b(?:spawn|exec|execFile|fork|spawnSync|execSync|execFileSync)\(/.test(src)) io.push('proc');
  const throws = new Set();
  const rxThrow = /throw\s+new\s+([A-Za-z]+)\(\s*['"`]([^'"`]{0,60})/g;
  while ((m = rxThrow.exec(raw))) throws.add(m[2] ? m[2].trim() : m[1]);

  const parts = [];
  if (defs.length) parts.push(defs.join(' '));
  if (exports.length) parts.push(`exp ${exports.join(',')}`);
  if (mods.size) parts.push(`← ${[...mods].slice(0, 8).join(',')}`);
  const topCalls = _top(calls, 10);
  if (topCalls.length) parts.push(`→ ${topCalls.join(',')}`);
  if (events.size) parts.push(`⚑ ${[...events].slice(0, 6).join(',')}`);
  if (routes.size) parts.push(`⇄ ${[...routes].slice(0, 6).join(',')}`);
  if (env.size) parts.push(`$ ${[...env].slice(0, 6).join(',')}`);
  if (io.length) parts.push(`io ${io.join(' ')}`);
  if (throws.size) parts.push(`✗ ${[...throws].slice(0, 3).join(' | ')}`);
  const purpose = _firstComment(raw);
  if (purpose) parts.push(`¶ ${purpose}`);
  return parts.join(' · ');
}

function glyphProse(text, df = null, { spec = false } = {}) {
  const src = String(text || '');
  const heads = [];
  let m;
  // markdown headings; for a .spec (YAML-shaped) its section keys at the top two
  // indent levels, minus the envelope every spec shares (spec/meta)
  const rxHead = spec ? /^\s{0,6}([A-Za-z][\w-]{2,48}):\s*(?:>|\|)?\s*$/gm : /^(?:#{1,4}\s+(.+)|([A-Za-z][\w-]{2,40}):\s*$)/gm;
  while ((m = rxHead.exec(src)) && heads.length < 8) {
    const h = (m[1] || m[2] || '').trim();
    if (spec && ['spec', 'meta', 'status', 'depends_on'].includes(h)) continue;
    heads.push(h.slice(0, 60));
  }
  if (spec) {
    const name = (src.match(/^\s*name:\s*["']?([^\n"']+)/m) || [])[1];
    const purpose = (src.match(/^\s*(?:purpose|intent|does|description):\s*>?\s*\n?\s*([^\n]{10,160})/m) || [])[1];
    if (name) heads.unshift(`name ${name.trim()}`);
    if (purpose) heads.push(`¶ ${purpose.trim()}`);
  }
  const obligations = [];
  const rxMust = /[^.\n]*\b(?:MUST|SHALL|REQUIRED|MUST NOT|SHALL NOT)\b[^.\n]*/g;
  while ((m = rxMust.exec(src)) && obligations.length < 3) obligations.push(m[0].trim().replace(/\s+/g, ' ').slice(0, 90));
  const body = src.replace(/^#+.*$/gm, '').replace(/[`*_>|-]+/g, ' ');
  const first = (body.match(/[A-Z][^.!?\n]{15,160}[.!?]/) || [''])[0].trim();
  const counts = new Map();
  for (const w of body.toLowerCase().match(/[a-z][a-z0-9_-]{3,}/g) || []) if (!STOPWORDS.has(w)) counts.set(w, (counts.get(w) || 0) + 1);
  // rarest-in-corpus first when document frequencies are known (tf-idf), else most frequent
  const scoreOf = (w) => (counts.get(w) || 0) * (df ? Math.log(1 + (df.docs || 1) / (1 + (df.terms[w] || 0))) : 1);
  const terms = [...counts.keys()].sort((a, b) => scoreOf(b) - scoreOf(a) || (a < b ? -1 : 1)).slice(0, 8);
  const parts = [];
  if (heads.length) parts.push(`§ ${heads.join(' / ')}`);
  if (obligations.length) parts.push(`! ${obligations.join(' | ')}`);
  if (first) parts.push(`¶ ${first}`);
  if (terms.length) parts.push(`≈ ${terms.join(',')}`);
  return parts.join(' · ');
}

function glyphData(text) {
  const src = String(text || '');
  try { const o = JSON.parse(src); if (o && typeof o === 'object') return `{ ${Object.keys(o).slice(0, 16).join(',')} }${Array.isArray(o) ? ` [${o.length}]` : ''}`; } catch (_) {}
  const keys = [];
  let m; const rx = /^([A-Za-z_][\w-]*):/gm;
  while ((m = rx.exec(src)) && keys.length < 16) keys.push(m[1]);
  return keys.length ? `{ ${keys.join(',')} }` : '';
}

/** glyph({ file, text, df }) -> { glyph, kind, chars, glyphChars, ratio } */
function glyph({ file = '', text = '', df = null } = {}) {
  const f = String(file);
  let g = '', kind = 'other';
  if (JS_RE.test(f)) { g = glyphCode(text); kind = 'code'; }
  else if (PROSE_RE.test(f)) { g = glyphProse(text, df, { spec: /\.spec$/i.test(f) }); kind = 'prose'; }
  else if (DATA_RE.test(f)) { g = glyphData(text); kind = 'data'; }
  else { g = glyphProse(text, df); kind = 'text'; }
  const chars = String(text || '').length;
  return { glyph: g, kind, chars, glyphChars: g.length, ratio: g.length ? +(chars / g.length).toFixed(1) : null };
}

/** documentFrequencies(texts) — the corpus stats glyphProse ranks terms against. */
function documentFrequencies(texts) {
  const terms = {};
  let docs = 0;
  for (const t of texts) {
    docs++;
    for (const w of new Set(String(t || '').toLowerCase().match(/[a-z][a-z0-9_-]{3,}/g) || [])) terms[w] = (terms[w] || 0) + 1;
  }
  return { docs, terms };
}

module.exports = { VERSION, glyph, glyphCode, glyphProse, glyphData, documentFrequencies };
