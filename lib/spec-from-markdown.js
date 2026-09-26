'use strict';
/**
 * lib/spec-from-markdown.js — plain .md -> canonical `spec:` envelope
 * UUID: nexus-spec-from-markdown-v1-0000-2026-0903-001
 *
 * §THE GAP THIS CLOSES — found by actually running lib/seam/spec-parser.js's
 * parseSpec() against a real uploaded .md (COMPARTMENT-OS-SPEC, 190KB), not
 * assumed: parseSpec()'s extractBlock() is a bare regex over `key:\s*value`
 * — correct for a real `spec:` YAML envelope, wrong for arbitrary markdown,
 * where it matches the first `name:`/`version:`/`status:`-shaped line
 * ANYWHERE in the document (a JSON-schema example, a table row) instead of
 * the document's real title. Confirmed: parsing COMPARTMENT-OS-SPEC.md gave
 * meta.name = "String," — a schema field name from inside the doc body, not
 * the title. Chunking (heading-split) is unaffected and correct either way.
 *
 * This module does NOT reimplement chunking — parseSpec()'s heading-split
 * already handles that correctly (verified: 129 real chunks from the same
 * file). It only replaces meta-extraction for non-canonical input, and
 * emits a real `spec:` envelope so the result can be saved and re-parsed
 * by parseSpec() itself, or dropped into idearium/repo/watcher.js's
 * _handleSpec() container path, unchanged.
 *
 * §DETECTION — canonical vs plain markdown: a real spec file's first
 * non-blank line is `spec:` (checked directly against every uploaded
 * .spec file's actual first line before writing this, not assumed from
 * the format description). Anything else is treated as plain markdown.
 */

const { parseSpec } = require('./seam/spec-parser.js');

const MODULE_ID = 'nexus-spec-from-markdown';
const VERSION   = '1.0.0';

function isCanonicalSpec(text) {
  return /^\s*spec:\s*$/m.test(text.split('\n').slice(0, 3).join('\n'));
}

/**
 * _deriveMetaFromMarkdown(text) — the real fix. Reads only the document's
 * own title/subtitle lines, never scans the body for key:-shaped noise.
 */
function _deriveMetaFromMarkdown(text, opts = {}) {
  const lines = text.split('\n');

  // Title: first `# ` (h1) heading. Falls back to filename if none.
  const titleLine = lines.find(l => /^#\s+\S/.test(l));
  const rawTitle  = titleLine ? titleLine.replace(/^#\s+/, '').trim() : (opts.filenameFallback || 'unnamed');
  const name = rawTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'unnamed';

  // Version: look for a `## <n> Master Architecture Specification — vX.Y.Z`
  // style subtitle, or a `**Version:** X.Y.Z` line — both real patterns
  // seen across the uploaded .md files, checked directly rather than
  // guessed at a single convention.
  const versionMatch =
    text.match(/\bv(\d+\.\d+(?:\.\d+)?)\b/i) ||
    text.match(/\*\*Version:\*\*\s*(\d+\.\d+(?:\.\d+)?)/i);
  const version = versionMatch ? versionMatch[1] : '0.0.0';

  // Author: `**Author:** X` line, if present — real field seen in the
  // uploaded docs, not invented.
  const authorMatch = text.match(/\*\*Author:\*\*\s*(.+)/);
  const author = authorMatch ? authorMatch[1].trim() : null;

  // Description/intent: the first real prose paragraph after the title —
  // skip blank lines, horizontal rules, and blockquote/table markup.
  let intent = '';
  for (let i = lines.indexOf(titleLine) + 1; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l || l === '---' || l.startsWith('#') || l.startsWith('|') || l.startsWith('>')) continue;
    if (/^\*\*[^*]+:\*\*/.test(l)) continue; // §FIX — skip **Field:** metadata lines (Author/Version/Status), found via the same real-file test
    intent = l.replace(/^\*+|\*+$/g, '').slice(0, 300);
    break;
  }

  return { name, version, uuid: null, intent, status: 'living', author };
}

/**
 * parseMarkdownToSpec(text, opts) — main entry.
 *   opts.filenameFallback — used for meta.name if the doc has no # title.
 *   opts.maxChunkSize / opts.splitOn — passed through to parseSpec() unchanged.
 * Returns: { meta, chunks[], evaluationRules, wasCanonical, specText }
 *   specText — the canonical `spec:` envelope, ready to save as a real
 *   .spec file or feed to idearium/repo/watcher.js's _handleSpec().
 */
function parseMarkdownToSpec(text, opts = {}) {
  if (!text || text.length < 10) throw new Error(`[${MODULE_ID}] empty input`);

  const wasCanonical = isCanonicalSpec(text);
  const parsed = parseSpec(text, opts); // chunking is correct either way — reused as-is

  const meta = wasCanonical ? parsed.meta : _deriveMetaFromMarkdown(text, opts);

  const specText = _buildSpecEnvelope(meta, parsed.chunks, wasCanonical ? text : null);

  return { meta, chunks: parsed.chunks, evaluationRules: parsed.evaluationRules, wasCanonical, specText };
}

/**
 * _buildSpecEnvelope — emits a real `spec: / meta: / phases:` document.
 * If the input was already canonical, the ORIGINAL text is returned
 * unchanged (§NO REPETITION — don't re-derive what's already correct).
 * Otherwise, wraps the derived meta + heading-chunked phases.
 */
function _buildSpecEnvelope(meta, chunks, originalIfCanonical) {
  if (originalIfCanonical) return originalIfCanonical;

  const esc = (s) => String(s || '').replace(/\n/g, ' ').replace(/"/g, "'");
  const lines = [
    'spec:',
    '',
    '  meta:',
    `    name:        ${meta.name}`,
    `    version:     ${meta.version}`,
    `    uuid:        null`,
    `    status:      ${meta.status}`,
    meta.author ? `    author:      ${esc(meta.author)}` : null,
    `    intent: >`,
    `      ${esc(meta.intent)}`,
    '',
    '  phases:',
  ].filter(Boolean);

  chunks.forEach((c, i) => {
    // §FIX — parseSpec()'s chunks[] are objects ({idx,title,content,...}),
    // not raw strings — confirmed by reading its actual construction
    // (lib/seam/spec-parser.js ~line 248) after this assumed otherwise and
    // threw `c.split is not a function` on every real markdown file tested.
    lines.push(`    - id:    phase-${String(i + 1).padStart(2, '0')}`);
    lines.push(`      title: ${esc(c.title) || `Phase ${i + 1}`}`);
    lines.push(`      content: |`);
    c.content.split('\n').forEach(l => lines.push(`        ${l}`));
    lines.push('');
  });

  return lines.join('\n');
}

module.exports = { parseMarkdownToSpec, isCanonicalSpec, MODULE_ID, VERSION };
