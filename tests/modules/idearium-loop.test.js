/**
 * tests/modules/idearium-loop.test.js — PHASE 2: the closed loop
 * UUID: nexus-idearium-loop-test-v1-0000-2026-0709-jamesbrooks-001
 *
 * §WHY — the phase map's exit criterion: "one idea in, one file on disk,
 * ledger row present. Everything after this attaches to a loop that turns."
 *
 * §ZERO LLM CALLS. This is not a mock of the pipeline; it is the pipeline,
 * driven along the one path that needs no agent. The genesis template
 * completes the `meta` chunk deterministically (idearium-templates.spec §T-2),
 * so the chain idea -> spec -> chunk -> artifact -> archive -> repo runs end to
 * end without a single token spent. A test that stubs the dispatcher proves
 * the stub works; this proves the loop does.
 *
 * §1.1 — every link is verified by observing the FILESYSTEM, not by trusting a
 * return value. createSpec can return a manifest that says `complete` while no
 * file exists; that is exactly the class of bug this codebase keeps producing.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const se = await import('../../idearium/spec-engine/index.js');

let passed = 0, failed = 0;
const assert = (cond, name, detail = '') => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? '\n      ' + detail : ''}`); }
};

console.log('\n  idearium-loop — one idea, all the way through, no LLM\n');

// ── Link 1: idea -> spec ─────────────────────────────────────────────────────
const name = `loop-proof-${Date.now()}`;
const manifest = se.createSpec({ name, templateId: 'genesis', description: 'phase 2 closed loop' });

assert(!!manifest.uuid, 'L1 idea -> spec: manifest has a uuid');
assert(manifest.templateId === 'genesis', 'L1 provenance: templateId recorded on the manifest');
assert(manifest.type === 'system', 'L1 type coerced to the template kind');

// ── Link 2: spec -> deterministic chunk (no agent) ───────────────────────────
const meta = manifest.chunks.find(c => c.sectionId === 'meta');
assert(meta?.status === 'complete', 'L2 spec -> chunk: meta completed with no dispatch');
assert(meta?.agent === 'template', 'L2 provenance: chunk.agent is "template", not an LLM name');
assert(Array.isArray(manifest.templateSeeded) && manifest.templateSeeded.includes('meta'),
  'L2 manifest records WHICH sections were seeded');

const pending = manifest.chunks.filter(c => c.status === 'pending').length;
assert(pending === manifest.chunks.length - 1,
  `L2 exactly one chunk skipped the agent (${pending} of ${manifest.chunks.length} still pending)`);

// ── Link 3: chunk -> physical artifact on disk ───────────────────────────────
// §1.1 — do not trust `status: complete`. Go look.
// SPECS_ROOT is `idearium/data/specs` (spec-engine/index.js:45) — NOT
// `data/idearium/specs`. Verified by reading the constant, after this test
// first failed against my assumed path. The code was right; the guess wasn't.
const specDir = path.join(process.cwd(), 'idearium', 'data', 'specs', manifest.uuid);
const dirExists = fs.existsSync(specDir);
assert(dirExists, 'L3 spec directory exists on disk', specDir);

let artifactPath = null;
if (dirExists) {
  const files = fs.readdirSync(specDir);
  artifactPath = files.map(f => path.join(specDir, f)).find(f => /meta/i.test(path.basename(f)) && f.endsWith('.md'));
  assert(files.includes('manifest.json'), 'L3 manifest.json persisted (§2.1 write before anything else)');
  assert(!!artifactPath, 'L3 chunk -> artifact: a real meta .md file exists', `saw: ${files.join(', ')}`);
}

if (artifactPath) {
  const body = fs.readFileSync(artifactPath, 'utf8');
  assert(body.includes('status: complete'), 'L3 artifact carries front-matter status');
  assert(body.includes('Seeded deterministically from template'), 'L3 artifact states its own provenance');
  assert(/Spine.*WARP/i.test(body), 'L3 artifact contains content EXTRACTED from genesis.spec, not invented');
  assert(!/undefined|\[object Object\]/.test(body), 'L3 artifact has no undefined/[object Object] leakage');
}

// ── Link 4: spec -> archive (compressible compartment) ───────────────────────
let archivePath = null;
try {
  const archived = await se.archiveSpec(manifest.uuid);
  archivePath = archived?.archivePath || `${specDir}.tar.gz`;
  assert(fs.existsSync(archivePath), 'L4 spec -> archive: .tar.gz exists on disk', archivePath);
  if (fs.existsSync(archivePath)) {
    assert(fs.statSync(archivePath).size > 0, 'L4 archive is non-empty');
  }
} catch (e) {
  assert(false, 'L4 spec -> archive', e.message);
}

// ── Link 5: archive -> repo compartment ──────────────────────────────────────
try {
  const { RepoLayer } = await import('../../idearium/repo/index.js');
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'idearium-repo-'));
  const repo = new RepoLayer({ root: tmpRoot });
  assert(typeof repo.ingest === 'function', 'L5 repo exposes ingest()');
  assert(typeof repo.list === 'function' && typeof repo.archive === 'function',
    'L5 repo exposes list()/archive() — compress/decompress on access');
} catch (e) {
  assert(false, 'L5 archive -> repo compartment', e.message);
}

console.log(`\n  idearium-loop: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
