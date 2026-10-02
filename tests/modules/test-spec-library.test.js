'use strict';
// tests/modules/test-spec-library.test.js — 0.39.290, master phasemap IL1.
// James: "my goal is to build these, eventually. im, the idea guy" · "lets fucking do it. need a way to import these
// and convert them." (his spec library: 171 files, 23 duplicate groups, zips in zips, one powershell.exe)
//
//   SL-01  scan: duplicates folded with every path kept; a zip inside the zip opened; a program refused, never read
//   SL-02  scan: a folder with package.json is ONE project; a document's family comes from its own name, not its zip
//   SL-03  scan: a Word document's text is read (title from its first lines)
//   SL-04  convert: Markdown ## headings, # BLOCK banners, plain documents — each its dialect
//   SL-05  the chunker keeps two sections with the same heading (the later used to replace the earlier)
//   SL-06  importSpec: sections by the document's headings, byte fidelity, one chunk file per section, agent 'import'
//   SL-07  importLibrary: ideas + specs linked, the zip kept, originals kept, the library table; importing again adds
//          nothing and merges new paths
//   SL-08  the surfaces: PUT /api/spec-library/import, GET /api/spec-library, the page served, the CLI, the Welcome button
//   SL-09  0.39.292 IL2 — James: "how can i import into the pipeline. the specs also need to convert into actual spec
//          files." toPipeline: the spec becomes a repo (the real RepoLayer), spec/<slug>.spec (YAML: meta + every
//          section, the import tag stripped) and spec/original/<name> are real files in it, the library's idea is the
//          repo's idea, the row remembers the repo, asking again opens the same one; a diagram is refused; lookups
//   SL-10  the surfaces: POST /api/spec-library/:key/to-repo, the CLI to-repo, the page's → pipeline, the main window
require('../../lib/test-sandbox.js').ensure();

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '../..');
const Zip = require('../../lib/zip.js');
const SL = require('../../lib/spec-library.js');

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${name}\n    ${e.stack}`); failed++; }
}
const zip = (files) => Zip.create(Object.entries(files).map(([p, data]) => ({ path: p, data: Buffer.isBuffer(data) ? data : Buffer.from(data) })));
const docx = (paras) => zip({ 'word/document.xml': `<w:document><w:body>${paras.map(p => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('')}</w:body></w:document>` });

const MD = '# RHEON STUDIO\n\nA template-driven creative environment. Not a notes app, each template a way of thinking.\n\n## Templates\nOne per kind of work.\n\n## Storage\nLocal first.\n';

async function main() {
  const inner = zip({ 'TRUST-MESH.md': '# TRUST MESH\n\nTrust is not a label. It is a running inference over what peers actually did.\n\n## Inputs\nA\n\n## Scores\nB\n' });
  const lib = zip({
    'a/RHEON-STUDIO-SPEC.md': MD,
    'b/copy of RHEON-STUDIO-SPEC.md': MD,
    'nexus-gate-session-architecture.zip': inner,
    'tools/src/powershell.exe': Buffer.from([0x4d, 0x5a, 0, 0]),
    'app/package.json': '{"name":"embodiment-studio"}',
    'app/README.md': '# Embodiment Studio\n\nWhere gap and friction physics starts behaving like emotional weather, rendered live.\n',
    'app/src/App.js': 'export default 1;\n',
    'ESS-spec.docx': docx(['ESS', 'END-STATE SIGNAL', 'ESS is a content-addressed signal routing language for intents.']),
    'NEXUS-CORE.spec': '# BLOCK 1 — META\nname: NEXUS-CORE\n\n# BLOCK 2 — PURPOSE\nThe immutable kernel.\n',
    'notes/JAMES-BROOKS-LIVING-DOCUMENT.md': '# JAMES BROOKS — LIVING SESSION DOCUMENT\n\nWho I am and how I work, kept for every session that picks this up.\n\n## Who I am\nX\n\n## How I work\nY\n',
    'diagrams/lattice.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  });

  const r = SL.scan({ buf: lib, name: 'specs.zip' });
  const byTitle = (t) => r.docs.find(d => d.title === t);

  await test('SL-01', 'duplicates folded with every path; zip in zip opened; a program refused', () => {
    const studio = byTitle('RHEON STUDIO');
    assert.ok(studio); assert.deepStrictEqual(studio.paths.sort(), ['a/RHEON-STUDIO-SPEC.md', 'b/copy of RHEON-STUDIO-SPEC.md']);
    assert.strictEqual(r.stats.duplicates, 1);
    assert.ok(byTitle('TRUST MESH'), 'the inner zip was opened');
    assert.match(byTitle('TRUST MESH').paths[0], /nexus-gate-session-architecture\.zip!\/TRUST-MESH\.md$/);
    assert.ok(r.skipped.some(s => /powershell\.exe$/.test(s.path) && /never read/.test(s.why)));
    assert.ok(!r.docs.some(d => /\.exe$/.test(d.name)));
  });

  await test('SL-02', 'a project is one unit; the family comes from the document itself', () => {
    const app = r.docs.find(d => d.kind === 'project');
    assert.ok(app); assert.strictEqual(app.title, 'Embodiment Studio'); assert.deepStrictEqual(app.files, ['README.md', 'package.json', 'src/App.js']);
    assert.ok(!r.docs.some(d => d.paths.some(p => /^app\//.test(p))), 'no loose file from the project');
    assert.strictEqual(byTitle('TRUST MESH').family, 'product', 'inside a "nexus-…" zip, still the product it is');
    assert.strictEqual(byTitle('RHEON STUDIO').family, 'product');
    assert.strictEqual(r.docs.find(d => /NEXUS-CORE/.test(d.name)).family, 'nexus');
    assert.strictEqual(byTitle('JAMES BROOKS — LIVING SESSION DOCUMENT').family, 'personal');
    assert.strictEqual(r.docs.find(d => d.kind === 'diagram').family, 'diagram');
  });

  await test('SL-03', "a Word document's text is read", () => {
    const d = r.docs.find(x => x.kind === 'docx');
    assert.strictEqual(d.title, 'ESS — END-STATE SIGNAL');
    assert.match(d.text, /content-addressed signal routing language/);
  });

  await test('SL-04', 'convert picks the dialect', () => {
    assert.strictEqual(SL.convert(byTitle('RHEON STUDIO')).dialect, 'markdown-h2');
    assert.strictEqual(SL.convert(r.docs.find(d => /NEXUS-CORE/.test(d.name))).dialect, 'blocks');
    assert.strictEqual(r.docs.find(d => /NEXUS-CORE/.test(d.name)).title, 'NEXUS-CORE', "a native .spec goes by its name:, not 'BLOCK 1 — META'");
    assert.strictEqual(SL.convert({ text: 'just one paragraph of prose with no headings at all, nothing else.' }).dialect, 'document');
    assert.strictEqual(SL.convert({ text: '' }).dialect, 'none');
  });

  await test('SL-05', 'the chunker keeps two sections with the same heading', () => {
    const { chunkDocument } = require('../../lib/chunker/index.js');
    const t = '# T\n\n## Overview\nA\n\n## API\nB\n\n## Overview\nC\n';
    const out = chunkDocument(t, { bannerRe: /^##\s+(\S.*)$/gm });
    assert.strictEqual(out.byteFidelity.verified, true);
    assert.deepStrictEqual(out.queue.map(q => q.content.trim()).filter(c => /Overview/.test(c)), ['## Overview\nA', '## Overview\nC']);
  });

  const se = await import(pathToFileURL(path.join(ROOT, 'idearium/spec-engine/index.js')).href);

  await test('SL-06', 'importSpec: sections by the headings, fidelity, one file per section, agent import', () => {
    const conv = SL.convert(byTitle('RHEON STUDIO'));
    const out = se.importSpec({ name: 'RHEON STUDIO', specText: conv.specText, bannerRe: conv.bannerRe, author: 'test' });
    assert.strictEqual(out.byteFidelity.verified, true);
    const m = se.loadSpec(out.manifest.uuid);
    assert.deepStrictEqual(m.chunks.map(c => c.sectionId), ['preamble', 'templates', 'storage']);
    assert.ok(m.chunks.every(c => c.status === 'complete' && c.agent === 'import' && fs.existsSync(c.filePath)));
    assert.match(fs.readFileSync(m.chunks[1].filePath, 'utf8'), /agent: import[\s\S]*## Templates\nOne per kind of work\./);
    assert.strictEqual(m.status, 'complete'); assert.ok(!m.ingesting);
    // a native .spec still splits on its BLOCK banners (the default)
    const core = se.importSpec({ name: 'NEXUS-CORE', specText: r.docs.find(d => /NEXUS-CORE/.test(d.name)).text });
    assert.ok(core.sectionsFilled.includes('meta') && core.sectionsFilled.includes('purpose'), JSON.stringify(core.sectionsFilled));
  });

  await test('SL-07', 'importLibrary: ideas + specs, the zip and originals kept, idempotent', async () => {
    const { importLibrary, listLibrary } = await import(pathToFileURL(path.join(ROOT, 'idearium/lib/spec-library-import.js')).href);
    const { getIdeaOS } = await import(pathToFileURL(path.join(ROOT, 'idearium/core/index.js')).href);
    const os = getIdeaOS();
    const dry = await importLibrary({ buf: lib, name: 'specs.zip', dryRun: true, se, os });
    assert.strictEqual(dry.added.length, r.docs.length); assert.strictEqual(listLibrary().length, 0, 'a dry run writes nothing');
    const out = await importLibrary({ buf: lib, name: 'specs.zip', se, os });
    assert.strictEqual(out.failed.length, 0, JSON.stringify(out.failed));
    assert.ok(fs.existsSync(out.upload.path), 'the zip is kept whole');
    const rows = listLibrary();
    assert.strictEqual(rows.length, r.docs.length);
    const studio = rows.find(x => x.title === 'RHEON STUDIO');
    assert.ok(studio.ideaUuid && studio.specUuid && studio.sections === 3 && studio.fidelity === true);
    const idea = os.db.ideas.find(i => i.uuid === studio.ideaUuid);
    assert.ok(idea.tags.includes('spec-library') && idea.tags.includes('product'));
    assert.strictEqual(idea.linkedSpec, studio.specUuid);
    assert.match(idea.text, /^RHEON STUDIO — A template-driven creative environment/);
    assert.ok(fs.existsSync(studio.original), 'the original bytes are kept');
    const svg = rows.find(x => x.kind === 'diagram');
    assert.ok(!svg.ideaUuid && fs.existsSync(svg.original), 'a diagram is kept in the library, no idea of its own');
    assert.ok(rows.find(x => x.kind === 'project').ideaUuid, 'a project is an idea');
    // again, with one more copy of the studio spec in a new place
    const again = zip({ 'a/RHEON-STUDIO-SPEC.md': MD, 'later/RHEON-STUDIO.md': MD });
    const n0 = os.db.ideas.length;
    const re = await importLibrary({ buf: again, name: 'more.zip', se, os });
    assert.strictEqual(re.added.length, 0); assert.strictEqual(os.db.ideas.length, n0, 'no new ideas');
    assert.strictEqual(re.merged.length, 1);
    assert.ok(listLibrary().find(x => x.title === 'RHEON STUDIO').paths.includes('later/RHEON-STUDIO.md'));
  });

  await test('SL-08', 'the surfaces: API, page, CLI, Welcome', () => {
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.match(api, /\['PUT',\s*\['api','spec-library','import'\],\s*'spec-library\.import'\]/);
    assert.match(api, /\['GET',\s*\['api','spec-library'\],\s*'spec-library\.list'\]/);
    assert.match(api, /route\.action !== 'spec-library\.import'/, 'the zip is read raw, never parsed as JSON');
    assert.match(api, /cleanUrl === '\/spec-library\.html'/);
    assert.ok(fs.existsSync(path.join(ROOT, 'idearium/ui/spec-library.html')));
    assert.match(fs.readFileSync(path.join(ROOT, 'idearium/ui/spec-library.html'), 'utf8'), /\/api\/spec-library\/import\?name=/);
    const cli = fs.readFileSync(path.join(ROOT, 'idearium/cli/index.js'), 'utf8');
    assert.match(cli, /async 'spec-library\.import'/); assert.match(cli, /async 'spec-library\.list'/);
    assert.match(fs.readFileSync(path.join(ROOT, 'idearium/ui/index.html'), 'utf8'), /onclick="openSpecLibrary\(\)"/);
    assert.match(fs.readFileSync(path.join(ROOT, 'idearium/ui/js/app.js'), 'utf8'), /function openSpecLibrary\(\)/);
  });

  await test('SL-09', 'toPipeline: a repo with a real .spec file, the same idea, idempotent', async () => {
    const LI = await import(pathToFileURL(path.join(ROOT, 'idearium/lib/spec-library-import.js')).href);
    const { RepoLayer } = await import(pathToFileURL(path.join(ROOT, 'idearium/repo/index.js')).href);
    const { getIdeaOS } = await import(pathToFileURL(path.join(ROOT, 'idearium/core/index.js')).href);
    const yaml = require('js-yaml');
    const os = getIdeaOS();
    const layer = new RepoLayer({ ideaOS: os, specEngine: se });
    let promoted = 0;
    // what _promoteSpecToRepo does in 'manual' mode: the repo layer's ingest of the existing spec, its idea carried
    const promote = (specUuid) => { promoted++; const m = se.loadSpec(specUuid);
      const r = layer.ingest({ name: m.name, specUuid, source: 'promote:manual', ideaUuid: m.ideaUuid || null, promotedFromSpec: specUuid });
      return r.error ? { error: r.error } : { repoUuid: r.repo.uuid }; };
    const writeFile = (u, rel, text) => layer.writeFile(u, rel, text, { preserveWhitespace: true });
    const repoExists = (u) => !!layer.get(u);

    assert.match(LI.findRow('').error, /name a document/);
    assert.match(LI.findRow('no such thing at all').error, /no document/);
    const studioRow = LI.findRow('rheon studio').row;
    assert.ok(studioRow && studioRow.title === 'RHEON STUDIO', 'title, any case');
    assert.strictEqual(LI.findRow(studioRow.sha.slice(0, 10)).row.sha, studioRow.sha, 'a sha prefix');
    assert.strictEqual(LI.slugOf('RHEON STUDIO'), 'rheon-studio');

    const out = await LI.toPipeline({ key: 'RHEON STUDIO', se, promote, writeFile, repoExists, yaml });
    assert.ok(out.ok, JSON.stringify(out));
    assert.strictEqual(out.specFile, 'spec/rheon-studio.spec');
    assert.strictEqual(out.original, 'spec/original/RHEON-STUDIO-SPEC.md');
    const repo = layer.get(out.repoUuid);
    assert.ok(repo, 'a real repo');
    assert.strictEqual(repo.ideaUuid, studioRow.ideaUuid, "the library's idea is the repo's idea — no second 'Repo: …' idea");
    const m = se.loadSpec(studioRow.specUuid);
    const specChunk = m.chunks.find(c => c.realPath === 'spec/rheon-studio.spec' && c.status === 'complete');
    assert.ok(specChunk, 'spec/rheon-studio.spec is a real file of the repo');
    const doc = yaml.load(specChunk.content);
    assert.strictEqual(doc.spec.name, 'RHEON STUDIO'); assert.strictEqual(doc.spec.sha, studioRow.sha); assert.strictEqual(doc.spec.family, 'product');
    assert.strictEqual(doc.sections.length, 3, JSON.stringify(doc.sections.map(x => x.id)));
    assert.ok(doc.sections.every(x => !/^<!-- imported/.test(x.body)), 'the import tag is not part of the document');
    assert.ok(doc.sections.some(x => /Local first\./.test(x.body)));
    const orig = m.chunks.find(c => c.realPath === 'spec/original/RHEON-STUDIO-SPEC.md');
    assert.strictEqual(orig.content, MD, 'the original, byte for byte');
    const row = LI.listLibrary().find(x => x.sha === studioRow.sha);
    assert.strictEqual(row.repoUuid, out.repoUuid); assert.strictEqual(row.specFile, 'spec/rheon-studio.spec');

    const again = await LI.toPipeline({ key: studioRow.sha, se, promote, writeFile, repoExists, yaml });
    assert.ok(again.ok && again.existing && again.repoUuid === out.repoUuid); assert.strictEqual(promoted, 1, 'asking again opens the same repo');

    const svg = LI.listLibrary().find(x => x.kind === 'diagram');
    const no = await LI.toPipeline({ key: svg.sha, se, promote, writeFile, repoExists, yaml });
    assert.ok(!no.ok && /kept in the library/.test(no.error));
    const failing = await LI.toPipeline({ key: 'TRUST MESH', se, promote: () => ({ error: 'boom' }), writeFile, repoExists, yaml });
    assert.ok(!failing.ok && failing.error === 'boom', 'a failed promotion is said, not swallowed');
    assert.ok(!LI.listLibrary().find(x => x.title === 'TRUST MESH').repoUuid);
  });

  await test('SL-10', 'the surfaces: route, CLI, page button, main window', () => {
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.match(api, /\['POST',\s*\['api','spec-library',':key','to-repo'\],\s*'spec-library\.to-repo'\]/);
    assert.match(api, /'spec-library\.to-repo':\s*CAPS\.WRITE_IDEAS/);
    assert.match(api, /promote: \(specUuid\) => _promoteSpecToRepo\(os, se, specUuid, mode\)/, 'the same promotion every spec takes');
    const cli = fs.readFileSync(path.join(ROOT, 'idearium/cli/index.js'), 'utf8');
    assert.match(cli, /async 'spec-library\.to-repo'/); assert.match(cli, /\/api\/spec-library\/\$\{encodeURIComponent\(key\)\}\/to-repo/);
    const page = fs.readFileSync(path.join(ROOT, 'idearium/ui/spec-library.html'), 'utf8');
    assert.match(page, /class="pipe"/); assert.match(page, /type: 'nexus:repo\.open'/);
    const app = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/app.js'), 'utf8');
    assert.match(app, /nexus:\(repo\\\.open\|workshop\\\.open\)/); assert.match(app, /const mine = \[_specLibraryWin, _workshopWin, _voidWin\]/); assert.match(app, /!mine\.includes\(ev\.source\)/, 'only from a window idearium opened');
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
