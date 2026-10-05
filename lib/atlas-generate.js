'use strict';
/**
 * lib/atlas-generate.js — the generated half of every system atlas, from the registry Nexus already keeps.
 * comp_id: nexus.lib.atlas-generate
 *
 * §0.39.266 (A1) — James: "every atlas should be expanded." Answer: narrative + generated sections. The narrative
 * stays hand-written; this writes, between two markers in each docs/atlases/<system>-atlas.md, what the registry
 * knows about that system so it can never drift from the tree:
 *
 *   the numbers        files, code files, registry components, events out / in, routes, covered files
 *   routes             from loom/data/registry.json components (declared_in → owning system)
 *   events             from loom/data/events.json — each event this system emits, who hears it (and in which system)
 *   files              directory by directory: purpose (the file's own header), exports, requires / required by
 *                      counts, events, covering tests — the same card lib/registry-harness.js gives an agent
 *   the store          for the "components" system: what lib/component-store.js holds
 *
 * CI4: only the text between <!-- generated:registry:start --> and <!-- generated:registry:end --> is replaced; an
 * atlas without markers gets them appended once, after its narrative (before a trailing "## Copyright").
 * CI5: every path written in `code` is a real file or directory of the tree it was generated from. Event names and
 * routes are written as plain text — they are not paths, and the atlas page resolves every code span.
 *
 * Run: node scripts/generate-atlases.js  (also after a loom bootstrap, so the registry it reads is current).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const START = '<!-- generated:registry:start -->';
const END = '<!-- generated:registry:end -->';
const MAX_EVENTS = 80;
const MAX_ROUTES = 120;
const MAX_FILES_PER_DIR = 60;

const systems = () => require('./nexus-self/systems.js');
const H = () => require('./registry-harness.js');

function atlasFileFor(name) { return `${name === 'ollama-bridge' ? 'ollama' : name}-atlas.md`; }

/** walk(root) → every file of the base (the snapshot's own skip rules), minus what loom never scans. */
function walk(root = ROOT) {
  const S = systems();
  const loomSkip = require('../loom/scanners/source-map.js').SKIP_PATHS;
  const out = [];
  const go = (rel) => {
    let ents; try { ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!S.skipped(r, true) && !e.name.startsWith('.') && !(loomSkip.has(r) && r !== 'components')) go(r); }
      else if (e.isFile() && !S.skipped(r, false)) out.push(r);
    }
  };
  go('');
  return out.sort();
}

function _purpose(src, file) {
  let p = H()._purposeOf(src) || '';
  // headers usually open with "<path> — what it is"; the path is already on the line
  p = p.replace(new RegExp(`^\\s*${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[—–:-]+\\s*`), '')
       .replace(new RegExp(`^\\s*${path.basename(file).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[—–:-]+\\s*`), '');
  // §0.39.310 — a bare :port in a header reads as a live port link on the atlas page; one no system owns (an old Emerge
  // :4242) is then a dead link. Ports in file purposes are written as words.
  p = p.replace(/`/g, "'").replace(/\s+/g, ' ').replace(/(^|[\s(]):(\d{2,5})\b/g, '$1port $2').trim();
  return p.length > 200 ? p.slice(0, 197).replace(/\s+\S*$/, '') + '…' : p;
}

const plain = (s) => String(s).replace(/`/g, "'").replace(/\|/g, '/');

/**
 * sectionFor(system, { idx, files }) → the markdown between the markers for one system.
 * idx: a lib/registry-harness nexus index over `files` (the live tree).
 */
function sectionFor(name, { idx, files, now = new Date() }) {
  const S = systems();
  const H_ = H();
  const mine = files.filter(f => S.ownerOf(f) === name);
  const code = mine.filter(f => H_.CODE_EXT.test(f));
  const lines = [];
  const push = (...l) => lines.push(...l);

  // cards for every code file
  const cards = new Map();
  for (const f of code) { const c = H_.card(idx, f, { cap: 1e6 }); if (!c.error) cards.set(f, c); }
  const fileOfId = (id) => idx.fileOf(id) || null;

  // routes: registry components declared in this system's files
  const reg = idx.registry || { component: {} };
  const routes = Object.values(reg.component || {}).filter(c => c.route && c.declared_in && S.ownerOf(c.declared_in) === name)
    .sort((a, b) => String(a.route).localeCompare(String(b.route)));

  // events emitted / heard here
  const emitted = new Map(), heard = new Map();
  for (const f of code) {
    const ev = idx.events.byFile[idx.idOf(f)];
    if (!ev) continue;
    for (const e of ev.emits) { if (!emitted.has(e)) emitted.set(e, []); emitted.get(e).push(f); }
    for (const e of ev.listens) { if (!heard.has(e)) heard.set(e, []); heard.get(e).push(f); }
  }
  const covered = [...cards.values()].filter(c => c.tests.length).length;
  const regComps = Object.values(reg.component || {}).filter(c => c.declared_in && S.ownerOf(c.declared_in) === name).length;

  push(START, '', '## What the registry knows (generated)', '');
  push(`> Generated by \`scripts/generate-atlases.js\` from loom's registry and events (loom/data/registry.json, loom/data/events.json — data, outside the snapshot, so written plain) and the tree itself, ${now.toISOString().slice(0, 10)}. Everything between the markers is rewritten on the next run — write narrative above them. The same facts, one component at a time, are what \`lib/registry-harness.js\` hands a repo agent (loom.card.tool).`, '');
  push(`**${mine.length}** files · **${code.length}** code files · **${regComps}** registry components declared here · **${emitted.size}** events emitted · **${heard.size}** heard · **${routes.length}** routes · **${covered}** code files with a covering test`, '');

  if (name === 'components') {
    try {
      const CS = require('./component-store.js');
      const st = CS.stats();
      push('### The store', '', `${st.components} component(s), ${st.versions} version(s), ${st.contracts} contract key(s), ${st.prompts} prompt key(s) in \`components/index.json\` at generation time. Each lives in \`components/\` as <id>/<version>/ with its file and component.json.`, '');
      for (const c of CS.list().slice(0, 200)) {
        const m = CS.manifest(c.id) || {};
        push(`- **${plain(c.id)}** @ ${c.latest} (${c.versions.length} version${c.versions.length === 1 ? '' : 's'}) — ${plain(m.purpose || c.path)}${Object.keys(m.dependencies || {}).length ? ` · needs ${Object.entries(m.dependencies).map(([d, v]) => `${plain(d)}@${v}`).join(', ')}` : ''}${(m.npm || []).length ? ` · npm ${m.npm.join(', ')}` : ''}`);
      }
      push('');
    } catch (e) { push(`_store unreadable: ${plain(e.message)}_`, ''); }
  }

  if (routes.length) {
    push(`### Routes (${routes.length})`, '');
    for (const r of routes.slice(0, MAX_ROUTES)) push(`- ${plain(r.route)} — ${plain(r.description || r.id)} · declared in \`${r.declared_in}\``);
    if (routes.length > MAX_ROUTES) push(`- … ${routes.length - MAX_ROUTES} more (loom: GET /api/registry/component/<id>)`);
    push('');
  }

  if (emitted.size) {
    const ranked = [...emitted.entries()].map(([e, from]) => {
      const v = idx.events.byEvent[e] || { listeners: [] };
      const hearers = v.listeners.map(fileOfId).filter(Boolean);
      return { e, from, hearers, cross: hearers.filter(f => S.ownerOf(f) !== name).length };
    }).sort((a, b) => b.cross - a.cross || b.hearers.length - a.hearers.length || a.e.localeCompare(b.e));
    push(`### Events it emits (${emitted.size}) — and who hears them`, '');
    for (const x of ranked.slice(0, MAX_EVENTS)) {
      const heardBy = x.hearers.length
        ? x.hearers.slice(0, 4).map(f => S.ownerOf(f) === name ? `\`${f}\`` : `\`${f}\` (${S.ownerOf(f)})`).join(', ') + (x.hearers.length > 4 ? ` +${x.hearers.length - 4}` : '')
        : 'no listener in the tree (heard over HTTP/SSE, or by nobody)';
      push(`- **${plain(x.e)}** — from ${x.from.slice(0, 2).map(f => `\`${f}\``).join(', ')}${x.from.length > 2 ? ` +${x.from.length - 2}` : ''} → ${heardBy}`);
    }
    if (ranked.length > MAX_EVENTS) push(`- … ${ranked.length - MAX_EVENTS} more — loom.find.tool kind "event"`);
    push('');
  }
  const foreign = [...heard.keys()].filter(e => !emitted.has(e)).sort();
  if (foreign.length) {
    push(`### Events it hears from elsewhere (${foreign.length})`, '');
    const shown = foreign.slice(0, MAX_EVENTS).map(e => {
      const from = ((idx.events.byEvent[e] || {}).emitters || []).map(fileOfId).filter(Boolean);
      const sys = [...new Set(from.map(f => S.ownerOf(f)))];
      return `**${plain(e)}**${sys.length ? ` (${sys.join(', ')})` : ''}`;
    });
    push(shown.join(' · ') + (foreign.length > MAX_EVENTS ? ` · … ${foreign.length - MAX_EVENTS} more` : ''), '');
  }

  // files, directory by directory
  const byDir = new Map();
  for (const f of mine) { const d = path.posix.dirname(f); if (!byDir.has(d)) byDir.set(d, []); byDir.get(d).push(f); }
  push(`### Files, directory by directory (${byDir.size} directories)`, '');
  for (const d of [...byDir.keys()].sort()) {
    const fs_ = byDir.get(d);
    const codeHere = fs_.filter(f => cards.has(f) && !H_.TEST_RE.test(f));
    const testsHere = fs_.filter(f => H_.TEST_RE.test(f));
    const other = fs_.filter(f => !cards.has(f) && !H_.TEST_RE.test(f));
    push(`#### \`${d === '.' ? fs_[0] : d + '/'}\``, '');
    const summary = [codeHere.length && `${codeHere.length} code`, testsHere.length && `${testsHere.length} test`, other.length && `${other.length} other`].filter(Boolean).join(' · ');
    if (d !== '.') push(`${summary} file(s).`, '');
    for (const f of codeHere.slice(0, MAX_FILES_PER_DIR)) {
      const c = cards.get(f);
      const bits = [];
      const purpose = _purpose(idx.read(f), f);
      if (c.exports.length) bits.push(`exports ${c.exports.slice(0, 6).map(plain).join(', ')}${c.exports.length > 6 ? ` +${c.exports.length - 6}` : ''}`);
      const req = c.requires.length, by = c.requiredBy.length;
      if (req || by) bits.push(`requires ${req} · required by ${by}`);
      const em = (idx.events.byFile[c.id] || {}).emits || [], li = (idx.events.byFile[c.id] || {}).listens || [];
      if (em.length) bits.push(`emits ${em.slice(0, 4).map(plain).join(', ')}${em.length > 4 ? ` +${em.length - 4}` : ''}`);
      if (li.length) bits.push(`hears ${li.slice(0, 4).map(plain).join(', ')}${li.length > 4 ? ` +${li.length - 4}` : ''}`);
      const tests = c.tests.map(fileOfId).filter(Boolean);
      if (tests.length) bits.push(`tested by ${tests.slice(0, 2).map(t => `\`${t}\``).join(', ')}${tests.length > 2 ? ` +${tests.length - 2}` : ''}`);
      push(`- \`${f}\` (${c.lines} lines)${purpose ? ` — ${purpose}` : ''}${bits.length ? `  \n  ${bits.join(' · ')}` : ''}`);
    }
    if (codeHere.length > MAX_FILES_PER_DIR) push(`- … ${codeHere.length - MAX_FILES_PER_DIR} more code files — loom.find.tool`);
    if (other.length && other.length <= 12) push(`- other: ${other.map(f => `\`${f}\``).join(', ')}`);
    else if (other.length) push(`- other: ${other.length} files (${[...new Set(other.map(f => path.extname(f) || path.basename(f)))].slice(0, 8).join(', ')})`);
    push('');
  }
  push(END);
  return lines.join('\n');
}

/** splice(doc, section) — replace between the markers, or append once before a trailing "## Copyright". */
function splice(doc, section) {
  const a = doc.indexOf(START), b = doc.indexOf(END);
  if (a >= 0 && b > a) return doc.slice(0, a) + section + doc.slice(b + END.length);
  const cp = doc.search(/\n---\s*\n+## Copyright[\s\S]*$|\n## Copyright[\s\S]*$/);
  if (cp >= 0) return doc.slice(0, cp).replace(/\s+$/, '') + '\n\n---\n\n' + section + '\n' + doc.slice(cp);
  return doc.replace(/\s+$/, '') + '\n\n---\n\n' + section + '\n';
}

/**
 * generate({ root, atlasDir, only, write }) → [{ system, atlas, chars, files, changed }]
 * write:false returns the sections without touching the docs (tests, previews).
 */
function generate({ root = ROOT, atlasDir = null, only = null, write = true, now = new Date() } = {}) {
  const S = systems();
  const files = walk(root);
  const idx = H().buildNexusIndex({ files, root });
  const dir = atlasDir || path.join(root, 'docs', 'atlases');
  const out = [];
  for (const s of S.SYSTEMS) {
    if (only && !only.includes(s.name)) continue;
    const section = sectionFor(s.name, { idx, files, now });
    const atlas = path.join(dir, atlasFileFor(s.name));
    let changed = false;
    if (write && fs.existsSync(atlas)) {
      const doc = fs.readFileSync(atlas, 'utf8');
      const next = splice(doc, section);
      if (next !== doc) { fs.writeFileSync(atlas, next); changed = true; }
    }
    out.push({ system: s.name, atlas: path.relative(root, atlas).replace(/\\/g, '/'), chars: section.length, files: files.filter(f => S.ownerOf(f) === s.name).length, changed, section: write ? undefined : section });
  }
  return out;
}

module.exports = { generate, sectionFor, splice, walk, atlasFileFor, START, END };
