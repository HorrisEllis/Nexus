'use strict';
/**
 * lib/readme-generate.js — the README's generated half: every system, module and file; every phase; the data structure;
 * Idearium's routes and commands; every release in his words (0.60.147)
 * comp_id: nexus.lib.readme-generate
 * UUID: nexus-lib-readme-generate-v1-0000-2026-1018-jamesbrooks-001
 *
 * James, 2026-10-18: "can you update and expand the read me. expand anything thats a list. all the phases. have a full section
 * of for each of the 15 systems, each module and all the files. the data structure. all the idearium work. use all the changelogs
 * to expand it."
 *
 * The README is docs/atlases/nexus-atlas.md, copied (his 0.59.12 decision: "copy the atlas to use as the readme"). The narrative
 * stays hand-written; this writes, between markers, what the tree and its records already say, so it cannot drift:
 *   inside each "### <system>" section       its modules (directories) and every file, each with the purpose its own header
 *                                            states (lib/atlas-generate.js purposeOf); the releases that touched it
 *   <!-- generated:readme:start/end -->      every phase of every phasemap (loom/scanners/phasemap-map.js, the one parser);
 *                                            the data structure (each store's folder and its env var, read from the code; the
 *                                            JAA tables, lib/context-atlas.js; the node types, lib/node-export.js; the ledgers);
 *                                            Idearium's work (its routes, read from its route table; its command rows); every
 *                                            release, from every CHANGELOG-*.md: his words first, then what was built
 * Folds (<details>) keep a 4,000-file tree readable; GitHub renders them, and so does the Idearium atlas page (nexus-atlas.js).
 * Every code span names a real path (test-nexus-atlas-refs); free text from old notes is written plain (no live links).
 *
 * Run: node scripts/generate-atlases.js (it calls this, then copies the atlas to README.md).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const START = '<!-- generated:readme:start -->';
const END = '<!-- generated:readme:end -->';
const sysStart = (n) => `<!-- generated:readme:system:${n}:start -->`;
const sysEnd = (n) => `<!-- generated:readme:system:${n}:end -->`;

const AG = () => require('./atlas-generate.js');
const S = () => require('./nexus-self/systems.js');

/** free text from a header or an old note, written so the atlas page makes no link of it */
function plain(s, max = 240) {
  let t = String(s || '')
    .replace(/`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/<[^>]+>/g, '')
    .replace(/(^|[\s(]):(\d{2,5})\b/g, '$1port $2').replace(/([\w.-]+)-atlas\.md\b/g, '$1 atlas')
    .replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  if (t.length > max) t = t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  return t;
}
const SMALL_MODULE = 8;
const fold = (summary, body) => `<details>\n<summary>${summary}</summary>\n\n${body}\n\n</details>\n`;
const owner = (f) => { const o = S().ownerOf(f); return (o && o.name) || o || 'core'; };
const vkey = (v) => String(v).split('.').map(n => String(Number(n) || 0).padStart(5, '0')).join('.');

function _read(f) { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (_) { return ''; } }
function _purpose(f) {
  const src = _read(f);
  if (/\.md$/i.test(f)) { const h = /^#\s+(.+)$/m.exec(src); return h ? plain(h[1], 160) : ''; }
  if (!/\.(c|m)?js$|\.ts$|\.py$|\.sh$|\.ps1$|\.spec$|\.ya?ml$/i.test(f)) return '';
  if (/\.spec$|\.ya?ml$/i.test(f)) { const c = /^#\s*(.+)$/m.exec(src); return c ? plain(c[1].replace(new RegExp(`^${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[—–:-]*\\s*`), ''), 160) : ''; }
  try { return plain(AG().purposeOf(src, f), 160); } catch (_) { return ''; }
}

// ── the systems, module by module ────────────────────────────────────────────────────────────────────────────────────────
function _moduleOf(f, sys) {
  const parts = f.split('/');
  if (parts.length === 1) return '(root)';
  if (sys === 'core') return parts.length > 2 && parts[0] === 'lib' ? `${parts[0]}/${parts[1]}/` : `${parts[0]}/`;
  const depth = ['clear-glass', 'cos', 'idearium', 'intelligence', 'guardian', 'loom'].includes(sys) ? 3 : 2;
  return parts.length - 1 >= depth ? `${parts.slice(0, depth).join('/')}/` : `${parts.slice(0, parts.length - 1).join('/')}/`;
}
function systemSection(sys, files, releases) {
  const mine = files.filter(f => owner(f) === sys).sort();
  const def = S().SYSTEMS.find(s => s.name === sys) || {};
  const mods = new Map();
  for (const f of mine) { const m = _moduleOf(f, sys); if (!mods.has(m)) mods.set(m, []); mods.get(m).push(f); }
  const CL = /(^|\/)CHANGELOG-[\d.]+(-part\d+)?\.md$/;   // 0.60.274 — at the root before, versionium/changelogs now
  const notes = mine.filter(f => CL.test(f));
  if (notes.length) for (const [m, l] of mods) mods.set(m, l.filter(f => !CL.test(f)));
  const out = [];
  out.push(`#### ${sys}: every module and every file`);
  out.push('');
  const facts = [`${mine.length} files in ${mods.size} modules`];
  if (def.entry) facts.push(`entry \`${def.entry}\``);
  if (def.port) facts.push(`port ${def.port}`);
  const spec = [`${(def.dirs || [sys])[0]}/spec/${sys}.spec`, `docs/${sys}.spec`].find(p => fs.existsSync(path.join(ROOT, p)));
  if (spec) facts.push(`spec \`${spec}\``);
  const atlas = `docs/atlases/${sys === 'ollama-bridge' ? 'ollama' : sys}-atlas.md`;
  out.push(`${sys[0].toUpperCase()}${sys.slice(1)} is ${facts.join(', ')}. Each module below opens to its files. In a module of up to ${SMALL_MODULE} files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in \`${atlas}\`.`);
  out.push('');
  for (const [m, fs_] of [...mods.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!fs_.length) continue;
    const label = m === '(root)' ? `the files at the top of ${sys === 'core' ? 'the tree' : `\`${(def.dirs || [sys])[0]}/\``}` : `\`${m}\``;
    // GitHub renders a README up to about 512 KiB, so a big module lists its files by name; a small one says what each is.
    // Every file's purpose is in its system's own atlas (lib/atlas-generate.js), the next zoom level.
    const small = fs_.length <= SMALL_MODULE;
    const lines = fs_.map(f => { const p = small ? plain(_purpose(f), 110) : ''; return `- \`${f}\`${p ? ` — ${p}` : ''}`; });
    out.push(fold(`${label} · ${fs_.length} file${fs_.length === 1 ? '' : 's'}`, lines.join('\n')));
  }
  if (notes.length) {
    out.push(fold(`the release notes · ${notes.length} files (each is in the version history below, in his words)`,
      notes.sort((a, b) => vkey(b.match(/CHANGELOG-([\d.]+)/)[1]).localeCompare(vkey(a.match(/CHANGELOG-([\d.]+)/)[1]))).map(f => `\`${f}\``).join(' · ')));
  }
  if (releases && releases.length && sys !== 'core') {
    // the releases themselves are in the version history below (one record, not two); here, which ones and how many
    out.push(`${releases.length} release notes name a file of ${sys}: ${releases.slice(0, 40).map(r => r.version).join(', ')}${releases.length > 40 ? `, and ${releases.length - 40} older` : ''}. Each is in the version history below, in his words.`);
    out.push('');
  }
  return out.join('\n');
}

// ── every release, from every CHANGELOG-*.md ─────────────────────────────────────────────────────────────────────────────
function releases(files) {
  const out = [];
  for (const f of files.filter(x => /(^|\/)CHANGELOG-[\d.]+(-part\d+)?\.md$/.test(x))) {
    const src = _read(f);
    const version = f.match(/CHANGELOG-([\d.]+)/)[1] + (/-part(\d+)/.test(f) ? ` (part ${f.match(/-part(\d+)/)[1]})` : '');
    const head = (/^#\s+(.+)$/m.exec(src) || [, ''])[1].replace(/^(NEXUS\s+)?v?[\d.]+\s*[—–:-]\s*/, '');
    const qm = /James[^"“]{0,40}["“]([^"”]{4,})["”]/.exec(src);
    const sections = [...src.matchAll(/^##\s+(.+)$/gm)].map(m => plain(m[1], 80)).filter(h => !/^(proof|open|tests?|files?)\b/i.test(h)).slice(0, 8);
    const dirs = new Set(); for (const m of src.matchAll(/\b([a-z][\w-]*)\/[\w./-]+/g)) dirs.add(m[1]);
    out.push({ file: f, version, title: plain(head || '(untitled)', 140), quote: qm ? plain(qm[1], 320) : null, sections, dirs });
  }
  return out.sort((a, b) => vkey(b.version.split(' ')[0]).localeCompare(vkey(a.version.split(' ')[0])) || b.file.localeCompare(a.file));
}
function releasesSection(rel) {
  const series = new Map();
  for (const r of rel) { const k = r.version.split('.').slice(0, 2).join('.'); if (!series.has(k)) series.set(k, []); series.get(k).push(r); }
  const out = ['### Every release, in his words', '',
    `Every release note in the tree, ${rel.length} of them, newest first. Each opens with James's own words: what he asked, as he wrote it, his spelling kept. Then what was built, from the note's own section headings. The note itself is the file named, at the top of the tree. Releases are grouped by series; each series opens to its releases.`, ''];
  for (const [k, rs] of series) {
    out.push(fold(`${k}.x · ${rs.length} release${rs.length === 1 ? '' : 's'} · ${rs[rs.length - 1].version} to ${rs[0].version}`, rs.map(r =>
      `- **${r.version}** — ${r.title}${r.quote ? ` — James: "${plain(r.quote, 140)}"` : ''}${r.sections.length ? ` — built: ${r.sections.slice(0, 3).join(' · ')}` : ''}`).join('\n')));
  }
  return out.join('\n');
}

// ── every phase ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function phasesSection(files = [], phasemaps = null) {
  const fileOf = new Map();
  for (const f of files) if (/\.spec$/.test(f)) { const b = path.basename(f, '.spec'); if (!fileOf.has(b) || f.startsWith('docs/')) fileOf.set(b, f); }
  // §0.60.156 — the phases are handed in by the caller (scripts/generate-atlases.js reads them with loom's parser): lib requiring
  // loom was a crossing SB-06 caught (shipped in 0.60.153, found by the gating census's test run).
  const all = phasemaps;
  if (!all || !Array.isArray(all.phases)) return '### Every phase\n\nThe phasemaps were not handed in (generate({ phasemaps }) — scripts/generate-atlases.js reads them with loom/scanners/phasemap-map.js).';
  const by = new Map();
  for (const p of all.phases || []) { if (!by.has(p.map)) by.set(p.map, []); by.get(p.map).push(p); }
  const tally = (ps) => { const t = {}; for (const p of ps) t[p.status] = (t[p.status] || 0) + 1; return t; };
  const tot = tally(all.phases || []);
  const out = ['### Every phase', '',
    `Every phase of every phasemap, ${all.phases.length} phases across ${by.size} maps, read by the one phasemap parser loom uses (\`loom/scanners/phasemap-map.js\`). ${tot.done || 0} are done, ${tot['in-progress'] || 0} in progress and ${tot.pending || 0} pending. A decision (a question for James, or one his axioms decided) is marked as one. The maps are newest first; each opens to its phases, each phase with its status and what it does. The map itself, with the reasons and the proof, is the file named.`, ''];
  for (const [map, ps] of [...by.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {   // what each phase does is in its map
    const t = tally(ps);
    const rows = ps.map(p => `- **${plain(p.id, 70)}** · ${p.kind === 'decision' ? 'decision · ' : ''}${p.status}`);
    const mf = fileOf.get(map);
    out.push(fold(`${mf ? `\`${mf}\`` : `**${plain(map, 90)}**`} · ${ps.length} · ${t.done || 0} done, ${t['in-progress'] || 0} in progress, ${t.pending || 0} pending`, rows.join('\n')));
  }
  return out.join('\n');
}

// ── the data structure ──────────────────────────────────────────────────────────────────────────────────────────────────
function dataSection(files) {
  const stores = new Map();
  const re = /process\.env\.([A-Z][A-Z0-9_]*(?:DIR|ROOT|PATH|_HOME))\s*\|\|\s*(path\.(?:join|resolve)\(([^()]*(?:\([^()]*\))?[^()]*)\)|'[^']*')/g;
  for (const f of files.filter(x => /\.(c|m)?js$/.test(x) && !/^tests\/|\/test\/|\.test\.|^_archive\//.test(x))) {
    const src = _read(f); let m;
    while ((m = re.exec(src))) {
      const where = m[2].replace(/__dirname/g, `${path.dirname(f)}/`).replace(/path\.(join|resolve)\(|\)$/g, '').replace(/ROOT|NEXUS_ROOT/g, '<root>');
      if (!stores.has(m[1])) stores.set(m[1], { env: m[1], where: plain(where, 120), files: [] });
      const st = stores.get(m[1]); if (st.files.length < 4 && !st.files.includes(f)) st.files.push(f);
    }
  }
  const out = ['### The data structure', '',
    'NEXUS keeps its state out of git: everything under a data folder is runtime state, never code (docs/CLAUDE.md: "NEVER commit data/**"). The stores below are read from the code itself: every store whose folder can be moved by an environment variable, with the default it falls back to and the files that open it. The test sandbox (`lib/test-sandbox.js`) points each of these into a throwaway folder, so a test never touches the real ones.', ''];
  out.push(fold(`the stores · ${stores.size} folders, each placed by an environment variable`, [...stores.values()].sort((a, b) => a.env.localeCompare(b.env)).map(s => `- **${s.env}** — default ${s.where} — opened by ${s.files.map(f => `\`${f}\``).join(', ')}`).join('\n')));
  try {
    const CA = require('./context-atlas.js');
    out.push(`The tables. Cortex's JAA store (\`cortex/memory/\`; the schema folder jaa/ was retired 2026-10-24) holds the named tables most systems write into. These are the ones described in \`lib/context-atlas.js\`, each checked against a real writer, with the system that owns it and the tool that reads it deeper. A table not described there is still searchable by its name.`);
    out.push('');
    out.push(fold(`the JAA tables · ${Object.keys(CA.DESCRIBED).length} described`, Object.entries(CA.DESCRIBED).map(([t, d]) => `- **${t}** (${d.system}) — ${plain(d.what, 160)}${d.tool ? ` — read with ${plain(d.tool, 40)}` : ''}`).join('\n')));
  } catch (_) {}
  try {
    const N = require('./node-export.js');
    out.push('The node types. Everything NEXUS keeps as a file is a node: one envelope (`lib/node-export.js`: uuid, type, id, context, intent, summary, system, tags, occurrences, payload) around a typed payload, written as YAML. These are the types the envelope accepts.');
    out.push('');
    out.push(fold(`the node types · ${N.KNOWN_TYPES.length}`, N.KNOWN_TYPES.map(t => `.${t}`).join(' · ')));
  } catch (_) {}
  const ledgers = files.filter(f => /^lib\/ledger-[\w-]+\.js$|^lib\/[\w-]*ledger[\w-]*\.js$|^lib\/activity-log\/[\w-]+\.js$|^lib\/work-journal\.js$|^lib\/run-state\.js$/.test(f));
  out.push('The ledgers. What happened is append-only: each ledger keeps its rows in order and never rewrites one. The contract ledger (`lib/work-journal.js`, 0.60.146) is one per contract, every gate\'s attempts, jobs and replies; a browser agent\'s reply text lives once, in Clear Glass\'s chat ledger (`clear-glass/src/downloads/chat-ledger.js`).');
  out.push('');
  out.push(fold(`the ledgers and records · ${ledgers.length} modules`, ledgers.map(f => { const p = _purpose(f); return `- \`${f}\`${p ? ` — ${p}` : ''}`; }).join('\n')));
  return out.join('\n');
}

// ── Idearium's work ─────────────────────────────────────────────────────────────────────────────────────────────────────
function ideariumSection() {
  const src = _read('idearium/api/index.js');
  const re = /\[\s*'(GET|POST|PUT|DELETE|PATCH)'\s*,\s*\[([^\]]*)\]\s*,\s*'([a-z][a-z0-9.]*)'\s*\]/gi;
  const routes = []; const seen = new Set(); let m;
  while ((m = re.exec(src))) {
    const p = '/' + m[2].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean).join('/');
    const k = `${m[1]} ${p}`; if (seen.has(k)) continue; seen.add(k);
    routes.push({ method: m[1], path: p, action: m[3] });
  }
  const groups = new Map();
  for (const r of routes) { const g = r.path.split('/').slice(0, r.path.startsWith('/api/repos') ? 5 : 3).join('/').replace(/:uuid/, ':uuid'); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); }
  const cmds = [];
  for (const line of _read('idearium/cli/route-commands.js').split('\n')) {
    const k = /^\s*\{\s*key:\s*'([^']+)'/.exec(line); if (!k) continue;
    const u = /usage:\s*'((?:\\'|[^'])*)'/.exec(line); const a = /about:\s*'((?:\\'|[^'])*)'/.exec(line);
    cmds.push({ key: k[1], usage: u ? u[1].replace(/\\'/g, "'") : '', about: a ? a[1].replace(/\\'/g, "'") : '' });
  }
  const out = ['### All the Idearium work', '',
    `Idearium is where work starts in NEXUS: ideas, specs, repos, their phases and builds, and the Code tab where the agents work. Everything it can do is a route on :4800, served by \`idearium/api/index.js\`, and every route a person uses is also a command row in \`idearium/cli/route-commands.js\`, so every agent can do it through the one command tool. Read from the route table itself: ${routes.length} routes, and ${cmds.length} command rows. Its files, module by module, are under its own section above; what each release did to it is in the version history below.`, ''];
  out.push(fold(`the routes · ${routes.length}, grouped by path`, [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([g, rs]) => `- **${plain(g, 90)}** — ${rs.map(r => `${r.method} ${plain(r.path.slice(g.length) || '/', 100)}`).join(' · ')}`).join('\n')));
  out.push(fold(`the command rows · ${cmds.length} (every agent has them through nexus.command)`, cmds.map(c => `- **${plain(c.usage || c.key, 110)}** — ${plain(c.about, 150)}`).join('\n')));
  return out.join('\n');
}

/** splice a block between two markers in doc; appended before `before` (a heading) when the markers are not there yet */
function spliceAt(doc, start, end, block, before) {
  const s = doc.indexOf(start), e = doc.indexOf(end);
  if (s >= 0 && e > s) return doc.slice(0, s) + start + '\n' + block + '\n' + doc.slice(e);
  const i = before ? doc.indexOf(before) : -1;
  const ins = `${start}\n${block}\n${end}\n\n`;
  return i >= 0 ? doc.slice(0, i) + ins + doc.slice(i) : doc + '\n' + ins;
}

/** generate({ write }) → { chars, files, phases, releases } — the atlas with every generated block in place */
function generate({ root = ROOT, write = true, phasemaps = null } = {}) {
  const file = path.join(root, 'docs', 'atlases', 'nexus-atlas.md');
  let doc = fs.readFileSync(file, 'utf8');
  const files = AG().walk(root);
  const rel = releases(files);
  for (const s of S().SYSTEMS) {
    const dirs = new Set(s.dirs || []);
    const touched = rel.filter(r => [...r.dirs].some(d => dirs.has(d)));
    const block = systemSection(s.name, files, touched);
    const head = new RegExp(`^### ${s.name.replace(/[-.]/g, '\\$&')}\\s*$`, 'm').exec(doc);
    if (!head) continue;
    const after = doc.slice(head.index + head[0].length);
    const next = /^(### |---\s*$|## )/m.exec(after);
    const at = next ? head.index + head[0].length + next.index : doc.length;
    if (doc.includes(sysStart(s.name))) doc = spliceAt(doc, sysStart(s.name), sysEnd(s.name), block, null);
    else doc = doc.slice(0, at) + `${sysStart(s.name)}\n${block}\n${sysEnd(s.name)}\n\n` + doc.slice(at);
  }
  const big = ['## The whole of NEXUS, generated from the tree and its records', '',
    'Everything below is written by `lib/readme-generate.js` from the tree as it is and the records it keeps, each time `scripts/generate-atlases.js` runs, so it cannot drift from the code. The narrative above is written by hand; this is the inventory under it.', '',
    phasesSection(files, phasemaps), '', dataSection(files), '', ideariumSection(), '', releasesSection(rel)].join('\n');
  doc = spliceAt(doc, START, END, big, '## Version History');
  if (write) fs.writeFileSync(file, doc, 'utf8');
  return { chars: doc.length, files: files.length, releases: rel.length };
}

module.exports = { MODULE_ID: 'nexus.lib.readme-generate', VERSION: '1.0.0', generate, systemSection, releases, releasesSection, phasesSection, dataSection, ideariumSection, plain, START, END };
