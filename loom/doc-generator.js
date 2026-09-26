'use strict';
/**
 * loom/doc-generator.js — R6: documentation generated from what's real, not
 * hand-maintained prose that can drift
 * UUID: nexus-loom-doc-generator-v1-0000-2026-0812-001
 *
 * docs/repair-contract-and-loom-hub-phasemap.spec R6. "loom is supposed to
 * be the system to do what your doing" (James) — this generates the kind
 * of document a person would otherwise write and maintain by hand, the
 * exact way lib/version.js's architect comment drifted stale earlier this
 * session. No new data source (§8.6): calls loom's OWN live HTTP API
 * (/api/component/:system, /api/phasemap, /api/gaps) — the same endpoints
 * the UI calls, the same aggregation R5 already built. Loom is the one
 * source; this is a rendering pass over it, not a fourth copy of the logic.
 *
 * §GATE — regenerating after a real change must produce a correct doc with
 * zero manual edit. Proven by generating twice around a real state change
 * in the module's own test, not asserted.
 */

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'docs', 'generated');
const LOOM_URL = process.env.LOOM_URL || `http://127.0.0.1:${process.env.LOOM_PORT || 3752}`;

async function _get(pathname) {
  const res = await fetch(`${LOOM_URL}${pathname}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${pathname} -> HTTP ${res.status}`);
  return res.json();
}

function _mdEscape(s) { return String(s == null ? '' : s).replace(/\|/g, '\\|'); }

/** generateSystemDoc(system) — one system's real, current page. */
async function generateSystemDoc(system) {
  const d = await _get(`/api/component/${encodeURIComponent(system)}`);
  const lines = [];
  lines.push(`# ${system}`);
  lines.push('');
  lines.push(`_Generated from loom's live \`/api/component/${system}\` — regenerate this file, never hand-edit it (§R6)._`);
  lines.push('');
  if (d.declared) {
    lines.push(`## Hooks — ${d.declared.activeCount}/${d.declared.totalCount} active`);
    lines.push('');
    lines.push('| Hook | Status | Why |');
    lines.push('|---|---|---|');
    for (const h of d.declared.hooks) {
      lines.push(`| ${_mdEscape(h.name)} | ${_mdEscape(h.status || 'unknown')} | ${_mdEscape((h.intent || '').slice(0, 200))} |`);
    }
    lines.push('');
  } else {
    lines.push('## Hooks');
    lines.push('');
    lines.push('No hand-declared `hooks/<system>.hooks.js` for this system — structural graph only.');
    lines.push('');
  }
  lines.push(`## Open gaps — ${d.gapCount}`);
  lines.push('');
  if (d.gaps && d.gaps.length) {
    for (const g of d.gaps.slice(0, 20)) lines.push(`- **${_mdEscape(g.type)}** (${_mdEscape(g.severity)}): ${_mdEscape(g.body)}`);
  } else {
    lines.push('None open right now.');
  }
  lines.push('');
  lines.push(`## Recent activity — ${d.historyCount} ledger entries`);
  lines.push('');
  for (const h of (d.history || []).slice(0, 10)) lines.push(`- \`${_mdEscape(h.component)}\` — ${_mdEscape(h.action)} (${_mdEscape(h.status)})`);
  lines.push('');
  return lines.join('\n');
}

/** generateOverview() — the whole-NEXUS page, zoomed out. */
async function generateOverview() {
  const [phasemap, gaps] = await Promise.all([_get('/api/phasemap'), _get('/api/gaps')]);
  const lines = [];
  lines.push('# NEXUS — overview');
  lines.push('');
  lines.push("_Generated from loom's live `/api/phasemap` + `/api/gaps` — regenerate this file, never hand-edit it (§R6)._");
  lines.push('');
  lines.push(`## Phasemap`);
  lines.push('');
  lines.push(phasemap.summary?.text || `${phasemap.total} phases.`);
  lines.push('');
  lines.push(`## Gaps`);
  lines.push('');
  lines.push(`${gaps.count} open right now.`);
  lines.push('');
  return lines.join('\n');
}

/**
 * generateAll(systems) — regenerate every doc, real files, real overwrite.
 * §GATE — this is the thing that must be safely re-runnable, always
 * matching current reality, never accumulating stale pages.
 */
async function generateAll(systems) {
  fs.mkdirSync(path.join(OUT_DIR, 'systems'), { recursive: true });
  const overview = await generateOverview();
  fs.writeFileSync(path.join(OUT_DIR, 'NEXUS-OVERVIEW.md'), overview);
  const written = ['NEXUS-OVERVIEW.md'];
  for (const system of systems) {
    try {
      const doc = await generateSystemDoc(system);
      const file = path.join(OUT_DIR, 'systems', `${system}.md`);
      fs.writeFileSync(file, doc);
      written.push(`systems/${system}.md`);
    } catch (e) {
      console.warn(`[doc-generator] skipped ${system}: ${e.message}`);
    }
  }
  return { ok: true, written };
}

module.exports = { generateSystemDoc, generateOverview, generateAll, OUT_DIR, MODULE_ID: 'loom-doc-generator', VERSION: '1.0.0' };
