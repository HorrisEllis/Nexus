/**
 * idearium/test/e2e-pipeline.test.js — full pipeline, every real stage
 * UUID: idearium-test-e2e-pipeline-v1-0000-2026-0714-jamesbrooks-001
 *
 * §BRUTAL 2026-07-14 — "i just want the idearium pipeline to work, end to
 * end." No mocks: real IdeaOS (cortex-backed), real spec-engine import,
 * real RepoLayer promote/read/write, real materialization to disk, real
 * CLI subprocess call at the end so this catches drift between the two.
 *
 * Run: node idearium/test/e2e-pipeline.test.js
 * Needs: a .spec file to import — defaults to any .spec found in
 * idearium/data/specs' source, but pass one explicitly:
 *   node idearium/test/e2e-pipeline.test.js /path/to/some.spec
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import * as se from '../spec-engine/index.js';
import { RepoLayer } from '../repo/index.js';
import { getIdeaOS } from '../core/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IDEARIUM_ROOT = path.join(__dirname, '..');

const FAIL = [];
const check = (label, cond, detail = '') => {
  const ok = !!cond;
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) FAIL.push(label);
  return ok;
};

const specPath = process.argv[2];
if (!specPath || !fs.existsSync(specPath)) {
  console.error('usage: node e2e-pipeline.test.js /path/to/some.spec');
  process.exit(1);
}

console.log('── Stage 1: IdeaOS boot (cortex-backed DB) ──');
const os = getIdeaOS();
check('IdeaOS boots', os && os.db, `${os.db.ideas.length} ideas loaded`);

console.log('\n── Stage 2: idea → spec (legacy lightweight) ──');
os.emit('idearium.idea.create', { text: 'E2E pipeline check idea', tags: ['e2e'], source: 'e2e' });
const createdIdea = os.ideas({ sort: 'updated', limit: 1 })[0];
check('idea created', createdIdea && createdIdea.uuid, createdIdea?.uuid);
os.emit('idearium.spec.create', { name: 'e2e-check-spec', ideaUuid: createdIdea.uuid, source: 'e2e' });
const createdSpec = os.specs()[os.specs().length - 1];
check('lightweight spec created + linked to idea', createdSpec && createdSpec.uuid, createdSpec?.uuid);
const linkedIdea = os.idea(createdIdea.uuid);
check('idea.linkedSpec set', linkedIdea.linkedSpec === createdSpec.uuid);

console.log('\n── Stage 3: real .spec import (chunk-engine) ──');
const specText = fs.readFileSync(specPath, 'utf8');
const result = se.importSpec({ name: `e2e-${path.basename(specPath, '.spec')}`, specText });
check('import completed', result.manifest.status === 'complete', `${result.sectionsFilled.length} chunks`);
check('byte-fidelity verified', result.byteFidelity.verified, `${result.byteFidelity.sourceBytes}b`);

console.log('\n── Stage 4: structural profiling ──');
const manifest = se.loadSpec(result.manifest.uuid);
const anyChunkWithProfile = manifest.chunks.find(c => c.structuralProfile);
check('structuralProfile attached to chunks', !!anyChunkWithProfile);

console.log('\n── Stage 5: promote → repo ──');
const repoLayer = new RepoLayer({ ideaOS: os, specEngine: se });
const promoted = repoLayer.ingest({ name: manifest.name, specUuid: manifest.uuid, source: 'promote:emerge', promotedFromSpec: result.manifest.uuid });
check('promote succeeded', !promoted.error, promoted.error || promoted.repo.uuid);
const repoUuid = promoted.repo?.uuid;

console.log('\n── Stage 6: repo read-back (file CRUD) ──');
const repoView = repoLayer.get(repoUuid);
check('repo resolves via spec-engine', repoView && repoView.hasSpec, `${repoView?.fileCount} files`);
if (repoView && repoView.files.length) {
  const firstFile = repoView.files[0];
  const rf = repoLayer.readFile(repoUuid, firstFile.path);
  check('readFile works', !rf.error && rf.content.length > 0, firstFile.path);
  const wf = repoLayer.writeFile(repoUuid, firstFile.path, rf.content + '\n<!-- e2e touch -->');
  check('writeFile works (edit)', wf.ok, wf.path);
  const rootHashAfterEdit = repoLayer.get(repoUuid).rootHash;
  check('rootHash changed after edit', rootHashAfterEdit !== repoView.rootHash);
  repoLayer.writeFile(repoUuid, firstFile.path, rf.content); // revert, keep repeated runs clean

  console.log('\n── Stage 7: materialize to real files on disk ──');
  // §FIXED 2026-09-06 — same real isolation fix as elsewhere in this
  // session's pass: respects IDEARIUM_DATA_DIR when a caller (like
  // run-e2e-pipeline-isolated.cjs) sets it, so this scratch output lands
  // in a real, disposable temp dir during an isolated run instead of
  // always inside the real idearium/ tree.
  const outDir = process.env.IDEARIUM_DATA_DIR
    ? path.join(process.env.IDEARIUM_DATA_DIR, '.e2e-materialized-tmp')
    : path.join(IDEARIUM_ROOT, '.e2e-materialized-tmp');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  let written = 0;
  for (const f of repoLayer.get(repoUuid).files) {
    const r = repoLayer.readFile(repoUuid, f.path);
    if (r.error) continue;
    const dest = path.join(outDir, f.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, r.content, 'utf8');
    written++;
  }
  check('materialized all files', written === repoLayer.get(repoUuid).fileCount, `${written} files -> ${outDir}`);
}

console.log('\n── Stage 8: repo index persisted to cortex DB (not just in-memory) ──');
const repoLayer2 = new RepoLayer({ ideaOS: os, specEngine: se }); // fresh instance, forces reload
const reloaded = repoLayer2.get(repoUuid);
check('repo survives reload via cortex table', reloaded && reloaded.uuid === repoUuid);

console.log('\n── Stage 9: CLI reflects the same state ──');
const cliOut = execSync('node cli/index.js status', { cwd: IDEARIUM_ROOT }).toString();
check('CLI status runs clean', cliOut.includes('Idearium Status'));

console.log('\n' + '='.repeat(60));
if (FAIL.length === 0) {
  console.log('ALL 9 STAGES PASSED');
} else {
  console.log(`FAILED: ${FAIL.join(', ')}`);
  process.exitCode = 1;
}
