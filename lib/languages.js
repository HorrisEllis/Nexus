'use strict';
/**
 * lib/languages.js — the one language table.
 * comp_id: nexus.lib.languages
 * uuid: nexus-lib-languages-v1-0000-2026-0920-001
 *
 * §BUILT 2026-09-20 — James: "coding syntax. Expand into the other
 * languages." Expanding them meant first finding out how many places
 * there were to expand, and the answer was the problem:
 *
 *   lib/extract-code.js          LANG_TO_EXT      30 fence names -> 19 exts
 *   guardian/lib/code-artifact.js SYNTAX_BY_EXT   33 exts, 46 aliases
 *   idearium/repo/import-pipeline.js LANGUAGES    15 exts
 *   idearium/repo/graph.js       per-family regex tables
 *
 * Four independently-maintained answers to "what language is this file."
 * Measured drift, not assumed: code-artifact.js knew 14 extensions
 * extract-code.js did not (.mjs .cjs .h .cc .php .swift .kt .bash .ps1
 * .scss .yml .toml .xml .spec). So the SAME agent reply returning Swift
 * resolved to a real extension on guardian's job path and to `ext: null`
 * on idearium's chunk-build path. That is §10.3's competing-truth-layers
 * failure in its most literal form — and adding languages to one of four
 * tables would have widened the gap rather than closed it.
 *
 * So: one table, and every other one is DERIVED from it. Adding a
 * language is now one entry here, not four edits that drift apart.
 *
 * §WHAT THIS DELIBERATELY IS NOT — this is a naming/extension registry,
 * not a parser registry. Knowing that .swift means Swift is a different
 * claim from being able to chunk it, extract its imports, or count its
 * braces. Each consumer still decides what it can actually DO with a
 * language (import-pipeline's BRACE_LANGS and SYMBOL_PATTERNS,
 * graph.js's per-family reference regexes). Those capability lists stay
 * where the capability lives — this file would otherwise start implying
 * support it cannot deliver (§1.1).
 */

/**
 * The table. One entry per canonical language.
 *   ext      — extensions, PRIMARY FIRST (the primary is what a fence
 *              tag resolves to when a file has to be named from it).
 *   aliases  — every fence info-string / tag that means this language.
 *              The canonical name itself is always accepted and is not
 *              repeated here.
 *   family   — the reference-extraction family, where one exists. null
 *              means no extractor family claims it — an honest absence,
 *              not an oversight (see §WHAT THIS IS NOT above).
 *   kind     — 'code' | 'data' | 'doc'. idearium's own dispatch path
 *              already draws this line for real (its CODE_EXTENSIONS
 *              filters .json/.yaml/.md out of LANG_TO_EXT because "the
 *              agent's whole reply is one clean fenced block" is not a
 *              safe assumption for a data file or a doc). That filter
 *              was a hardcoded list of three; it is a real property of
 *              the language, so it lives here.
 */
const LANGUAGES = Object.freeze({
  // ── JS/TS family ──────────────────────────────────────────────────────
  javascript: { ext: ['.js', '.mjs', '.cjs'], aliases: ['js', 'node', 'nodejs'], family: 'javascript', kind: 'code' },
  jsx:        { ext: ['.jsx'],                aliases: [],                      family: 'javascript', kind: 'code' },
  typescript: { ext: ['.ts'],                 aliases: ['ts'],                  family: 'javascript', kind: 'code' },
  tsx:        { ext: ['.tsx'],                aliases: [],                      family: 'javascript', kind: 'code' },

  // ── the rest of the real code languages ───────────────────────────────
  python:     { ext: ['.py', '.pyw'],   aliases: ['py', 'python3'],        family: 'python',     kind: 'code' },
  ruby:       { ext: ['.rb'],           aliases: ['rb'],                   family: 'ruby',       kind: 'code' },
  go:         { ext: ['.go'],           aliases: ['golang'],               family: 'go',         kind: 'code' },
  rust:       { ext: ['.rs'],           aliases: ['rs'],                   family: 'rust',       kind: 'code' },
  java:       { ext: ['.java'],         aliases: [],                       family: 'jvm',        kind: 'code' },
  kotlin:     { ext: ['.kt', '.kts'],   aliases: ['kt'],                   family: 'jvm',        kind: 'code' },
  scala:      { ext: ['.scala'],        aliases: [],                       family: 'jvm',        kind: 'code' },
  csharp:     { ext: ['.cs'],           aliases: ['c#', 'cs', 'dotnet'],   family: 'jvm',        kind: 'code' },
  c:          { ext: ['.c', '.h'],      aliases: [],                       family: 'c',          kind: 'code' },
  cpp:        { ext: ['.cpp', '.cc', '.cxx', '.hpp', '.hh'], aliases: ['c++', 'cxx'], family: 'c', kind: 'code' },
  objectivec: { ext: ['.m', '.mm'],     aliases: ['objc', 'objective-c'],  family: 'c',          kind: 'code' },
  php:        { ext: ['.php'],          aliases: [],                       family: null,         kind: 'code' },
  swift:      { ext: ['.swift'],        aliases: [],                       family: null,         kind: 'code' },
  dart:       { ext: ['.dart'],         aliases: [],                       family: null,         kind: 'code' },
  elixir:     { ext: ['.ex', '.exs'],   aliases: [],                       family: null,         kind: 'code' },
  erlang:     { ext: ['.erl'],          aliases: [],                       family: null,         kind: 'code' },
  haskell:    { ext: ['.hs'],           aliases: ['hs'],                   family: null,         kind: 'code' },
  clojure:    { ext: ['.clj', '.cljs'], aliases: [],                       family: null,         kind: 'code' },
  lua:        { ext: ['.lua'],          aliases: [],                       family: null,         kind: 'code' },
  perl:       { ext: ['.pl', '.pm'],    aliases: [],                       family: null,         kind: 'code' },
  r:          { ext: ['.r'],            aliases: [],                       family: null,         kind: 'code' },
  julia:      { ext: ['.jl'],           aliases: [],                       family: null,         kind: 'code' },
  zig:        { ext: ['.zig'],          aliases: [],                       family: null,         kind: 'code' },
  bash:       { ext: ['.sh', '.bash'],  aliases: ['sh', 'shell', 'zsh', 'console'], family: null, kind: 'code' },
  powershell: { ext: ['.ps1'],          aliases: ['ps1', 'pwsh'],          family: null,         kind: 'code' },
  sql:        { ext: ['.sql'],          aliases: [],                       family: null,         kind: 'code' },
  html:       { ext: ['.html', '.htm'], aliases: [],                       family: null,         kind: 'code' },
  css:        { ext: ['.css'],          aliases: [],                       family: null,         kind: 'code' },
  scss:       { ext: ['.scss', '.sass'], aliases: ['sass'],                family: null,         kind: 'code' },
  vue:        { ext: ['.vue'],          aliases: [],                       family: 'javascript', kind: 'code' },
  svelte:     { ext: ['.svelte'],       aliases: [],                       family: 'javascript', kind: 'code' },
  dockerfile: { ext: ['.dockerfile'],   aliases: ['docker'],               family: null,         kind: 'code' },

  // ── data + docs: real languages, but NOT safe to assume a reply is one
  //    clean fenced block of (see `kind` above) ────────────────────────
  json:       { ext: ['.json'],           aliases: [],          family: null, kind: 'data' },
  yaml:       { ext: ['.yaml', '.yml', '.spec'], aliases: ['yml'], family: null, kind: 'data' },
  toml:       { ext: ['.toml'],           aliases: [],          family: null, kind: 'data' },
  xml:        { ext: ['.xml'],            aliases: [],          family: null, kind: 'data' },
  csv:        { ext: ['.csv'],            aliases: [],          family: null, kind: 'data' },
  markdown:   { ext: ['.md', '.markdown'], aliases: ['md'],     family: null, kind: 'doc' },
  text:       { ext: ['.txt'],            aliases: ['plaintext'], family: null, kind: 'doc' },
});

// ── derived indexes, built once ─────────────────────────────────────────

/** EXT_TO_LANGUAGE — '.ts' -> 'typescript'. First declaration wins, so a
 *  shared extension resolves to the language that claims it primarily. */
const EXT_TO_LANGUAGE = {};
for (const [name, def] of Object.entries(LANGUAGES)) {
  for (const e of def.ext) if (!(e in EXT_TO_LANGUAGE)) EXT_TO_LANGUAGE[e] = name;
}

/** ALIAS_TO_LANGUAGE — every fence tag, plus each canonical name. */
const ALIAS_TO_LANGUAGE = {};
for (const [name, def] of Object.entries(LANGUAGES)) {
  ALIAS_TO_LANGUAGE[name] = name;
  for (const a of def.aliases) ALIAS_TO_LANGUAGE[a] = name;
}

/** LANGUAGE_TO_EXT — canonical name -> its PRIMARY extension. */
const LANGUAGE_TO_EXT = {};
for (const [name, def] of Object.entries(LANGUAGES)) LANGUAGE_TO_EXT[name] = def.ext[0];

/**
 * normalize(tag) — a fence tag or language name to its canonical name.
 * An unrecognised value is returned lowercased rather than discarded: an
 * unknown language is still a real, comparable claim the agent made, and
 * dropping it would turn "said brainfuck" into "said nothing" (§1.2).
 */
function normalize(tag) {
  if (!tag || typeof tag !== 'string') return null;
  const k = tag.trim().toLowerCase();
  if (!k) return null;
  return ALIAS_TO_LANGUAGE[k] || k;
}

/** forExtension(ext) — '.rs' or 'rs' -> 'rust', or null. */
function forExtension(ext) {
  if (!ext || typeof ext !== 'string') return null;
  const e = ext.trim().toLowerCase();
  return EXT_TO_LANGUAGE[e.startsWith('.') ? e : `.${e}`] || null;
}

/** forFileName(name) — 'src/a.rs' -> 'rust', or null. */
function forFileName(name) {
  if (!name || typeof name !== 'string') return null;
  const i = name.lastIndexOf('.');
  return i === -1 ? null : forExtension(name.slice(i));
}

/** extFor(langOrTag) — 'ts' -> '.ts'. null when unknown, never guessed. */
function extFor(langOrTag) {
  const n = normalize(langOrTag);
  return n ? (LANGUAGE_TO_EXT[n] || null) : null;
}

/** isCode(langOrTag) — true only for kind 'code'. Data and docs are real
 *  languages but a reply containing one is not safely "one clean fenced
 *  block", which is the distinction idearium's dispatch path already
 *  makes for real. */
function isCode(langOrTag) {
  const n = normalize(langOrTag);
  return !!(n && LANGUAGES[n] && LANGUAGES[n].kind === 'code');
}

/** familyOf(langOrTag) — the reference-extraction family, or null when
 *  no extractor claims this language. null is an honest answer. */
function familyOf(langOrTag) {
  const n = normalize(langOrTag);
  return n && LANGUAGES[n] ? LANGUAGES[n].family : null;
}

/** codeExtensions() — every extension whose language is kind 'code'. */
function codeExtensions() {
  const out = new Set();
  for (const def of Object.values(LANGUAGES)) {
    if (def.kind === 'code') for (const e of def.ext) out.add(e);
  }
  return out;
}

/** allExtensions() — every extension this registry knows, any kind. */
function allExtensions() {
  return new Set(Object.keys(EXT_TO_LANGUAGE));
}

module.exports = {
  LANGUAGES,
  EXT_TO_LANGUAGE: Object.freeze(EXT_TO_LANGUAGE),
  ALIAS_TO_LANGUAGE: Object.freeze(ALIAS_TO_LANGUAGE),
  LANGUAGE_TO_EXT: Object.freeze(LANGUAGE_TO_EXT),
  normalize, forExtension, forFileName, extFor, isCode, familyOf,
  codeExtensions, allExtensions,
};
