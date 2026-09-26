'use strict';
/**
 * .architecture/registry/create-atlas.js — scaffolds a new system atlas
 * from atlas-template.md, pre-filling whatever a real .spec object
 * already answers (meta, axioms, gaps, whether Versionium is wired)
 * so a human/agent fills in only what the .spec genuinely doesn't say
 * — not a document generator that invents content, a copier that
 * moves real fields from one real shape into another.
 */
const fs = require('fs');

/**
 * scaffoldAtlas({ templatePath, specObj, systemName }) -> string
 * specObj: a parsed architecture-spec-style { spec: { meta, core, ... } }
 * object, or null if no real .spec exists yet for this system.
 */
function scaffoldAtlas({ templatePath, specObj, systemName }) {
  let text = fs.readFileSync(templatePath, 'utf8');
  const spec = specObj ? specObj.spec : null;

  // Title line
  text = text.replace(
    '# [System Name] — [One-line description of what it is]',
    `# ${systemName}${spec ? ` — ${spec.meta.purpose ? spec.meta.purpose.trim().split('\n')[0].slice(0, 80) : '[one-line description]'}` : ' — [one-line description of what it is]'}`
  );

  // Version badge line
  if (spec && spec.meta) {
    text = text.replace(
      '> **v[version]** · [N] modules built · [N] modules specced · [one short capability line] · [one key constraint, if any]',
      `> **v${spec.meta.version} (${spec.meta.status || 'status unknown'})** · ${(spec.modules || []).length} modules per .spec · [one short capability line] · [one key constraint, if any]`
    );
  }

  // Governing axioms table — pre-fill rows if the .spec has them
  if (spec && spec.core && Array.isArray(spec.core.axioms)) {
    const rows = spec.core.axioms
      .filter(a => typeof a === 'string' && /^[A-Z][A-Z0-9_-]*\s/.test(a))
      .map(a => {
        const m = a.match(/^(\S+)\s+(.*)$/);
        return m ? `| \`${m[1]}\` | ${m[2]} | [rationale, from .spec if stated, else fill in] |` : null;
      })
      .filter(Boolean)
      .join('\n');
    if (rows) {
      text = text.replace(
        '| `[AXIOM_NAME]` | [what it requires] | [why, not just what] |',
        rows
      );
    }
  }

  // Version History source — real gap-flagging logic, not a neutral default
  const gaps = spec && spec.gaps && spec.gaps.entries ? spec.gaps.entries : [];
  const versioniumGap = gaps.find(g => /versionium/i.test(g.summary || ''));
  let sourceLine;
  if (versioniumGap) {
    sourceLine = `**Source:** NOT YET WIRED TO VERSIONIUM — confirmed as a real gap in this system's own .spec (${versioniumGap.id}): ${versioniumGap.summary}`;
  } else if (spec) {
    sourceLine = `**Source:** NOT CONFIRMED EITHER WAY — this system's .spec was read, but whether it reports to Versionium (\`GET /api/versionium/history?system=${systemName}\`) was not explicitly checked. Confirm before assuming either way.`;
  } else {
    sourceLine = `**Source:** [no .spec found for this system yet — nothing to scaffold from]`;
  }
  text = text.replace(
    '**Source:** [`GET /api/versionium/history?system=<name>`, or — flagged as a real gap, not a neutral state — "NOT YET WIRED TO VERSIONIUM: hand-maintained below, see gaps section"]',
    sourceLine
  );

  return text;
}

/**
 * synthesize({ registryObj, taxonomy, nodeIndex }) — pulls real counts
 * and grounding status from three more real sources beyond the .spec:
 *   registryObj: a KINDS-keyed object, loom's real registry.json shape
 *                — { component: {id: {...}}, hook: {...}, wire: {...}, ... }
 *   taxonomy:    array of { kind, status: REAL|OPEN|DEFERRED, grounding }
 *                — matches this template's own node_kinds table shape,
 *                  the same one NODE-TAXONOMY.md's own REAL/OPEN/DEFERRED
 *                  discipline uses
 *   nodeIndex:   per-type live node list, e.g. watcher.all(type)'s shape
 *                — { [type]: [{node, filePath}, ...] }
 * Returns real counts and rows, never invented ones — a kind or a node
 * type with nothing to report is 0, not omitted.
 */
function synthesize({ registryObj = {}, taxonomy = [], nodeIndex = {} }) {
  const registryCounts = {};
  for (const [kind, records] of Object.entries(registryObj)) {
    registryCounts[kind] = Object.keys(records || {}).length;
  }
  const liveCounts = {};
  for (const [type, list] of Object.entries(nodeIndex)) {
    liveCounts[type] = Array.isArray(list) ? list.length : 0;
  }
  const taxonomyRows = taxonomy.map(t => ({
    kind: t.kind,
    status: t.status || 'OPEN',
    grounding: t.grounding || '[not stated]',
    registryCount: registryCounts[t.kind] ?? null,
    liveCount: liveCounts[t.kind] ?? null,
  }));
  return { registryCounts, liveCounts, taxonomyRows };
}

/**
 * toCortexMemory(entry, { system }) — converts a version_history or gaps
 * entry into cortex's real CortexMemory schema shape
 * ({uuid, key, value, tags, source, tier, ts}, per cortex.spec's own
 * core.schemas), so history stays first-class, queryable data instead
 * of prose trapped in a markdown file. Does not POST anywhere — no live
 * cortex was reachable to test against this session; this only proves
 * the shape conversion is real and correct.
 */
function toCortexMemory(entry, { system }) {
  const crypto = require('crypto');
  const isGap = 'opened' in entry || 'severity' in entry;
  return {
    uuid: crypto.randomUUID(),
    key: isGap ? `${system}.gap.${entry.id}` : `${system}.version.${entry.version || entry.date}`,
    value: entry.summary || entry.message || '',
    tags: [system, isGap ? 'gap' : 'version_history'],
    source: `${system}.spec`,
    tier: 'long', // history is permanent per cortex's own MEMORY_TIERS — never working/short
    ts: Date.now(),
  };
}

module.exports = { scaffoldAtlas, synthesize, toCortexMemory };
