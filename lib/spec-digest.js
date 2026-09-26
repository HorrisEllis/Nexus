'use strict';
/**
 * lib/spec-digest.js — a finished document spec, condensed for code generation.
 * §0.39.265 — James: "now what? no code actually generated."
 *
 * A document spec's ten sections (purpose, schema, api, … tests) are prose and
 * nothing turned a finished one into files. Idearium's "Generate code"
 * (speceng.codegen in idearium/api/index.js) plans a file tree FROM the spec and
 * builds every file with the spec in its prompt. This is the "from the spec"
 * part: the finished sections, most useful first, each trimmed to a fair share
 * of one budget so the whole spec fits a prompt and no one section crowds out
 * the rest.
 */
const ORDER = Object.freeze(['purpose', 'build_order', 'schema', 'api', 'events', 'integration', 'tests', 'failure_modes', 'axioms', 'meta']);

/** specDigest(manifest, budget) -> string ('' when the spec has no written sections) */
function specDigest(manifest, budget = 9000) {
  const rank = (id) => { const i = ORDER.indexOf(id); return i < 0 ? 99 : i; };
  const chunks = ((manifest && manifest.chunks) || [])
    .filter(c => c.status === 'complete' && c.content && String(c.content).trim())
    .sort((a, b) => rank(a.sectionId) - rank(b.sectionId));
  if (!chunks.length) return '';
  const per = Math.max(500, Math.floor(budget / chunks.length));
  const out = [];
  let left = budget;
  for (const c of chunks) {
    if (left <= 0) break;
    const body = String(c.content).replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
    const take = body.slice(0, Math.min(per, left));
    left -= take.length;
    out.push(`## ${c.sectionTitle || c.sectionId}\n${take}${take.length < body.length ? '\n…' : ''}`);
  }
  return out.join('\n\n');
}

module.exports = { specDigest, ORDER };
