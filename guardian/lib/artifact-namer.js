'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// guardian/lib/artifact-namer.js — real artifact-record builder
// UUID: nexus-guardian-artifact-namer-v1-0000-2026-0903-001
// Version: 1.0.0
// Component: guardian.lib.artifact-namer
// Hook: guardian.lib.artifact-namer:v1:p0001
//
// §BUG FOUND 2026-09-02 — guardian/agents/index.js's header claimed
// "artifact naming ... via artifact-namer.js" since v5.2.0. No such file
// existed anywhere in the repo (grepped, confirmed). _loadOptionalModules()
// hardcoded `_namer = { inferFilename: () => null, inferSpecFilename: () =>
// null }` — an object literal that can never throw, so the try/catch around
// it was dead. The real call site, _extractAndNameArtifacts(), then called
// `_namer.buildArtifactRecord(...)` — a method that never existed anywhere
// in the repo (grepped, zero hits) — guarded only by `if (_namer)`, never a
// `typeof === 'function'` check (unlike the sibling _gtci call sites two
// blocks up, which do check). Since the stub object is always truthy, this
// threw TypeError on every agent-call response containing a fenced code
// block >= 10 chars, UNCAUGHT (no try/catch at the _processCall call site),
// which meant the completion write (jaaDB.update('agent_calls', ...))
// never ran either — calls appeared stuck mid-flight, not just missing
// artifacts.
//
// This module is the real thing the header always claimed existed. It
// reuses guardian/spec-namer.js's real inferFilename() (looks for a
// `// @file: foo.ts`-style annotation) when present, and falls back to the
// exact same hash-based shape the dead fallback branch already had worked
// out correctly — so behavior for un-annotated content is unchanged.
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');
const { inferFilename } = require('../spec-namer');

const EXT_MAP = {
  typescript: 'ts', javascript: 'js', python: 'py', rust: 'rs', css: 'css',
  html: 'html', json: 'json', bash: 'sh', shell: 'sh', sql: 'sql', markdown: 'md',
};

/**
 * buildArtifactRecord({content, lang, name, provider, context, chatUrl,
 *                       causedBy, source})
 * Returns the full record shape the artifacts-table insert (guardian/
 * agents/index.js, ~line 225) reads field-by-field. Never throws — bad
 * input degrades to the same fallback naming, it does not crash the caller.
 */
function buildArtifactRecord({
  content = '', lang = null, name = null, provider = 'guardian',
  context = '', chatUrl = null, causedBy = null, source = 'guardian',
} = {}) {
  const safeContent = content || '';
  const ext = lang ? (EXT_MAP[lang] || lang) : 'txt';
  const hash = crypto.createHash('sha256').update(safeContent).digest('hex');

  // Real @file:-style annotation takes priority over the hash name.
  // inferFilename()'s own un-annotated fallback is always 'output.<ext>' —
  // that specific value means "no real annotation found", not a real name.
  const inferred = name || inferFilename(safeContent, lang, null);
  const isRealAnnotation = inferred && inferred !== 'output.' + ext;
  const finalName = isRealAnnotation
    ? inferred
    : `${provider || 'guardian'}-${hash.slice(0, 8)}.${ext}`;

  return {
    name: finalName,
    ext: '.' + ext,
    file_path: `guardian/artifacts/${finalName}`,
    lang: lang || 'text',
    confidence: isRealAnnotation ? 'annotated' : 'fallback',
    content: safeContent,
    hash,
    provider: provider || 'guardian',
    chatUrl: chatUrl || null,
    context: (context || '').slice(0, 300),
    source: source || 'guardian',
    causedBy: causedBy || null,
    ts: Date.now(),
  };
}

module.exports = { buildArtifactRecord };
