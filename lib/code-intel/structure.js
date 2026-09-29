'use strict';
/**
 * lib/code-intel/structure.js — where the real boundaries in a source file are.
 * comp_id: nexus.lib.code-intel.structure
 * UUID: nexus-lib-code-intel-structure-v1-0000-2026-0927-jamesbrooks-001
 *
 * §0.39.273 CB1 (docs/2026-09-27-idearium-codebase-toolkit-phasemap.spec). The 0.39.272 chunker cut a chunk at
 * every line a symbol regex matched, at ANY indentation: 1054 of 3584 measured chunks began at a nested function
 * (so the enclosing function was cut mid-body), and 984 ended in the next symbol's doc comment. This module gives
 * every line two numbers — its structural depth and its bracket depth at the start of the line — and says whether
 * the line starts a new logical statement. Chunk planning (./chunker.js) only ever cuts at a statement start of the
 * level it is working at, so it cannot cut mid-body.
 *
 * Families:
 *   js      javascript/jsx/typescript/tsx — strings, template literals with ${} nesting, comments, regex literals
 *   c       go/rust/java/kotlin/scala/c#/c/c++/objc/php/swift/dart/css/scss/json — strings, char literals,
 *           raw/triple strings, comments (no regex literals)
 *   indent  python/ruby/elixir/lua/yaml/spec/html/xml/sql/shell/text — logical lines by indentation, with bracket
 *           and triple-quote tracking for python
 *   md      markdown — heading levels, fenced code ignored
 *
 * §HONEST SCOPE — a scanner, not a parser. A brace scan that does not return to zero (JSX text with an apostrophe,
 * a language quirk) is not trusted: the file falls back to indentation (`fallback` says so). It never throws.
 */

const JS_LANGS = new Set(['javascript', 'jsx', 'typescript', 'tsx']);
const C_LANGS = new Set(['go', 'rust', 'java', 'kotlin', 'scala', 'csharp', 'c', 'cpp', 'objectivec', 'php', 'swift', 'dart', 'css', 'scss', 'json']);
const MD_LANGS = new Set(['markdown']);

function familyOf(language) {
  if (JS_LANGS.has(language)) return 'js';
  if (C_LANGS.has(language)) return 'c';
  if (MD_LANGS.has(language)) return 'md';
  return 'indent';
}

const REGEX_PREFIX_WORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'else', 'do', 'yield', 'await', 'instanceof']);

/**
 * scanBraces(src, { language }) -> { ok, lines:[{ depth, paren, inCode }], finalDepth, finalParen }
 * depth = { } nesting at the START of each line; paren = ( [ nesting at the start of each line; inCode = the line
 * does not start inside a string, template or block comment.
 */
function scanBraces(src, { language = 'javascript' } = {}) {
  const js = JS_LANGS.has(language);
  const lineComment = language === 'css' || language === 'json' ? null : '//';
  const hashComment = language === 'php';
  const singleQuoteStrings = js || language === 'php' || language === 'dart' || language === 'css' || language === 'scss' || language === 'python';
  const backtickRaw = language === 'go' || language === 'kotlin' ? true : false;
  const triple = language === 'kotlin' || language === 'swift' || language === 'scala' || language === 'dart' || language === 'java' || language === 'csharp';

  const out = [];
  let depth = 0, paren = 0, minDepth = 0;
  let inString = null;          // quote char, or '"""' / '`raw'
  let inLineComment = false, inBlockComment = false;
  let inRegex = false, inRegexClass = false;
  let lastSig = '', lastWord = '';
  const templateStack = [];
  out.push({ depth: 0, paren: 0, inCode: true });

  for (let i = 0; i < src.length; i++) {
    const c = src[i], next = src[i + 1];
    if (c === '\n') {
      inLineComment = false;
      if (inRegex) { inRegex = false; inRegexClass = false; }          // a regex never spans lines: the guess was wrong
      if (inString === "'" || inString === '"') { if (!(js && src[i - 1] === '\\')) inString = null; } // unterminated
      out[out.length - 1].endSig = lastSig;
      out.push({ depth, paren, inCode: !inString && !inBlockComment, inComment: inBlockComment });
      continue;
    }
    if (inLineComment) continue;
    if (inBlockComment) { if (c === '*' && next === '/') { inBlockComment = false; i++; } continue; }
    if (inRegex) {
      if (c === '\\') { i++; continue; }
      if (c === '[') { inRegexClass = true; continue; }
      if (c === ']') { inRegexClass = false; continue; }
      if (c === '/' && !inRegexClass) { inRegex = false; lastSig = 'R'; lastWord = ''; }   // R: a regex literal ended here
      continue;
    }
    if (inString) {
      if (inString === '"""') { if (c === '"' && next === '"' && src[i + 2] === '"') { inString = null; i += 2; } continue; }
      if (inString === '`raw') { if (c === '`') inString = null; continue; }
      if (c === '\\') { i++; continue; }
      if (inString === '`' && js && c === '$' && next === '{') { templateStack.push(depth); depth++; inString = null; i++; continue; }
      if (c === inString) { inString = null; lastSig = c; lastWord = ''; }
      continue;
    }
    if (lineComment && c === '/' && next === '/') { inLineComment = true; continue; }
    if (hashComment && c === '#') { inLineComment = true; continue; }
    if (c === '/' && next === '*') { inBlockComment = true; i++; continue; }
    if (triple && c === '"' && next === '"' && src[i + 2] === '"') { inString = '"""'; i += 2; continue; }
    if (c === '"') { inString = '"'; continue; }
    if (c === '`') { inString = js ? '`' : (backtickRaw ? '`raw' : null); if (!inString) lastSig = c; continue; }
    if (c === "'") {
      if (singleQuoteStrings) { inString = "'"; continue; }
      // a char literal: 'x' or '\n' — anything else (a Rust lifetime 'a) is not a string
      const m = /^'(?:\\.[^']{0,8}|[^'\\\n])'/.exec(src.slice(i, i + 12));
      if (m) { i += m[0].length - 1; lastSig = "'"; }
      continue;
    }
    if (js && c === '/') {
      const regexOk = !lastSig || /[(,=:[!&|?{};+\-*%<>~^]/.test(lastSig) || REGEX_PREFIX_WORDS.has(lastWord);
      if (regexOk && !(lastSig === ')' || lastSig === ']')) { inRegex = true; continue; }
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth < minDepth) minDepth = depth;
      if (templateStack.length && templateStack[templateStack.length - 1] === depth) { templateStack.pop(); inString = '`'; continue; }
    } else if (c === '(' || c === '[') paren++;
    else if (c === ')' || c === ']') paren = Math.max(0, paren - 1);
    if (!/\s/.test(c)) {
      if (/[\w$]/.test(c)) { lastWord = (/[\w$]/.test(lastSig) ? lastWord : '') + c; lastSig = c; }
      else { lastSig = c; lastWord = ''; }
    }
  }
  out[out.length - 1].endSig = lastSig;
  const ok = depth === 0 && minDepth >= 0 && !inString && !inBlockComment && templateStack.length === 0;
  return { ok, lines: out, finalDepth: depth, finalParen: paren };
}

// ── indentation ──────────────────────────────────────────────────────────────────────────────────────────
function indentWidth(line) {
  let w = 0;
  for (const ch of line) { if (ch === ' ') w++; else if (ch === '\t') w += 4; else break; }
  return w;
}

/**
 * scanIndent(lines, { language }) -> [{ depth, paren, inCode, logical }]
 * depth = indentation LEVEL (python tokenizer rule: a stack of widths), assigned to logical starts; continuation
 * lines, blank lines and lines inside triple-quoted strings inherit the level of the line that owns them.
 */
function scanIndent(lines, { language = 'text' } = {}) {
  const py = language === 'python';
  const hash = new Set(['python', 'ruby', 'elixir', 'yaml', 'toml', 'bash', 'powershell', 'r', 'perl', 'julia', 'text']);
  const commentRe = language === 'lua' || language === 'sql' || language === 'haskell' ? /^\s*--/ : hash.has(language) ? /^\s*#/ : language === 'html' || language === 'xml' || language === 'vue' || language === 'svelte' ? /^\s*<!--/ : /^\s*(#|\/\/)/;
  const out = [];
  const stack = [0];
  let paren = 0, inTriple = null, level = 0;
  for (const line of lines) {
    const startParen = paren, startTriple = inTriple;
    const blank = !line.trim();
    // advance bracket / triple-quote state across the line (python only needs it; harmless elsewhere)
    if (py) {
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inTriple) { if (line.startsWith(inTriple, i)) { inTriple = null; i += 2; } continue; }
        if (c === '#') break;
        if ((c === '"' || c === "'") && line[i + 1] === c && line[i + 2] === c) { inTriple = c.repeat(3); i += 2; continue; }
        if (c === '"' || c === "'") { const j = line.indexOf(c, i + 1); if (j < 0) break; i = j; continue; }
        if ('([{'.includes(c)) paren++; else if (')]}'.includes(c)) paren = Math.max(0, paren - 1);
      }
    }
    const logical = !blank && startParen === 0 && !startTriple;
    if (logical && !commentRe.test(line)) {
      const w = indentWidth(line);
      if (w > stack[stack.length - 1]) stack.push(w);
      else while (stack.length > 1 && w < stack[stack.length - 1]) stack.pop();
      level = stack.length - 1;
    }
    out.push({ depth: logical ? (commentRe.test(line) ? Math.min(level, _levelFor(stack, indentWidth(line))) : level) : level, paren: startParen, inCode: !startTriple, logical });
  }
  return out;
}
function _levelFor(stack, w) { let l = 0; for (let i = 0; i < stack.length; i++) if (stack[i] <= w) l = i; return l; }

// ── markdown ─────────────────────────────────────────────────────────────────────────────────────────────
function scanMarkdown(lines) {
  const out = [];
  let fence = null;
  let level = 0;
  const heads = [];
  lines.forEach((line, i) => {
    const f = /^\s*(```+|~~~+)/.exec(line);
    if (f) { if (!fence) fence = f[1][0]; else if (f[1][0] === fence) fence = null; }
    const h = !fence && /^(#{1,6})\s+\S/.exec(line);
    if (h) heads.push({ line: i, level: h[1].length });
  });
  const min = heads.length ? Math.min(...heads.map(h => h.level)) : 1;
  let hi = 0;
  for (let i = 0; i < lines.length; i++) {
    if (hi < heads.length && heads[hi].line === i) { level = heads[hi].level - min; hi++; out.push({ depth: level, paren: 0, inCode: true, logical: true, heading: true }); continue; }
    out.push({ depth: level + 1, paren: 0, inCode: true, logical: false });
  }
  return out;
}

/**
 * lineInfo(content, language) -> { family, fallback, lines:[{ depth, paren, inCode, logical, blank, comment }] }
 * One record per line. `logical` = this line begins a statement (not inside a string, comment, bracket group, or a
 * continuation of the previous line).
 */
function lineInfo(content, language) {
  const text = String(content || '');
  const lines = text.split('\n');
  let family = familyOf(language);
  let fallback = null;
  let info;
  if (family === 'md') info = scanMarkdown(lines);
  else if (family === 'js' || family === 'c') {
    const s = scanBraces(text, { language });
    if (s.ok) {
      info = s.lines.slice(0, lines.length).map((x) => ({ ...x, logical: x.inCode }));
    } else {
      fallback = `brace scan did not balance (depth ${s.finalDepth}) — structure taken from indentation`;
      family = 'indent';
      info = scanIndent(lines, { language });
    }
  } else info = scanIndent(lines, { language });

  const commentRe = /^\s*(\/\/|\/\*|\*|\*\/|#(?![!\[{])|--|<!--|;;|%)/;
  for (let i = 0; i < lines.length; i++) {
    const r = info[i] || (info[i] = { depth: 0, paren: 0, inCode: true, logical: false });
    r.blank = !lines[i].trim();
    r.comment = !r.blank && family !== 'md' && (r.inComment || (r.inCode && commentRe.test(lines[i]))) && !/^\s*#\s*(include|define|if|ifdef|ifndef|endif|else|elif|pragma|region|endregion|import)\b/.test(lines[i]);
    if (r.blank) r.logical = false;
  }
  // a line that opens by closing something (`}`, `});`, `) {`, `} else {`) continues a statement, it never starts one;
  // likewise the continuation keywords of indentation languages
  const CONT_INDENT = { python: /^(elif|else|except|finally)\b/, ruby: /^(end|else|elsif|rescue|ensure|when|in)\b/, elixir: /^(end|else|rescue|after|catch|do)\b/, lua: /^(end|else|elseif|until)\b/ };
  for (let i = 0; i < lines.length; i++) {
    const r = info[i];
    if (!r.logical) continue;
    const t = lines[i].trim();
    if ((family === 'js' || family === 'c') && /^[}\])]/.test(t)) r.logical = false;
    else if (family === 'indent' && CONT_INDENT[language] && CONT_INDENT[language].test(t)) r.logical = false;
  }
  // continuation: a code line whose previous code line (same depth) ends mid-expression, or which itself begins
  // with an operator, belongs to the previous statement.
  if ((family === 'js' || family === 'c') && !['css', 'scss', 'json'].includes(language)) {
    let prev = -1;
    for (let i = 0; i < lines.length; i++) {
      const r = info[i];
      if (r.blank || r.comment || !r.inCode) continue;
      const t = lines[i].trim();
      if (r.logical && prev >= 0 && info[prev].depth === r.depth && info[prev].paren === r.paren) {
        const end = info[prev].endSig || '';
        const p = lines[prev].trimEnd();
        // ',' is NOT a continuation here: at equal bracket depth a trailing comma separates object/class members
        if (/^[=+\-*/%&|^!<>?:.]$/.test(end) && !/(?:\+\+|--)$/.test(p) && !/^\s*(case\b.*|default\s*):\s*$/.test(p)) r.logical = false;
        if (/^(?:\.(?!\.\.)|\?\.|\?|:(?!:)|&&|\|\||\+(?!\+)|-(?!-)|\*|\/(?![/*])|=>)/.test(t)) r.logical = false;
      }
      prev = i;
    }
  }
  return { family, fallback, lines: info };
}

module.exports = { familyOf, scanBraces, scanIndent, scanMarkdown, lineInfo, indentWidth, JS_LANGS, C_LANGS };
