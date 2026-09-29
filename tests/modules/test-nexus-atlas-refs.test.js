'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-nexus-atlas-refs.test.js — §0.39.264 every reference in the
 * Nexus atlas (and the system atlases it opens) is a link that lands somewhere real.
 *
 * James: "the nexus atlas in the nexus repo. expand it completely, don't make it
 * just a list. then make each reference a link to either open the nested or file."
 *
 * REAL, end to end with the page's own code:
 *   - idearium/ui/js/nexus-atlas.js's nxMarkdown() renders each atlas (run in a
 *     vm context, as the browser runs it), and every data-ref it produces is
 *     collected — exactly the set the page makes clickable;
 *   - idearium/repo/nexus-self.js's resolveWith() resolves them against an index
 *     of the REAL tree built with lib/nexus-self/systems.js's own skip + owner
 *     rules (the same rules the snapshot uses).
 * A path-like reference that resolves to nothing would render struck through
 * ("not in the snapshot"); for the atlases this release wrote, that count is 0.
 * Older system atlases are reported, not failed — their stale references are
 * their own drift, listed so they can be fixed (§1.2).
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }

function realIndex(NS, systems) {
  const bySys = {};
  const walk = (rel) => {
    let ents; try { ents = fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!systems.skipped(r, true)) walk(r); }
      else if (e.isFile() && !systems.skipped(r, false)) (bySys[systems.ownerOf(r)] = bySys[systems.ownerOf(r)] || []).push([r, '', 0]);
    }
  };
  walk('');
  return NS.indexOf(bySys);
}

function renderer() {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const ctx = { escapeHtml: esc, console, API_REPOS: [], document: {}, window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'idearium', 'ui', 'js', 'nexus-atlas.js'), 'utf8'), ctx);
  return ctx;
}
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function refsIn(html) { return [...html.matchAll(/data-ref="([^"]*)"/g)].map(m => unesc(m[1])); }
const pathLike = (r, el) => /\/|\.\w{1,6}$/.test(r);

async function main() {
  console.log('\ntest-nexus-atlas-refs\n');
  const NS = await import(path.join(ROOT, 'idearium', 'repo', 'nexus-self.js'));
  const systems = require(path.join(ROOT, 'lib', 'nexus-self', 'systems.js'));
  const idx = realIndex(NS, systems);
  const R = renderer();

  const atlasDir = path.join(ROOT, 'docs', 'atlases');
  const md = (f) => fs.readFileSync(path.join(atlasDir, f), 'utf8');
  const nexus = md('nexus-atlas.md');

  // ── the atlas is an atlas, not a list ──
  const words = nexus.split(/\s+/).length;
  const paras = nexus.split('\n').filter(l => /^[A-Z*`(].{120,}/.test(l)).length;
  check(`the Nexus atlas is written out (${words} words, ${paras} prose paragraphs)`, words > 5000 && paras > 60, `${words} words, ${paras} paragraphs`);
  for (const s of systems.SYSTEMS) {
    check(`every system has its own section: ${s.name}`, new RegExp(`^### ${s.name.replace('-', '\\-')}\\s*$`, 'm').test(nexus));
  }
  const topDirs = fs.readdirSync(ROOT, { withFileTypes: true }).filter(e => e.isDirectory() && !systems.skipped(e.name, true) && !e.name.startsWith('.') && e.name !== 'undefined').map(e => e.name);
  const missingDirs = topDirs.filter(d => !nexus.includes('`' + d + '/`') && !new RegExp(`^\\s+${d.replace(/[.-]/g, '\\$&')}/\\s`, 'm').test(nexus));
  check(`every top-level directory of the tree is placed in the atlas (${topDirs.length})`, missingDirs.length === 0, missingDirs.join(', '));
  for (const s of systems.SYSTEMS) {
    const doc = `docs/atlases/${s.name === 'ollama-bridge' ? 'ollama' : s.name}-atlas.md`;
    check(`every system has an atlas to open (nested): ${doc}`, fs.existsSync(path.join(ROOT, doc)));
  }

  // ── every reference resolves ──
  // §0.39.270 — idearium-atlas.md rewritten from the code (docs/2026-09-27-idearium-atlas-phasemap.spec) and held to the same rule.
  // §0.39.280 BS19 — copilot-atlas.md became the user guide and is held to the same rule
  const OURS = ['nexus-atlas.md', 'orchestrator-atlas.md', 'architect-atlas.md', 'eravos-atlas.md', 'core-atlas.md', 'idearium-atlas.md', 'copilot-atlas.md'];
  let total = 0;
  for (const f of OURS) {
    if (!fs.existsSync(path.join(atlasDir, f))) { check(`${f} exists`, false); continue; }
    const html = R.nxMarkdown(md(f));
    const refs = [...new Set(refsIn(html))];
    const hits = NS.resolveWith(idx, refs);
    const dead = refs.filter(r => !hits[r] && pathLike(r));
    const plain = refs.filter(r => !hits[r] && !pathLike(r));
    total += refs.length;
    check(`${f}: all ${refs.length} references resolve to a system, file, directory or doc — none dead`, dead.length === 0, dead.slice(0, 25).join(' · '));
    check(`${f}: every code span names something real (no plain-text code spans)`, plain.length === 0, plain.slice(0, 25).join(' · '));
  }
  check(`the new atlases carry ${total} live references`, total > 600, String(total));
  const nexHits = NS.resolveWith(idx, [...new Set(refsIn(R.nxMarkdown(nexus)))]);
  const kinds = {}; for (const h of Object.values(nexHits)) if (h) kinds[h.kind] = (kinds[h.kind] || 0) + 1;
  check(`the Nexus atlas links all four ways: system ${kinds.system || 0} · file ${kinds.file || 0} · dir ${kinds.dir || 0} · doc ${kinds.doc || 0}`, kinds.system > 13 && kinds.file > 150 && kinds.dir > 40 && kinds.doc > 12);
  const docTargets = Object.values(nexHits).filter(h => h && h.kind === 'doc').map(h => h.path);
  check('every system atlas is reachable from the Nexus atlas as a nested doc', systems.SYSTEMS.every(s => docTargets.includes(`docs/atlases/${s.name === 'ollama-bridge' ? 'ollama' : s.name}-atlas.md`)));

  // ── the page: nested and file, both ──
  const PAGE = fs.readFileSync(path.join(ROOT, 'idearium', 'ui', 'js', 'nexus-atlas.js'), 'utf8');
  check('a system heading carries a link into its nested atlas', /nx-nested/.test(PAGE) && /nexusOpenDoc\(\$\{JSON\.stringify\(s\.atlasDoc\)\}\)|nexusOpenDoc\(' \+|data-doc=/.test(PAGE));
  check('the atlas has a contents list that jumps to each section', /nx-toc/.test(PAGE));

  // ── the older system atlases: reported ──
  const older = fs.readdirSync(atlasDir).filter(f => f.endsWith('-atlas.md') && !OURS.includes(f));
  for (const f of older) {
    const refs = [...new Set(refsIn(R.nxMarkdown(md(f))))];
    const hits = NS.resolveWith(idx, refs);
    const dead = refs.filter(r => !hits[r] && pathLike(r));
    console.log(`    · ${f}: ${refs.length} references, ${dead.length} not in the tree${dead.length ? ` (${dead.slice(0, 6).join(', ')}${dead.length > 6 ? ', …' : ''})` : ''}`);
  }

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail === 0 ? 0 : 1;
}
main().catch(e => { console.log('  ! crashed:', e.stack); process.exit(1); });
