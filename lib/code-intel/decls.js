'use strict';
/**
 * lib/code-intel/decls.js — what a statement-start line declares, per language.
 * comp_id: nexus.lib.code-intel.decls
 * UUID: nexus-lib-code-intel-decls-v1-0000-2026-0927-jamesbrooks-001
 *
 * §0.39.273 CB1. Applied ONLY to lines ./structure.js marks as a statement start at the level being chunked, so a
 * pattern here never has to guess whether it is looking at a nested function: the caller already knows the depth.
 *
 * matchDecl(language, text, { member }) -> null | { kind, name, primary, container, exported, attach, label }
 *   kind      function | class | interface | type | enum | namespace | method | field | variable | import | export |
 *             test | route | section | key | statement-label | macro | impl | module | struct | trait | table
 *   primary   a unit of its own (functions, classes, types, tests, routes, sections). Non-primary units are merged
 *             with their neighbours into blocks.
 *   container its body holds members worth splitting on when it is too large (class, impl, namespace, object)
 *   attach    a decorator/annotation/attribute line — it belongs to the declaration below it
 *   label     a switch `case` — a cut point inside a large body
 */

const KEYWORDS = new Set(['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'catch', 'try', 'finally', 'return', 'throw', 'new', 'function',
  'typeof', 'await', 'yield', 'super', 'this', 'with', 'import', 'export', 'delete', 'void', 'in', 'of', 'sizeof', 'elif', 'match', 'when',
  'foreach', 'using', 'lock', 'unless', 'until', 'loop', 'select', 'defer', 'go', 'guard', 'repeat']);

const ID = '[A-Za-z_$][\\w$]*';
const JS_TOP = [
  [new RegExp(`^(export\\s+(?:default\\s+)?)?(?:declare\\s+)?(?:async\\s+)?function\\s*\\*?\\s*(${ID})`), 'function', { primary: true }],
  [new RegExp(`^(export\\s+(?:default\\s+)?)?(?:declare\\s+)?(?:abstract\\s+)?class\\s+(${ID})`), 'class', { primary: true, container: true }],
  [new RegExp(`^(export\\s+)?(?:declare\\s+)?interface\\s+(${ID})`), 'interface', { primary: true, container: true }],
  [new RegExp(`^(export\\s+)?(?:declare\\s+)?type\\s+(${ID})\\s*(?:<[^=]*>)?\\s*=`), 'type', { primary: true }],
  [new RegExp(`^(export\\s+)?(?:declare\\s+)?(?:const\\s+)?enum\\s+(${ID})`), 'enum', { primary: true, container: true }],
  [new RegExp(`^(export\\s+)?(?:declare\\s+)?(?:namespace|module)\\s+(${ID}(?:\\.${ID})*)\\s*\\{`), 'namespace', { primary: true, container: true }],
  // a binding to another module is an import, not a definition (so "where is add defined" never answers the require)
  [/^()(?:const|let|var)\s+(?:\{[^}]*\}|\[[^\]]*\]|[\w$]+)\s*=\s*(?:await\s+)?(?:require|import)\s*\(/, 'import', {}],
  [new RegExp(`^(export\\s+)?(?:const|let|var)\\s+(${ID})\\s*(?::[^=]+)?=\\s*(?:async\\s+)?(?:function\\b|\\([^)]*\\)\\s*(?::[^=]+)?=>|${ID}\\s*=>|\\(\\s*$|\\(\\s*\\{[^}]*\\}?\\s*$)`), 'function', { primary: true }],
  [new RegExp(`^(export\\s+)?(?:const|let|var)\\s+(${ID})\\s*(?::[^=]+)?=\\s*class\\b`), 'class', { primary: true, container: true }],
  [new RegExp(`^(export\\s+)?(?:const|let|var)\\s+(${ID})\\s*(?::[^=]+)?=\\s*(?:Object\\.freeze\\()?\\{\\s*$`), 'variable', { container: true }],
  [new RegExp(`^(export\\s+)?(?:const|let|var)\\s+(${ID})`), 'variable', {}],
  [/^()(?:const|let|var)\s+[{[]/, 'variable', {}],
  [/^()module\.exports\s*=\s*\{\s*$/, 'export', { name: 'module.exports', container: true }],
  [/^()module\.exports\s*=/, 'export', { name: 'module.exports' }],
  [new RegExp(`^()(?:module\\.)?exports\\.(${ID})\\s*=\\s*(?:async\\s+)?(?:function\\b|\\([^)]*\\)\\s*=>|${ID}\\s*=>)`), 'function', { primary: true, exported: true }],
  [new RegExp(`^()(?:module\\.)?exports\\.(${ID})\\s*=`), 'variable', { exported: true }],
  [/^(export)\s+default\b/, 'export', { name: 'default' }],
  [/^()(?:describe|suite|context)(?:\.\w+)?\s*\(\s*(['"`])(.{1,80}?)\2/, 'test', { primary: true, container: true, nameGroup: 3 }],
  [/^()(?:it|test|t)(?:\.\w+)?\s*\(\s*(['"`])(.{1,80}?)\2/, 'test', { primary: true, nameGroup: 3 }],
  [/^()(?:router|app|server|api|fastify)\.(get|post|put|patch|delete|all|use|head|options)\s*\(\s*(['"`])([^'"`]{1,80})\3/, 'route', { primary: true, routeGroup: 2, nameGroup: 4 }],
  [/^()import\b/, 'import', {}],
  [/^()export\s*(?:\{|\*)/, 'export', { name: null }],
];
const JS_MEMBER = [
  [new RegExp(`^()(?:(?:public|private|protected|static|readonly|override|abstract|async|declare|get|set|accessor)\\s+)*\\*?\\s*(#?${ID})\\s*(?:<[^>(]*>)?\\s*\\(`), 'method', { primary: true, notKeyword: true, noSemicolon: true }],
  [new RegExp(`^()(?:(?:public|private|protected|static|readonly|override)\\s+)*(#?${ID})\\s*(?::[^=]+)?=\\s*(?:async\\s*)?(?:\\([^)]*\\)|${ID})\\s*(?::[^=]+)?=>`), 'method', { primary: true }],
  [new RegExp(`^()(${ID}|'[^']+'|"[^"]+")\\s*:\\s*(?:async\\s+)?(?:function\\b|\\([^)]*\\)\\s*=>|${ID}\\s*=>)`), 'method', { primary: true }],
  [new RegExp(`^()(${ID}|'[^']+'|"[^"]+"|\\[[^\\]]+\\])\\s*:\\s*\\{\\s*$`), 'key', { container: true }],
  [/^()static\s*\{/, 'method', { primary: true, name: 'static' }],
  [new RegExp(`^()(?:(?:public|private|protected|static|readonly|declare)\\s+)*(#?${ID})\\s*[?!]?\\s*(?::[^=;]+)?(?:=|;|$)`), 'field', { notKeyword: true }],
];

const PY_TOP = [
  [/^()(?:async\s+)?def\s+([A-Za-z_]\w*)/, 'function', { primary: true }],
  [/^()class\s+([A-Za-z_]\w*)/, 'class', { primary: true, container: true }],
  [/^()if\s+__name__\s*==/, 'function', { primary: true, name: '__main__' }],
  [/^()(?:from\s+\S+\s+)?import\s/, 'import', {}],
  [/^()([A-Za-z_]\w*)\s*(?::[^=]+)?=(?!=)/, 'variable', {}],
];
const PY_MEMBER = [
  [/^()(?:async\s+)?def\s+([A-Za-z_]\w*)/, 'method', { primary: true }],
  [/^()class\s+([A-Za-z_]\w*)/, 'class', { primary: true, container: true }],
  [/^()([A-Za-z_]\w*)\s*(?::[^=]+)?=(?!=)/, 'field', {}],
];

const GO_TOP = [
  [/^()func\s+\(\s*\w+\s+\*?([A-Za-z_]\w*)[^)]*\)\s*([A-Za-z_]\w*)/, 'method', { primary: true, receiverGroup: 2, nameGroup: 3 }],
  [/^()func\s+([A-Za-z_]\w*)/, 'function', { primary: true }],
  [/^()type\s+([A-Za-z_]\w*)\s+struct\b/, 'struct', { primary: true, container: true }],
  [/^()type\s+([A-Za-z_]\w*)\s+interface\b/, 'interface', { primary: true, container: true }],
  [/^()type\s+([A-Za-z_]\w*)/, 'type', { primary: true }],
  [/^()(?:import|package)\b/, 'import', {}],
  [/^()(?:var|const)\s+([A-Za-z_]\w*)/, 'variable', {}],
  [/^()(?:var|const)\s*\(/, 'variable', {}],
];
const RUST_TOP = [
  [/^()(?:pub(?:\([^)]*\))?\s+)?(?:default\s+)?(?:async\s+)?(?:const\s+)?(?:unsafe\s+)?(?:extern\s+"[^"]*"\s+)?fn\s+([A-Za-z_]\w*)/, 'function', { primary: true }],
  [/^()(?:pub(?:\([^)]*\))?\s+)?struct\s+([A-Za-z_]\w*)/, 'struct', { primary: true, container: true }],
  [/^()(?:pub(?:\([^)]*\))?\s+)?enum\s+([A-Za-z_]\w*)/, 'enum', { primary: true, container: true }],
  [/^()(?:pub(?:\([^)]*\))?\s+)?(?:unsafe\s+)?trait\s+([A-Za-z_]\w*)/, 'trait', { primary: true, container: true }],
  [/^()(?:pub(?:\([^)]*\))?\s+)?union\s+([A-Za-z_]\w*)/, 'struct', { primary: true, container: true }],
  [/^()(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_]\w*)\s*\{/, 'module', { primary: true, container: true }],
  [/^()(?:pub(?:\([^)]*\))?\s+)?type\s+([A-Za-z_]\w*)/, 'type', { primary: true }],
  [/^()(?:unsafe\s+)?impl(?:<[^>]*>)?\s+(?:[\w:<>, &']+?\s+for\s+)?([A-Za-z_][\w:]*)/, 'impl', { primary: true, container: true }],
  [/^()macro_rules!\s*([A-Za-z_]\w*)/, 'macro', { primary: true }],
  [/^()(?:pub(?:\([^)]*\))?\s+)?(?:use|extern\s+crate)\b/, 'import', {}],
  [/^()(?:pub(?:\([^)]*\))?\s+)?(?:static|const)\s+(?:mut\s+)?([A-Za-z_]\w*)/, 'variable', {}],
];
const RUST_MEMBER = [
  [/^()(?:pub(?:\([^)]*\))?\s+)?(?:default\s+)?(?:async\s+)?(?:const\s+)?(?:unsafe\s+)?(?:extern\s+"[^"]*"\s+)?fn\s+([A-Za-z_]\w*)/, 'method', { primary: true }],
  [/^()(?:pub(?:\([^)]*\))?\s+)?([A-Za-z_]\w*)\s*:/, 'field', {}],
];
// Java / Kotlin / C# / Scala / Swift / Dart / PHP / C / C++ / ObjC — modifiers first, then the declaring word
const MODS = '(?:(?:public|private|protected|internal|static|final|abstract|sealed|open|override|virtual|partial|async|inline|extern|const|constexpr|export|data|inner|enum|annotation|companion|suspend|synchronized|native|transient|volatile|readonly|unsafe|new|default|fileprivate|mutating|required|convenience|lazy|weak|external|operator|infix|tailrec|expect|actual|pub)\\s+)*';
const CLIKE_CLASS = new RegExp(`^()${MODS}(class|interface|enum|record|struct|object|trait|protocol|extension|namespace|union)\\s+([A-Za-z_]\\w*)`);
const CLIKE_FUN = [
  new RegExp(`^()${MODS}(?:fun|func|function|def)\\s+(?:<[^>]*>\\s*)?(?:[\\w.]+\\.)?([A-Za-z_]\\w*)`),
  new RegExp(`^()${MODS}(?:[\\w:<>\\[\\],.*&?]+\\s+)+[*&]*([A-Za-z_~]\\w*)\\s*\\([^;{]*(?:\\)\\s*(?:const\\s*)?(?:throws\\s+[\\w.,\\s]+)?(?:->\\s*[\\w:<>*& ]+)?\\s*\\{?\\s*$|,?\\s*$)`),
  /^()(init|deinit)\s*[(?{]/,
];
const CLIKE_TOP_OTHER = [
  [/^()(?:#include|#import|import|using|package|namespace\s+[\w.]+\s*;|use\s|require|require_once|include)\b/, 'import', {}],
  [/^()#define\s+([A-Za-z_]\w*)/, 'macro', {}],
  [/^()typedef\b.*?([A-Za-z_]\w*)\s*;\s*$/, 'type', {}],
];
const CSS_TOP = [
  [/^()(@media[^{]*|@supports[^{]*|@layer[^{]*|@keyframes\s+[\w-]+|@font-face)\s*\{?/, 'section', { primary: true, container: true }],
  [/^()(@(?:import|use|forward|charset)\b)/, 'import', {}],
  [/^()(\$[\w-]+)\s*:/, 'variable', {}],
  [/^()(@mixin\s+[\w-]+|@function\s+[\w-]+)/, 'function', { primary: true }],
  [/^()([^@\s{}][^{]*?)\s*\{\s*(?:\}\s*)?$/, 'section', { selector: true }],
];
const RB_TOP = [
  [/^()(?:class|module)\s+([A-Z][\w:]*)/, 'class', { primary: true, container: true }],
  [/^()def\s+((?:self\.)?[\w?!=]+)/, 'function', { primary: true }],
  [/^()defmodule\s+([\w.]+)/, 'module', { primary: true, container: true }],
  [/^()(?:def|defp|defmacro|defmacrop)\s+([\w?!]+)/, 'function', { primary: true }],
  [/^()(?:local\s+)?function\s+([\w.:]+)/, 'function', { primary: true }],
  [/^()(?:require|require_relative|import|alias|use)\b/, 'import', {}],
];
const RB_MEMBER = [
  [/^()def\s+((?:self\.)?[\w?!=]+)/, 'method', { primary: true }],
  [/^()(?:def|defp|defmacro|defmacrop)\s+([\w?!]+)/, 'method', { primary: true }],
  [/^()(?:class|module)\s+([A-Z][\w:]*)/, 'class', { primary: true, container: true }],
  [/^()(?:local\s+)?function\s+([\w.:]+)/, 'method', { primary: true }],
];
const YAML_KEY = [[/^()(?:- )?([\w.$-]+|"[^"]+"|'[^']+')\s*:(?:\s|$)/, 'key', { container: true }]];
const SQL_TOP = [[/^()((?:create|alter|drop)\s+(?:or\s+replace\s+)?(?:temporary\s+)?(?:table|view|index|function|procedure|trigger|schema|type|materialized\s+view)\s+(?:if\s+(?:not\s+)?exists\s+)?[\w."`\[\]]+)/i, 'table', { primary: true }],
  [/^()((?:insert|update|delete|select|with|grant|begin|commit)\b)/i, 'statement-label', {}]];
const SHELL_TOP = [[/^()(?:function\s+)?([A-Za-z_][\w-]*)\s*\(\)\s*\{?/, 'function', { primary: true }]];
const HTML_TOP = [[/^()<(script|style|template|head|body|header|footer|main|nav|section|article|aside|form|table|svg)\b/i, 'section', { primary: true, container: true }]];
const JSON_KEY = [[/^()"([^"]{1,120})"\s*:/, 'key', { container: true }]];

function _tables(language, member) {
  switch (language) {
    case 'javascript': case 'jsx': case 'typescript': case 'tsx': return member ? JS_MEMBER : JS_TOP;
    case 'python': return member ? PY_MEMBER : PY_TOP;
    case 'go': return member ? [] : GO_TOP;
    case 'rust': return member ? RUST_MEMBER : RUST_TOP;
    case 'ruby': case 'elixir': case 'lua': return member ? RB_MEMBER : RB_TOP;
    case 'css': case 'scss': return CSS_TOP;
    case 'yaml': case 'toml': return YAML_KEY;
    case 'json': return JSON_KEY;
    case 'sql': return SQL_TOP;
    case 'bash': case 'powershell': return SHELL_TOP;
    case 'html': case 'xml': case 'vue': case 'svelte': return HTML_TOP;
    default: return null;
  }
}
const CLIKE = new Set(['java', 'kotlin', 'scala', 'csharp', 'c', 'cpp', 'objectivec', 'php', 'swift', 'dart']);

function _fromTable(table, text) {
  for (const [re, kind, o] of table) {
    const m = re.exec(text);
    if (!m) continue;
    let name = o.name || (m[o.nameGroup || 2] ?? null);
    if (name && /^['"]/.test(name)) name = name.slice(1, -1);
    if (o.notKeyword && name && KEYWORDS.has(name)) continue;
    if (o.noSemicolon && /;\s*$/.test(text)) continue;
    if (o.selector) name = String(m[2] || '').trim().slice(0, 80);
    if (o.routeGroup) name = `${String(m[o.routeGroup]).toUpperCase()} ${m[o.nameGroup]}`;
    if (o.receiverGroup) name = `${m[o.receiverGroup]}.${m[o.nameGroup]}`;
    return { kind, name: name || null, primary: !!o.primary, container: !!o.container, exported: !!(o.exported || (m[1] && /export/.test(m[1]))) };
  }
  return null;
}

/**
 * matchDecl(language, text, { member }) — text is the line with its indentation removed.
 */
function matchDecl(language, text, { member = false } = {}) {
  const t = String(text || '');
  if (!t) return null;
  // decorators / annotations / attributes belong to what they decorate
  if (/^@[A-Za-z_][\w.]*(\(.*)?\s*$/.test(t) && language !== 'css' && language !== 'scss') return { kind: 'decorator', attach: true };
  if (/^#!?\[[^\]]*\]?\s*$/.test(t) && language === 'rust') return { kind: 'attribute', attach: true };
  if (/^\[[A-Z][\w.]*(\(.*\))?\]\s*$/.test(t) && language === 'csharp') return { kind: 'attribute', attach: true };
  if (/^(case\s+.+|default)\s*:/.test(t) && language !== 'yaml' && language !== 'python') return { kind: 'statement-label', label: true, name: t.replace(/:\s*(\{\s*)?$/, '').replace(/:\s*\S.*$/, '').slice(0, 80) };
  if (CLIKE.has(language)) {
    const c = CLIKE_CLASS.exec(t);
    if (c) return { kind: c[2] === 'namespace' ? 'namespace' : c[2] === 'interface' || c[2] === 'protocol' ? 'interface' : c[2] === 'enum' ? 'enum' : c[2] === 'struct' || c[2] === 'record' ? 'struct' : c[2] === 'trait' ? 'trait' : 'class', name: c[3], primary: true, container: true, exported: /\b(public|export|pub)\b/.test(t) };
    for (const re of CLIKE_FUN) {
      const m = re.exec(t);
      if (m && m[2] && !KEYWORDS.has(m[2]) && !/;\s*$/.test(t) && !/^(return|else|new|throw)\b/.test(t)) return { kind: member ? 'method' : 'function', name: m[2], primary: true, container: false, exported: /\b(public|export|pub)\b/.test(t) };
    }
    if (!member) { const o = _fromTable(CLIKE_TOP_OTHER, t); if (o) return o; }
    if (member) return /^[\w<>\[\],.:?*&\s]+\s+[A-Za-z_]\w*\s*(=|;)/.test(t) ? { kind: 'field', name: (/([A-Za-z_]\w*)\s*(=|;)/.exec(t) || [])[1] || null, primary: false } : null;
    return null;
  }
  const table = _tables(language, member);
  if (!table) return null;
  return _fromTable(table, t);
}

/** signatureOf(lines, start, max) — the declaration line(s) up to the opening brace/colon, one line. */
function signatureOf(lines, start, { max = 200 } = {}) {
  let s = '';
  for (let i = start; i < Math.min(lines.length, start + 6); i++) {
    const l = lines[i].trim();
    if (!l || /^(\/\/|\/\*|\*|#(?!\[)|@)/.test(l)) { if (s) break; continue; }
    s += (s ? ' ' : '') + l;
    if (/[{:;]\s*$|=>\s*\{?\s*$|\)\s*$/.test(l) && /\)/.test(s)) break;
    if (!/[,(]\s*$/.test(l) && !/\($/.test(s)) break;
  }
  s = s.replace(/\s*\{\s*$/, '').replace(/\s+/g, ' ');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

module.exports = { matchDecl, signatureOf, KEYWORDS };
